from django.contrib import admin
from .models import StockItem, StockTransaction, StockTransfer


@admin.register(StockItem)
class StockItemAdmin(admin.ModelAdmin):
    list_display = ["product", "variant", "warehouse", "quantity"]
    list_filter = ["warehouse"]
    search_fields = ["product__name", "product__sku"]


@admin.register(StockTransaction)
class StockTransactionAdmin(admin.ModelAdmin):
    list_display = ["product", "warehouse", "transaction_type", "quantity", "balance_after", "created_at"]
    list_filter = ["transaction_type", "warehouse"]
    search_fields = ["product__name", "product__sku", "reference"]
    readonly_fields = [f.name for f in StockTransaction._meta.fields]
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(StockTransfer)
class StockTransferAdmin(admin.ModelAdmin):
    list_display = ["transfer_number", "product", "from_warehouse", "to_warehouse", "quantity", "status"]
    list_filter = ["status"]
    search_fields = ["transfer_number", "product__name"]
