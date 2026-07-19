from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from apps.core.permissions import IsManagerOrAbove
from . import services
from .models import Supplier
from .serializers import SupplierSerializer


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["is_active"]
    search_fields = ["name", "email", "phone", "contact_person"]
    ordering_fields = ["name", "outstanding_payable", "created_at"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsManagerOrAbove()]
        return super().get_permissions()

    @action(detail=True, methods=["get"])
    def ledger(self, request, pk=None):
        """GET /suppliers/{id}/ledger/ — chronological statement of purchase
        orders, payments, and returns with a running balance."""
        supplier = self.get_object()
        entries = services.get_supplier_ledger(supplier)
        return Response({"success": True, "supplier": supplier.name,
                          "opening_balance": "0.00", "entries": entries,
                          "closing_balance": str(supplier.outstanding_payable)})
