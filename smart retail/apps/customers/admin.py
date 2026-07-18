from django.contrib import admin
from .models import Customer, CustomerGroup


@admin.register(CustomerGroup)
class CustomerGroupAdmin(admin.ModelAdmin):
    list_display = ["name", "default_discount_percent"]


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ["name", "phone", "group", "loyalty_points", "outstanding_balance", "is_active"]
    list_filter = ["group", "is_active"]
    search_fields = ["name", "phone", "email"]
