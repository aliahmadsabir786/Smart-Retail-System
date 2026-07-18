from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend

from apps.core.permissions import IsManagerOrAbove
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
