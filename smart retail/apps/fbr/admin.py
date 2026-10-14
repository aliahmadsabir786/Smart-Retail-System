from django.contrib import admin

from .models import CustomerFBRProfile, FBRInvoice, FBRSettings, ProductFBRProfile


@admin.register(FBRSettings)
class FBRSettingsAdmin(admin.ModelAdmin):
    # The encrypted token is deliberately not shown or editable here.
    exclude = ["api_token_encrypted"]
    list_display = ["__str__", "is_enabled", "environment", "auto_submit_enabled"]

    def has_add_permission(self, request):
        return not FBRSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(FBRInvoice)
class FBRInvoiceAdmin(admin.ModelAdmin):
    list_display = ["local_invoice_number", "status", "is_sandbox", "fbr_invoice_number",
                    "retry_count", "submitted_at", "error_category"]
    list_filter = ["status", "is_sandbox"]
    search_fields = ["local_invoice_number", "fbr_invoice_number"]
    readonly_fields = [f.name for f in FBRInvoice._meta.fields]

    def has_add_permission(self, request):
        return False


admin.site.register(ProductFBRProfile)
admin.site.register(CustomerFBRProfile)
