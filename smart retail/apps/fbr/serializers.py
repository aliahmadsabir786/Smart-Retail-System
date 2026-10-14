from django.utils import timezone
from rest_framework import serializers

from .models import CustomerFBRProfile, FBRInvoice, FBRSettings, ProductFBRProfile


def _digits_only(value: str) -> str:
    return "".join(c for c in (value or "") if c.isdigit())


class FBRSettingsSerializer(serializers.ModelSerializer):
    # Write-only: the token can be set or cleared, but is never sent back.
    api_token = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=True)
    clear_token = serializers.BooleanField(write_only=True, required=False, default=False)

    token_configured = serializers.BooleanField(read_only=True)
    missing_configuration = serializers.ListField(read_only=True)
    post_url = serializers.CharField(read_only=True)
    validate_url = serializers.CharField(read_only=True)

    class Meta:
        model = FBRSettings
        fields = [
            "is_enabled", "environment", "api_token", "clear_token", "token_configured",
            "seller_ntn_cnic", "seller_business_name", "seller_province", "seller_address",
            "default_hs_code", "default_uom", "default_sale_type", "sandbox_scenario_id",
            "request_timeout_seconds", "post_url_override", "validate_url_override",
            "auto_submit_enabled", "auto_submit_from",
            "post_url", "validate_url", "missing_configuration", "updated_at",
        ]
        read_only_fields = ["auto_submit_from", "updated_at"]

    def validate_seller_ntn_cnic(self, value):
        digits = _digits_only(value)
        if digits and len(digits) not in (7, 13):
            raise serializers.ValidationError("Enter a 7-digit NTN or a 13-digit CNIC.")
        return digits

    def validate_request_timeout_seconds(self, value):
        if not 5 <= value <= 120:
            raise serializers.ValidationError("Timeout must be between 5 and 120 seconds.")
        return value

    def update(self, instance, validated_data):
        token = validated_data.pop("api_token", None)
        clear = validated_data.pop("clear_token", False)
        was_auto = instance.auto_submit_enabled

        for k, v in validated_data.items():
            setattr(instance, k, v)
        if clear:
            instance.api_token_encrypted = ""
        elif token:
            instance.set_token(token)

        # Turning auto-submit on starts the clock now: older sales are never swept in.
        if instance.auto_submit_enabled and not was_auto:
            instance.auto_submit_from = timezone.now()
        if not instance.auto_submit_enabled:
            instance.auto_submit_from = None
        instance.save()
        return instance


class ProductFBRProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductFBRProfile
        fields = ["hs_code", "uom", "sale_type", "sro_schedule_no", "sro_item_serial_no", "further_tax_percent"]


class CustomerFBRProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerFBRProfile
        fields = ["ntn_cnic", "registration_type", "province"]

    def validate_ntn_cnic(self, value):
        digits = _digits_only(value)
        if digits and len(digits) not in (7, 9, 13):
            raise serializers.ValidationError("Enter a 7/9-digit NTN or a 13-digit CNIC.")
        return digits


class FBRInvoiceListSerializer(serializers.ModelSerializer):
    """Admin diagnostics list. Never includes the request payload."""

    class Meta:
        model = FBRInvoice
        fields = ["id", "sale", "local_invoice_number", "status", "is_sandbox", "fbr_invoice_number",
                  "submitted_at", "last_attempt_at", "retry_count", "http_status",
                  "error_category", "error_code", "error_message", "created_at"]
