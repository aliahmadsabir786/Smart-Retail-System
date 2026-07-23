from decimal import Decimal
from django.conf import settings
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from apps.core.models import BaseModel
from apps.products.models import Product, ProductVariant
from apps.warehouse.models import Warehouse
from apps.customers.models import Customer


class Coupon(BaseModel):
    class DiscountType(models.TextChoices):
        PERCENT = "percent", "Percentage"
        FIXED = "fixed", "Fixed Amount"

    code = models.CharField(max_length=30, unique=True)
    discount_type = models.CharField(max_length=10, choices=DiscountType.choices, default=DiscountType.PERCENT)
    discount_value = models.DecimalField(max_digits=10, decimal_places=2)
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    usage_limit = models.PositiveIntegerField(null=True, blank=True, help_text="Blank = unlimited")
    used_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "coupon"

    def __str__(self):
        return self.code

    def is_valid(self, at=None):
        from django.utils import timezone
        now = at or timezone.now()
        if not self.is_active or not (self.valid_from <= now <= self.valid_to):
            return False
        if self.usage_limit is not None and self.used_count >= self.usage_limit:
            return False
        return True

    def calculate_discount(self, subtotal: Decimal) -> Decimal:
        if self.discount_type == self.DiscountType.PERCENT:
            return (subtotal * self.discount_value / Decimal("100")).quantize(Decimal("0.01"))
        return min(self.discount_value, subtotal)


class Sale(BaseModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        RETURNED = "returned", "Returned"
        PARTIALLY_RETURNED = "partially_returned", "Partially Returned"

    class PaymentStatus(models.TextChoices):
        UNPAID = "unpaid", "Unpaid"
        PARTIAL = "partial", "Partially Paid"
        PAID = "paid", "Paid"

    invoice_number = models.CharField(max_length=30, unique=True)
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name="sales")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="sales")
    served_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                   related_name="sales_served")
    coupon = models.ForeignKey(Coupon, on_delete=models.SET_NULL, null=True, blank=True, related_name="sales")

    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.COMPLETED)
    payment_status = models.CharField(max_length=10, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID)

    notes = models.TextField(blank=True)

    class Meta:
        db_table = "sale"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["invoice_number"]), models.Index(fields=["status"])]

    def __str__(self):
        return self.invoice_number

    @property
    def due_amount(self):
        return (self.total_amount - self.paid_amount).quantize(Decimal("0.01"))

    @staticmethod
    def generate_invoice_number():
        """
        Builds the next invoice number as {company's configured prefix}{sequential number}.

        Uses a sequential counter rather than a random one: with only 3 digits
        (000-999) a random number would start colliding with existing invoice
        numbers fairly quickly (invoice_number is unique=True), causing an
        IntegrityError on save. A sequential counter can never collide, and
        it's also the more standard, auditable pattern for invoice numbering.
        Rolls naturally past 999 to 4+ digits instead of erroring out.
        """
        from apps.settings.models import CompanySettings

        settings_row = CompanySettings.objects.first()
        prefix = (settings_row.invoice_prefix if settings_row else "INV-") or "INV-"

        # all_objects (not the soft-delete-filtered default manager) so a
        # deleted invoice's number still counts — its row still occupies
        # that unique invoice_number in the database.
        last_number = (
            Sale.all_objects.filter(invoice_number__startswith=prefix)
            .order_by("-id")
            .values_list("invoice_number", flat=True)
            .first()
        )
        next_seq = 1
        if last_number:
            suffix = last_number[len(prefix):]
            if suffix.isdigit():
                next_seq = int(suffix) + 1

        return f"{prefix}{next_seq:03d}"


class SaleItem(BaseModel):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="sale_items")
    variant = models.ForeignKey(ProductVariant, on_delete=models.PROTECT, null=True, blank=True)

    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))
    tax_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))

    quantity_returned = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "sale_item"

    def __str__(self):
        return f"{self.product.sku} x{self.quantity} on {self.sale.invoice_number}"

    @property
    def line_subtotal(self):
        return (self.unit_price * self.quantity).quantize(Decimal("0.01"))

    @property
    def line_discount(self):
        return (self.line_subtotal * self.discount_percent / Decimal("100")).quantize(Decimal("0.01"))

    @property
    def line_taxable(self):
        return self.line_subtotal - self.line_discount

    @property
    def line_tax(self):
        return (self.line_taxable * self.tax_percent / Decimal("100")).quantize(Decimal("0.01"))

    @property
    def line_total(self):
        return (self.line_taxable + self.line_tax).quantize(Decimal("0.01"))


class Payment(BaseModel):
    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        MOBILE_WALLET = "mobile_wallet", "Mobile Wallet"
        OTHER = "other", "Other"

    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="payments")
    amount = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0.01"))])
    method = models.CharField(max_length=20, choices=Method.choices, default=Method.CASH)
    reference = models.CharField(max_length=100, blank=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    class Meta:
        db_table = "sale_payment"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.sale.invoice_number} — {self.amount} ({self.method})"


class SaleReturn(BaseModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    sale = models.ForeignKey(Sale, on_delete=models.PROTECT, related_name="returns")
    reason = models.TextField(blank=True)
    refund_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.APPROVED)
    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    class Meta:
        db_table = "sale_return"
        ordering = ["-created_at"]

    def __str__(self):
        return f"Return for {self.sale.invoice_number}"


class SaleReturnItem(BaseModel):
    sale_return = models.ForeignKey(SaleReturn, on_delete=models.CASCADE, related_name="items")
    sale_item = models.ForeignKey(SaleItem, on_delete=models.PROTECT, related_name="return_items")
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    refund_amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "sale_return_item"