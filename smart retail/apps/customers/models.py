from decimal import Decimal
from django.conf import settings
from django.db import models
from django.core.validators import MinValueValidator
from apps.core.models import BaseModel


class CustomerGroup(BaseModel):
    """E.g. Retail, Wholesale, VIP — drives default discount tiers."""
    name = models.CharField(max_length=100, unique=True)
    default_discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))
    description = models.TextField(blank=True)

    class Meta:
        db_table = "customer_group"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Customer(BaseModel):
    # Optional link to a login-capable User account (role=customer)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name="customer_profile")

    group = models.ForeignKey(CustomerGroup, on_delete=models.SET_NULL, null=True, blank=True,
                               related_name="customers")

    name = models.CharField(max_length=150)
    cnic = models.CharField(max_length=15, blank=True, default="",
                             help_text="Pakistani CNIC, format 35202-1234567-1")
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)

    loyalty_points = models.PositiveIntegerField(default=0)
    credit_limit = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"),
                                        validators=[MinValueValidator(Decimal("0"))])
    outstanding_balance = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"),
                                               help_text="Total unpaid amount across all invoices")

    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "customer"
        ordering = ["name"]
        indexes = [models.Index(fields=["phone"]), models.Index(fields=["email"])]

    def __str__(self):
        return self.name

    @property
    def available_credit(self):
        return self.credit_limit - self.outstanding_balance

    def can_purchase_on_credit(self, amount):
        return self.available_credit >= amount