"""
Banking Records — a personal "digital bank payment register".

This app is deliberately INDEPENDENT: it is only a historical record of what
was paid / deposited / transferred (plus the proof for it), to be compared with
a handwritten ledger and the bank slips. It has NO accounting logic and no
link to customers, suppliers, invoices, sales, purchases or inventory.
"""
import os
import uuid
from decimal import Decimal

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.core.validators import MinValueValidator
from django.db import models, transaction

from apps.core.models import BaseModel


# Proofs (slips, screenshots) are private: they live OUTSIDE MEDIA_ROOT, which
# this project serves publicly at /media/. They are only ever handed out by the
# authenticated attachment endpoint.
def get_private_storage():
    # A callable (not a storage instance) so migrations don't bake an absolute
    # path from one machine into the migration file.
    return FileSystemStorage(location=str(settings.BASE_DIR / "private_media"))


def attachment_path(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    return f"bank_records/{uuid.uuid4().hex}{ext}"


class Status(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"


class Bank(BaseModel):
    name = models.CharField(max_length=120, unique=True)
    code = models.CharField(max_length=20, blank=True)
    branch = models.CharField(max_length=150, blank=True)
    # Optional logo, stored as a small PNG data URL (resized on upload). Banks
    # without one get a coloured initials badge in the UI.
    logo_data = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        db_table = "bankrec_bank"
        ordering = ["name"]

    def __str__(self):
        return self.name


def mask_number(value):
    value = (value or "").strip()
    if not value:
        return ""
    return "****" + value[-4:] if len(value) > 4 else "****"


class BankAccount(BaseModel):
    """One of MY OWN bank accounts."""

    class AccountType(models.TextChoices):
        CURRENT = "current", "Current"
        SAVINGS = "savings", "Savings"
        OTHER = "other", "Other"

    bank = models.ForeignKey(Bank, on_delete=models.PROTECT, related_name="accounts")
    account_title = models.CharField(max_length=150)
    account_number = models.CharField(max_length=40)
    iban = models.CharField(max_length=40, blank=True)
    branch = models.CharField(max_length=150, blank=True)
    account_type = models.CharField(max_length=10, choices=AccountType.choices, default=AccountType.CURRENT)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        db_table = "bankrec_account"
        ordering = ["bank__name", "account_title"]

    @property
    def masked_account_number(self):
        return mask_number(self.account_number)

    @property
    def label(self):
        return f"{self.account_title} ({self.masked_account_number}) — {self.bank.name}"

    def __str__(self):
        return self.label


class PaymentContact(BaseModel):
    """Address book of people / companies I send money to. NOT a customer or supplier."""

    name = models.CharField(max_length=150)
    company_name = models.CharField(max_length=150, blank=True)
    bank_name = models.CharField(max_length=120, blank=True)
    account_title = models.CharField(max_length=150, blank=True)
    account_number = models.CharField(max_length=40, blank=True)
    iban = models.CharField(max_length=40, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        db_table = "bankrec_contact"
        ordering = ["name"]

    @property
    def masked_account_number(self):
        return mask_number(self.account_number)

    def __str__(self):
        return self.name


class ActivityType(models.TextChoices):
    PAYMENT = "payment", "Payment"
    DEPOSIT = "deposit", "Deposit"
    TRANSFER = "transfer", "Transfer"
    WITHDRAWAL = "withdrawal", "Withdrawal"
    OTHER = "other", "Other"


REFERENCE_PREFIX = {
    ActivityType.PAYMENT: "PAY",
    ActivityType.DEPOSIT: "DEP",
    ActivityType.TRANSFER: "TRF",
    ActivityType.WITHDRAWAL: "WDR",
    ActivityType.OTHER: "OTH",
}


class ActivityStatus(models.TextChoices):
    RECORDED = "recorded", "Recorded"
    COMPLETED = "completed", "Completed"
    PENDING = "pending", "Pending"
    CANCELLED = "cancelled", "Cancelled"
    REVERSED = "reversed", "Reversed"


# Cancelled / reversed records stay visible for verification but are not
# counted in any summary total.
VOID_STATUSES = (ActivityStatus.CANCELLED, ActivityStatus.REVERSED)


class ReferenceCounter(models.Model):
    """Per-prefix running number behind PAY-000001 / DEP-000001 / TRF-000001 …"""

    prefix = models.CharField(max_length=5, primary_key=True)
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "bankrec_reference_counter"

    @classmethod
    def next(cls, prefix):
        with transaction.atomic():
            counter, _ = cls.objects.select_for_update().get_or_create(prefix=prefix)
            counter.last_number += 1
            counter.save(update_fields=["last_number"])
            return f"{prefix}-{counter.last_number:06d}"


class BankActivity(BaseModel):
    class Method(models.TextChoices):
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        ONLINE_TRANSFER = "online_transfer", "Online Transfer"
        CHEQUE = "cheque", "Cheque"
        CASH_DEPOSIT = "cash_deposit", "Cash Deposit"
        ATM = "atm", "ATM"
        OTHER = "other", "Other"

    activity_type = models.CharField(max_length=12, choices=ActivityType.choices)
    date = models.DateField()
    time = models.TimeField()

    # My own accounts. Payment/withdrawal: from_account. Deposit: to_account.
    # Transfer: both.
    from_account = models.ForeignKey(BankAccount, on_delete=models.PROTECT, null=True, blank=True,
                                     related_name="activities_out")
    to_account = models.ForeignKey(BankAccount, on_delete=models.PROTECT, null=True, blank=True,
                                   related_name="activities_in")

    # Who received it (payments). The contact is optional; the text columns are
    # a snapshot so old records never change when a contact is edited later.
    recipient = models.ForeignKey(PaymentContact, on_delete=models.SET_NULL, null=True, blank=True,
                                  related_name="activities")
    recipient_name = models.CharField(max_length=150, blank=True)
    recipient_bank = models.CharField(max_length=120, blank=True)
    recipient_account_title = models.CharField(max_length=150, blank=True)
    recipient_account_number = models.CharField(max_length=40, blank=True)
    recipient_iban = models.CharField(max_length=40, blank=True)

    amount = models.DecimalField(max_digits=15, decimal_places=2,
                                 validators=[MinValueValidator(Decimal("0.01"))])
    payment_method = models.CharField(max_length=20, choices=Method.choices, default=Method.BANK_TRANSFER)

    system_reference = models.CharField(max_length=20, unique=True, editable=False)  # PAY-000001
    bank_reference = models.CharField(max_length=100, blank=True)                    # bank's own number
    slip_number = models.CharField(max_length=60, blank=True)
    purpose = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    status = models.CharField(max_length=10, choices=ActivityStatus.choices, default=ActivityStatus.COMPLETED)
    status_reason = models.CharField(max_length=300, blank=True)
    status_changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
                                          blank=True, related_name="+")
    status_changed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "bankrec_activity"
        ordering = ["-date", "-time", "-id"]
        indexes = [
            models.Index(fields=["date"]),
            models.Index(fields=["activity_type"]),
            models.Index(fields=["slip_number"]),
            models.Index(fields=["bank_reference"]),
        ]

    def __str__(self):
        return f"{self.system_reference} — {self.amount} ({self.date})"


class BankActivityChange(models.Model):
    """Audit trail: one row per field changed on a record, with who/when/why.
    Rows are only ever added, never edited or removed."""

    activity = models.ForeignKey(BankActivity, on_delete=models.CASCADE, related_name="changes")
    field = models.CharField(max_length=60)
    old_value = models.TextField(blank=True)
    new_value = models.TextField(blank=True)
    reason = models.CharField(max_length=300, blank=True)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
                                   related_name="+")
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "bankrec_activity_change"
        ordering = ["-changed_at", "-id"]


class BankAttachment(BaseModel):
    class Kind(models.TextChoices):
        SLIP = "slip", "Bank Slip"
        SCREENSHOT = "screenshot", "Screenshot"
        RECEIPT = "receipt", "Transaction Receipt"
        PROOF = "proof", "Payment Proof"
        OTHER = "other", "Other Document"

    activity = models.ForeignKey(BankActivity, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to=attachment_path, storage=get_private_storage, max_length=255)
    original_name = models.CharField(max_length=255)
    file_type = models.CharField(max_length=10)          # jpg / png / pdf
    file_size = models.PositiveIntegerField(default=0)
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.SLIP)

    class Meta:
        db_table = "bankrec_attachment"
        ordering = ["created_at"]


class DailyVerification(BaseModel):
    """Optional end-of-day check: physical ledger ↔ digital records ↔ slips."""

    date = models.DateField(unique=True)
    physical_ledger_checked = models.BooleanField(default=False)
    digital_records_checked = models.BooleanField(default=False)
    bank_slips_checked = models.BooleanField(default=False)
    all_records_matched = models.BooleanField(default=False)
    mismatch_found = models.BooleanField(default=False)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "bankrec_daily_verification"
        ordering = ["-date"]