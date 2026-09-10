from decimal import Decimal
from rest_framework import serializers
from apps.sales.models import Payment
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


class CollectPaymentSerializer(serializers.Serializer):
    """Used for POST /customers/{id}/collect-payment/ — a general cash
    collection against the customer's running balance, not tied to any
    one invoice (e.g. a daily credit-collection round)."""
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    method = serializers.ChoiceField(choices=Payment.Method.choices, default=Payment.Method.CASH)
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    date = serializers.DateTimeField(required=False, source="occurred_on")