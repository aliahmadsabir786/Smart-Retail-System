from rest_framework import generics
from apps.core.permissions import IsAdminOrAbove
from .models import CompanySettings
from .serializers import CompanySettingsSerializer


class CompanySettingsView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /settings/company/ — single company-wide settings object (singleton)."""
    serializer_class = CompanySettingsSerializer
    permission_classes = [IsAdminOrAbove]

    def get_object(self):
        return CompanySettings.load()
