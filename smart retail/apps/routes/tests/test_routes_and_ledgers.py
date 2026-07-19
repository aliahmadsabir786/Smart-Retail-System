import pytest
from decimal import Decimal
from rest_framework.test import APIClient
from rest_framework import status

from apps.authentication.models import User, Role
from apps.warehouse.models import Warehouse
from apps.categories.models import Category
from apps.products.models import Product
from apps.customers.models import Customer
from apps.suppliers.models import Supplier
from apps.customers import services as customer_services
from apps.suppliers import services as supplier_services
from apps.sales import services as sales_services
from apps.purchase import services as purchase_services
from apps.inventory import services as inv_services

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client():
    user = User.objects.create_user(
        email="admin-route@test.com", password="Pass123!",
        first_name="A", last_name="B", role=Role.ADMIN,
    )
    user.is_verified = True
    user.save()
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def warehouse():
    return Warehouse.objects.create(name="Main", code="RT-WH", is_default=True)


@pytest.fixture
def product():
    category = Category.objects.create(name="RT Category")
    return Product.objects.create(
        sku="RT-SKU-1", name="RT Product", category=category,
        cost_price="5.00", selling_price="10.00", reorder_level=5,
    )


class TestSupplyRoute:
    def test_create_route_with_suppliers(self, admin_client):
        supplier = Supplier.objects.create(name="Route Supplier")
        response = admin_client.post("/api/v1/routes/", {
            "name": "North Zone", "area": "Model Town", "person": "Ali",
            "days": ["Monday", "Friday"], "suppliers": [supplier.id], "status": "Active",
        }, format="json")
        assert response.status_code == status.HTTP_201_CREATED, response.content
        assert response.data["supplier_names"] == ["Route Supplier"]

    def test_list_routes(self, admin_client):
        response = admin_client.get("/api/v1/routes/")
        assert response.status_code == status.HTTP_200_OK


class TestCustomerLedger:
    def test_ledger_matches_outstanding_balance(self, warehouse, product):
        customer = Customer.objects.create(name="Ledger Cust", credit_limit=Decimal("1000"))
        inv_services.stock_in(product, warehouse, 20)

        sale = sales_services.create_sale(
            customer=customer, warehouse=warehouse,
            items=[{"product": product, "quantity": 5, "unit_price": Decimal("10.00")}],
            user=None, is_credit_sale=True,
        )
        sales_services.add_payment(sale, Decimal("20.00"), "cash", user=None)

        customer.refresh_from_db()
        entries = customer_services.get_customer_ledger(customer)

        assert len(entries) == 2
        assert entries[0]["type"] == "invoice"
        assert entries[0]["debit"] == "50.00"
        assert entries[1]["type"] == "payment"
        assert entries[1]["credit"] == "20.00"
        assert Decimal(entries[-1]["balance"]) == customer.outstanding_balance == Decimal("30.00")

    def test_ledger_api_endpoint(self, admin_client, warehouse, product):
        customer = Customer.objects.create(name="API Ledger Cust", credit_limit=Decimal("1000"))
        response = admin_client.get(f"/api/v1/customers/{customer.id}/ledger/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["entries"] == []
        assert response.data["closing_balance"] == "0.00"


class TestSupplierLedger:
    def test_ledger_matches_outstanding_payable(self, warehouse, product):
        supplier = Supplier.objects.create(name="Ledger Supplier")
        po = purchase_services.create_purchase_order(
            supplier=supplier, warehouse=warehouse,
            items=[{"product": product, "quantity_ordered": 10, "unit_cost": Decimal("5.00")}],
            user=None,
        )
        po_item = po.items.first()
        purchase_services.receive_stock(po, [{"purchase_order_item": po_item, "quantity": 10}], user=None)
        purchase_services.add_supplier_payment(po, Decimal("20.00"), "cash", user=None)

        supplier.refresh_from_db()
        entries = supplier_services.get_supplier_ledger(supplier)

        assert len(entries) == 2
        assert entries[0]["type"] == "purchase_order"
        assert entries[0]["credit"] == "50.00"
        assert entries[1]["type"] == "payment"
        assert entries[1]["debit"] == "20.00"
        assert Decimal(entries[-1]["balance"]) == supplier.outstanding_payable == Decimal("30.00")

    def test_ledger_api_endpoint(self, admin_client):
        supplier = Supplier.objects.create(name="API Ledger Supplier")
        response = admin_client.get(f"/api/v1/suppliers/{supplier.id}/ledger/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["entries"] == []
