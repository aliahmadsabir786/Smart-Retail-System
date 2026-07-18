from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from apps.core.permissions import IsInventoryManagerOrAbove
from .models import Category
from .serializers import CategorySerializer, CategoryTreeSerializer


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.select_related("parent").all()
    serializer_class = CategorySerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["is_active", "parent"]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsInventoryManagerOrAbove()]
        return super().get_permissions()

    @action(detail=False, methods=["get"])
    def tree(self, request):
        """GET /categories/tree/ — full nested category tree (root nodes only, children recursive)."""
        roots = self.get_queryset().filter(parent__isnull=True, is_active=True)
        return Response(CategoryTreeSerializer(roots, many=True).data)
