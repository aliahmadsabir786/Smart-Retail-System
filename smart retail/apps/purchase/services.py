from decimal import Decimal
from django.db import transaction

from apps.core.exceptions import ServiceException
from apps.inventory import services as inventory_services
from apps.inventory.models import StockTransaction
from .models import PurchaseOrder, PurchaseOrderItem, SupplierPayment


@transaction.atomic
def create_purchase_order(supplier, warehouse, items, user, expected_date=None, notes=""):
    """
    Creates a PO in DRAFT status with computed totals. No stock movement happens here —
    stock is only added when receive_stock() is called against (some of) the ordered items.

    `items`: list of dicts {"product", "variant", "quantity_ordered", "unit_cost", "tax_percent"}
    """
    if not items:
        raise ServiceException("A purchase order must contain at least one item.")

    po = PurchaseOrder.objects.create(
        po_number=PurchaseOrder.generate_po_number(), supplier=supplier, warehouse=warehouse,
        ordered_by=user, status=PurchaseOrder.Status.ORDERED, expected_date=expected_date,
        notes=notes, created_by=user,
    )

    subtotal = Decimal("0")
    total_tax = Decimal("0")

    for item in items:
        po_item = PurchaseOrderItem.objects.create(
            purchase_order=po, product=item["product"], variant=item.get("variant"),
            quantity_ordered=item["quantity_ordered"], unit_cost=item["unit_cost"],
            tax_percent=item.get("tax_percent", Decimal("0")), created_by=user,
        )
        subtotal += po_item.line_subtotal
        total_tax += po_item.line_tax

    total_amount = (subtotal + total_tax).quantize(Decimal("0.01"))
    po.subtotal = subtotal.quantize(Decimal("0.01"))
    po.tax_amount = total_tax.quantize(Decimal("0.01"))
    po.total_amount = total_amount
    po.save(update_fields=["subtotal", "tax_amount", "total_amount"])

    return po


@transaction.atomic
def receive_stock(purchase_order, received_items, user):
    """
    Receives some or all of a PO's ordered quantities into inventory:
      1. Increases StockItem quantity for each received line (PURCHASE ledger entry)
      2. Updates quantity_received on each PurchaseOrderItem
      3. Adds the received value to the supplier's outstanding_payable
      4. Advances PO status to PARTIALLY_RECEIVED or RECEIVED

    `received_items`: list of dicts {"purchase_order_item": PurchaseOrderItem, "quantity": int}
    """
    if purchase_order.status == PurchaseOrder.Status.CANCELLED:
        raise ServiceException("Cannot receive stock against a cancelled purchase order.")
    if not received_items:
        raise ServiceException("At least one item must be specified to receive.")

    received_value = Decimal("0")

    for entry in received_items:
        po_item = entry["purchase_order_item"]
        qty = entry["quantity"]

        if qty > po_item.quantity_pending:
            raise ServiceException(
                f"Cannot receive {qty} of {po_item.product.sku}; only {po_item.quantity_pending} pending."
            )

        inventory_services.stock_in(
            product=po_item.product, warehouse=purchase_order.warehouse, quantity=qty,
            variant=po_item.variant, reference=purchase_order.po_number,
            notes=f"Received against {purchase_order.po_number}", user=user,
            transaction_type=StockTransaction.TransactionType.PURCHASE,
        )

        po_item.quantity_received += qty
        po_item.save(update_fields=["quantity_received"])

        received_value += (po_item.unit_cost * qty).quantize(Decimal("0.01"))

    purchase_order.supplier.outstanding_payable += received_value
    purchase_order.supplier.save(update_fields=["outstanding_payable"])

    all_received = all(i.quantity_received >= i.quantity_ordered for i in purchase_order.items.all())
    purchase_order.status = (
        PurchaseOrder.Status.RECEIVED if all_received else PurchaseOrder.Status.PARTIALLY_RECEIVED
    )
    purchase_order.save(update_fields=["status"])

    return purchase_order


@transaction.atomic
def add_supplier_payment(purchase_order, amount, method, user, reference=""):
    """Records a payment to the supplier against a PO and reduces their outstanding payable."""
    if amount <= 0:
        raise ValueError("Payment amount must be positive.")

    payment = SupplierPayment.objects.create(
        purchase_order=purchase_order, amount=amount, method=method,
        reference=reference, paid_by=user, created_by=user,
    )

    purchase_order.paid_amount += amount
    purchase_order.save(update_fields=["paid_amount"])

    supplier = purchase_order.supplier
    supplier.outstanding_payable = max(Decimal("0"), supplier.outstanding_payable - amount)
    supplier.save(update_fields=["outstanding_payable"])

    return payment
