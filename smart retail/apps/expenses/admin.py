from django.contrib import admin
from .models import Expense, ExpenseCategory


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "is_active"]


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ["title", "category", "amount", "expense_date", "status"]
    list_filter = ["category", "status"]
    search_fields = ["title"]
    date_hierarchy = "expense_date"
