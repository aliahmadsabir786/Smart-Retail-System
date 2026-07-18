import pytest
from decimal import Decimal
from apps.warehouse.models import Warehouse
from apps.categories.models import Category
from apps.products.models import Product
from apps.customers.models import Customer
from apps.inventory import services as inv_services
from apps.sales import services as sales_services
from apps.sales.models import Sale
from apps.core.exceptions import CreditLimitExceededException, InsufficientStockException, ServiceException

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
        sku="P-001", name="Notebook", category=category,
        cost_price="50.00", selling_price="100.00", tax_rate="10.00",
    )


@pytest.fixture
def customer():
    return Customer.objects.create(name="Walk-in Regular", credit_limit=Decimal("1000.00"))


class TestCreateSale:
    def test_create_sale_deducts_stock_and_computes_totals(self, product, warehouse):
        inv_services.stock_in(product, warehouse, 20)

        sale = sales_services.create_sale(
            customer=None, warehouse=warehouse,
            items=[{"product": product, "quantity": 3, "unit_price": Decimal("100.00"),
                    "tax_percent": Decimal("10.00")}],
            user=None,
        )

        assert sale.subtotal == Decimal("300.00")
        assert sale.tax_amount == Decimal("30.00")
        assert sale.total_amount == Decimal("330.00")
        assert inv_services.get_available_quantity(product, warehouse) == 17

    def test_create_sale_insufficient_stock_rolls_back(self, product, warehouse):
        inv_services.stock_in(product, warehouse, 2)

        with pytest.raises(InsufficientStockException):
            sales_services.create_sale(
                customer=None, warehouse=warehouse,
                items=[{"product": product, "quantity": 5, "unit_price": Decimal("100.00")}],
                user=None,
            )

        # Stock and sale count unaffected — full rollback
        assert inv_services.get_available_quantity(product, warehouse) == 2
        assert Sale.objects.count() == 0

    def test_create_sale_requires_at_least_one_item(self, warehouse):
        with pytest.raises(ServiceException):
            sales_services.create_sale(customer=None, warehouse=warehouse, items=[], user=None)

    def test_line_discount_reduces_total(self, product, warehouse):
        inv_services.stock_in(product, warehouse, 10)
        sale = sales_services.create_sale(
            customer=None, warehouse=warehouse,
            items=[{"product": product, "quantity": 2, "unit_price": Decimal("100.00"),
                    "discount_percent": Decimal("10.00")}],
            user=None,
        )
        # subtotal 200, discount 20 -> total 180
        assert sale.subtotal == Decimal("200.00")
        assert sale.discount_amount == Decimal("20.00")
        assert sale.total_amount == Decimal("180.00")


class TestCreditSale:
    def test_credit_sale_within_limit_updates_balance(self, product, warehouse, customer):
        inv_services.stock_in(product, warehouse, 10)
        sale = sales_services.create_sale(
            customer=customer, warehouse=warehouse,
            items=[{"product": product, "quantity": 2, "unit_price": Decimal("100.00")}],
            user=None, is_credit_sale=True,
        )
        customer.refresh_from_db()
        assert customer.outstanding_balance == Decimal("200.00")
        assert sale.payment_status == Sale.PaymentStatus.UNPAID

    def test_credit_sale_exceeding_limit_raises_and_rolls_back(self, product, warehouse, customer):
        inv_services.stock_in(product, warehouse, 100)
        with pytest.raises(CreditLimitExceededException):
            sales_services.create_sale(
                customer=customer, warehouse=warehouse,
                items=[{"product": product, "quantity": 50, "unit_price": Decimal("100.00")}],  # 5000 > 1000 limit
                user=None, is_credit_sale=True,
            )
        customer.refresh_from_db()
        assert customer.outstanding_balance == Decimal("0.00")
        assert inv_services.get_available_quantity(product, warehouse) == 100  # rolled back

    def test_credit_sale_awards_loyalty_points(self, product, warehouse, customer):
        inv_services.stock_in(product, warehouse, 10)
        sales_services.create_sale(
            customer=customer, warehouse=warehouse,
            items=[{"product": product, "quantity": 1, "unit_price": Decimal("100.00")}],
            user=None, is_credit_sale=True,
        )
        customer.refresh_from_db()
        assert customer.loyalty_points == 100


