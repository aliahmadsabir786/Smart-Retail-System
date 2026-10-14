from django.shortcuts import get_object_or_404
from rest_framework import generics, status as http
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.exceptions import ServiceException
from apps.core.permissions import (
    IsAdminOrAbove, IsCashierOrAbove, IsInventoryManagerOrAbove, IsManagerOrAbove,
)
from apps.customers.models import Customer
from apps.products.models import Product
from apps.sales.models import Sale
from . import services
from .client import FBRClient, REFERENCE_ENDPOINTS
from .models import CustomerFBRProfile, FBRInvoice, FBRSettings, ProductFBRProfile
from .serializers import (
    CustomerFBRProfileSerializer, FBRInvoiceListSerializer, FBRSettingsSerializer,
    ProductFBRProfileSerializer,
)


def _is_manager_or_above(user) -> bool:
    return bool(user.is_superuser or getattr(user, "role", "") in ("super_admin", "admin", "manager"))


class FBRSettingsView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /fbr/config/ — admin only. The token is write-only."""
    serializer_class = FBRSettingsSerializer
    permission_classes = [IsAdminOrAbove]

    def get_object(self):
        return FBRSettings.load()


class FBRFeatureStatusView(APIView):
    """GET /fbr/enabled/ — lets the UI decide whether to show any FBR controls. No secrets."""
    permission_classes = [IsCashierOrAbove]

    def get(self, request):
        cfg = FBRSettings.load()
        return Response({"enabled": cfg.is_enabled, "environment": cfg.environment,
                         "ready": cfg.is_enabled and not cfg.missing_configuration()})


class FBRTestConnectionView(APIView):
    """POST /fbr/test-connection/ — admin only."""
    permission_classes = [IsAdminOrAbove]

    def post(self, request):
        return Response(services.test_connection())


class FBRReferenceView(APIView):
    """GET /fbr/reference/<name>/ — FBR's own lists (provinces, uom, sale types) to help fill profiles."""
    permission_classes = [IsAdminOrAbove]

    def get(self, request, name):
        if name not in REFERENCE_ENDPOINTS:
            return Response({"detail": "Unknown reference list."}, status=http.HTTP_404_NOT_FOUND)
        cfg = FBRSettings.load()
        if not cfg.token_configured:
            raise ServiceException("Save the FBR API token first.")
        res = FBRClient(cfg.get_token(), timeout=cfg.request_timeout_seconds).get_reference(name)
        if res.category != "ok":
            return Response({"detail": res.message or "Could not load the list from FBR."},
                            status=http.HTTP_502_BAD_GATEWAY)
        return Response(res.data)


class _ProfileView(APIView):
    model = None
    owner_field = ""
    owner_model = None
    serializer_class = None

    def _owner(self, pk):
        return get_object_or_404(self.owner_model, pk=pk)

    def get(self, request, pk):
        owner = self._owner(pk)
        obj = self.model.objects.filter(**{self.owner_field: owner}).first()
        if obj is None:
            return Response(self.serializer_class(self.model(**{self.owner_field: owner})).data)
        return Response(self.serializer_class(obj).data)

    def put(self, request, pk):
        owner = self._owner(pk)
        obj = self.model.objects.filter(**{self.owner_field: owner}).first()
        ser = self.serializer_class(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        if obj is None:
            ser.save(**{self.owner_field: owner})
        else:
            ser.save()
        return Response(ser.data)

    patch = put


class ProductFBRProfileView(_ProfileView):
    """GET/PUT /fbr/products/<id>/profile/"""
    permission_classes = [IsInventoryManagerOrAbove]
    model = ProductFBRProfile
    owner_field = "product"
    owner_model = Product
    serializer_class = ProductFBRProfileSerializer


class CustomerFBRProfileView(_ProfileView):
    """GET/PUT /fbr/customers/<id>/profile/"""
    permission_classes = [IsManagerOrAbove]
    model = CustomerFBRProfile
    owner_field = "customer"
    owner_model = Customer
    serializer_class = CustomerFBRProfileSerializer


class FBRInvoiceListView(generics.ListAPIView):
    """GET /fbr/invoices/?status=failed — diagnostics list for managers/admins."""
    serializer_class = FBRInvoiceListSerializer
    permission_classes = [IsManagerOrAbove]

    def get_queryset(self):
        qs = FBRInvoice.objects.all()
        st = self.request.query_params.get("status")
        if st:
            qs = qs.filter(status=st)
        return qs


class _SaleActionView(APIView):
    def _sale(self, sale_id):
        return get_object_or_404(Sale, pk=sale_id)


class FBRInvoiceStatusView(_SaleActionView):
    """GET /fbr/invoices/<sale_id>/status/"""
    permission_classes = [IsCashierOrAbove]

    def get(self, request, sale_id):
        sale = self._sale(sale_id)
        return Response(services.status_for_sale(sale, detailed=_is_manager_or_above(request.user)))


class FBRInvoiceSubmitView(_SaleActionView):
    """POST /fbr/invoices/<sale_id>/submit/"""
    permission_classes = [IsManagerOrAbove]

    def post(self, request, sale_id):
        sale = self._sale(sale_id)
        return Response(services.submit_sale(sale))


class FBRInvoiceRetryView(_SaleActionView):
    """
    POST /fbr/invoices/<sale_id>/retry/
    Body {"confirm_unknown": true} is required to re-send an invoice whose
    previous attempt may already have reached FBR (status "unknown").
    """
    permission_classes = [IsManagerOrAbove]

    def post(self, request, sale_id):
        sale = self._sale(sale_id)
        confirm = str(request.data.get("confirm_unknown", "")).lower() in ("1", "true", "yes")
        return Response(services.submit_sale(sale, allow_unknown_retry=confirm))


class FBRInvoiceValidateView(_SaleActionView):
    """POST /fbr/invoices/<sale_id>/validate/ — dry run, nothing is recorded."""
    permission_classes = [IsManagerOrAbove]

    def post(self, request, sale_id):
        return Response(services.validate_sale(self._sale(sale_id)))


class FBRProductProfileListView(APIView):
    """
    GET /fbr/products/?q=<name or sku>&limit=100 — products together with their FBR
    profile, so the settings screen can fill HS codes in bulk. `effective_hs_code`
    shows what would actually be sent (own value, else the default).
    """
    permission_classes = [IsInventoryManagerOrAbove]

    def get(self, request):
        from django.db.models import Q

        cfg = FBRSettings.load()
        q = (request.query_params.get("q") or "").strip()
        try:
            limit = max(1, min(int(request.query_params.get("limit", 100)), 200))
        except ValueError:
            limit = 100
        qs = Product.objects.select_related("fbr_profile").order_by("name")
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(sku__icontains=q))
        rows = []
        for p in qs[:limit]:
            prof = getattr(p, "fbr_profile", None)
            hs = (prof.hs_code if prof else "") or cfg.default_hs_code
            rows.append({
                "id": p.pk, "sku": p.sku, "name": p.name, "unit": p.unit,
                "tax_rate": str(p.tax_rate),
                "hs_code": prof.hs_code if prof else "", "uom": prof.uom if prof else "",
                "sale_type": prof.sale_type if prof else "",
                "effective_hs_code": hs, "missing_hs_code": not hs,
            })
        return Response({"results": rows})
