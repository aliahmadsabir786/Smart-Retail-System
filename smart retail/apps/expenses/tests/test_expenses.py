import pytest
from decimal import Decimal
from apps.expenses.models import Expense, ExpenseCategory

pytestmark = pytest.mark.django_db


@pytest.fixture
def category():
    return ExpenseCategory.objects.create(name="Utilities")


class TestExpense:
    def test_create_expense(self, category):
        expense = Expense.objects.create(
            category=category, title="Electricity Bill", amount=Decimal("150.00"),
            expense_date="2026-06-01",
        )
        assert expense.status == Expense.Status.APPROVED
        assert str(expense).startswith("Electricity Bill")

    def test_expense_category_str(self, category):
        assert str(category) == "Utilities"
