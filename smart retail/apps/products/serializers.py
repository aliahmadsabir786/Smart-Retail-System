from decimal import Decimal
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .models import Product, ProductImage, ProductVariant


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "image", "is_primary", "sort_order"]
        read_only_fields = ["id"]


class ProductVariantSerializer(serializers.ModelSerializer):
    final_selling_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = ProductVariant
        fields = ["id", "product", "sku", "barcode", "color", "size",
                  "extra_price", "final_selling_price", "is_active"]
        read_only_fields = ["id", "barcode", "final_selling_price"]


class ProductListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views (POS product search, catalog grid)."""
    category_name = serializers.CharField(source="category.name", read_only=True)
    brand_name = serializers.CharField(source="brand.name", read_only=True, default=None)
    primary_image = serializers.SerializerMethodField()
    final_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    current_stock = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Product
        fields = ["id", "sku", "barcode", "name", "category_name", "brand_name",
                  "unit", "cost_price", "selling_price", "tax_rate", "final_price", "status", "primary_image",
                  "current_stock", "reorder_level"]

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_primary_image(self, obj):
        img = obj.images.filter(is_primary=True).first() or obj.images.first()
        if img and img.image:
            request = self.context.get("request")
            return request.build_absolute_uri(img.image.url) if request else img.image.url
        return None


class ProductDetailSerializer(serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, read_only=True)
    variants = ProductVariantSerializer(many=True, read_only=True)
    final_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    price_with_tax = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    profit_margin = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    brand_name = serializers.CharField(source="brand.name", read_only=True, default=None)
    current_stock = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Product
        fields = [
            "id", "sku", "barcode", "name", "description",
            "category", "category_name", "brand", "brand_name", "unit",
            "cost_price", "selling_price", "tax_rate", "discount_percent",
            "final_price", "price_with_tax", "profit_margin",
            "weight", "reorder_level", "status", "current_stock",
            "images", "variants", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "barcode", "created_at", "updated_at"]

    def validate(self, attrs):
        cost = attrs.get("cost_price", getattr(self.instance, "cost_price", None))
        selling = attrs.get("selling_price", getattr(self.instance, "selling_price", None))
        if cost is not None and selling is not None and selling < cost:
            raise serializers.ValidationError(
                {"selling_price": "Selling price should not be lower than cost price."}
            )
        return attrs