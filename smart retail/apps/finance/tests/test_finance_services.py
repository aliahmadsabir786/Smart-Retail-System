import pytest
from decimal import Decimal
from apps.warehouse.models import Warehouse
from apps.categories.models import Category
from apps.products.models import Product
from apps.expenses.models import Expense, ExpenseCategory
from apps.inventory import services as inv_services
from apps.sales import services as sales_services
from apps.finance import services as finance_services

pytestmark = pytest.mark.django_db


@pytest.fixture
def warehouse():
    return Warehouse.objects.create(name="Main", code="WH-1", is_default=True)


@pytest.fixture
def category():
    return Category.objects.create(name="General")


@pytest.fixture
def product(category):
    return Product.objects.create(
        sku="F-001", name="Item", category=category,
        cost_price="40.00", selling_price="100.00",
    )


class TestProfitAndLoss:
    def test_profit_and_loss_reflects_sale_and_expense(self, product, warehouse):
        inv_services.stock_in(product, warehouse, 10)
        sales_services.create_sale(
            customer=None, warehouse=warehouse,
            items=[{"product": product, "quantity": 2, "unit_price": Decimal("100.00")}],
            user=None,
        )
        # income = 200, COGS = 2 * 40 = 80 -> gross profit 120
        expense_category = ExpenseCategory.objects.create(name="Rent")
        Expense.objects.create(category=expense_category, title="Rent", amount=Decimal("50.00"),
                                expense_date="2026-01-01")

        pl = finance_services.get_profit_and_loss()
        assert pl["income"] == Decimal("200.00")
        assert pl["cost_of_goods_sold"] == Decimal("80.00")
        assert pl["gross_profit"] == Decimal("120.00")
        assert pl["expenses"] == Decimal("50.00")
        assert pl["net_profit"] == Decimal("70.00")
        assert pl["is_profit"] is True

    def test_no_activity_gives_zero_pl(self):
        pl = finance_services.get_profit_and_loss()
        assert pl["income"] == Decimal("0")
        assert pl["net_profit"] == Decimal("0")


class TestCashFlow:
    def test_cash_flow_counts_only_actual_payments(self, product, warehouse):
        inv_services.stock_in(product, warehouse, 10)
        sale = sales_services.create_sale(
            customer=None, warehouse=warehouse,
            items=[{"product": product, "quantity": 1, "unit_price": Decimal("100.00")}],
            user=None,
        )
        # No payment recorded yet -> cash_in should be 0 even though total_amount is 100
        cf = finance_services.get_cash_flow()
        assert cf["cash_in"] == Decimal("0")

        sales_services.add_payment(sale, Decimal("100.00"), "cash", user=None)
        cf = finance_services.get_cash_flow()
        assert cf["cash_in"] == Decimal("100.00")
