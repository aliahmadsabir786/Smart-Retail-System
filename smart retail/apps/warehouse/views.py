from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend

from apps.core.permissions import IsInventoryManagerOrAbove
from .models import Warehouse
from .serializers import WarehouseSerializer


class WarehouseViewSet(viewsets.ModelViewSet):
    """
    CRUD for warehouses. Only inventory managers and above may create/edit;
    everyone authenticated can list/retrieve (needed by POS/Sales to pick a warehouse).
    """
    queryset = Warehouse.objects.all()
    serializer_class = WarehouseSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["is_active", "city"]
    search_fields = ["name", "code", "city"]
    ordering_fields = ["name", "created_at"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsInventoryManagerOrAbove()]
        return super().get_permissions()
