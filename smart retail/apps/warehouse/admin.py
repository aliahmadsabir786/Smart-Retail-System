from django.contrib import admin
from .models import Warehouse


@admin.register(Warehouse)
class WarehouseAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "city", "is_active", "is_default"]
    list_filter = ["is_active", "is_default"]
    search_fields = ["name", "code", "city"]
