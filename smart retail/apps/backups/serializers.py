from rest_framework import serializers
from .models import Backup


class BackupSerializer(serializers.ModelSerializer):
    size_display = serializers.CharField(read_only=True)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default="")

    class Meta:
        model = Backup
        fields = [
            "id", "file", "size_bytes", "size_display",
            "is_automatic", "notes", "created_at", "created_by_name",
        ]
        read_only_fields = fields
