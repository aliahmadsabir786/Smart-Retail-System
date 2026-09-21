import pytest
from decimal import Decimal
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from apps.authentication.models import User, Role
from apps.warehouse.models import Warehouse
from apps.categories.models import Category
from apps.products.models import Product
from apps.inventory import services as inv_services
from apps.sales import services as sales_services
from apps.purchase import services as purchase_services
from apps.suppliers.models import Supplier

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def manager():
    user = User.objects.create_user(
        email="mgr@smartretail.com", password="Pass123!",
        first_name="Man", last_name="Ager", role=Role.MANAGER,
    )
    user.is_verified = True
    user.save()
    return user


@pytest.fixture
def sale_setup():
    warehouse = Warehouse.objects.create(name="Main", code="WH-R", is_default=True)
    category = Category.objects.create(name="General")
    product = Product.objects.create(sku="R-001", name="Item", category=category,
                                      cost_price="10.00", selling_price="25.00")
    inv_services.stock_in(product, warehouse, 20)
    sales_services.create_sale(
        customer=None, warehouse=warehouse,
        items=[{"product": product, "quantity": 3, "unit_price": Decimal("25.00")}],
        user=None,
    )
    return warehouse, product


@pytest.fixture
def purchase_setup():
    warehouse = Warehouse.objects.create(name="Main", code="WH-P", is_default=True)
    category = Category.objects.create(name="General")
    supplier = Supplier.objects.create(name="Unilever Pakistan", phone="0300-0000000")
    product_a = Product.objects.create(sku="P-001", name="Surf Excel", category=category,
                                        cost_price="100.00", selling_price="150.00")
    product_b = Product.objects.create(sku="P-002", name="Lifebuoy Soap", category=category,
                                        cost_price="20.00", selling_price="30.00")
    po = purchase_services.create_purchase_order(
        supplier=supplier, warehouse=warehouse, user=None,
        items=[
            {"product": product_a, "quantity_ordered": 10, "unit_cost": Decimal("100.00")},
            {"product": product_b, "quantity_ordered": 50, "unit_cost": Decimal("20.00")},
        ],
    )
    return supplier, po


class TestReportsAPI:
    def test_sales_report_json_default(self, api_client, manager, sale_setup):
        api_client.force_authenticate(manager)
        url = reverse("reports:sales-report")
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is True
        assert response.data["count"] == 1

    def test_sales_report_includes_cost_of_sale_profit_and_total_row(self, api_client, manager, sale_setup):
        # sale_setup sells 3 units at 25.00 (cost_price 10.00/unit) ->
        # sale amount 75.00, cost of sale 30.00, profit 45.00.
        api_client.force_authenticate(manager)
        url = reverse("reports:sales-report")
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]

        # `count` only reflects the one real sale — the totals row below is a
        # display-only summary line, the same way a sale slip's Total line
        # isn't itself a purchased item.
        assert response.data["count"] == 1
        assert len(results) == 2

        sale_row = results[0]
        assert Decimal(sale_row["cost_of_sale"]) == Decimal("30.00")
        assert Decimal(sale_row["profit"]) == Decimal("45.00")

        total_row = results[-1]
        assert total_row["date"] == "TOTAL"
        assert Decimal(total_row["total_amount"]) == Decimal("75.00")
        assert Decimal(total_row["cost_of_sale"]) == Decimal("30.00")
        assert Decimal(total_row["profit"]) == Decimal("45.00")

    def test_sales_report_csv_export(self, api_client, manager, sale_setup):
        api_client.force_authenticate(manager)
        url = reverse("reports:sales-report")
        response = api_client.get(url, {"export": "csv"})
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "text/csv"
        assert b"Invoice #" in response.content

    def test_inventory_report_has_total_row_for_quantity_and_stock_value(self, api_client, manager, sale_setup):
        # 20 units stocked in, 3 sold in sale_setup -> 17 left, cost_price 10.00/unit.
        api_client.force_authenticate(manager)
        url = reverse("reports:inventory-report")
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]
        assert response.data["count"] == 1
        assert len(results) == 2

        item_row = results[0]
        assert item_row["quantity"] == 17
        assert Decimal(item_row["stock_value"]) == Decimal("170.00")

        total_row = results[-1]
        assert total_row["product"] == "TOTAL"
        assert total_row["quantity"] == "17"
        assert Decimal(total_row["stock_value"]) == Decimal("170.00")

    def test_tax_report_has_total_row(self, api_client, manager, sale_setup):
        # sale_setup: 3 units at 25.00, no tax configured on the item -> subtotal
        # 75.00, tax_amount 0.00 for the one sale.
        api_client.force_authenticate(manager)
        url = reverse("reports:tax-report")
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]
        assert response.data["count"] == 1
        assert len(results) == 2

        total_row = results[-1]
        assert total_row["date"] == "TOTAL"
        assert Decimal(total_row["subtotal"]) == Decimal("75.00")
        assert Decimal(total_row["tax_amount"]) == Decimal("0.00")

    def test_supplier_report_is_row_per_product(self, api_client, manager, purchase_setup):
        supplier, po = purchase_setup
        api_client.force_authenticate(manager)
        url = reverse("reports:supplier-report")
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        results = response.data["results"]

        # 2 product lines on the one PO -> count=2, plus the TOTAL row.
        assert response.data["count"] == 2
        assert len(results) == 3

        products = {row["product"] for row in results[:-1]}
        assert products == {"Surf Excel", "Lifebuoy Soap"}
        for row in results[:-1]:
            assert row["supplier"] == "Unilever Pakistan"
            assert row["po_number"] == po.po_number

        total_row = results[-1]
        assert total_row["date"] == "TOTAL"
        assert total_row["quantity"] == "60"  # 10 + 50
        assert Decimal(total_row["amount"]) == Decimal("2000.00")  # 10*100 + 50*20

    def test_inventory_report_excel_export(self, api_client, manager, sale_setup):
        api_client.force_authenticate(manager)
        url = reverse("reports:inventory-report")
        response = api_client.get(url, {"export": "excel"})
        assert response.status_code == status.HTTP_200_OK
        assert "spreadsheetml" in response["Content-Type"]

    def test_cashier_cannot_access_reports(self, api_client, sale_setup):
        cashier = User.objects.create_user(
            email="c@smartretail.com", password="Pass123!",
            first_name="C", last_name="H", role=Role.CASHIER,
        )
        api_client.force_authenticate(cashier)
        url = reverse("reports:sales-report")
        response = api_client.get(url)
        assert response.status_code == status.HTTP_403_FORBIDDEN