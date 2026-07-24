import uuid as uuid_lib
from decimal import Decimal
from django.db import models
from django.core.validators import MinValueValidator, MaxValueValidator
from apps.core.models import BaseModel
from apps.categories.models import Category
from apps.brands.models import Brand


class Unit(models.TextChoices):
    PIECE = "pcs", "Piece"
    KILOGRAM = "kg", "Kilogram"
    GRAM = "g", "Gram"
    LITRE = "l", "Litre"
    MILLILITRE = "ml", "Millilitre"
    BOX = "box", "Box"
    DOZEN = "dozen", "Dozen"
    PACK = "pack", "Pack"
    METER = "m", "Meter"


class ProductStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"
    DISCONTINUED = "discontinued", "Discontinued"


def _generate_barcode():
    """Generates a unique EAN-13-friendly numeric barcode string."""
    return str(uuid_lib.uuid4().int)[:12].zfill(12)


class Product(BaseModel):
    sku = models.CharField(max_length=50, unique=True)
    barcode = models.CharField(max_length=50, unique=True, blank=True)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    category = models.ForeignKey(Category, on_delete=models.PROTECT, null=True, blank=True, related_name="products")
    brand = models.ForeignKey(Brand, on_delete=models.SET_NULL, null=True, blank=True, related_name="products")

    unit = models.CharField(max_length=10, choices=Unit.choices, default=Unit.PIECE)

    cost_price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])
    selling_price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"),
                                    validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("100"))],
                                    help_text="Tax percentage, e.g. 17.00 for 17%")
    discount_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"),
                                            validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("100"))])

    weight = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True, help_text="Weight in kg")

    reorder_level = models.PositiveIntegerField(default=10, help_text="Alert threshold for low stock")

    status = models.CharField(max_length=15, choices=ProductStatus.choices, default=ProductStatus.ACTIVE)

    class Meta:
        db_table = "product"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["sku"]),
            models.Index(fields=["barcode"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.sku})"

    def save(self, *args, **kwargs):
        if not self.barcode:
            self.barcode = _generate_barcode()
        super().save(*args, **kwargs)

    @staticmethod
    def _as_decimal(value):
        """Defensive coercion — direct .create()/assignment can leave Decimal fields
        as plain strings until the instance is reloaded from the database."""
        return value if isinstance(value, Decimal) else Decimal(str(value))

    @property
    def final_price(self):
        """Selling price after discount, before tax."""
        selling_price = self._as_decimal(self.selling_price)
        discount_percent = self._as_decimal(self.discount_percent)
        discount_amount = selling_price * (discount_percent / Decimal("100"))
        return (selling_price - discount_amount).quantize(Decimal("0.01"))

    @property
    def price_with_tax(self):
        tax_rate = self._as_decimal(self.tax_rate)
        tax_amount = self.final_price * (tax_rate / Decimal("100"))
        return (self.final_price + tax_amount).quantize(Decimal("0.01"))

    @property
    def profit_margin(self):
        cost_price = self._as_decimal(self.cost_price)
        selling_price = self._as_decimal(self.selling_price)
        if cost_price == 0:
            return Decimal("0")
        return ((selling_price - cost_price) / cost_price * 100).quantize(Decimal("0.01"))


class ProductImage(BaseModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="products/")
    is_primary = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "product_image"
        ordering = ["sort_order"]

    def save(self, *args, **kwargs):
        if self.is_primary:
            ProductImage.objects.filter(product=self.product, is_primary=True).exclude(pk=self.pk).update(is_primary=False)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Image for {self.product.name}"


class ProductVariant(BaseModel):
    """
    Represents a specific color/size combination of a product.
    Stock for variants is tracked in apps.inventory via variant FK.
    """
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    sku = models.CharField(max_length=60, unique=True)
    barcode = models.CharField(max_length=50, unique=True, blank=True)
    color = models.CharField(max_length=50, blank=True)
    size = models.CharField(max_length=50, blank=True)
    extra_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"),
                                       help_text="Added to (or subtracted from) the base selling price")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "product_variant"
        unique_together = [("product", "color", "size")]

    def __str__(self):
        attrs = " / ".join(filter(None, [self.color, self.size]))
        return f"{self.product.name} — {attrs or self.sku}"

    def save(self, *args, **kwargs):
        if not self.barcode:
            self.barcode = _generate_barcode()
        super().save(*args, **kwargs)

    @property
    def final_selling_price(self):
        return self.product.selling_price + self.extra_price