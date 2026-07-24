from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db import transaction as db_transaction

from apps.core.permissions import IsManagerOrAbove
from . import services
from .models import Customer, CustomerGroup
from .serializers import CustomerSerializer, CustomerGroupSerializer


class CustomerGroupViewSet(viewsets.ModelViewSet):
    queryset = CustomerGroup.objects.all()
    serializer_class = CustomerGroupSerializer
    permission_classes = [IsManagerOrAbove]


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.select_related("group", "user")
    serializer_class = CustomerSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["group", "is_active"]
    search_fields = ["name", "email", "phone"]
    ordering_fields = ["name", "outstanding_balance", "created_at"]

    @action(detail=False, methods=["post"], url_path="bulk-create")
    def bulk_create(self, request):
        """
        POST /customers/bulk-create/ — create many customers in ONE request.

        Body: {"items": [{name, phone?, email?, address?, cnic?, loyalty_points?}, ...]}

        Built for bulk import from CSV/Excel — replaces sending one POST per
        row (100 customers = 100 round-trips) with a single request. Every
        row is still validated and saved independently (its own savepoint),
        so one bad row is reported in "errors" without blocking the rest.
        """
        items = request.data.get("items")
        if not isinstance(items, list) or not items:
            return Response({"detail": "Expected a non-empty 'items' list."}, status=status.HTTP_400_BAD_REQUEST)

        created, errors = [], []
        for idx, row in enumerate(items):
            try:
                with db_transaction.atomic():
                    serializer = CustomerSerializer(data=row, context={"request": request})
                    serializer.is_valid(raise_exception=True)
                    customer = serializer.save()
                    created.append(CustomerSerializer(customer, context={"request": request}).data)
            except Exception as exc:
                detail = exc.detail if hasattr(exc, "detail") else str(exc)
                errors.append({"index": idx, "row": row, "error": detail})

        return Response(
            {"success": True, "created_count": len(created), "error_count": len(errors),
             "created": created, "errors": errors},
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get"])
    def ledger(self, request, pk=None):
        """GET /customers/{id}/ledger/ — chronological statement of invoices,
        payments, and returns with a running balance."""
        customer = self.get_object()
        entries = services.get_customer_ledger(customer)
        return Response({"success": True, "customer": customer.name,
                          "opening_balance": "0.00", "entries": entries,
                          "closing_balance": str(customer.outstanding_balance)})