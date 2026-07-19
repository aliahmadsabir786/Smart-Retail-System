from django.contrib import admin
from .models import PurchaseOrder, PurchaseOrderItem, SupplierPayment, PurchaseReturn, PurchaseReturnItem


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 0
    readonly_fields = ["quantity_received"]


class SupplierPaymentInline(admin.TabularInline):
    model = SupplierPayment
    extra = 0


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ["po_number", "supplier", "warehouse", "total_amount", "paid_amount", "status"]
    list_filter = ["status", "warehouse"]
    search_fields = ["po_number", "supplier__name"]
    inlines = [PurchaseOrderItemInline, SupplierPaymentInline]
    readonly_fields = ["po_number", "subtotal", "tax_amount", "total_amount"]


@admin.register(PurchaseReturn)
class PurchaseReturnAdmin(admin.ModelAdmin):
    list_display = ["purchase_order", "refund_amount", "status", "created_at"]
    list_filter = ["status"]
    search_fields = ["purchase_order__po_number"]
