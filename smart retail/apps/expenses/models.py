from decimal import Decimal
from django.conf import settings
from django.db import models
from apps.core.models import BaseModel
from apps.warehouse.models import Warehouse


class ExpenseCategory(BaseModel):
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "expense_category"
        ordering = ["name"]
        verbose_name_plural = "Expense Categories"

    def __str__(self):
        return self.name


class Expense(BaseModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending Approval"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    category = models.ForeignKey(ExpenseCategory, on_delete=models.PROTECT, related_name="expenses")
    warehouse = models.ForeignKey(Warehouse, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name="expenses")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    expense_date = models.DateField()
    receipt = models.FileField(upload_to="expenses/receipts/", null=True, blank=True)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.APPROVED)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                     blank=True, related_name="approved_expenses")

    class Meta:
        db_table = "expense"
        ordering = ["-expense_date"]
        indexes = [models.Index(fields=["expense_date"]), models.Index(fields=["status"])]

    def __str__(self):
        return f"{self.title} — {self.amount} ({self.expense_date})"
