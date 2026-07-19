import pytest
from decimal import Decimal
from rest_framework.test import APIClient
from rest_framework import status

from apps.authentication.models import User, Role
from apps.warehouse.models import Warehouse
from apps.categories.models import Category
from apps.products.models import Product
from apps.suppliers.models import Supplier
from apps.purchase import services as purchase_services
from apps.purchase.models import PurchaseReturn
from apps.core.exceptions import ServiceException

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client():
    user = User.objects.create_user(
        email="admin-preturn@test.com", password="Pass123!",
        first_name="A", last_name="B", role=Role.ADMIN,
    )
    user.is_verified = True
    user.save()
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def warehouse():
    return Warehouse.objects.create(name="Main", code="PR-WH", is_default=True)


@pytest.fixture
def supplier():
    return Supplier.objects.create(name="PR Supplier")


@pytest.fixture
def product():
    category = Category.objects.create(name="PR Category")
    return Product.objects.create(
        sku="PR-SKU-1", name="PR Product", category=category,
        cost_price="5.00", selling_price="10.00", reorder_level=5,
    )


class TestPurchaseReturnService:
    def test_return_reduces_stock_and_supplier_payable(self, warehouse, supplier, product):
        po = purchase_services.create_purchase_order(
            supplier=supplier, warehouse=warehouse,
            items=[{"product": product, "quantity_ordered": 20, "unit_cost": Decimal("5.00")}],
            user=None,
        )
        po_item = po.items.first()
        purchase_services.receive_stock(po, [{"purchase_order_item": po_item, "quantity": 20}], user=None)

        purchase_return = purchase_services.process_purchase_return(
            po, [{"purchase_order_item": po_item, "quantity": 5}], reason="Damaged", user=None,
        )

        assert purchase_return.refund_amount == Decimal("25.00")
        from apps.inventory import services as inv_services
        assert inv_services.get_available_quantity(product, warehouse) == 15

        supplier.refresh_from_db()
        assert supplier.outstanding_payable == Decimal("75.00")  # 100 - 25

    def test_cannot_return_more_than_received(self, warehouse, supplier, product):
        po = purchase_services.create_purchase_order(
            supplier=supplier, warehouse=warehouse,
            items=[{"product": product, "quantity_ordered": 10, "unit_cost": Decimal("5.00")}],
            user=None,
        )
        po_item = po.items.first()
        purchase_services.receive_stock(po, [{"purchase_order_item": po_item, "quantity": 4}], user=None)

        with pytest.raises(ServiceException):
            purchase_services.process_purchase_return(
                po, [{"purchase_order_item": po_item, "quantity": 10}], reason="", user=None,
            )


class TestPurchaseReturnAPI:
    def test_full_return_flow_via_api(self, admin_client, warehouse, supplier, product):
        create_resp = admin_client.post("/api/v1/purchase-orders/", {
            "supplier": supplier.id, "warehouse": warehouse.id,
            "items": [{"product": product.id, "quantity_ordered": 10, "unit_cost": "5.00"}],
        }, format="json")
        po_data = create_resp.json()
        item_id = po_data["items"][0]["id"]

        admin_client.post(f"/api/v1/purchase-orders/{po_data['id']}/receive/", {
            "items": [{"purchase_order_item": item_id, "quantity": 10}],
        }, format="json")

        return_resp = admin_client.post(f"/api/v1/purchase-orders/{po_data['id']}/return/", {
            "items": [{"purchase_order_item": item_id, "quantity": 3}],
            "reason": "Wrong item shipped",
        }, format="json")
        assert return_resp.status_code == status.HTTP_201_CREATED, return_resp.content
        assert return_resp.json()["refund_amount"] == "15.00"

        history_resp = admin_client.get("/api/v1/purchase-orders/returns/")
        assert history_resp.status_code == status.HTTP_200_OK
        assert history_resp.json()["count"] == 1
