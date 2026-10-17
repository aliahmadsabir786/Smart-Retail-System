from datetime import date
from decimal import Decimal
from django.db.models import Sum, F, DecimalField, Case, When, Value, IntegerField
from apps.sales.models import Sale, SaleItem
from apps.expenses.models import Expense
from apps.purchase.models import PurchaseOrder
from .models import OtherIncome


def _date_filter(qs, field, date_from, date_to, is_datetime=True):
    """See apps.reports.services._date_filter for why this uses `{field}__date`
    for DateTimeField columns — without it, "Date To" excludes anything
    created after midnight on that day, silently hiding today's activity
    (today's sales, purchases, payments) from Profit & Loss."""
    lookup = f"{field}__date" if is_datetime else field
    if date_from:
        qs = qs.filter(**{f"{lookup}__gte": date_from})
    if date_to:
        qs = qs.filter(**{f"{lookup}__lte": date_to})
    return qs


def get_sales_income(date_from=None, date_to=None):
    """Revenue recognized from completed sales (excludes cancelled)."""
    qs = Sale.objects.exclude(status=Sale.Status.CANCELLED)
    qs = _date_filter(qs, "created_at", date_from, date_to)
    return qs.aggregate(total=Sum("total_amount"))["total"] or Decimal("0")


def get_other_income(date_from=None, date_to=None):
    qs = _date_filter(OtherIncome.objects.all(), "income_date", date_from, date_to, is_datetime=False)
    return qs.aggregate(total=Sum("amount"))["total"] or Decimal("0")


def get_total_income(date_from=None, date_to=None):
    return get_sales_income(date_from, date_to) + get_other_income(date_from, date_to)


def get_cost_of_goods_sold(date_from=None, date_to=None):
    """Sum of (cost_price * quantity_sold) across sale items in the period —
    approximates COGS using the product's current cost_price."""
    qs = SaleItem.objects.exclude(sale__status=Sale.Status.CANCELLED)
    qs = _date_filter(qs, "created_at", date_from, date_to)
    result = qs.aggregate(
        total=Sum(F("quantity") * F("product__cost_price"), output_field=DecimalField(max_digits=14, decimal_places=2))
    )["total"]
    return result or Decimal("0")


def get_total_expenses(date_from=None, date_to=None):
    qs = _date_filter(Expense.objects.filter(status=Expense.Status.APPROVED), "expense_date", date_from, date_to, is_datetime=False)
    return qs.aggregate(total=Sum("amount"))["total"] or Decimal("0")


def get_expense_breakdown(date_from=None, date_to=None):
    """
    Every individual approved expense in the period, oldest first — used
    to print the P&L's Expenses section as itemized lines (name, category,
    date, amount) followed by the total, instead of just a single lump
    total with no detail behind it.
    """
    qs = _date_filter(
        Expense.objects.filter(status=Expense.Status.APPROVED).select_related("category"),
        "expense_date", date_from, date_to, is_datetime=False,
    ).order_by("expense_date", "id")
    return [
        {
            "title": e.title,
            "category": e.category.name if e.category else "",
            "date": e.expense_date.isoformat(),
            "amount": e.amount,
        }
        for e in qs
    ]


def get_purchase_cash_outflow(date_from=None, date_to=None):
    """Cash actually paid to suppliers in the period (not the full PO value)."""
    from apps.purchase.models import SupplierPayment
    qs = _date_filter(SupplierPayment.objects.all(), "created_at", date_from, date_to)
    return qs.aggregate(total=Sum("amount"))["total"] or Decimal("0")


def get_sales_cash_inflow(date_from=None, date_to=None):
    """Cash actually received from customers in the period (payments, not invoice totals)."""
    from apps.sales.models import Payment
    qs = _date_filter(Payment.objects.all(), "created_at", date_from, date_to)
    return qs.aggregate(total=Sum("amount"))["total"] or Decimal("0")


def get_profit_and_loss(date_from=None, date_to=None):
    income = get_total_income(date_from, date_to)
    cogs = get_cost_of_goods_sold(date_from, date_to)
    gross_profit = income - cogs
    expenses = get_total_expenses(date_from, date_to)
    expense_items = get_expense_breakdown(date_from, date_to)
    net_profit = gross_profit - expenses

    return {
        "income": income,
        "cost_of_goods_sold": cogs,
        "gross_profit": gross_profit,
        "expenses": expenses,
        "expense_items": expense_items,
        "net_profit": net_profit,
        "is_profit": net_profit >= 0,
    }


