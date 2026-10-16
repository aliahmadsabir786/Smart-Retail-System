from rest_framework import serializers
from .models import CompanySettings


class CompanySettingsSerializer(serializers.ModelSerializer):
    # General Auth: the password itself is WRITE-ONLY (stored hashed, never
    # returned). Everyone who can read settings only learns whether it is on.
    general_auth_password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, max_length=128, trim_whitespace=False,
    )
    general_auth_clear = serializers.BooleanField(write_only=True, required=False, default=False)
    general_auth_enabled = serializers.BooleanField(read_only=True)

    class Meta:
        model = CompanySettings
        fields = [
            "company_name", "logo", "address", "phone", "email", "website", "tax_id",
            "default_currency", "default_tax_percent", "invoice_prefix",
            "invoice_header_note", "invoice_footer_note", "show_tax_on_receipt",
            "low_stock_notification_enabled", "low_stock_threshold",
            "auto_backup_enabled", "backup_frequency_days",
            "distributor_name", "distributor_phone", "distributor_address", "distributor_email",
            "general_auth_password", "general_auth_clear", "general_auth_enabled",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]

    def update(self, instance, validated_data):
        new_password = validated_data.pop("general_auth_password", "")
        clear = validated_data.pop("general_auth_clear", False)
        instance = super().update(instance, validated_data)
        # A blank password field means "leave it alone" — only a typed value
        # sets it, and only the explicit clear flag removes it.
        if clear:
            instance.set_general_auth_password("")
            instance.save(update_fields=["general_auth_password", "updated_at"])
        elif new_password:
            instance.set_general_auth_password(new_password)
            instance.save(update_fields=["general_auth_password", "updated_at"])
        return instance