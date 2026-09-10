from decimal import Decimal
from django.db import transaction
from django.utils import timezone

from apps.core.exceptions import ServiceException, InvalidTransitionException
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

    # Snapshot what the customer already owed BEFORE this sale, computed the
    # same way the Ledger Accounts screen does (live from real Sale/Payment
    # rows) rather than from the customer.outstanding_balance cache field,
    # which only gets bumped for credit sales and can drift out of sync.
    # Safe to read now: this sale row exists but total_amount is still 0,
    # so it contributes nothing to the ledger's numbers yet.
    if customer:
        from apps.customers.services import get_customer_ledger
        sale.previous_balance = Decimal(get_customer_ledger(customer)["remaining"])
        sale.save(update_fields=["previous_balance"])

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
        # Per-customer credit limit is no longer enforced — a credit sale is
        # always allowed regardless of the customer's outstanding balance.
        # We still track outstanding_balance itself, since Customer Collection
        # (previous balance / total-to-collect) depends on it.
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
    # Snapshot the customer's already-owed balance at the moment of booking
    # (see create_sale's identical comment) — this is what the booking
    # screen's "Previous Balance" preview shows, and it's what should still
    # print on the invoice later, frozen as of right now.
    if customer:
        from apps.customers.services import get_customer_ledger
        sale.previous_balance = Decimal(get_customer_ledger(customer)["remaining"])
        sale.save(update_fields=["previous_balance"])
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

    if customer != sale.customer:
        # The booking's previous-balance snapshot was taken for whoever the
        # customer was at hold time — if they've since switched who this
        # booking is for, that snapshot belongs to the wrong person and
        # needs retaking against the new customer's own balance.
        if customer:
            from apps.customers.services import get_customer_ledger
            sale.previous_balance = Decimal(get_customer_ledger(customer)["remaining"])
        else:
            sale.previous_balance = Decimal("0")
        sale.save(update_fields=["previous_balance"])

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
        # Per-customer credit limit is no longer enforced — see create_sale() above.
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
def edit_completed_sale(sale, customer, warehouse, items, user, discount_amount=Decimal("0"),
                         coupon=None, is_credit_sale=None, notes=""):
    """
    Edits an already-finalized invoice IN PLACE: same Sale row, same
    invoice_number. Internally this still reverses every side effect the
    original items caused (stock, customer credit balance, loyalty points)
    and reapplies fresh ones for the new items — it just does it on the
    existing row and marks it EDITED instead of creating a second invoice
    and marking the first one RETURNED.

    Refuses a CANCELLED sale (nothing meaningful to edit) or a DRAFT (use
    update_draft_sale/finalize_draft_sale for those instead).

    NOTE on payments: any cash/card payments already recorded against the
    old total are removed along with paid_amount being reset to 0 and
    payment_status going back to UNPAID/credit — since the item list (and
    therefore what's actually owed) has changed, the till needs to
    re-collect against the new total, and the customer's Ledger must not
    keep counting money that was received against the invoice's old
    version. Adjust here if your business instead wants old payments
    carried forward onto the new total.
    """
    if sale.status == Sale.Status.CANCELLED:
        raise InvalidTransitionException("A cancelled invoice cannot be edited.")
    if sale.status == Sale.Status.DRAFT:
        raise InvalidTransitionException("This invoice is still held — use the hold/edit-hold endpoint instead.")
    if not items:
        raise ServiceException("A sale must contain at least one item.")

    # Was the ORIGINAL sale a credit sale? Best available signal: it was
    # left UNPAID/PARTIAL rather than PAID (see create_sale — a cash/card
    # sale is paid in full right away via add_payment).
    was_credit_sale = sale.customer_id is not None and sale.payment_status != Sale.PaymentStatus.PAID
    if is_credit_sale is None:
        is_credit_sale = was_credit_sale

    old_items = list(sale.items.select_related("product", "variant"))

    # Fixed: when this edit changes the sale (e.g. Cash → Credit), paid_amount
    # is reset to 0 below and the sale goes back to UNPAID — but the old Cash/
    # Card Payment row(s) recorded against this invoice used to be left in
    # place "for audit purposes". The customer Ledger (get_customer_ledger)
    # sums real Payment rows, not sale.paid_amount, so that stale payment kept
    # counting as money already received — the invoice still showed as paid/
    # cash in the ledger even though it had just been switched to Credit (On
    # Account) and should now show as an outstanding due amount. Since
    # paid_amount is being zeroed out for this invoice anyway, its old
    # payments are removed here too so the ledger and the sale's own fields
    # stay consistent.
    sale.payments.all().delete()

    # --- 1. Reverse the OLD items' stock + credit + loyalty side effects ---
    for old_item in old_items:
        remaining = old_item.quantity - old_item.quantity_returned
        if remaining > 0:
            inventory_services.stock_in(
                product=old_item.product, warehouse=sale.warehouse, quantity=remaining,
                variant=old_item.variant, reference=sale.invoice_number,
                notes=f"Edit: reversing original items on {sale.invoice_number}", user=user,
                transaction_type=StockTransaction.TransactionType.SALE_RETURN,
            )

    if sale.customer:
        if was_credit_sale:
            # due_amount (not total_amount) is what's still actually sitting
            # on the customer's balance from this sale — any payments already
            # made against it were already subtracted by add_payment.
            sale.customer.outstanding_balance = max(
                Decimal("0"), sale.customer.outstanding_balance - sale.due_amount
            )
        sale.customer.loyalty_points = max(0, sale.customer.loyalty_points - int(sale.total_amount))
        sale.customer.save(update_fields=["outstanding_balance", "loyalty_points"])

    # --- 2. Replace line items and reapply stock/pricing for the new ones ---
    sale.items.all().delete()

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

        inventory_services.stock_out(
            product=item["product"], warehouse=warehouse, quantity=item["quantity"],
            variant=item.get("variant"), reference=sale.invoice_number,
            notes=f"Edit: new items on {sale.invoice_number}", user=user,
            transaction_type=StockTransaction.TransactionType.SALE,
        )

    extra_discount = Decimal(discount_amount or 0)
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

    sale.customer = customer
    sale.warehouse = warehouse
    sale.notes = notes
    sale.coupon = coupon
    sale.subtotal = subtotal.quantize(Decimal("0.01"))
    sale.discount_amount = total_discount.quantize(Decimal("0.01"))
    sale.tax_amount = total_tax.quantize(Decimal("0.01"))
    sale.total_amount = total_amount
    sale.paid_amount = Decimal("0.00")
    sale.status = Sale.Status.EDITED
    sale.payment_status = Sale.PaymentStatus.UNPAID

    if is_credit_sale:
        if not customer:
            raise ServiceException("Credit sales require a registered customer.")
        customer.outstanding_balance += total_amount
        customer.save(update_fields=["outstanding_balance"])

    sale.save(update_fields=[
        "customer", "warehouse", "notes", "coupon", "subtotal", "discount_amount",
        "tax_amount", "total_amount", "paid_amount", "status", "payment_status",
    ])

    if customer:
        customer.loyalty_points += int(total_amount)
        customer.save(update_fields=["loyalty_points"])

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
def collect_customer_payment(customer, amount, method, user, reference=""):
    """
    Records a general cash collection against a customer's overall running
    balance — e.g. the daily round collecting whatever credit customers pay
    off, where the money isn't earmarked for one specific invoice. Not
    linked to any Sale: it shows up in the customer's ledger as its own
    dated "General Collection" row, and counts toward paying down whatever
    is oldest, exactly like any other payment — including reducing the
    previous_balance snapshot on the customer's NEXT invoice.
    """
    if amount <= 0:
        raise ValueError("Amount must be positive.")
    payment = Payment.objects.create(
        sale=None, customer=customer, amount=amount, method=method,
        reference=reference, received_by=user,
    )
    customer.outstanding_balance = max(Decimal("0"), customer.outstanding_balance - amount)
    customer.save(update_fields=["outstanding_balance"])

    # Fixed: this used to stop here, only touching the customer's overall
    # balance. That left every individual invoice's own paid_amount /
    # payment_status untouched, so a customer could be fully cleared here
    # (outstanding_balance = 0) while their invoices still showed "unpaid"
    # on the Order Bookings list. Now the collection is also applied to the
    # customer's own unpaid/partial invoices, oldest first -- same
    # allocation the Collection page already does via SalesAPI.pay() -- so
    # each invoice's status stays in sync with the account being cleared.
    # No extra Payment rows are created and outstanding_balance is not
    # touched again here; only each Sale's own bookkeeping fields update.
    remaining = amount
    unpaid_sales = (
        Sale.objects.filter(customer=customer)
        .exclude(status__in=[Sale.Status.CANCELLED, Sale.Status.RETURNED])
        .exclude(payment_status=Sale.PaymentStatus.PAID)
        .order_by("created_at")
    )
    for sale in unpaid_sales:
        if remaining <= 0:
            break
        due = sale.total_amount - sale.paid_amount
        if due <= 0:
            continue
        applied = min(due, remaining)
        sale.paid_amount += applied
        sale.payment_status = (
            Sale.PaymentStatus.PAID if sale.paid_amount >= sale.total_amount
            else Sale.PaymentStatus.PARTIAL
        )
        sale.save(update_fields=["paid_amount", "payment_status"])
        remaining -= applied

    return payment


