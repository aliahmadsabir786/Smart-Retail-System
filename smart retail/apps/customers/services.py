from decimal import Decimal


def get_customer_ledger(customer):
    """
    Builds a payment-receipt ledger for a customer: only actual payments
    show up as dated line items, each carrying the amount received and the
    balance still owed right after that payment.

    Invoices and returns are NOT shown as their own line items — showing
    every invoice (debit) and return (credit) as separate rows made the
    balance visibly swing up and down and was confusing to read. Instead
    they're folded into a single "amount owed" baseline up front:
      amount_owed = total of active (non-cancelled, non-fully-returned)
                    invoices, minus any partial-return refunds against
                    those still-active invoices.
    Each payment then simply counts down from that baseline.
    """
    from apps.sales.models import Sale, Payment, SaleReturn

    active_sales = Sale.objects.filter(customer=customer).exclude(
        status__in=[Sale.Status.CANCELLED, Sale.Status.RETURNED]
    )
    total_billed = sum((s.total_amount for s in active_sales), Decimal("0"))

    # Partial returns against a still-active sale reduce what's actually
    # owed, even though the sale itself isn't fully cancelled/returned.
    total_returned = sum(
        (r.refund_amount for r in SaleReturn.objects.filter(sale__in=active_sales)), Decimal("0")
    )
    amount_owed = total_billed - total_returned

    payments = (
        Payment.objects.filter(sale__customer=customer, sale__in=active_sales)
        .select_related("sale")
        .order_by("created_at")
    )

    running_paid = Decimal("0")
    entries = []
    for payment in payments:
        running_paid += payment.amount
        remaining = amount_owed - running_paid
        entries.append({
            "date": payment.created_at.isoformat(), "type": "payment", "reference": payment.sale.invoice_number,
            "description": f"Payment received ({payment.method}) — {payment.sale.invoice_number}",
            "amount": str(payment.amount),
            "remaining": str(remaining),
        })

    return {
        "amount_owed": str(amount_owed),
        "total_paid": str(running_paid),
        "remaining": str(amount_owed - running_paid),
        "entries": entries,
    }