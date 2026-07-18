from django.contrib import admin
from .models import OtherIncome


@admin.register(OtherIncome)
class OtherIncomeAdmin(admin.ModelAdmin):
    list_display = ["title", "category", "amount", "income_date"]
    date_hierarchy = "income_date"
