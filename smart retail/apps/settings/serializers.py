from rest_framework import serializers
from .models import CompanySettings


class CompanySettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompanySettings
        fields = [
            "company_name", "logo", "address", "phone", "email", "website", "tax_id",
            "default_currency", "default_tax_percent", "invoice_prefix",
            "invoice_header_note", "invoice_footer_note", "show_tax_on_receipt",
            "low_stock_notification_enabled", "low_stock_threshold",
            "auto_backup_enabled", "backup_frequency_days",
            "distributor_name", "distributor_phone", "distributor_address", "distributor_email",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]