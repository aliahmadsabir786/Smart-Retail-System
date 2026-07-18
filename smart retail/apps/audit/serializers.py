from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    user_email = serializers.CharField(source="user.email", read_only=True, default=None)
    model_name = serializers.CharField(source="content_type.model", read_only=True)

    class Meta:
        model = AuditLog
        fields = ["id", "user", "user_email", "action", "model_name", "object_id",
                  "object_repr", "changes", "created_at"]
        read_only_fields = fields
