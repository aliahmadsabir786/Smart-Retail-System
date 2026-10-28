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


class TestExpenseReport:
    def test_report_sums_per_category_across_dates(self):
        from apps.reports.services import expense_report
        other = ExpenseCategory.objects.create(name="Other")
        transport = ExpenseCategory.objects.create(name="Transport")
        for cat, amt, day in [(other, "100", "2026-06-01"), (other, "250.50", "2026-06-05"),
                              (transport, "75", "2026-06-02")]:
            Expense.objects.create(category=cat, title="x", amount=Decimal(amt), expense_date=day)
        rows, columns = expense_report("2026-06-01", "2026-06-30")
        by_cat = {r["category"]: r for r in rows}
        assert by_cat["Other"]["amount"] == "350.50" and by_cat["Other"]["entries"] == "2"
        assert by_cat["Transport"]["amount"] == "75.00"
        assert len(rows) == 2

    def test_report_respects_date_range(self):
        from apps.reports.services import expense_report
        cat = ExpenseCategory.objects.create(name="Marketing")
        Expense.objects.create(category=cat, title="a", amount=Decimal("10"), expense_date="2026-05-01")
        Expense.objects.create(category=cat, title="b", amount=Decimal("20"), expense_date="2026-06-10")
        rows, _ = expense_report("2026-06-01", "2026-06-30")
        assert rows[0]["amount"] == "20.00"