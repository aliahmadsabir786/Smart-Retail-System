from django.db import models
from django.core.validators import MinValueValidator
from apps.core.models import BaseModel
from apps.products.models import Product, ProductVariant
from apps.warehouse.models import Warehouse


class StockItem(BaseModel):
    """
    Current on-hand quantity of a product (optionally a specific variant)
    at a specific warehouse. This is the 'live' balance; StockTransaction
    is the append-only ledger that explains how it got there.
    """
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="stock_items")
    variant = models.ForeignKey(ProductVariant, on_delete=models.CASCADE, null=True, blank=True,
                                 related_name="stock_items")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name="stock_items")
    quantity = models.IntegerField(default=0, validators=[MinValueValidator(0)])

    class Meta:
        db_table = "stock_item"
        unique_together = [("product", "variant", "warehouse")]
        ordering = ["id"]
        indexes = [models.Index(fields=["product", "warehouse"])]

    def __str__(self):
        return f"{self.product.sku} @ {self.warehouse.code}: {self.quantity}"

    @property
    def is_low_stock(self):
        return self.quantity <= self.product.reorder_level

    @property
    def is_out_of_stock(self):
        return self.quantity <= 0


class StockTransaction(BaseModel):
    """
    Append-only stock ledger. Every change to StockItem.quantity must be
    accompanied by a StockTransaction row created via apps.inventory.services —
    never mutate StockItem.quantity directly outside the service layer.
    """

    class TransactionType(models.TextChoices):
        STOCK_IN = "stock_in", "Stock In"
        STOCK_OUT = "stock_out", "Stock Out"
        ADJUSTMENT_INCREASE = "adjustment_increase", "Adjustment (Increase)"
        ADJUSTMENT_DECREASE = "adjustment_decrease", "Adjustment (Decrease)"
        TRANSFER_OUT = "transfer_out", "Transfer Out"
        TRANSFER_IN = "transfer_in", "Transfer In"
        SALE = "sale", "Sale"
        SALE_RETURN = "sale_return", "Sale Return"
        PURCHASE = "purchase", "Purchase Received"
        PURCHASE_RETURN = "purchase_return", "Purchase Return"

    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="stock_transactions")
    variant = models.ForeignKey(ProductVariant, on_delete=models.PROTECT, null=True, blank=True,
                                 related_name="stock_transactions")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="stock_transactions")

    transaction_type = models.CharField(max_length=25, choices=TransactionType.choices)
    quantity = models.IntegerField(help_text="Always positive; direction implied by transaction_type")
    balance_after = models.IntegerField(help_text="StockItem.quantity snapshot immediately after this entry")

    reference = models.CharField(max_length=100, blank=True, help_text="PO#, Invoice#, Transfer#, etc.")
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "stock_transaction"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["product", "warehouse"]),
            models.Index(fields=["transaction_type"]),
        ]

    def __str__(self):
        return f"{self.transaction_type} — {self.product.sku} x{self.quantity} @ {self.warehouse.code}"


class StockTransfer(BaseModel):
    """Warehouse-to-warehouse transfer request/record, drives paired TRANSFER_OUT/TRANSFER_IN ledger entries."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        IN_TRANSIT = "in_transit", "In Transit"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    transfer_number = models.CharField(max_length=30, unique=True)
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="transfers")
    variant = models.ForeignKey(ProductVariant, on_delete=models.PROTECT, null=True, blank=True)
    quantity = models.PositiveIntegerField()
    from_warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="transfers_out")
    to_warehouse = models.ForeignKey(Warehouse, on_delete=models.PROTECT, related_name="transfers_in")
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    notes = models.TextField(blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "stock_transfer"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.transfer_number}: {self.product.sku} {self.from_warehouse.code} -> {self.to_warehouse.code}"
