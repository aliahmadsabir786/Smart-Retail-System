from rest_framework import serializers
from .models import StockItem, StockTransaction, StockTransfer


class StockItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    is_out_of_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = StockItem
        fields = ["id", "product", "product_name", "product_sku", "variant", "warehouse",
                  "warehouse_name", "quantity", "is_low_stock", "is_out_of_stock", "updated_at"]
        read_only_fields = ["id", "quantity", "updated_at"]


class StockTransactionSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = StockTransaction
        fields = ["id", "product", "product_name", "variant", "warehouse", "warehouse_name",
                  "transaction_type", "quantity", "balance_after", "reference", "notes",
                  "created_by", "created_by_name", "created_at"]
        read_only_fields = fields


class StockInSerializer(serializers.Serializer):
    product = serializers.IntegerField()
    warehouse = serializers.IntegerField()
    variant = serializers.IntegerField(required=False, allow_null=True)
    quantity = serializers.IntegerField(min_value=1)
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class StockOutSerializer(StockInSerializer):
    pass


class StockAdjustSerializer(serializers.Serializer):
    product = serializers.IntegerField()
    warehouse = serializers.IntegerField()
    variant = serializers.IntegerField(required=False, allow_null=True)
    new_quantity = serializers.IntegerField(min_value=0)
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class StockTransferSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    from_warehouse_name = serializers.CharField(source="from_warehouse.name", read_only=True)
    to_warehouse_name = serializers.CharField(source="to_warehouse.name", read_only=True)

    class Meta:
        model = StockTransfer
        fields = ["id", "transfer_number", "product", "product_name", "variant", "quantity",
                  "from_warehouse", "from_warehouse_name", "to_warehouse", "to_warehouse_name",
                  "status", "notes", "completed_at", "created_at"]
        read_only_fields = ["id", "transfer_number", "status", "completed_at", "created_at"]

    def validate(self, attrs):
        if attrs["from_warehouse"] == attrs["to_warehouse"]:
            raise serializers.ValidationError("Source and destination warehouse must differ.")
        return attrs
