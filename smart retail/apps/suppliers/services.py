from decimal import Decimal


def get_supplier_ledger(supplier):
    """
    Chronological ledger for a supplier from three existing sources (no
    separate Ledger model — this is a computed view over real transactions):
      - PurchaseOrder (credit: total_amount) — increases what we owe the supplier
      - SupplierPayment (debit: amount) — reduces what we owe
      - PurchaseReturn (debit: refund_amount) — reduces what we owe
    Returns a list of entries with a running balance, oldest first.
    """
    from apps.purchase.models import PurchaseOrder, SupplierPayment, PurchaseReturn

    events = []

    orders = PurchaseOrder.objects.filter(supplier=supplier).exclude(status=PurchaseOrder.Status.CANCELLED)
    for po in orders:
        events.append({
            "date": po.created_at, "type": "purchase_order", "reference": po.po_number,
            "description": f"Purchase Order {po.po_number}",
            "debit": Decimal("0"), "credit": po.total_amount,
        })

    payments = SupplierPayment.objects.filter(purchase_order__supplier=supplier).select_related("purchase_order")
    for payment in payments:
        events.append({
            "date": payment.created_at, "type": "payment", "reference": payment.purchase_order.po_number,
            "description": f"Payment sent ({payment.method}) — {payment.purchase_order.po_number}",
            "debit": payment.amount, "credit": Decimal("0"),
        })

    returns = PurchaseReturn.objects.filter(purchase_order__supplier=supplier).select_related("purchase_order")
    for ret in returns:
        events.append({
            "date": ret.created_at, "type": "return", "reference": ret.purchase_order.po_number,
            "description": f"Return against {ret.purchase_order.po_number}",
            "debit": ret.refund_amount, "credit": Decimal("0"),
        })

    events.sort(key=lambda e: e["date"])

    running_balance = Decimal("0")
    entries = []
    for e in events:
        running_balance += e["credit"] - e["debit"]
        entries.append({
            "date": e["date"].isoformat(), "type": e["type"], "reference": e["reference"],
            "description": e["description"],
            "debit": str(e["debit"]), "credit": str(e["credit"]),
            "balance": str(running_balance),
        })

    return entries
