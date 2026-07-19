"""
These tests deliberately go through the DRF API views (APIClient), not the
service functions directly — unlike test_purchase_services.py / test_sales_services.py.

This matters because the ViewSets fetch their objects with
.prefetch_related("items", ...) for performance, while the receive/return
actions look up individual line items via a *separate* query
(PurchaseOrderItem.objects.get(...) / SaleItem.objects.get(...)).
That mismatch can leave the prefetched `.items.all()` cache on the parent
object stale, which previously caused a full receive/return to be
misreported as "partially_received"/"partially_returned" even though every
line was fully processed. Calling services directly (as the other test files
do) never touches that prefetch cache, so it can't catch this class of bug —
these tests exist specifically to close that gap.
"""
import pytest
from decimal import Decimal
from rest_framework.test import APIClient
from rest_framework import status

from apps.authentication.models import User, Role
from apps.warehouse.models import Warehouse
from apps.categories.models import Category
from apps.products.models import Product
from apps.suppliers.models import Supplier
from apps.customers.models import Customer
from apps.purchase.models import PurchaseOrder
from apps.sales.models import Sale

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def admin_client():
    user = User.objects.create_user(
        email="admin-api@test.com", password="Pass123!",
        first_name="A", last_name="B", role=Role.ADMIN,
    )
    user.is_verified = True
    user.save()
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def cashier_client():
    user = User.objects.create_user(
        email="cashier-api@test.com", password="Pass123!",
        first_name="C", last_name="D", role=Role.CASHIER,
    )
    user.is_verified = True
    user.save()
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def warehouse():
    return Warehouse.objects.create(name="Main", code="API-WH", is_default=True)


@pytest.fixture
def supplier():
    return Supplier.objects.create(name="API Supplier")


@pytest.fixture
def customer():
    return Customer.objects.create(name="API Customer", credit_limit=Decimal("1000"))


@pytest.fixture
def product():
    category = Category.objects.create(name="API Category")
    return Product.objects.create(
        sku="API-SKU-1", name="API Product", category=category,
        cost_price="10.00", selling_price="20.00", reorder_level=5,
    )


class TestPurchaseOrderReceiveViaAPI:
    def test_full_receive_via_api_marks_received_not_partial(self, admin_client, warehouse, supplier, product):
        """Regression test for the prefetch_related staleness bug: receiving
        100% of a single-line PO through the real API must land on RECEIVED."""
        create_resp = admin_client.post("/api/v1/purchase-orders/", {
            "supplier": supplier.id, "warehouse": warehouse.id,
            "items": [{"product": product.id, "quantity_ordered": 20, "unit_cost": "2.00"}],
        }, format="json")
        assert create_resp.status_code == status.HTTP_201_CREATED, create_resp.content
        po_data = create_resp.json()
        item_id = po_data["items"][0]["id"]

        receive_resp = admin_client.post(f"/api/v1/purchase-orders/{po_data['id']}/receive/", {
            "items": [{"purchase_order_item": item_id, "quantity": 20}],
        }, format="json")
        assert receive_resp.status_code == status.HTTP_200_OK, receive_resp.content
        assert receive_resp.json()["status"] == PurchaseOrder.Status.RECEIVED

    def test_partial_receive_via_api_marks_partially_received(self, admin_client, warehouse, supplier, product):
        create_resp = admin_client.post("/api/v1/purchase-orders/", {
            "supplier": supplier.id, "warehouse": warehouse.id,
            "items": [{"product": product.id, "quantity_ordered": 20, "unit_cost": "2.00"}],
        }, format="json")
        po_data = create_resp.json()
        item_id = po_data["items"][0]["id"]

        receive_resp = admin_client.post(f"/api/v1/purchase-orders/{po_data['id']}/receive/", {
            "items": [{"purchase_order_item": item_id, "quantity": 5}],
        }, format="json")
        assert receive_resp.status_code == status.HTTP_200_OK, receive_resp.content
        assert receive_resp.json()["status"] == PurchaseOrder.Status.PARTIALLY_RECEIVED


class TestSaleReturnViaAPI:
    def test_full_return_via_api_marks_returned_not_partial(self, admin_client, cashier_client, warehouse, product):
        # Stock the product first
        stockin_resp = admin_client.post("/api/v1/inventory/stock-in/", {
            "product": product.id, "warehouse": warehouse.id, "quantity": 10,
        }, format="json")
        assert stockin_resp.status_code == status.HTTP_201_CREATED, stockin_resp.content

        sale_resp = cashier_client.post("/api/v1/sales/", {
            "warehouse": warehouse.id,
            "items": [{"product": product.id, "quantity": 3, "unit_price": "20.00"}],
        }, format="json")
        assert sale_resp.status_code == status.HTTP_201_CREATED, sale_resp.content
        sale_data = sale_resp.json()
        sale_item_id = sale_data["items"][0]["id"]

        return_resp = cashier_client.post(f"/api/v1/sales/{sale_data['id']}/return/", {
            "items": [{"sale_item": sale_item_id, "quantity": 3}],
            "reason": "Full return test",
        }, format="json")
        assert return_resp.status_code == status.HTTP_201_CREATED, return_resp.content

        # Re-fetch the sale via the API to confirm its persisted status
        detail_resp = cashier_client.get(f"/api/v1/sales/{sale_data['id']}/")
        assert detail_resp.json()["status"] == Sale.Status.RETURNED

    def test_partial_return_via_api_marks_partially_returned(self, admin_client, cashier_client, warehouse, product):
        stockin_resp = admin_client.post("/api/v1/inventory/stock-in/", {
            "product": product.id, "warehouse": warehouse.id, "quantity": 10,
        }, format="json")
        assert stockin_resp.status_code == status.HTTP_201_CREATED, stockin_resp.content

        sale_resp = cashier_client.post("/api/v1/sales/", {
            "warehouse": warehouse.id,
            "items": [{"product": product.id, "quantity": 4, "unit_price": "20.00"}],
        }, format="json")
        sale_data = sale_resp.json()
        sale_item_id = sale_data["items"][0]["id"]

        return_resp = cashier_client.post(f"/api/v1/sales/{sale_data['id']}/return/", {
            "items": [{"sale_item": sale_item_id, "quantity": 1}],
            "reason": "Partial return test",
        }, format="json")
        assert return_resp.status_code == status.HTTP_201_CREATED, return_resp.content

        detail_resp = cashier_client.get(f"/api/v1/sales/{sale_data['id']}/")
        assert detail_resp.json()["status"] == Sale.Status.PARTIALLY_RETURNED
