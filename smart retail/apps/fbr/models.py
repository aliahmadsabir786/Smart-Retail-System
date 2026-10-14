from decimal import Decimal

from django.db import models

from apps.core.models import BaseModel, TimeStampedModel
from .crypto import decrypt_token, encrypt_token

# Documented PRAL Digital Invoicing API v1.12 endpoints. Both are overridable
# from the settings screen in case FBR changes them.
DEFAULT_SANDBOX_POST_URL = "https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata_sb"
DEFAULT_SANDBOX_VALIDATE_URL = "https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata_sb"
DEFAULT_PRODUCTION_POST_URL = "https://gw.fbr.gov.pk/di_data/v1/di/postinvoicedata"
DEFAULT_PRODUCTION_VALIDATE_URL = "https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata"
DEFAULT_REFERENCE_BASE_URL = "https://gw.fbr.gov.pk/pdi/v1"


class FBRSettings(models.Model):
    """
    Singleton (pk=1) — one FBR configuration per installation. Everything is
    OFF until a business explicitly enables it, so installations that don't
    use FBR are completely unaffected.
    """

    class Environment(models.TextChoices):
        SANDBOX = "sandbox", "Sandbox (testing)"
        PRODUCTION = "production", "Production (live)"

    is_enabled = models.BooleanField(default=False)
    environment = models.CharField(max_length=12, choices=Environment.choices, default=Environment.SANDBOX)

    # Stored encrypted — never returned by any API.
    api_token_encrypted = models.TextField(blank=True, default="")

    seller_ntn_cnic = models.CharField(max_length=13, blank=True, help_text="Seller NTN (7 digits) or CNIC (13 digits)")
    seller_business_name = models.CharField(max_length=200, blank=True, help_text="Blank = company name from Company Settings")
    seller_province = models.CharField(max_length=60, blank=True, help_text="Must match an FBR province name")
    seller_address = models.TextField(blank=True, help_text="Blank = company address from Company Settings")

    # Fallbacks used when a product has no FBR profile of its own.
    default_hs_code = models.CharField(max_length=20, blank=True)
    default_uom = models.CharField(max_length=60, blank=True, default="Numbers, pieces, units")
    default_sale_type = models.CharField(max_length=100, blank=True, default="Goods at standard rate (default)")

    sandbox_scenario_id = models.CharField(max_length=10, blank=True, default="SN001",
                                           help_text="Required by FBR for sandbox posts only, e.g. SN001")

    request_timeout_seconds = models.PositiveIntegerField(default=30)

    # Optional endpoint overrides (blank = documented defaults above).
    post_url_override = models.URLField(blank=True)
    validate_url_override = models.URLField(blank=True)

    # When on, the `fbr_submit_pending` command will submit completed sales.
    # The POS itself never waits for FBR either way.
    auto_submit_enabled = models.BooleanField(default=False)
    # Sales created before this moment are never auto-submitted, so switching
    # auto-submit on can't suddenly push the whole sales history to FBR.
    auto_submit_from = models.DateTimeField(null=True, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "fbr_settings"
        verbose_name = "FBR Settings"
        verbose_name_plural = "FBR Settings"

    def __str__(self):
        return f"FBR settings ({self.environment}, {'on' if self.is_enabled else 'off'})"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        pass

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    # --- token helpers -------------------------------------------------
    def set_token(self, plain: str):
        self.api_token_encrypted = encrypt_token(plain)

    def get_token(self) -> str:
        return decrypt_token(self.api_token_encrypted)

    @property
    def token_configured(self) -> bool:
        return bool(self.get_token())

    # --- resolved endpoints -------------------------------------------
    @property
    def is_sandbox(self) -> bool:
        return self.environment == self.Environment.SANDBOX

    @property
    def post_url(self) -> str:
        if self.post_url_override:
            return self.post_url_override
        return DEFAULT_SANDBOX_POST_URL if self.is_sandbox else DEFAULT_PRODUCTION_POST_URL

    @property
    def validate_url(self) -> str:
        if self.validate_url_override:
            return self.validate_url_override
        return DEFAULT_SANDBOX_VALIDATE_URL if self.is_sandbox else DEFAULT_PRODUCTION_VALIDATE_URL

    def missing_configuration(self) -> list:
        """Human-readable list of what still has to be filled in before any submission."""
        missing = []
        if not self.token_configured:
            missing.append("API token")
        digits = "".join(c for c in self.seller_ntn_cnic if c.isdigit())
        if len(digits) not in (7, 13):
            missing.append("Seller NTN (7 digits) or CNIC (13 digits)")
        if not self.seller_province.strip():
            missing.append("Seller province")
        return missing


class ProductFBRProfile(BaseModel):
    """FBR-only attributes for a product, kept out of the Product model on purpose."""

    product = models.OneToOneField("products.Product", on_delete=models.CASCADE, related_name="fbr_profile")
    hs_code = models.CharField(max_length=20, blank=True)
    uom = models.CharField(max_length=60, blank=True, help_text="FBR unit of measure description")
    sale_type = models.CharField(max_length=100, blank=True)
    sro_schedule_no = models.CharField(max_length=60, blank=True)
    sro_item_serial_no = models.CharField(max_length=60, blank=True)
    further_tax_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))

    class Meta:
        db_table = "fbr_product_profile"

    def __str__(self):
        return f"FBR profile for {self.product_id}"


