import pytest
from decimal import Decimal
from apps.warehouse.models import Warehouse
from apps.categories.models import Category
from apps.products.models import Product
from apps.suppliers.models import Supplier
from apps.inventory import services as inv_services
from apps.purchase import services as purchase_services
from apps.purchase.models import PurchaseOrder
from apps.core.exceptions import ServiceException

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
        sku="P-100", name="Notebook", category=category,
        cost_price="50.00", selling_price="100.00",
    )


@pytest.fixture
def supplier():
    return Supplier.objects.create(name="Paper Co")


class TestCreatePurchaseOrder:
    def test_create_po_computes_totals(self, product, warehouse, supplier):
        po = purchase_services.create_purchase_order(
            supplier=supplier, warehouse=warehouse,
            items=[{"product": product, "quantity_ordered": 10, "unit_cost": Decimal("50.00"),
                    "tax_percent": Decimal("10.00")}],
            user=None,
        )
        assert po.subtotal == Decimal("500.00")
        assert po.tax_amount == Decimal("50.00")
        assert po.total_amount == Decimal("550.00")
        assert po.status == PurchaseOrder.Status.ORDERED

    def test_create_po_requires_items(self, warehouse, supplier):
        with pytest.raises(ServiceException):
            purchase_services.create_purchase_order(supplier=supplier, warehouse=warehouse, items=[], user=None)


class TestReceiveStock:
    def test_full_receive_marks_po_received_and_adds_stock(self, product, warehouse, supplier):
        po = purchase_services.create_purchase_order(
            supplier=supplier, warehouse=warehouse,
            items=[{"product": product, "quantity_ordered": 10, "unit_cost": Decimal("50.00")}],
            user=None,
        )
        po_item = po.items.first()
        po = purchase_services.receive_stock(po, [{"purchase_order_item": po_item, "quantity": 10}], user=None)

        assert po.status == PurchaseOrder.Status.RECEIVED
        assert inv_services.get_available_quantity(product, warehouse) == 10

        supplier.refresh_from_db()
        assert supplier.outstanding_payable == Decimal("500.00")

    def test_partial_receive_marks_po_partially_received(self, product, warehouse, supplier):
        po = purchase_services.create_purchase_order(
            supplier=supplier, warehouse=warehouse,
            items=[{"product": product, "quantity_ordered": 10, "unit_cost": Decimal("50.00")}],
            user=None,
        )
        po_item = po.items.first()
        po = purchase_services.receive_stock(po, [{"purchase_order_item": po_item, "quantity": 4}], user=None)

        assert po.status == PurchaseOrder.Status.PARTIALLY_RECEIVED
        assert inv_services.get_available_quantity(product, warehouse) == 4
        po_item.refresh_from_db()
        assert po_item.quantity_pending == 6

    def test_cannot_receive_more_than_ordered(self, product, warehouse, supplier):
        po = purchase_services.create_purchase_order(
            supplier=supplier, warehouse=warehouse,
            items=[{"product": product, "quantity_ordered": 5, "unit_cost": Decimal("50.00")}],
            user=None,
        )
        po_item = po.items.first()
        with pytest.raises(ServiceException):
            purchase_services.receive_stock(po, [{"purchase_order_item": po_item, "quantity": 99}], user=None)


class TestSupplierPayment:
    def test_payment_reduces_supplier_payable_and_po_due(self, product, warehouse, supplier):
        po = purchase_services.create_purchase_order(
            supplier=supplier, warehouse=warehouse,
            items=[{"product": product, "quantity_ordered": 10, "unit_cost": Decimal("50.00")}],
            user=None,
        )
        po_item = po.items.first()
        po = purchase_services.receive_stock(po, [{"purchase_order_item": po_item, "quantity": 10}], user=None)

        purchase_services.add_supplier_payment(po, Decimal("200.00"), "cash", user=None)

        po.refresh_from_db()
        supplier.refresh_from_db()
        assert po.paid_amount == Decimal("200.00")
        assert po.due_amount == Decimal("300.00")
        assert supplier.outstanding_payable == Decimal("300.00")
