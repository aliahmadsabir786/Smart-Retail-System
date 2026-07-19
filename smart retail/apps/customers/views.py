from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

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

    @action(detail=True, methods=["get"])
    def ledger(self, request, pk=None):
        """GET /customers/{id}/ledger/ — chronological statement of invoices,
        payments, and returns with a running balance."""
        customer = self.get_object()
        entries = services.get_customer_ledger(customer)
        return Response({"success": True, "customer": customer.name,
                          "opening_balance": "0.00", "entries": entries,
                          "closing_balance": str(customer.outstanding_balance)})
