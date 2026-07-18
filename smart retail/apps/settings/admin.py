from django.contrib import admin
from .models import CompanySettings


@admin.register(CompanySettings)
class CompanySettingsAdmin(admin.ModelAdmin):
    list_display = ["company_name", "default_currency", "default_tax_percent"]

    def has_add_permission(self, request):
        return not CompanySettings.objects.exists()