def _recompute_sale_payment_status(sale):
    """Shared helper: derives payment_status from the current paid_amount vs
    total_amount, used any time paid_amount is corrected after the fact
    (editing/deleting a payment) rather than added to fresh."""
    if sale.paid_amount <= 0:
        sale.payment_status = Sale.PaymentStatus.UNPAID
    elif sale.paid_amount >= sale.total_amount:
        sale.payment_status = Sale.PaymentStatus.PAID
    else:
        sale.payment_status = Sale.PaymentStatus.PARTIAL


@transaction.atomic
def update_payment(payment, *, amount=None, method=None, reference=None, occurred_on=None, user=None):
    """
    Manually corrects an already-recorded payment (e.g. a cashier typo, a
    duplicate entry, or the wrong date) directly from the Ledger Accounts
    screen. Rather than treating the new amount as a fresh payment, this
    applies only the DELTA between the old and new amount to the sale's
    paid_amount and the customer's outstanding_balance, since the old
    amount's effect on both is already baked in.
    """
    sale = payment.sale
    old_amount = payment.amount

    if amount is not None:
        if amount <= 0:
            raise ValueError("Payment amount must be positive.")
        payment.amount = amount
    if method is not None:
        payment.method = method
    if reference is not None:
        payment.reference = reference
    if user is not None and hasattr(payment, "updated_by_id"):
        payment.updated_by = user
    payment.save()

    if occurred_on is not None:
        # created_at is auto_now_add, so it can't be set through a normal
        # .save() — bypass it with a queryset update, then refresh the
        # in-memory instance so the returned/serialized object is correct.
        Payment.objects.filter(pk=payment.pk).update(created_at=occurred_on)
        payment.refresh_from_db(fields=["created_at"])

    delta = payment.amount - old_amount
    if delta != 0:
        if sale:
            sale.paid_amount = max(Decimal("0"), sale.paid_amount + delta)
            _recompute_sale_payment_status(sale)
            sale.save(update_fields=["paid_amount", "payment_status"])
            if sale.customer:
                sale.customer.outstanding_balance = max(
                    Decimal("0"), sale.customer.outstanding_balance - delta
                )
                sale.customer.save(update_fields=["outstanding_balance"])
        elif payment.customer:
            # Standalone general-collection payment — no Sale to update,
            # just the customer's running balance.
            payment.customer.outstanding_balance = max(
                Decimal("0"), payment.customer.outstanding_balance - delta
            )
            payment.customer.save(update_fields=["outstanding_balance"])

    return payment


@transaction.atomic
def delete_payment(payment):
    """Removes a wrongly-recorded payment and reverses its effect on the
    parent sale's paid_amount/payment_status and the customer's
    outstanding_balance — or, for a standalone general collection, just
    the customer's outstanding_balance."""
    sale = payment.sale
    amount = payment.amount

    if sale:
        sale.paid_amount = max(Decimal("0"), sale.paid_amount - amount)
        _recompute_sale_payment_status(sale)
        sale.save(update_fields=["paid_amount", "payment_status"])
        if sale.customer:
            sale.customer.outstanding_balance += amount
            sale.customer.save(update_fields=["outstanding_balance"])
    elif payment.customer:
        payment.customer.outstanding_balance += amount
        payment.customer.save(update_fields=["outstanding_balance"])

    payment.delete()


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