class TestPayments:
    def test_full_payment_marks_sale_paid(self, product, warehouse):
        inv_services.stock_in(product, warehouse, 10)
        sale = sales_services.create_sale(
            customer=None, warehouse=warehouse,
            items=[{"product": product, "quantity": 1, "unit_price": Decimal("100.00")}],
            user=None,
        )
        sales_services.add_payment(sale, Decimal("100.00"), "cash", user=None)
        sale.refresh_from_db()
        assert sale.payment_status == Sale.PaymentStatus.PAID
        assert sale.due_amount == Decimal("0.00")

    def test_partial_payment_marks_sale_partial(self, product, warehouse):
        inv_services.stock_in(product, warehouse, 10)
        sale = sales_services.create_sale(
            customer=None, warehouse=warehouse,
            items=[{"product": product, "quantity": 2, "unit_price": Decimal("100.00")}],
            user=None,
        )
        sales_services.add_payment(sale, Decimal("50.00"), "cash", user=None)
        sale.refresh_from_db()
        assert sale.payment_status == Sale.PaymentStatus.PARTIAL
        assert sale.due_amount == Decimal("150.00")

    def test_payment_reduces_customer_outstanding_balance(self, product, warehouse, customer):
        inv_services.stock_in(product, warehouse, 10)
        sale = sales_services.create_sale(
            customer=customer, warehouse=warehouse,
            items=[{"product": product, "quantity": 2, "unit_price": Decimal("100.00")}],
            user=None, is_credit_sale=True,
        )
        sales_services.add_payment(sale, Decimal("120.00"), "cash", user=None)
        customer.refresh_from_db()
        assert customer.outstanding_balance == Decimal("80.00")


class TestReturns:
    def test_return_restocks_inventory(self, product, warehouse):
        inv_services.stock_in(product, warehouse, 10)
        sale = sales_services.create_sale(
            customer=None, warehouse=warehouse,
            items=[{"product": product, "quantity": 5, "unit_price": Decimal("100.00")}],
            user=None,
        )
        assert inv_services.get_available_quantity(product, warehouse) == 5

        sale_item = sale.items.first()
        sales_services.process_return(
            sale, [{"sale_item": sale_item, "quantity": 2}], reason="Damaged", user=None,
        )
        assert inv_services.get_available_quantity(product, warehouse) == 7

    def test_full_return_marks_sale_returned(self, product, warehouse):
        inv_services.stock_in(product, warehouse, 10)
        sale = sales_services.create_sale(
            customer=None, warehouse=warehouse,
            items=[{"product": product, "quantity": 3, "unit_price": Decimal("100.00")}],
            user=None,
        )
        sale_item = sale.items.first()
        sales_services.process_return(sale, [{"sale_item": sale_item, "quantity": 3}], reason="", user=None)
        sale.refresh_from_db()
        assert sale.status == Sale.Status.RETURNED

    def test_partial_return_marks_sale_partially_returned(self, product, warehouse):
        inv_services.stock_in(product, warehouse, 10)
        sale = sales_services.create_sale(
            customer=None, warehouse=warehouse,
            items=[{"product": product, "quantity": 4, "unit_price": Decimal("100.00")}],
            user=None,
        )
        sale_item = sale.items.first()
        sales_services.process_return(sale, [{"sale_item": sale_item, "quantity": 1}], reason="", user=None)
        sale.refresh_from_db()
        assert sale.status == Sale.Status.PARTIALLY_RETURNED

    def test_cannot_return_more_than_purchased(self, product, warehouse):
        inv_services.stock_in(product, warehouse, 10)
        sale = sales_services.create_sale(
            customer=None, warehouse=warehouse,
            items=[{"product": product, "quantity": 2, "unit_price": Decimal("100.00")}],
            user=None,
        )
        sale_item = sale.items.first()
        with pytest.raises(ServiceException):
            sales_services.process_return(sale, [{"sale_item": sale_item, "quantity": 5}], reason="", user=None)
