from decimal import Decimal
from rest_framework import serializers
from apps.products.models import Product, ProductVariant
from .models import PurchaseOrder, PurchaseOrderItem, SupplierPayment


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    line_subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    line_tax = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    quantity_pending = serializers.IntegerField(read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = ["id", "product", "product_name", "product_sku", "variant", "quantity_ordered",
                  "quantity_received", "quantity_pending", "unit_cost", "tax_percent",
                  "line_subtotal", "line_tax", "line_total"]
        read_only_fields = fields


class SupplierPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupplierPayment
        fields = ["id", "purchase_order", "amount", "method", "reference", "paid_by", "created_at"]
        read_only_fields = ["id", "purchase_order", "paid_by", "created_at"]


class PurchaseOrderSerializer(serializers.ModelSerializer):
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    payments = SupplierPaymentSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    due_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = [
            "id", "po_number", "supplier", "supplier_name", "warehouse", "warehouse_name",
            "ordered_by", "subtotal", "tax_amount", "total_amount", "paid_amount", "due_amount",
            "status", "notes", "expected_date", "items", "payments", "created_at",
        ]
        read_only_fields = fields


# --- write serializers -------------------------------------------------

class PurchaseOrderItemInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    variant = serializers.PrimaryKeyRelatedField(queryset=ProductVariant.objects.all(),
                                                  required=False, allow_null=True)
    quantity_ordered = serializers.IntegerField(min_value=1)
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2)
    tax_percent = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, default=Decimal("0"))


class CreatePurchaseOrderSerializer(serializers.Serializer):
    supplier = serializers.IntegerField()
    warehouse = serializers.IntegerField()
    items = PurchaseOrderItemInputSerializer(many=True)
    expected_date = serializers.DateField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ReceiveItemInputSerializer(serializers.Serializer):
    purchase_order_item = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class ReceiveStockSerializer(serializers.Serializer):
    items = ReceiveItemInputSerializer(many=True)


class AddSupplierPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    method = serializers.ChoiceField(choices=SupplierPayment.Method.choices, default=SupplierPayment.Method.BANK_TRANSFER)
    reference = serializers.CharField(required=False, allow_blank=True, default="")