class CustomerFBRProfile(BaseModel):
    """Buyer details FBR needs for registered (business) customers."""

    class RegistrationType(models.TextChoices):
        REGISTERED = "Registered", "Registered"
        UNREGISTERED = "Unregistered", "Unregistered"

    customer = models.OneToOneField("customers.Customer", on_delete=models.CASCADE, related_name="fbr_profile")
    ntn_cnic = models.CharField(max_length=13, blank=True)
    registration_type = models.CharField(max_length=15, choices=RegistrationType.choices,
                                         default=RegistrationType.UNREGISTERED)
    province = models.CharField(max_length=60, blank=True)

    class Meta:
        db_table = "fbr_customer_profile"

    def __str__(self):
        return f"FBR profile for customer {self.customer_id}"


class FBRInvoice(TimeStampedModel):
    """
    One row per local sale that has been (or is being) sent to FBR.

    `sale` is a nullable one-to-one with SET_NULL so (a) a second row for the
    same sale is impossible at the database level, and (b) the existing
    "Clear Sale Slips" reset — which hard-deletes sales and rewinds ids — keeps
    working and can never collide with an old FBR record. The invoice number is
    snapshotted here for the same reason.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"          # a submission is in flight right now
        SUBMITTED = "submitted", "Submitted"    # FBR accepted it and issued an invoice number
        FAILED = "failed", "Failed"             # definitively not accepted — safe to retry
        UNKNOWN = "unknown", "Needs review"     # request may have reached FBR; outcome not known

    sale = models.OneToOneField("sales.Sale", on_delete=models.SET_NULL, null=True, blank=True,
                                related_name="fbr_invoice")
    local_invoice_number = models.CharField(max_length=30, db_index=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING, db_index=True)
    is_sandbox = models.BooleanField(default=True)

    fbr_invoice_number = models.CharField(max_length=60, blank=True, db_index=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    retry_count = models.PositiveIntegerField(default=0)

    payload_hash = models.CharField(max_length=64, blank=True)
    request_payload = models.JSONField(default=dict, blank=True)
    response_data = models.JSONField(default=dict, blank=True)

    http_status = models.PositiveIntegerField(null=True, blank=True)
    error_category = models.CharField(max_length=30, blank=True)
    error_code = models.CharField(max_length=20, blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        db_table = "fbr_invoice"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.local_invoice_number} — {self.status}"
