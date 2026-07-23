from rest_framework import serializers
from .models import Customer, CustomerGroup


class CustomerGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerGroup
        fields = ["id", "name", "default_discount_percent", "description"]
        read_only_fields = ["id"]


class CustomerSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source="group.name", read_only=True, default=None)
    available_credit = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Customer
        fields = ["id", "user", "group", "group_name", "name", "cnic", "email", "phone", "address", "city",
                  "loyalty_points", "credit_limit", "outstanding_balance", "available_credit",
                  "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]