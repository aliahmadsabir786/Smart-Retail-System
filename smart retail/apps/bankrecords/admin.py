from django.contrib import admin

from .models import (
    Bank, BankAccount, BankActivity, BankActivityChange, BankAttachment, DailyVerification, PaymentContact,
)

for model in (Bank, BankAccount, PaymentContact, BankAttachment, DailyVerification):
    admin.site.register(model)


@admin.register(BankActivity)
class BankActivityAdmin(admin.ModelAdmin):
    list_display = ("system_reference", "activity_type", "date", "time", "amount", "slip_number", "status")
    search_fields = ("system_reference", "bank_reference", "slip_number", "recipient_name")
    list_filter = ("activity_type", "status")
    readonly_fields = ("system_reference",)

    def has_delete_permission(self, request, obj=None):
        return False   # records are cancelled / reversed, never deleted


@admin.register(BankActivityChange)
class BankActivityChangeAdmin(admin.ModelAdmin):
    list_display = ("activity", "field", "old_value", "new_value", "changed_by", "changed_at")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
