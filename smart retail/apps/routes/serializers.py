from rest_framework import serializers
from .models import SupplyRoute


class SupplyRouteSerializer(serializers.ModelSerializer):
    supplier_names = serializers.SerializerMethodField()

    class Meta:
        model = SupplyRoute
        fields = ["id", "name", "area", "person", "days", "suppliers", "supplier_names",
                  "notes", "status", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_supplier_names(self, obj):
        return [s.name for s in obj.suppliers.all()]