def get_cash_flow(date_from=None, date_to=None):
    cash_in = get_sales_cash_inflow(date_from, date_to) + get_other_income(date_from, date_to)
    cash_out = get_purchase_cash_outflow(date_from, date_to) + get_total_expenses(date_from, date_to)
    net_cash_flow = cash_in - cash_out

    return {
        "cash_in": cash_in,
        "cash_out": cash_out,
        "net_cash_flow": net_cash_flow,
    }


# ═══════════════════════════════════════════════════════════════════
# PROFIT & LOSS STATEMENT (trading-account layout)
#   SALES / SALES ADJUSTMENTS / NET SALES / COST OF GOODS SOLD /
#   GROSS PROFIT / OTHER INCOMES / EXPENSES / NET PROFIT
# Every figure is pulled from the POS data (sales, returns, purchases,
# stock ledger, other income, approved expenses) — nothing is typed in.
# ═══════════════════════════════════════════════════════════════════
_ZERO = Decimal("0")


def _q(v):
    return (v or _ZERO).quantize(Decimal("0.01"))


def get_stock_value_at(as_of=None):
    """
    Inventory value (quantity x current cost price) at the END of `as_of`
    (None = right now). Rebuilt from the append-only stock ledger: current
    quantity minus every movement that happened after `as_of`.
    """
    from apps.inventory.models import StockItem, StockTransaction
    from apps.products.models import Product

    T = StockTransaction.TransactionType
    plus = [T.STOCK_IN, T.ADJUSTMENT_INCREASE, T.TRANSFER_IN, T.SALE_RETURN, T.PURCHASE]
    minus = [T.STOCK_OUT, T.ADJUSTMENT_DECREASE, T.TRANSFER_OUT, T.SALE, T.PURCHASE_RETURN]

    qty = {r["product_id"]: int(r["q"] or 0)
           for r in StockItem.objects.values("product_id").annotate(q=Sum("quantity"))}
    if as_of is not None:
        signed = Case(
            When(transaction_type__in=plus, then=F("quantity")),
            When(transaction_type__in=minus, then=-F("quantity")),
            default=Value(0), output_field=IntegerField(),
        )
        moved_after = (StockTransaction.objects.filter(created_at__date__gt=as_of)
                       .values("product_id").annotate(net=Sum(signed)))
        for r in moved_after:
            qty[r["product_id"]] = qty.get(r["product_id"], 0) - int(r["net"] or 0)
    costs = dict(Product.objects.filter(id__in=list(qty.keys())).values_list("id", "cost_price"))
    total = _ZERO
    for pid, q in qty.items():
        if q > 0:
            total += Decimal(q) * (costs.get(pid) or _ZERO)
    return _q(total)


