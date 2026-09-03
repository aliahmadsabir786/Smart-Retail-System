import pytest
from apps.warehouse.models import Warehouse
from apps.categories.models import Category
from apps.brands.models import Brand
from apps.products.models import Product
from apps.inventory import services
from apps.inventory.models import StockItem, StockTransaction, StockTransfer
from apps.core.exceptions import InsufficientStockException

pytestmark = pytest.mark.django_db


@pytest.fixture
def warehouse_a():
    return Warehouse.objects.create(name="Main Store", code="WH-A", is_default=True)


@pytest.fixture
def warehouse_b():
    return Warehouse.objects.create(name="Branch Store", code="WH-B")


@pytest.fixture
def category():
    return Category.objects.create(name="Electronics")


@pytest.fixture
def brand():
    return Brand.objects.create(name="Acme")


@pytest.fixture
def product(category, brand):
    return Product.objects.create(
        sku="SKU-001", name="Wireless Mouse", category=category, brand=brand,
        cost_price="500.00", selling_price="800.00", reorder_level=5,
    )


class TestStockIn:
    def test_stock_in_creates_stock_item_and_ledger_entry(self, product, warehouse_a):
        txn = services.stock_in(product, warehouse_a, 50, reference="PO-1001")

        stock_item = StockItem.objects.get(product=product, warehouse=warehouse_a)
        assert stock_item.quantity == 50
        assert txn.transaction_type == StockTransaction.TransactionType.STOCK_IN
        assert txn.balance_after == 50

    def test_stock_in_accumulates(self, product, warehouse_a):
        services.stock_in(product, warehouse_a, 20)
        services.stock_in(product, warehouse_a, 30)
        stock_item = StockItem.objects.get(product=product, warehouse=warehouse_a)
        assert stock_item.quantity == 50

    def test_stock_in_rejects_non_positive_quantity(self, product, warehouse_a):
        with pytest.raises(ValueError):
            services.stock_in(product, warehouse_a, 0)


class TestStockOut:
    def test_stock_out_reduces_quantity(self, product, warehouse_a):
        services.stock_in(product, warehouse_a, 100)
        services.stock_out(product, warehouse_a, 40, reference="INV-2001")

        stock_item = StockItem.objects.get(product=product, warehouse=warehouse_a)
        assert stock_item.quantity == 60

    def test_stock_out_raises_when_insufficient(self, product, warehouse_a):
        services.stock_in(product, warehouse_a, 10)
        with pytest.raises(InsufficientStockException):
            services.stock_out(product, warehouse_a, 999)

        # Balance must remain unchanged after a failed attempt (atomicity)
        stock_item = StockItem.objects.get(product=product, warehouse=warehouse_a)
        assert stock_item.quantity == 10

    def test_stock_out_allow_negative_override(self, product, warehouse_a):
        services.stock_in(product, warehouse_a, 5)
        services.stock_out(product, warehouse_a, 8, allow_negative=True)
        stock_item = StockItem.objects.get(product=product, warehouse=warehouse_a)
        assert stock_item.quantity == -3


class TestAdjustStock:
    def test_adjust_stock_increase_logs_correct_type(self, product, warehouse_a):
        services.stock_in(product, warehouse_a, 10)
        txn = services.adjust_stock(product, warehouse_a, 25)
        assert txn.transaction_type == StockTransaction.TransactionType.ADJUSTMENT_INCREASE
        assert txn.quantity == 15

    def test_adjust_stock_decrease_logs_correct_type(self, product, warehouse_a):
        services.stock_in(product, warehouse_a, 30)
        txn = services.adjust_stock(product, warehouse_a, 10)
        assert txn.transaction_type == StockTransaction.TransactionType.ADJUSTMENT_DECREASE
        assert txn.quantity == 20

    def test_adjust_stock_no_change_returns_none(self, product, warehouse_a):
        services.stock_in(product, warehouse_a, 15)
        result = services.adjust_stock(product, warehouse_a, 15)
        assert result is None


class TestTransferStock:
    def test_transfer_moves_stock_between_warehouses(self, product, warehouse_a, warehouse_b):
        services.stock_in(product, warehouse_a, 100)
        transfer = services.transfer_stock(product, warehouse_a, warehouse_b, 30)

        assert transfer.status == StockTransfer.Status.COMPLETED
        assert StockItem.objects.get(product=product, warehouse=warehouse_a).quantity == 70
        assert StockItem.objects.get(product=product, warehouse=warehouse_b).quantity == 30

        # Paired ledger entries exist
        assert StockTransaction.objects.filter(
            reference=transfer.transfer_number,
            transaction_type=StockTransaction.TransactionType.TRANSFER_OUT,
        ).exists()
        assert StockTransaction.objects.filter(
            reference=transfer.transfer_number,
            transaction_type=StockTransaction.TransactionType.TRANSFER_IN,
        ).exists()

    def test_transfer_rejects_same_warehouse(self, product, warehouse_a):
        services.stock_in(product, warehouse_a, 10)
        with pytest.raises(ValueError):
            services.transfer_stock(product, warehouse_a, warehouse_a, 5)

    def test_transfer_insufficient_stock_rolls_back(self, product, warehouse_a, warehouse_b):
        services.stock_in(product, warehouse_a, 5)
        with pytest.raises(InsufficientStockException):
            services.transfer_stock(product, warehouse_a, warehouse_b, 999)
        # No transfer or partial ledger entries should persist
        assert StockTransfer.objects.filter(status=StockTransfer.Status.COMPLETED).count() == 0
        assert StockItem.objects.get(product=product, warehouse=warehouse_a).quantity == 5


class TestLowStock:
    def test_is_low_stock_property(self, product, warehouse_a):
        services.stock_in(product, warehouse_a, 3)  # reorder_level=5
        stock_item = StockItem.objects.get(product=product, warehouse=warehouse_a)
        assert stock_item.is_low_stock is True

    def test_is_not_low_stock_when_above_reorder_level(self, product, warehouse_a):
        services.stock_in(product, warehouse_a, 50)
        stock_item = StockItem.objects.get(product=product, warehouse=warehouse_a)
        assert stock_item.is_low_stock is False
