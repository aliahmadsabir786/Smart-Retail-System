from rest_framework import viewsets, filters, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from apps.core.permissions import IsCashierOrAbove, IsManagerOrAbove
from apps.customers.models import Customer
from apps.warehouse.models import Warehouse
from apps.sales.models import SaleItem
from . import services
from .models import Sale, Coupon, SaleReturn
from .serializers import (
    SaleSerializer, CreateSaleSerializer, AddPaymentSerializer,
    ProcessReturnSerializer, SaleReturnSerializer, PaymentSerializer,
    CouponSerializer,
)


class CouponViewSet(viewsets.ModelViewSet):
    queryset = Coupon.objects.all()
    serializer_class = CouponSerializer
    permission_classes = [IsManagerOrAbove]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["is_active"]
    search_fields = ["code"]


class SaleViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                   mixins.CreateModelMixin, viewsets.GenericViewSet):
    """
    POS / Sales endpoint. Creating a sale runs the full atomic service pipeline
    (stock deduction, pricing, credit check, loyalty points) — see apps.sales.services.
    """
    queryset = Sale.objects.select_related("customer", "warehouse", "served_by").prefetch_related(
        "items", "payments"
    )
    permission_classes = [IsCashierOrAbove]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "payment_status", "warehouse", "customer"]
    search_fields = ["invoice_number", "customer__name"]
    ordering_fields = ["created_at", "total_amount"]

    def get_serializer_class(self):
        if self.action == "create":
            return CreateSaleSerializer
        return SaleSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data

        customer = None
        if v.get("customer"):
            customer = Customer.objects.get(pk=v["customer"])
        warehouse = Warehouse.objects.get(pk=v["warehouse"])

        coupon = None
        if v.get("coupon_code"):
            coupon = Coupon.objects.filter(code=v["coupon_code"]).first()

        sale = services.create_sale(
            customer=customer, warehouse=warehouse, items=v["items"], user=request.user,
            discount_amount=v.get("discount_amount", 0), coupon=coupon,
            is_credit_sale=v.get("is_credit_sale", False), notes=v.get("notes", ""),
        )
        return Response(SaleSerializer(sale).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="pay")
    def pay(self, request, pk=None):
        """POST /sales/{id}/pay/ — record a payment (cash/card/etc.) against this invoice."""
        sale = self.get_object()
        serializer = AddPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment = services.add_payment(
            sale, serializer.validated_data["amount"], serializer.validated_data["method"],
            user=request.user, reference=serializer.validated_data.get("reference", ""),
        )
        return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="return")
    def process_return(self, request, pk=None):
        """POST /sales/{id}/return/ — process a full or partial return with automatic restocking."""
        sale = self.get_object()
        serializer = ProcessReturnSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        return_items = []
        for entry in serializer.validated_data["items"]:
            sale_item = SaleItem.objects.get(pk=entry["sale_item"], sale=sale)
            return_items.append({"sale_item": sale_item, "quantity": entry["quantity"]})

        sale_return = services.process_return(
            sale, return_items, serializer.validated_data.get("reason", ""), user=request.user,
        )
        return Response(SaleReturnSerializer(sale_return).data, status=status.HTTP_201_CREATED)


class SaleReturnViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Read-only history of processed sale returns (/api/v1/sales/returns/)."""
    queryset = SaleReturn.objects.select_related("sale", "processed_by").prefetch_related("items")
    serializer_class = SaleReturnSerializer
    permission_classes = [IsCashierOrAbove]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["sale", "status"]
    ordering_fields = ["created_at"]
