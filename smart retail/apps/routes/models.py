from django.db import models
from apps.core.models import BaseModel
from apps.suppliers.models import Supplier


class SupplyRoute(BaseModel):
    """A recurring route for visiting suppliers on specific days of the
    week (procurement/collection rounds) — distinct from customer delivery."""

    class Day(models.TextChoices):
        MONDAY = "Monday", "Monday"
        TUESDAY = "Tuesday", "Tuesday"
        WEDNESDAY = "Wednesday", "Wednesday"
        THURSDAY = "Thursday", "Thursday"
        FRIDAY = "Friday", "Friday"
        SATURDAY = "Saturday", "Saturday"
        SUNDAY = "Sunday", "Sunday"

    class Status(models.TextChoices):
        ACTIVE = "Active", "Active"
        INACTIVE = "Inactive", "Inactive"

    name = models.CharField(max_length=150)
    area = models.CharField(max_length=200, blank=True)
    person = models.CharField(max_length=150, blank=True, help_text="Name of the person covering this route")
    days = models.JSONField(default=list, blank=True, help_text='e.g. ["Monday", "Wednesday", "Friday"]')
    suppliers = models.ManyToManyField(Supplier, blank=True, related_name="supply_routes")
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        db_table = "supply_route"
        ordering = ["name"]

    def __str__(self):
        return self.name
