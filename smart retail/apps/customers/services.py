from decimal import Decimal


def get_customer_ledger(customer):
    """
    Builds a chronological ledger for a customer from three existing sources
    (no separate Ledger model — this is a computed view over real transactions):
      - Sale (debit: total_amount) — increases what the customer owes
      - Payment (credit: amount) — reduces what the customer owes
      - SaleReturn (credit: refund_amount) — reduces what the customer owes
    Returns a list of entries with a running balance, oldest first.
    """
    from apps.sales.models import Sale, Payment, SaleReturn

    events = []

    sales = Sale.objects.filter(customer=customer).exclude(status=Sale.Status.CANCELLED)
    for sale in sales:
        events.append({
            "date": sale.created_at, "type": "invoice", "reference": sale.invoice_number,
            "description": f"Invoice {sale.invoice_number}",
            "debit": sale.total_amount, "credit": Decimal("0"),
        })

    payments = Payment.objects.filter(sale__customer=customer).select_related("sale")
    for payment in payments:
        events.append({
            "date": payment.created_at, "type": "payment", "reference": payment.sale.invoice_number,
            "description": f"Payment received ({payment.method}) — {payment.sale.invoice_number}",
            "debit": Decimal("0"), "credit": payment.amount,
        })

    returns = SaleReturn.objects.filter(sale__customer=customer).select_related("sale")
    for ret in returns:
        events.append({
            "date": ret.created_at, "type": "return", "reference": ret.sale.invoice_number,
            "description": f"Return against {ret.sale.invoice_number}",
            "debit": Decimal("0"), "credit": ret.refund_amount,
        })

    events.sort(key=lambda e: e["date"])

    running_balance = Decimal("0")
    entries = []
    for e in events:
        running_balance += e["debit"] - e["credit"]
        entries.append({
            "date": e["date"].isoformat(), "type": e["type"], "reference": e["reference"],
            "description": e["description"],
            "debit": str(e["debit"]), "credit": str(e["credit"]),
            "balance": str(running_balance),
        })

    return entries
