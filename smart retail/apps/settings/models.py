from django.db import models


class CompanySettings(models.Model):
    """
    Singleton — there is only ever one row (pk=1). Holds company profile,
    default currency/tax, invoice numbering, and backup preferences.
    """
    company_name = models.CharField(max_length=200, default="My Company")
    logo = models.ImageField(upload_to="company/", null=True, blank=True)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    tax_id = models.CharField(max_length=50, blank=True)

    default_currency = models.CharField(max_length=3, default="PKR", help_text="ISO 4217 code, e.g. USD, PKR, EUR")
    default_tax_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)

    invoice_prefix = models.CharField(max_length=10, default="INV-")
    invoice_header_note = models.TextField(blank=True, default="Thank you for shopping with us!")
    invoice_footer_note = models.TextField(blank=True, default="Thank you for your business!")
    show_tax_on_receipt = models.BooleanField(default=True)
    # Prints the "Scan to verify invoice" QR code on A4 sale slips. Off = no QR on new prints.
    show_invoice_qr = models.BooleanField(default=True)

    low_stock_notification_enabled = models.BooleanField(default=True)
    low_stock_threshold = models.PositiveIntegerField(default=10)
    auto_backup_enabled = models.BooleanField(default=False)
    backup_frequency_days = models.PositiveIntegerField(default=7)

    distributor_name = models.CharField(max_length=200, blank=True)
    distributor_phone = models.CharField(max_length=20, blank=True)
    distributor_address = models.TextField(blank=True)
    distributor_email = models.EmailField(blank=True)

    # "General Auth" — password asked before any General payment is recorded
    # from a customer's Ledger. Stored HASHED (never plain text); blank = off.
    general_auth_password = models.CharField(max_length=128, blank=True, default="")

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "company_settings"
        verbose_name = "Company Settings"
        verbose_name_plural = "Company Settings"

    def __str__(self):
        return self.company_name

    def save(self, *args, **kwargs):
        self.pk = 1  # enforce singleton
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        pass  # singleton cannot be deleted

    @property
    def general_auth_enabled(self):
        return bool(self.general_auth_password)

    def set_general_auth_password(self, raw):
        from django.contrib.auth.hashers import make_password
        self.general_auth_password = make_password(raw) if raw else ""

    def check_general_auth_password(self, raw):
        """True when no General Auth password is set, or `raw` matches it."""
        from django.contrib.auth.hashers import check_password
        if not self.general_auth_password:
            return True
        return bool(raw) and check_password(raw, self.general_auth_password)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj