from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from apps.core.exceptions import CreditLimitExceededException, ServiceException, InvalidTransitionException
from apps.inventory import services as inventory_services
from apps.inventory.models import StockTransaction
from .models import Sale, SaleItem, Payment, SaleReturn, SaleReturnItem


@transaction.atomic
def create_sale(customer, warehouse, items, user, discount_amount=Decimal("0"),
                 coupon=None, is_credit_sale=False, notes=""):
    """
    Creates a POS/Sales invoice atomically:
      1. Validates & deducts stock for every line item (raises InsufficientStockException if short)
      2. Computes subtotal/discount/tax/total from line items
      3. If is_credit_sale, checks & updates the customer's outstanding balance against their credit limit
      4. Awards loyalty points (1 point per whole currency unit spent, simple default policy)

    `items` is a list of dicts: {"product": Product, "variant": ProductVariant|None,
    "quantity": int, "unit_price": Decimal, "discount_percent": Decimal, "tax_percent": Decimal}
    """
    if not items:
        raise ServiceException("A sale must contain at least one item.")

    if is_credit_sale and customer is None:
        raise ServiceException("Credit sales require a registered customer.")

    sale = Sale.objects.create(
        invoice_number=Sale.generate_invoice_number(),
        customer=customer, warehouse=warehouse, served_by=user, coupon=coupon,
        status=Sale.Status.COMPLETED, notes=notes, created_by=user,
    )

    subtotal = Decimal("0")
    total_discount = Decimal("0")
    total_tax = Decimal("0")

    for item in items:
        sale_item = SaleItem.objects.create(
            sale=sale, product=item["product"], variant=item.get("variant"),
            quantity=item["quantity"], unit_price=item["unit_price"],
            discount_percent=item.get("discount_percent", Decimal("0")),
            tax_percent=item.get("tax_percent", Decimal("0")),
            created_by=user,
        )
        subtotal += sale_item.line_subtotal
        total_discount += sale_item.line_discount
        total_tax += sale_item.line_tax

        # Deduct stock — will raise InsufficientStockException and roll back the whole sale
        inventory_services.stock_out(
            product=item["product"], warehouse=warehouse, quantity=item["quantity"],
            variant=item.get("variant"), reference=sale.invoice_number,
            notes=f"Sale {sale.invoice_number}", user=user,
            transaction_type=StockTransaction.TransactionType.SALE,
        )

    # Coupon or manual discount stacks on top of per-line discounts
    extra_discount = discount_amount
    if coupon:
        if not coupon.is_valid():
            raise ServiceException("Coupon is invalid, expired, or has reached its usage limit.")
        extra_discount += coupon.calculate_discount(subtotal)
        coupon.used_count += 1
        coupon.save(update_fields=["used_count"])

    total_discount += extra_discount
    total_amount = (subtotal - total_discount + total_tax).quantize(Decimal("0.01"))
    if total_amount < 0:
        total_amount = Decimal("0.00")

    sale.subtotal = subtotal.quantize(Decimal("0.01"))
    sale.discount_amount = total_discount.quantize(Decimal("0.01"))
    sale.tax_amount = total_tax.quantize(Decimal("0.01"))
    sale.total_amount = total_amount
    sale.save(update_fields=["subtotal", "discount_amount", "tax_amount", "total_amount"])

    if is_credit_sale:
        if not customer.can_purchase_on_credit(total_amount):
            raise CreditLimitExceededException(
                f"Sale of {total_amount} exceeds available credit of {customer.available_credit}."
            )
        customer.outstanding_balance += total_amount
        customer.save(update_fields=["outstanding_balance"])
        sale.payment_status = Sale.PaymentStatus.UNPAID
        sale.save(update_fields=["payment_status"])
    else:
        # Cash/card sale is assumed paid in full via a Payment record created by the caller
        # (see add_payment) — payment_status stays UNPAID until that payment is recorded.
        pass

    if customer:
        points_earned = int(total_amount)  # simple default: 1 point per currency unit
        customer.loyalty_points += points_earned
        customer.save(update_fields=["loyalty_points"])

    return sale


@transaction.atomic
def create_draft_sale(customer, warehouse, items, user, discount_amount=Decimal("0"), notes=""):
    """
    "Hold Invoice" — parks a booking as a DRAFT sale. Line items and totals are
    computed exactly like a normal sale, but every side effect that only makes
    sense for a *finalized* transaction is skipped: no stock is deducted, no
    customer balance or loyalty points are touched. A held invoice can be
    freely edited (see update_draft_sale) or deleted until it's converted into
    a real sale with finalize_draft_sale.
    """
    if not items:
        raise ServiceException("A sale must contain at least one item.")

    sale = Sale.objects.create(
        invoice_number=Sale.generate_invoice_number(),
        customer=customer, warehouse=warehouse, served_by=user,
        status=Sale.Status.DRAFT, notes=notes, created_by=user,
    )
    _set_draft_items(sale, items, discount_amount)
    return sale


@transaction.atomic
def update_draft_sale(sale, customer, warehouse, items, discount_amount=Decimal("0"), notes=""):
    """Replaces every line item on a still-held (DRAFT) invoice and recomputes
    totals. Refuses to touch anything once the invoice has been finalized —
    editing a completed sale's items would silently desync stock and ledgers
    that have already moved; use a Sale Return for that instead."""
    if sale.status != Sale.Status.DRAFT:
        raise InvalidTransitionException("Only a held invoice can be edited — this one is already finalized.")
    if not items:
        raise ServiceException("A sale must contain at least one item.")

    sale.customer = customer
    sale.warehouse = warehouse
    sale.notes = notes
    sale.items.all().delete()
    _set_draft_items(sale, items, discount_amount)
    return sale


def _set_draft_items(sale, items, discount_amount):
    """Shared item/total-building step for create_draft_sale and update_draft_sale
    — deliberately has no stock or customer side effects."""
    subtotal = Decimal("0")
    total_discount = Decimal(discount_amount or 0)
    total_tax = Decimal("0")

    for item in items:
        sale_item = SaleItem.objects.create(
            sale=sale, product=item["product"], variant=item.get("variant"),
            quantity=item["quantity"], unit_price=item["unit_price"],
            discount_percent=item.get("discount_percent", Decimal("0")),
            tax_percent=item.get("tax_percent", Decimal("0")),
            created_by=sale.created_by,
        )
        subtotal += sale_item.line_subtotal
        total_discount += sale_item.line_discount
        total_tax += sale_item.line_tax

    total_amount = (subtotal - total_discount + total_tax).quantize(Decimal("0.01"))
    if total_amount < 0:
        total_amount = Decimal("0.00")

    sale.subtotal = subtotal.quantize(Decimal("0.01"))
    sale.discount_amount = total_discount.quantize(Decimal("0.01"))
    sale.tax_amount = total_tax.quantize(Decimal("0.01"))
    sale.total_amount = total_amount
    sale.save(update_fields=[
        "subtotal", "discount_amount", "tax_amount", "total_amount",
        "customer", "warehouse", "notes",
    ])


@transaction.atomic
def finalize_draft_sale(sale, user, coupon=None, is_credit_sale=False):
    """
    Converts a held (DRAFT) invoice into a real, completed sale — this is the
    moment stock actually leaves the warehouse and the customer's balance/
    loyalty points are updated, exactly like a normal checkout via create_sale.
    """
    if sale.status != Sale.Status.DRAFT:
        raise InvalidTransitionException("This invoice has already been finalized.")

    items = list(sale.items.select_related("product", "variant"))
    if not items:
        raise ServiceException("A sale must contain at least one item.")

    subtotal = sum((i.line_subtotal for i in items), Decimal("0"))
    line_discount = sum((i.line_discount for i in items), Decimal("0"))
    total_tax = sum((i.line_tax for i in items), Decimal("0"))
    # Whatever was stored beyond the per-line discounts is the manual/flat
    # discount that was entered while the invoice was held.
    manual_discount = max(sale.discount_amount - line_discount, Decimal("0"))
    total_discount = line_discount + manual_discount

    for sale_item in items:
        inventory_services.stock_out(
            product=sale_item.product, warehouse=sale.warehouse, quantity=sale_item.quantity,
            variant=sale_item.variant, reference=sale.invoice_number,
            notes=f"Sale {sale.invoice_number}", user=user,
            transaction_type=StockTransaction.TransactionType.SALE,
        )

    if coupon:
        if not coupon.is_valid():
            raise ServiceException("Coupon is invalid, expired, or has reached its usage limit.")
        total_discount += coupon.calculate_discount(subtotal)
        coupon.used_count += 1
        coupon.save(update_fields=["used_count"])
        sale.coupon = coupon

    total_amount = (subtotal - total_discount + total_tax).quantize(Decimal("0.01"))
    if total_amount < 0:
        total_amount = Decimal("0.00")

    sale.subtotal = subtotal.quantize(Decimal("0.01"))
    sale.discount_amount = total_discount.quantize(Decimal("0.01"))
    sale.tax_amount = total_tax.quantize(Decimal("0.01"))
    sale.total_amount = total_amount
    sale.status = Sale.Status.COMPLETED

    if is_credit_sale:
        if not sale.customer:
            raise ServiceException("Credit sales require a registered customer.")
        if not sale.customer.can_purchase_on_credit(total_amount):
            raise CreditLimitExceededException(
                f"Sale of {total_amount} exceeds available credit of {sale.customer.available_credit}."
            )
        sale.customer.outstanding_balance += total_amount
        sale.customer.save(update_fields=["outstanding_balance"])
        sale.payment_status = Sale.PaymentStatus.UNPAID

    sale.save(update_fields=[
        "subtotal", "discount_amount", "tax_amount", "total_amount", "status", "payment_status", "coupon",
    ])

    if sale.customer:
        points_earned = int(total_amount)
        sale.customer.loyalty_points += points_earned
        sale.customer.save(update_fields=["loyalty_points"])

    return sale


