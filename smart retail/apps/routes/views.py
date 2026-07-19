from rest_framework import viewsets, filters
from django_filters.rest_framework import DjangoFilterBackend

from apps.core.permissions import IsManagerOrAbove
from .models import SupplyRoute
from .serializers import SupplyRouteSerializer


class SupplyRouteViewSet(viewsets.ModelViewSet):
    queryset = SupplyRoute.objects.prefetch_related("suppliers")
    serializer_class = SupplyRouteSerializer
    permission_classes = [IsManagerOrAbove]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status"]
    search_fields = ["name", "area", "person"]
    ordering_fields = ["name", "created_at"]
