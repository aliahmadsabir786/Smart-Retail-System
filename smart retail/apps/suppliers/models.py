from decimal import Decimal
from django.db import models
from apps.core.models import BaseModel


class Supplier(BaseModel):
    name = models.CharField(max_length=150)
    contact_person = models.CharField(max_length=150, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)

    outstanding_payable = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"),
                                               help_text="Total amount owed to this supplier")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "supplier"
        ordering = ["name"]
        indexes = [models.Index(fields=["phone"]), models.Index(fields=["email"])]

    def __str__(self):
        return self.name
