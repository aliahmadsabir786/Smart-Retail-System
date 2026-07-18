from rest_framework import serializers
from .models import CompanySettings


class CompanySettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanySettings
        fields = [
            "company_name", "logo", "address", "phone", "email", "website", "tax_id",
            "default_currency", "default_tax_percent", "invoice_prefix", "invoice_footer_note",
            "low_stock_notification_enabled", "auto_backup_enabled", "backup_frequency_days",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]
