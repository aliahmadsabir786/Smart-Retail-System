from django.contrib import admin
from .models import Sale, SaleItem, Payment, Coupon, SaleReturn, SaleReturnItem


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0
    readonly_fields = ["quantity_returned"]


class PaymentInline(admin.TabularInline):
    model = Payment
    extra = 0


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ["invoice_number", "customer", "warehouse", "total_amount",
                     "paid_amount", "status", "payment_status", "created_at"]
    list_filter = ["status", "payment_status", "warehouse"]
    search_fields = ["invoice_number", "customer__name"]
    inlines = [SaleItemInline, PaymentInline]
    readonly_fields = ["invoice_number", "subtotal", "discount_amount", "tax_amount", "total_amount"]


@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = ["code", "discount_type", "discount_value", "valid_from", "valid_to", "is_active"]
    search_fields = ["code"]


@admin.register(SaleReturn)
class SaleReturnAdmin(admin.ModelAdmin):
    list_display = ["sale", "refund_amount", "status", "created_at"]
    search_fields = ["sale__invoice_number"]
