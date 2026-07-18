from django.contrib import admin
from .models import Product, ProductImage, ProductVariant


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1


class ProductVariantInline(admin.TabularInline):
    model = ProductVariant
    extra = 0


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ["name", "sku", "barcode", "category", "brand", "selling_price", "status"]
    list_filter = ["status", "category", "brand", "unit"]
    search_fields = ["name", "sku", "barcode"]
    inlines = [ProductImageInline, ProductVariantInline]
    readonly_fields = ["barcode"]


@admin.register(ProductVariant)
class ProductVariantAdmin(admin.ModelAdmin):
    list_display = ["product", "sku", "color", "size", "extra_price", "is_active"]
    search_fields = ["sku", "barcode"]
