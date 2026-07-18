from rest_framework import serializers
from .models import Expense, ExpenseCategory


class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = ["id", "name", "description", "is_active"]
        read_only_fields = ["id"]


class ExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True, default=None)
    approved_by_name = serializers.CharField(source="approved_by.get_full_name", read_only=True, default=None)

    class Meta:
        model = Expense
        fields = ["id", "category", "category_name", "warehouse", "warehouse_name", "title",
                  "description", "amount", "expense_date", "receipt", "status",
                  "approved_by", "approved_by_name", "created_at"]
        read_only_fields = ["id", "approved_by", "created_at"]
