from django.db.models import Q
from rest_framework import serializers

from apps.core.exceptions import ServiceException  # noqa: F401  (re-exported for views)
from .models import (
    ActivityType, Bank, BankAccount, BankActivity, BankActivityChange, BankAttachment,
    DailyVerification, PaymentContact,
)


class BankSerializer(serializers.ModelSerializer):
    logo = serializers.CharField(source="logo_data", read_only=True)

    class Meta:
        model = Bank
        fields = ["id", "name", "code", "branch", "status", "logo", "created_at"]
        read_only_fields = ["id", "created_at"]


class BankAccountListSerializer(serializers.ModelSerializer):
    """Lists show the MASKED number only."""
    bank_name = serializers.CharField(source="bank.name", read_only=True)
    masked_account_number = serializers.CharField(read_only=True)
    label = serializers.CharField(read_only=True)

    class Meta:
        model = BankAccount
        fields = ["id", "bank", "bank_name", "account_title", "masked_account_number", "branch",
                  "account_type", "status", "label", "created_at"]


class BankAccountDetailSerializer(BankAccountListSerializer):
    """Detail / create / edit include the full number and IBAN."""

    class Meta(BankAccountListSerializer.Meta):
        fields = BankAccountListSerializer.Meta.fields + ["account_number", "iban", "notes"]
        read_only_fields = ["id", "created_at"]


class PaymentContactListSerializer(serializers.ModelSerializer):
    masked_account_number = serializers.CharField(read_only=True)

    class Meta:
        model = PaymentContact
        fields = ["id", "name", "company_name", "bank_name", "account_title", "masked_account_number",
                  "phone", "status", "created_at"]


class PaymentContactDetailSerializer(PaymentContactListSerializer):
    class Meta(PaymentContactListSerializer.Meta):
        fields = PaymentContactListSerializer.Meta.fields + ["account_number", "iban", "notes"]
        read_only_fields = ["id", "created_at"]


class AttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BankAttachment
        fields = ["id", "original_name", "file_type", "file_size", "kind", "created_at", "uploaded_by_name"]

    def get_uploaded_by_name(self, obj):
        u = obj.created_by
        return (u.get_full_name() or u.email) if u else ""


class ChangeSerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BankActivityChange
        fields = ["id", "field", "old_value", "new_value", "reason", "changed_by_name", "changed_at"]

    def get_changed_by_name(self, obj):
        u = obj.changed_by
        return (u.get_full_name() or u.email) if u else ""


class BankActivitySerializer(serializers.ModelSerializer):
    from_label = serializers.SerializerMethodField()
    to_label = serializers.SerializerMethodField()
    recipient_display = serializers.SerializerMethodField()
    recipient_account_masked = serializers.SerializerMethodField()
    type_label = serializers.CharField(source="get_activity_type_display", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    method_label = serializers.CharField(source="get_payment_method_display", read_only=True)
    attachment_count = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()
    # Reason for a change (edit of a completed record) — write-only, goes to the audit trail.
    change_reason = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = BankActivity
        fields = [
            "id", "activity_type", "type_label", "date", "time",
            "from_account", "from_label", "to_account", "to_label",
            "recipient", "recipient_display", "recipient_name", "recipient_bank",
            "recipient_account_title", "recipient_account_number", "recipient_account_masked", "recipient_iban",
            "amount", "payment_method", "method_label",
            "system_reference", "bank_reference", "slip_number", "purpose", "description", "notes",
            "status", "status_label", "status_reason", "status_changed_at",
            "attachment_count", "created_by_name", "created_at", "updated_at", "change_reason",
        ]
        read_only_fields = ["id", "system_reference", "status_reason", "status_changed_at",
                            "created_at", "updated_at"]
        extra_kwargs = {
            # The full recipient number is only returned by the detail view (see to_representation).
            "recipient_account_number": {"required": False, "allow_blank": True},
        }

    # ---- read side -------------------------------------------------------
    def _acc(self, acc):
        return acc.label if acc else ""

    def get_from_label(self, obj):
        if obj.activity_type == ActivityType.DEPOSIT:
            return "Cash / Depositor"
        return self._acc(obj.from_account)

    def get_to_label(self, obj):
        if obj.activity_type in (ActivityType.DEPOSIT, ActivityType.TRANSFER):
            return self._acc(obj.to_account)
        return obj.recipient_name or (obj.recipient.name if obj.recipient else "")

    def get_recipient_display(self, obj):
        return obj.recipient_name or (obj.recipient.name if obj.recipient else "")

    def get_recipient_account_masked(self, obj):
        from .models import mask_number
        return mask_number(obj.recipient_account_number)

    def get_attachment_count(self, obj):
        return sum(1 for a in obj.attachments.all() if not a.is_deleted)

    def get_created_by_name(self, obj):
        u = obj.created_by
        return (u.get_full_name() or u.email) if u else ""

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Full recipient account number only on the single-record view; lists stay masked.
        view = self.context.get("view")
        if not (view and getattr(view, "action", None) in ("retrieve", "create", "partial_update", "update")):
            data.pop("recipient_account_number", None)
            data.pop("recipient_iban", None)
        return data

    # ---- write side ------------------------------------------------------
    def validate(self, attrs):
        inst = self.instance
        get = lambda k: attrs.get(k, getattr(inst, k, None) if inst else None)
        kind = get("activity_type")
        frm, to = get("from_account"), get("to_account")
        rec, rec_name = get("recipient"), (get("recipient_name") or "").strip()

        if kind == ActivityType.PAYMENT:
            if not frm:
                raise serializers.ValidationError({"from_account": "Choose the account the payment was made from."})
            if not (rec or rec_name):
                raise serializers.ValidationError({"recipient": "Choose or type who was paid."})
        elif kind == ActivityType.DEPOSIT:
            if not to:
                raise serializers.ValidationError({"to_account": "Choose the account the money was deposited into."})
        elif kind == ActivityType.TRANSFER:
            if not frm or not to:
                raise serializers.ValidationError("A transfer needs both a From and a To account.")
            if frm == to:
                raise serializers.ValidationError("From and To account must be different.")
        elif kind == ActivityType.WITHDRAWAL:
            if not frm:
                raise serializers.ValidationError({"from_account": "Choose the account the money was withdrawn from."})
        for acc, field in ((frm, "from_account"), (to, "to_account")):
            if acc and acc.status != "active" and (not inst or getattr(inst, field) != acc):
                raise serializers.ValidationError({field: "This bank account is inactive."})
        return attrs

    def create(self, validated_data):
        from . import services
        validated_data.pop("change_reason", None)
        return services.create_activity(self.context["request"].user, validated_data)

    def update(self, instance, validated_data):
        from . import services
        reason = validated_data.pop("change_reason", "")
        return services.update_activity(instance, self.context["request"].user, validated_data, reason)


class DailyVerificationSerializer(serializers.ModelSerializer):
    verified_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DailyVerification
        fields = ["id", "date", "physical_ledger_checked", "digital_records_checked", "bank_slips_checked",
                  "all_records_matched", "mismatch_found", "notes", "verified_by_name", "updated_at"]
        read_only_fields = ["id", "updated_at"]
        extra_kwargs = {"date": {"validators": []}}   # upsert by date is handled in the viewset

    def get_verified_by_name(self, obj):
        u = obj.updated_by or obj.created_by
        return (u.get_full_name() or u.email) if u else ""