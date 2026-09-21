from decimal import Decimal


def get_customer_ledger(customer):
    """
    Builds a full statement of account for a customer: every invoice that
    makes up what they owe shows as its own dated line (Invoice No, date,
    amount — pulled straight from the Sale, same as the invoice template),
    followed by every return and payment against those invoices — each
    carrying a running balance so it's clear exactly which invoices add up
    to the total, and what's been paid off since.

    amount_owed / total_paid / remaining are unchanged in meaning from
    before (still the same aggregate totals other code — previous_balance
    snapshotting, the New Booking screen's live balance, etc. — reads off
    this function) — only `entries` grew to include invoice/return rows
    alongside payments, so nothing else that calls this breaks.
    """
    from apps.sales.models import Sale, Payment, SaleReturn
    from django.db.models import Q

    active_sales = Sale.objects.filter(customer=customer).exclude(
        status__in=[Sale.Status.CANCELLED, Sale.Status.RETURNED]
    ).order_by("created_at", "id")
    # sale.total_amount is already net of any return against it — see
    # process_return in apps/sales/services.py, which nets the refund
    # straight off the invoice's own total_amount at the source. So
    # total_billed here is already the correct, current amount owed on
    # these invoices; it must NOT be reduced by refund_amount again below
    # (that used to double-subtract every return — once because
    # total_amount was already smaller, and again via total_returned —
    # which is exactly what showed a returned invoice's remaining balance
    # as a false negative "advance").
    total_billed = sum((s.total_amount for s in active_sales), Decimal("0"))
    amount_owed = total_billed

    # Still fetched for the informational "Return against X" line below
    # (so a return remains visible in the statement), but no longer
    # subtracted from amount_owed — seeing when/how much was returned is
    # useful, it just must not move the balance a second time.
    returns = SaleReturn.objects.filter(sale__in=active_sales).select_related("sale").order_by("created_at", "id")

    # Includes both payments tied to a specific invoice AND standalone
    # "General Collection" payments recorded straight against the customer
    # (see collect_customer_payment) — both count down the same baseline.
    # Sorting by id as a tiebreaker (not just created_at) keeps same-second
    # rows from a single "Collect Payment" action in their true creation
    # order — invoices first, any leftover General Collection last.
    payments = (
        Payment.objects.filter(
            Q(sale__customer=customer, sale__in=active_sales) | Q(customer=customer, sale__isnull=True)
        )
        .select_related("sale")
        .order_by("created_at", "id")
    )
    running_paid = sum((p.amount for p in payments), Decimal("0"))

    # Build every invoice/return/payment as a (date, tiebreak, delta, row)
    # transaction, sort them chronologically, then walk that single list
    # once so the running balance is always the true balance right after
    # that specific line — invoices push it up, returns and payments bring
    # it down. Tiebreak keeps an invoice ahead of a same-second payment
    # against it (e.g. a cash sale paid instantly at booking).
    txns = []
    for sale in active_sales:
        txns.append((sale.created_at, sale.id, 0, sale.total_amount, {
            "type": "invoice", "sale_id": sale.id, "reference": sale.invoice_number,
            "description": f"Invoice — {sale.invoice_number}",
        }))
    for r in returns:
        # delta 0 on purpose: the return's financial effect is already
        # baked into the invoice line above (its total_amount is already
        # net of this refund) — this line is shown purely so a return
        # remains visible in the statement, without moving the balance a
        # second time.
        txns.append((r.created_at, r.id, 1, Decimal("0"), {
            "type": "return", "sale_id": r.sale_id, "reference": r.sale.invoice_number,
            "description": f"Return against {r.sale.invoice_number} (already reflected in the invoice total above)",
            "display_amount": r.refund_amount,
        }))
    for p in payments:
        if p.sale_id:
            reference = p.sale.invoice_number
            description = f"Payment received ({p.method}) — {p.sale.invoice_number}"
        else:
            reference = p.reference or "General Collection"
            description = f"Payment received ({p.method}) — General Collection"
        txns.append((p.created_at, p.id, 2, -p.amount, {
            "type": "payment", "id": p.id, "reference": reference,
            "description": description, "method": p.method,
        }))

    txns.sort(key=lambda t: (t[0], t[2], t[1]))

    running_balance = Decimal("0")
    entries = []
    for date, _row_id, _tiebreak, delta, data in txns:
        running_balance += delta
        # Return lines carry delta=0 (see above) but still show the real
        # refund figure via display_amount, rather than the 0 that
        # abs(delta) would otherwise show.
        shown_amount = data.get("display_amount", abs(delta))
        entry = {
            "date": date.isoformat(),
            "type": data["type"],
            "reference": data["reference"],
            "description": data["description"],
            "amount": str(shown_amount),
            "remaining": str(running_balance),
        }
        if "sale_id" in data:
            entry["sale_id"] = data["sale_id"]
        if "id" in data:
            entry["id"] = data["id"]
        if "method" in data:
            entry["method"] = data["method"]
        entries.append(entry)

    return {
        "amount_owed": str(amount_owed),
        "total_paid": str(running_paid),
        "remaining": str(amount_owed - running_paid),
        "entries": entries,
    }