@transaction.atomic
def add_payment(sale, amount, method, user, reference=""):
    """Records a payment against a sale and updates paid_amount/payment_status
    (and reduces the customer's outstanding_balance for credit sales)."""
    if amount <= 0:
        raise ValueError("Payment amount must be positive.")

    payment = Payment.objects.create(
        sale=sale, amount=amount, method=method, reference=reference,
        received_by=user, created_by=user,
    )

    sale.paid_amount += amount
    if sale.paid_amount >= sale.total_amount:
        sale.payment_status = Sale.PaymentStatus.PAID
    elif sale.paid_amount > 0:
        sale.payment_status = Sale.PaymentStatus.PARTIAL
    sale.save(update_fields=["paid_amount", "payment_status"])

    if sale.customer:
        sale.customer.outstanding_balance = max(
            Decimal("0"), sale.customer.outstanding_balance - amount
        )
        sale.customer.save(update_fields=["outstanding_balance"])

    return payment


@transaction.atomic
def process_return(sale, return_items, reason, user):
    """
    Processes a return for one or more sale items:
      1. Validates quantities against what's still returnable per line
      2. Restocks inventory (SALE_RETURN ledger entry)
      3. Computes refund_amount per item and total, creates SaleReturn + SaleReturnItem rows
      4. Updates the parent Sale's status (returned / partially_returned)

    `return_items` is a list of dicts: {"sale_item": SaleItem, "quantity": int}
    """
    if sale.status == Sale.Status.CANCELLED:
        raise InvalidTransitionException("Cannot return items on a cancelled sale.")
    if not return_items:
        raise ServiceException("At least one item must be specified for a return.")

    sale_return = SaleReturn.objects.create(
        sale=sale, reason=reason, processed_by=user, created_by=user,
    )

    total_refund = Decimal("0")

    for entry in return_items:
        sale_item = entry["sale_item"]
        qty = entry["quantity"]
        remaining = sale_item.quantity - sale_item.quantity_returned

        if qty > remaining:
            raise ServiceException(
                f"Cannot return {qty} of {sale_item.product.sku}; only {remaining} eligible for return."
            )

        unit_refund = (sale_item.line_total / sale_item.quantity) if sale_item.quantity else Decimal("0")
        refund_amount = (unit_refund * qty).quantize(Decimal("0.01"))

        SaleReturnItem.objects.create(
            sale_return=sale_return, sale_item=sale_item, quantity=qty, refund_amount=refund_amount,
        )

        sale_item.quantity_returned += qty
        sale_item.save(update_fields=["quantity_returned"])

        inventory_services.stock_in(
            product=sale_item.product, warehouse=sale.warehouse, quantity=qty,
            variant=sale_item.variant, reference=sale.invoice_number,
            notes=f"Return against {sale.invoice_number}", user=user,
            transaction_type=StockTransaction.TransactionType.SALE_RETURN,
        )

        total_refund += refund_amount

    sale_return.refund_amount = total_refund
    sale_return.save(update_fields=["refund_amount"])

    all_returned = all(
        i.quantity_returned >= i.quantity
        for i in SaleItem.objects.filter(sale=sale)
    )
    sale.status = Sale.Status.RETURNED if all_returned else Sale.Status.PARTIALLY_RETURNED
    sale.save(update_fields=["status"])

    if sale.customer:
        sale.customer.outstanding_balance = max(
            Decimal("0"), sale.customer.outstanding_balance - total_refund
        )
        sale.customer.save(update_fields=["outstanding_balance"])

    return sale_return