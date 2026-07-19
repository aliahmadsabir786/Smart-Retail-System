from django.contrib import admin
from .models import SupplyRoute


@admin.register(SupplyRoute)
class SupplyRouteAdmin(admin.ModelAdmin):
    list_display = ["name", "area", "person", "status"]
    list_filter = ["status"]
    search_fields = ["name", "area", "person"]
    filter_horizontal = ["suppliers"]
