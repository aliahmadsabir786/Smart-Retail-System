from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.authentication.models import User
from apps.categories.models import Category
from apps.customers.models import Customer
from apps.fbr.models import FBRSettings
from apps.inventory import services as inv_services
from apps.products.models import Product
from apps.sales import services as sales_services
from apps.warehouse.models import Warehouse


@pytest.fixture
def warehouse(db):
    return Warehouse.objects.create(name="Main", code="WH-1", is_default=True)


@pytest.fixture
def user(db):
    return User.objects.create_user(email="admin@example.com", password="pass12345",
                                    first_name="A", last_name="B", role="admin")


@pytest.fixture
def cashier(db):
    return User.objects.create_user(email="cashier@example.com", password="pass12345",
                                    first_name="C", last_name="D", role="cashier")


def _client(u):
    c = APIClient()
    c.force_authenticate(u)
    return c


@pytest.fixture
def admin_client(user):
    return _client(user)


@pytest.fixture
def cashier_client(cashier):
    return _client(cashier)


@pytest.fixture
def product(db):
    cat = Category.objects.create(name="General")
    p = Product.objects.create(sku="P-1", name="Notebook", category=cat,
                               cost_price="50.00", selling_price="100.00", tax_rate="18.00")
    p.refresh_from_db()  # string inputs -> Decimal, as the existing sales tests expect
    return p


@pytest.fixture
def product2(db):
    cat = Category.objects.first() or Category.objects.create(name="General")
    p = Product.objects.create(sku="P-2", name="Pen", category=cat, unit="pcs",
                               cost_price="5.00", selling_price="20.00", tax_rate="0.00")
    p.refresh_from_db()
    return p


@pytest.fixture
def cfg(db):
    s = FBRSettings.load()
    s.is_enabled = True
    s.environment = "sandbox"
    s.seller_ntn_cnic = "1234567"
    s.seller_business_name = "Test Traders"
    s.seller_province = "Punjab"
    s.seller_address = "Main Road, Lahore"
    s.default_hs_code = "0101.2100"
    s.set_token("secret-token-value")
    s.save()
    return s


def make_sale(user, warehouse, product, qty=2, discount_percent="0", customer=None, extra_discount="0"):
    inv_services.stock_in(product, warehouse, 100)
    return sales_services.create_sale(
        customer=customer, warehouse=warehouse, user=user,
        discount_amount=Decimal(extra_discount),
        items=[{"product": product, "variant": None, "quantity": qty,
                "unit_price": product.selling_price,
                "discount_percent": Decimal(discount_percent),
                "tax_percent": product.tax_rate}],
    )


@pytest.fixture
def sale(user, warehouse, product):
    return make_sale(user, warehouse, product)


def ok_response(number="7000007DI1747119701593"):
    return {"invoiceNumber": number, "dated": "2026-10-07 12:00:00",
            "validationResponse": {"statusCode": "00", "status": "Valid", "error": "",
                                   "invoiceStatuses": [{"itemSNo": "1", "statusCode": "00",
                                                        "status": "Valid", "invoiceNo": number + "-1",
                                                        "errorCode": "", "error": ""}]}}
