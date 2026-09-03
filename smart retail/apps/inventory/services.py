import uuid
from django.db import transaction
from django.db.models import F

from apps.core.exceptions import InsufficientStockException
from .models import StockItem, StockTransaction, StockTransfer


def _get_or_create_stock_item(product, warehouse, variant=None):
    stock_item, _ = StockItem.objects.select_for_update().get_or_create(
        product=product, warehouse=warehouse, variant=variant,
        defaults={"quantity": 0},
    )
    return stock_item


@transaction.atomic
def stock_in(product, warehouse, quantity, variant=None, reference="", notes="", user=None,
             transaction_type=StockTransaction.TransactionType.STOCK_IN):
    """Increases stock and writes a ledger entry. Used for receiving purchases, initial stock, returns."""
    if quantity <= 0:
        raise ValueError("Quantity must be positive.")

    stock_item = _get_or_create_stock_item(product, warehouse, variant)
    stock_item.quantity = F("quantity") + quantity
    stock_item.save(update_fields=["quantity"])
    stock_item.refresh_from_db()

    return StockTransaction.objects.create(
        product=product, variant=variant, warehouse=warehouse,
        transaction_type=transaction_type, quantity=quantity,
        balance_after=stock_item.quantity, reference=reference, notes=notes,
        created_by=user,
    )


@transaction.atomic
def stock_out(product, warehouse, quantity, variant=None, reference="", notes="", user=None,
              transaction_type=StockTransaction.TransactionType.STOCK_OUT, allow_negative=False):
    """Decreases stock and writes a ledger entry. Raises InsufficientStockException if not enough on hand."""
    if quantity <= 0:
        raise ValueError("Quantity must be positive.")

    stock_item = _get_or_create_stock_item(product, warehouse, variant)

    if not allow_negative and stock_item.quantity < quantity:
        raise InsufficientStockException(
            f"Insufficient stock for {product.sku} at {warehouse.code}: "
            f"have {stock_item.quantity}, need {quantity}."
        )

    stock_item.quantity = F("quantity") - quantity
    stock_item.save(update_fields=["quantity"])
    stock_item.refresh_from_db()

    return StockTransaction.objects.create(
        product=product, variant=variant, warehouse=warehouse,
        transaction_type=transaction_type, quantity=quantity,
        balance_after=stock_item.quantity, reference=reference, notes=notes,
        created_by=user,
    )


@transaction.atomic
def adjust_stock(product, warehouse, new_quantity, variant=None, reference="", notes="", user=None):
    """
    Sets stock to an exact quantity (physical count reconciliation) and logs the
    delta as an ADJUSTMENT_INCREASE or ADJUSTMENT_DECREASE transaction.
    """
    if new_quantity < 0:
        raise ValueError("New quantity cannot be negative.")

    stock_item = _get_or_create_stock_item(product, warehouse, variant)
    current = stock_item.quantity
    delta = new_quantity - current

    if delta == 0:
        return None

    stock_item.quantity = new_quantity
    stock_item.save(update_fields=["quantity"])

    txn_type = (StockTransaction.TransactionType.ADJUSTMENT_INCREASE if delta > 0
                else StockTransaction.TransactionType.ADJUSTMENT_DECREASE)

    return StockTransaction.objects.create(
        product=product, variant=variant, warehouse=warehouse,
        transaction_type=txn_type, quantity=abs(delta),
        balance_after=new_quantity, reference=reference,
        notes=notes or f"Adjusted from {current} to {new_quantity}",
        created_by=user,
    )


@transaction.atomic
def transfer_stock(product, from_warehouse, to_warehouse, quantity, variant=None, notes="", user=None):
    """
    Moves stock between warehouses as a single atomic operation:
    creates a StockTransfer record + paired TRANSFER_OUT/TRANSFER_IN ledger entries.
    """
    if from_warehouse == to_warehouse:
        raise ValueError("Source and destination warehouse must differ.")

    transfer_number = f"TRF-{uuid.uuid4().hex[:10].upper()}"

    transfer = StockTransfer.objects.create(
        transfer_number=transfer_number, product=product, variant=variant,
        quantity=quantity, from_warehouse=from_warehouse, to_warehouse=to_warehouse,
        status=StockTransfer.Status.PENDING, notes=notes, created_by=user,
    )

    stock_out(product, from_warehouse, quantity, variant=variant, reference=transfer_number,
              notes=f"Transfer to {to_warehouse.code}", user=user,
              transaction_type=StockTransaction.TransactionType.TRANSFER_OUT)

    stock_in(product, to_warehouse, quantity, variant=variant, reference=transfer_number,
             notes=f"Transfer from {from_warehouse.code}", user=user,
             transaction_type=StockTransaction.TransactionType.TRANSFER_IN)

    from django.utils import timezone
    transfer.status = StockTransfer.Status.COMPLETED
    transfer.completed_at = timezone.now()
    transfer.save(update_fields=["status", "completed_at"])

    return transfer


def get_available_quantity(product, warehouse, variant=None):
    stock_item = StockItem.objects.filter(product=product, warehouse=warehouse, variant=variant).first()
    return stock_item.quantity if stock_item else 0


def get_total_quantity_across_warehouses(product, variant=None):
    from django.db.models import Sum
    qs = StockItem.objects.filter(product=product, variant=variant)
    return qs.aggregate(total=Sum("quantity"))["total"] or 0
