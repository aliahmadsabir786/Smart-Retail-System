from rest_framework import viewsets, mixins, filters
from django_filters.rest_framework import DjangoFilterBackend

from apps.core.permissions import IsAdminOrAbove
from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Read-only — audit logs are never edited or deleted through the API."""
    queryset = AuditLog.objects.select_related("user", "content_type")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminOrAbove]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["action", "user", "content_type"]
    ordering_fields = ["created_at"]
