from decimal import Decimal
from rest_framework import serializers
from apps.products.models import Product, ProductVariant
from .models import Sale, SaleItem, Payment, Coupon, SaleReturn, SaleReturnItem


class CouponSerializer(serializers.ModelSerializer):
    class Meta:
        model = Coupon
        fields = ["id", "code", "discount_type", "discount_value", "valid_from", "valid_to",
                  "usage_limit", "used_count", "is_active"]
        read_only_fields = ["id", "used_count"]


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_sku = serializers.CharField(source="product.sku", read_only=True)
    line_subtotal = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    line_discount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    line_tax = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    line_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = SaleItem
        fields = ["id", "product", "product_name", "product_sku", "variant", "quantity",
                  "unit_price", "discount_percent", "tax_percent", "quantity_returned",
                  "line_subtotal", "line_discount", "line_tax", "line_total"]
        read_only_fields = fields


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ["id", "sale", "customer", "amount", "method", "reference", "received_by", "created_at"]
        read_only_fields = ["id", "sale", "customer", "received_by", "created_at"]


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True, default=None)
    customer_cnic = serializers.CharField(source="customer.cnic", read_only=True, default=None)
    customer_address = serializers.CharField(source="customer.address", read_only=True, default=None)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    served_by_name = serializers.CharField(source="served_by.get_full_name", read_only=True, default=None)
    due_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    # LIVE: what the customer still owes on their EARLIER bills right now. It
    # used to be the figure frozen when this invoice was booked, so a pending
    # balance cleared later in the day still printed as "previous" on today's
    # invoice. The frozen figure is still available as previous_balance_at_booking.
    previous_balance = serializers.SerializerMethodField()
    previous_balance_at_booking = serializers.DecimalField(
        source="previous_balance", max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = Sale
        fields = [
            "id", "invoice_number", "customer", "customer_name", "customer_cnic", "customer_address",
            "warehouse", "warehouse_name",
            "served_by", "served_by_name", "coupon", "subtotal", "discount_amount", "tax_amount",
            "total_amount", "paid_amount", "due_amount", "previous_balance", "previous_balance_at_booking",
            "status", "payment_status",
            "is_credit", "notes",
            "items", "payments", "created_at",
        ]
        read_only_fields = fields

    def get_previous_balance(self, sale):
        """Live "Previous Balance" for this invoice = what is STILL unpaid on the
        customer's bills created before it (oldest payments first), so paying a
        pending bill off is reflected on the next view/print immediately. Later
        bills never count. Any standalone "General Collection" advance is applied
        to the oldest dues first; if it more than covers them the leftover shows
        as a negative figure (an advance), as before. Drafts / cancelled /
        returned invoices keep their frozen figure."""
        frozen = sale.previous_balance
        if not sale.customer_id or sale.status in (
            Sale.Status.DRAFT, Sale.Status.CANCELLED, Sale.Status.RETURNED
        ):
            return str(frozen.quantize(Decimal("0.01")))

        # One small computation per customer per request, shared by every
        # invoice of that customer in a list.
        cache = self.context.setdefault("_live_prev", {})
        table = cache.get(sale.customer_id)
        if table is None:
            from django.db.models import Sum
            rows = (Sale.objects.filter(customer_id=sale.customer_id)
                    .exclude(status__in=[Sale.Status.DRAFT, Sale.Status.CANCELLED, Sale.Status.RETURNED])
                    .order_by("created_at", "id")
                    .values_list("id", "total_amount", "paid_amount"))
            credit = (Payment.objects.filter(customer_id=sale.customer_id, sale__isnull=True)
                      .aggregate(t=Sum("amount"))["t"] or Decimal("0"))
            table, owed_before = {}, Decimal("0")
            for sid, total, paid in rows:
                table[sid] = owed_before - credit          # credit still unused before this bill
                due = max(Decimal("0"), total - paid)
                used = min(credit, due)
                credit -= used
                owed_before += due - used
            cache[sale.customer_id] = table

        value = table.get(sale.id, frozen)
        return str(Decimal(value).quantize(Decimal("0.01")))


# ---------------------------------------------------------------------------
# Write serializers — thin validation layer in front of apps.sales.services
# ---------------------------------------------------------------------------

class SaleItemInputSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    variant = serializers.PrimaryKeyRelatedField(queryset=ProductVariant.objects.all(),
                                                  required=False, allow_null=True)
    quantity = serializers.IntegerField(min_value=1)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    discount_percent = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, default=Decimal("0"))
    tax_percent = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, default=Decimal("0"))

    def validate(self, attrs):
        if "unit_price" not in attrs:
            attrs["unit_price"] = attrs["product"].selling_price
        return attrs


class CreateSaleSerializer(serializers.Serializer):
    customer = serializers.IntegerField(required=False, allow_null=True)
    warehouse = serializers.IntegerField()
    items = SaleItemInputSerializer(many=True)
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, default=Decimal("0"))
    coupon_code = serializers.CharField(required=False, allow_blank=True, default="")
    is_credit_sale = serializers.BooleanField(required=False, default=False)
    notes = serializers.CharField(required=False, allow_blank=True, default="")


class AddPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    method = serializers.ChoiceField(choices=Payment.Method.choices, default=Payment.Method.CASH)
    reference = serializers.CharField(required=False, allow_blank=True, default="")


class PaymentEditSerializer(serializers.Serializer):
    """Used to manually correct an already-recorded payment from the Ledger
    Accounts screen — every field is optional since this backs a PATCH."""
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"), required=False)
    method = serializers.ChoiceField(choices=Payment.Method.choices, required=False)
    reference = serializers.CharField(required=False, allow_blank=True)
    date = serializers.DateTimeField(required=False, source="occurred_on")


class FinalizeSaleSerializer(serializers.Serializer):
    """Converts a held (draft) invoice into a completed sale."""
    coupon_code = serializers.CharField(required=False, allow_blank=True, default="")
    is_credit_sale = serializers.BooleanField(required=False, default=False)


class ReturnItemInputSerializer(serializers.Serializer):
    sale_item = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class ProcessReturnSerializer(serializers.Serializer):
    items = ReturnItemInputSerializer(many=True)
    reason = serializers.CharField(required=False, allow_blank=True, default="")


class SaleReturnItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleReturnItem
        fields = ["id", "sale_item", "quantity", "refund_amount"]
        read_only_fields = fields


class SaleReturnSerializer(serializers.ModelSerializer):
    items = SaleReturnItemSerializer(many=True, read_only=True)

    class Meta:
        model = SaleReturn
        fields = ["id", "sale", "reason", "refund_amount", "status", "processed_by", "items", "created_at"]
        read_only_fields = fields