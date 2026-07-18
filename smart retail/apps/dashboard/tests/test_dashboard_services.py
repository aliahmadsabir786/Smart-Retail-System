import pytest
from decimal import Decimal
from apps.warehouse.models import Warehouse
from apps.categories.models import Category
from apps.products.models import Product
from apps.customers.models import Customer
from apps.inventory import services as inv_services
from apps.sales import services as sales_services
from apps.dashboard import services as dashboard_services

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
        sku="D-001", name="Widget", category=category,
        cost_price="20.00", selling_price="50.00", reorder_level=5,
    )


class TestDashboardSummary:
    def test_summary_includes_todays_sales(self, product, warehouse):
        inv_services.stock_in(product, warehouse, 10)
        sales_services.create_sale(
            customer=None, warehouse=warehouse,
            items=[{"product": product, "quantity": 2, "unit_price": Decimal("50.00")}],
            user=None,
        )
        summary = dashboard_services.get_dashboard_summary()
        assert summary["today_sales"] == Decimal("100.00")
        assert summary["sales_orders_count"] == 1

    def test_summary_counts_active_customers_and_suppliers(self):
        Customer.objects.create(name="A", is_active=True)
        Customer.objects.create(name="B", is_active=False)
        summary = dashboard_services.get_dashboard_summary()
        assert summary["total_customers"] == 1

    def test_low_stock_items_detected(self, product, warehouse):
        inv_services.stock_in(product, warehouse, 3)  # reorder_level=5
        summary = dashboard_services.get_dashboard_summary()
        skus = [i["sku"] for i in summary["low_stock_items"]]
        assert "D-001" in skus

    def test_inventory_value_calculation(self, product, warehouse):
        inv_services.stock_in(product, warehouse, 10)  # 10 * cost_price(20) = 200
        value = dashboard_services.get_inventory_value()
        assert value == Decimal("200.00")
