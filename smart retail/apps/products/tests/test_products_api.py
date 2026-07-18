import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status

from apps.authentication.models import User, Role
from apps.categories.models import Category
from apps.brands.models import Brand
from apps.products.models import Product

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def inventory_manager():
    user = User.objects.create_user(
        email="inv@smartretail.com", password="Pass123!",
        first_name="Ivy", last_name="Inventory", role=Role.INVENTORY_MANAGER,
    )
    user.is_verified = True
    user.save()
    return user


@pytest.fixture
def cashier():
    user = User.objects.create_user(
        email="cash@smartretail.com", password="Pass123!",
        first_name="Cas", last_name="Hier", role=Role.CASHIER,
    )
    user.is_verified = True
    user.save()
    return user


class TestCategoryTree:
    def test_nested_category_path(self):
        electronics = Category.objects.create(name="Electronics")
        phones = Category.objects.create(name="Phones", parent=electronics)
        accessories = Category.objects.create(name="Accessories", parent=phones)

        assert accessories.get_path() == "Electronics > Phones > Accessories"
        assert set(electronics.get_descendant_ids()) == {electronics.id, phones.id, accessories.id}

    def test_category_tree_endpoint(self, api_client, inventory_manager):
        electronics = Category.objects.create(name="Electronics")
        Category.objects.create(name="Phones", parent=electronics)

        api_client.force_authenticate(inventory_manager)
        url = reverse("categories:category-tree")
        response = api_client.get(url)

        assert response.status_code == status.HTTP_200_OK
        assert response.data[0]["name"] == "Electronics"
        assert response.data[0]["children"][0]["name"] == "Phones"


class TestProductRBAC:
    def test_cashier_cannot_create_product(self, api_client, cashier):
        category = Category.objects.create(name="Groceries")
        api_client.force_authenticate(cashier)
        url = reverse("products:product-list")
        response = api_client.post(url, {
            "sku": "SKU-100", "name": "Rice Bag", "category": category.id,
            "cost_price": "100.00", "selling_price": "150.00",
        })
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_inventory_manager_can_create_product(self, api_client, inventory_manager):
        category = Category.objects.create(name="Groceries")
        api_client.force_authenticate(inventory_manager)
        url = reverse("products:product-list")
        response = api_client.post(url, {
            "sku": "SKU-101", "name": "Sugar Bag", "category": category.id,
            "cost_price": "80.00", "selling_price": "120.00",
        })
        assert response.status_code == status.HTTP_201_CREATED
        product = Product.objects.get(sku="SKU-101")
        assert product.barcode  # auto-generated

    def test_product_rejects_selling_price_below_cost(self, api_client, inventory_manager):
        category = Category.objects.create(name="Groceries")
        api_client.force_authenticate(inventory_manager)
        url = reverse("products:product-list")
        response = api_client.post(url, {
            "sku": "SKU-102", "name": "Flour Bag", "category": category.id,
            "cost_price": "200.00", "selling_price": "150.00",
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestProductPricing:
    def test_final_price_applies_discount(self):
        category = Category.objects.create(name="Test")
        product = Product.objects.create(
            sku="SKU-200", name="Test Item", category=category,
            cost_price="100.00", selling_price="200.00", discount_percent="10.00",
        )
        product.refresh_from_db()  # ensure Decimal fields are cast, not raw strings
        assert product.final_price == 180  # 200 - 10%

    def test_price_with_tax(self):
        category = Category.objects.create(name="Test")
        product = Product.objects.create(
            sku="SKU-201", name="Test Item 2", category=category,
            cost_price="100.00", selling_price="200.00", tax_rate="15.00",
        )
        product.refresh_from_db()
        assert product.price_with_tax == 230  # 200 + 15%
