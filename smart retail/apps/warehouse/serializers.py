from rest_framework import serializers
from .models import Warehouse


class WarehouseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Warehouse
        fields = ["id", "name", "code", "address", "city", "phone",
                  "is_active", "is_default", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
