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


class TestReportsAPI:
    def test_sales_report_json_default(self, api_client, manager, sale_setup):
        api_client.force_authenticate(manager)
        url = reverse("reports:sales-report")
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["success"] is True
        assert response.data["count"] == 1

    def test_sales_report_csv_export(self, api_client, manager, sale_setup):
        api_client.force_authenticate(manager)
        url = reverse("reports:sales-report")
        response = api_client.get(url, {"export": "csv"})
        assert response.status_code == status.HTTP_200_OK
        assert response["Content-Type"] == "text/csv"
        assert b"Invoice #" in response.content

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