def get_profit_loss_statement(date_from=None, date_to=None, include_closing_stock=True):
    """Structured P&L statement: a flat list of display rows + the key totals."""
    from datetime import timedelta
    from apps.sales.models import SaleReturn
    from apps.purchase.models import PurchaseReturn

    # ── SALES (split by how the bill was booked) ──
    sales_qs = _date_filter(Sale.objects.exclude(status=Sale.Status.CANCELLED), "created_at", date_from, date_to)
    ret_qs = SaleReturn.objects.filter(status=SaleReturn.Status.APPROVED, sale__in=sales_qs)

    def _sum(qs, field):
        return qs.aggregate(t=Sum(field))["t"] or _ZERO

    # A return is netted straight off the invoice's total_amount when it is
    # processed, so the ORIGINAL (gross) sale = current total + what was returned.
    credit_ret = _sum(ret_qs.filter(sale__is_credit=True), "refund_amount")
    cash_ret = _sum(ret_qs.filter(sale__is_credit=False), "refund_amount")
    credit_sales = _sum(sales_qs.filter(is_credit=True), "total_amount") + credit_ret
    cash_sales = _sum(sales_qs.filter(is_credit=False), "total_amount") + cash_ret
    sales_total = credit_sales + cash_sales
    sales_returns = credit_ret + cash_ret
    net_sales = sales_total - sales_returns

    # ── COST OF GOODS SOLD ──
    opening = get_stock_value_at(date_from - timedelta(days=1)) if date_from else get_stock_value_at(date.min)
    po_qs = _date_filter(
        PurchaseOrder.objects.filter(status__in=[PurchaseOrder.Status.RECEIVED, PurchaseOrder.Status.PARTIALLY_RECEIVED]),
        "created_at", date_from, date_to,
    ).prefetch_related("items")
    purchases = cash_purchases = _ZERO
    for po in po_qs:
        value = sum((i.quantity_received * i.unit_cost * (Decimal("1") + i.tax_percent / Decimal("100"))
                     for i in po.items.all()), _ZERO)
        if po.total_amount > 0 and po.paid_amount >= po.total_amount:
            cash_purchases += value
        else:
            purchases += value
    purchase_returns = _sum(_date_filter(
        PurchaseReturn.objects.filter(status=PurchaseReturn.Status.APPROVED), "created_at", date_from, date_to,
    ), "refund_amount")
    closing = get_stock_value_at(date_to) if include_closing_stock else _ZERO
    cogs_total = opening + purchases + cash_purchases - purchase_returns - closing
    gross_profit = net_sales - cogs_total

    # ── OTHER INCOMES (by category) ──
    oi_rows = (_date_filter(OtherIncome.objects.all(), "income_date", date_from, date_to, is_datetime=False)
               .values("category").annotate(t=Sum("amount")).order_by("category"))
    other_incomes = [((r["category"] or "").strip().upper() or "OTHER INCOME", r["t"] or _ZERO) for r in oi_rows]
    other_total = sum((a for _, a in other_incomes), _ZERO)

    # ── EXPENSES (approved, by category) ──
    ex_rows = (_date_filter(Expense.objects.filter(status=Expense.Status.APPROVED), "expense_date", date_from, date_to, is_datetime=False)
               .values("category_id", "category__name").annotate(t=Sum("amount")).order_by("category_id"))
    expenses = [(r["category_id"], (r["category__name"] or "").upper(), r["t"] or _ZERO) for r in ex_rows]
    expenses_total = sum((a for _, _, a in expenses), _ZERO)

    net_profit = gross_profit + other_total - expenses_total

    # ── display rows ──
    base = sales_total

    def pct(a):
        return f"{(a / base * 100):.2f}" if base else ""

    def money(a):
        return f"{_q(a):,.2f}"

    rows = []

    def heading(text, underline=False):
        rows.append({"kind": "heading_u" if underline else "heading", "code": "", "description": text,
                     "amount": "", "percent": "", "_bold": True})

    def line(code, text, amount):
        rows.append({"kind": "line", "code": code, "description": text, "amount": money(amount),
                     "percent": pct(amount), "_bold": False})

    def subtotal(amount):
        rows.append({"kind": "subtotal", "code": "", "description": "", "amount": money(amount),
                     "percent": pct(amount), "_bold": False})

    def total(text, amount):
        rows.append({"kind": "total", "code": "", "description": text, "amount": money(amount),
                     "percent": pct(amount), "_bold": True})

    def spacer():
        rows.append({"kind": "spacer", "code": "", "description": "", "amount": "", "percent": "", "_bold": False})

    heading("SALES")
    line("500-0000", "SALES", credit_sales)
    line("500-1000", "CASH SALES", cash_sales)
    subtotal(sales_total)
    spacer()
    heading("SALES ADJUSTMENTS", underline=True)
    line("510-0000", "SALES RETURN", sales_returns)
    subtotal(sales_returns)
    spacer()
    total("NET SALES", net_sales)
    spacer()
    heading("COST OF GOODS SOLD")
    line("600-0000", "STOCK-OPENING", opening)
    line("610-0000", "PURCHASES", purchases)
    line("610-1000", "CASH PURCHASE", cash_purchases)
    line("612-0000", "PURCHASES RETURN", -purchase_returns)
    if include_closing_stock:
        line("620-0000", "STOCK-CLOSING", -closing)
    subtotal(cogs_total)
    spacer()
    total("GROSS PROFIT/(LOSS)", gross_profit)
    spacer()
    heading("OTHER INCOMES", underline=True)
    for i, (name, amt) in enumerate(other_incomes):
        line(f"555-{i * 1000:04d}", name, amt)
    subtotal(other_total)
    spacer()
    heading("EXPENSES")
    for cat_id, name, amt in expenses:
        line(f"{900 + cat_id}-0000", name, amt)
    subtotal(expenses_total)
    spacer()
    total("NET PROFIT/(LOSS)", net_profit)

    return {
        "rows": rows,
        "sales_total": sales_total, "sales_returns": sales_returns, "net_sales": net_sales,
        "stock_opening": opening, "stock_closing": closing, "cogs_total": cogs_total,
        "gross_profit": gross_profit, "other_incomes_total": other_total,
        "expenses_total": expenses_total, "net_profit": net_profit,
        "includes_closing_stock": include_closing_stock,
    }