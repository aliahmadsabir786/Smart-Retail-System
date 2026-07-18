import uuid
from decimal import Decimal
from django.conf import settings
from django.db import models
from django.core.validators import MinValueValidator
from apps.core.models import BaseModel
from apps.products.models import Product, ProductVariant
from apps.warehouse.models import Warehouse
from apps.suppliers.models import Supplier


class PurchaseOrder(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ORDERED = "ordered", "Ordered"
        PARTIALLY_RECEIVED = "partially_received", "Partially Received"
        RECEIVED = "received", "Fully Received"
        CANCELLED = "cancelled", "Cancelled"

    po_number = models.CharField(max_length=30, unique=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchase_orders")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="purchase_orders")
    ordered_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    notes = models.TextField(blank=True)
    expected_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "purchase_order"
        ordering = ["-created_at"]

    def __str__(self):
        return self.po_number

    @property
    def due_amount(self):
        return (self.total_amount - self.paid_amount).quantize(Decimal("0.01"))

    @staticmethod
    def generate_po_number():
        return f"PO-{uuid.uuid4().hex[:10].upper()}"


class PurchaseOrderItem(BaseModel):
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="purchase_items")
    variant = models.ForeignKey(ProductVariant, on_delete=models.PROTECT, null=True, blank=True)

    quantity_ordered = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    quantity_received = models.PositiveIntegerField(default=0)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2)
    tax_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))

    class Meta:
        db_table = "purchase_order_item"

    def __str__(self):
        return f"{self.product.sku} x{self.quantity_ordered} on {self.purchase_order.po_number}"

    @property
    def line_subtotal(self):
        return (self.unit_cost * self.quantity_ordered).quantize(Decimal("0.01"))

    @property
    def line_tax(self):
        return (self.line_subtotal * self.tax_percent / Decimal("100")).quantize(Decimal("0.01"))

    @property
    def line_total(self):
        return (self.line_subtotal + self.line_tax).quantize(Decimal("0.01"))

    @property
    def quantity_pending(self):
        return self.quantity_ordered - self.quantity_received


class SupplierPayment(BaseModel):
    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        CHEQUE = "cheque", "Cheque"
        OTHER = "other", "Other"

    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name="payments")
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    method = models.CharField(max_length=20, choices=Method.choices, default=Method.BANK_TRANSFER)
    reference = models.CharField(max_length=100, blank=True)
    paid_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    class Meta:
        db_table = "supplier_payment"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.purchase_order.po_number} — {self.amount}"
