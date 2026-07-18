from django.db import models
from apps.core.models import BaseModel


class OtherIncome(BaseModel):
    """Non-sales income: e.g. asset sale, refunds received, misc income."""
    title = models.CharField(max_length=200)
    category = models.CharField(max_length=100, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    income_date = models.DateField()
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "other_income"
        ordering = ["-income_date"]

    def __str__(self):
        return f"{self.title} — {self.amount} ({self.income_date})"
