from rest_framework import viewsets, mixins, status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.permissions import IsAdminOrAbove
from . import services
from .models import Backup
from .serializers import BackupSerializer


class BackupViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    /api/v1/backups/ — list past backups (each with a downloadable file URL).
    /api/v1/backups/run/ — POST to trigger a manual backup right now.

    Admin-only: a backup contains the full business database (including
    hashed user credentials), so it's gated the same as the Danger Zone
    clear-data actions in Settings.
    """
    queryset = Backup.objects.select_related("created_by")
    serializer_class = BackupSerializer
    permission_classes = [IsAdminOrAbove]

    @action(detail=False, methods=["post"], url_path="run")
    def run(self, request):
        backup = services.create_backup(user=request.user, is_automatic=False)
        return Response(BackupSerializer(backup).data, status=status.HTTP_201_CREATED)
