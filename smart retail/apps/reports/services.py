from decimal import Decimal
from django.db.models import Sum, Count
from apps.sales.models import Sale, SaleItem
from apps.purchase.models import PurchaseOrder, PurchaseOrderItem
from apps.inventory.models import StockItem
from apps.customers.models import Customer
from apps.expenses.models import Expense


def _date_filter(qs, field, date_from, date_to, is_datetime=True):
    """
    Filters a queryset by a date range.

    `field` is a DateTimeField (created_at, etc.) by default — in that case we
    filter on `{field}__date` so "Date To" includes the WHOLE day. Without
    this, `created_at__lte=2026-07-20` compares against midnight
    (2026-07-20 00:00:00), silently excluding everything created later that
    same day — which made today's purchases/sales vanish from every report
    that defaults "Date To" to today. Pass is_datetime=False for plain
    DateField columns (e.g. Expense.expense_date), which don't support the
    `__date` lookup and don't need it.
    """
    lookup = f"{field}__date" if is_datetime else field
    if date_from:
        qs = qs.filter(**{f"{lookup}__gte": date_from})
    if date_to:
        qs = qs.filter(**{f"{lookup}__lte": date_to})
    return qs


def sales_report(date_from=None, date_to=None):
    """
    Row-per-sale Sales Report. Each row now also carries Cost of Sale
    (sum of product.cost_price * quantity across that sale's items) and
    Profit (Sale Amount - Cost of Sale). The view layer (see
    SalesReportView.total_columns) appends a final Total row over these
    same columns — Sale Amount, Cost of Sale, Profit, etc. — the same way
    a sale slip/invoice ends with a Total line, without inflating the
    reported record `count`.
    """
    qs = _date_filter(Sale.objects.exclude(status=Sale.Status.CANCELLED), "created_at", date_from, date_to)
    columns = [
        ("date", "Date"), ("invoice_number", "Invoice #"), ("customer", "Customer"), ("warehouse", "Warehouse"),
        ("subtotal", "Subtotal"), ("discount_amount", "Discount"), ("tax_amount", "Tax"),
        ("total_amount", "Sale Amount"), ("cost_of_sale", "Cost of Sale"), ("profit", "Profit"),
        ("paid_amount", "Paid"), ("status", "Status"),
    ]

    sales = qs.select_related("customer", "warehouse").prefetch_related("items__product")

    rows = []
    for s in sales:
        cost_of_sale = sum(
            (item.quantity * item.product.cost_price for item in s.items.all()),
            Decimal("0"),
        ).quantize(Decimal("0.01"))
        sale_amount = s.total_amount
        profit = (sale_amount - cost_of_sale).quantize(Decimal("0.01"))

        rows.append({
            "date": s.created_at.strftime("%Y-%m-%d"),
            "invoice_number": s.invoice_number,
            "customer": s.customer.name if s.customer else "Walk-in",
            "warehouse": s.warehouse.name,
            "subtotal": str(s.subtotal), "discount_amount": str(s.discount_amount),
            "tax_amount": str(s.tax_amount), "total_amount": str(sale_amount),
            "cost_of_sale": str(cost_of_sale), "profit": str(profit),
            "paid_amount": str(s.paid_amount), "status": s.status,
        })

    return rows, columns


def purchase_report(date_from=None, date_to=None):
    qs = _date_filter(PurchaseOrder.objects.exclude(status=PurchaseOrder.Status.CANCELLED),
                       "created_at", date_from, date_to)
    columns = [
        ("date", "Date"), ("po_number", "PO #"), ("supplier", "Supplier"), ("warehouse", "Warehouse"),
        ("total_amount", "Total"), ("paid_amount", "Paid"), ("status", "Status"),
    ]
    rows = [
        {
            "date": po.created_at.strftime("%Y-%m-%d"),
            "po_number": po.po_number, "supplier": po.supplier.name, "warehouse": po.warehouse.name,
            "total_amount": str(po.total_amount), "paid_amount": str(po.paid_amount),
            "status": po.status,
        }
        for po in qs.select_related("supplier", "warehouse")
    ]
    return rows, columns


def inventory_report(date_from=None, date_to=None):
    """
    Stock Report built from the append-only stock ledger (StockTransaction),
    one row per product / variant / warehouse:

        Opening + Purchased - Sold + Adjustments = Remaining
        Remaining x Cost Price                   = Stock Value (remaining cost)

    * Opening    - quantity on hand at the START of date_from (0-movement rows
                   before the first ledger entry show 0).
    * Purchased  - stock received in the range: purchases, manual stock-in,
                   transfers in.
    * Sold       - NET sales in the range (sales minus sale returns, so an
                   edited / voided / returned invoice never inflates it).
    * Adjustments- everything else, signed: stock-count adjustments (+/-),
                   returns to supplier, manual stock-out, transfers out.
    * Remaining  - quantity on hand at the END of date_to (today if blank).
    * Ledger Check - compares the live StockItem quantity with the sum of the
                   ledger. "OK" means every unit is explained by a recorded
                   movement; "MISMATCH (+N)" means the stock was changed
                   outside the ledger (e.g. edited directly in the admin /
                   database), so the figures for that row should not be trusted.

    Cost uses Product.cost_price (last purchase cost) for every unit - it is
    not FIFO / weighted-average.
    """
    from collections import defaultdict
    from apps.inventory.models import StockTransaction
    from apps.products.models import Product, ProductVariant
    from apps.warehouse.models import Warehouse

    T = StockTransaction.TransactionType
    plus = {T.STOCK_IN, T.ADJUSTMENT_INCREASE, T.TRANSFER_IN, T.SALE_RETURN, T.PURCHASE}
    signed = lambda t, q: q if t in plus else -q  # noqa: E731 - every other type reduces stock
    received_types = (T.PURCHASE, T.STOCK_IN, T.TRANSFER_IN)

    def by_key(qs):
        out = defaultdict(lambda: defaultdict(int))
        for r in qs.values("product_id", "variant_id", "warehouse_id", "transaction_type").annotate(q=Sum("quantity")):
            out[(r["product_id"], r["variant_id"], r["warehouse_id"])][r["transaction_type"]] += int(r["q"] or 0)
        return out

    def net(types):
        return sum(signed(t, q) for t, q in types.items())

    ledger = StockTransaction.objects.all()
    all_moves = by_key(ledger)
    period = by_key(_date_filter(ledger, "created_at", date_from, date_to))
    after = by_key(ledger.filter(created_at__date__gt=date_to)) if date_to else {}
    current = {(r["product_id"], r["variant_id"], r["warehouse_id"]): r["quantity"]
               for r in StockItem.objects.values("product_id", "variant_id", "warehouse_id", "quantity")}

    keys = set(current) | set(period)
    products = Product.objects.in_bulk({k[0] for k in keys})
    warehouses = Warehouse.objects.in_bulk({k[2] for k in keys})
    variants = ProductVariant.objects.in_bulk({k[1] for k in keys if k[1]})

    columns = [
        ("sku", "SKU"), ("product", "Product"), ("warehouse", "Warehouse"),
        ("opening", "Opening Stock"), ("purchased", "Purchased / In"), ("sold", "Sold (Net)"),
        ("adjustments", "Adjustments / Out"), ("remaining", "Remaining Stock"),
        ("cost_price", "Cost Price"), ("stock_value", "Remaining Cost"), ("ledger_check", "Ledger Check"),
    ]
    rows = []
    for key in keys:
        pid, vid, wid = key
        product = products.get(pid)
        if product is None:
            continue
        moves = period.get(key, {})
        purchased = sum(moves.get(t, 0) for t in received_types)
        sold = moves.get(T.SALE, 0) - moves.get(T.SALE_RETURN, 0)
        adjustments = (moves.get(T.ADJUSTMENT_INCREASE, 0) - moves.get(T.ADJUSTMENT_DECREASE, 0)
                       - moves.get(T.PURCHASE_RETURN, 0) - moves.get(T.STOCK_OUT, 0)
                       - moves.get(T.TRANSFER_OUT, 0))
        remaining = current.get(key, 0) - net(after.get(key, {}))
        opening = remaining - (purchased - sold + adjustments)
        if not any((opening, purchased, sold, adjustments, remaining)):
            continue

        diff = current.get(key, 0) - net(all_moves.get(key, {}))
        variant = variants.get(vid)
        name = product.name + (f" ({' / '.join(x for x in (variant.color, variant.size) if x) or variant.sku})" if variant else "")
        cost = product.cost_price
        rows.append({
            "sku": variant.sku if variant else product.sku, "product": name,
            "warehouse": warehouses[wid].name if wid in warehouses else "",
            "opening": opening, "purchased": purchased, "sold": sold, "adjustments": adjustments,
            "remaining": remaining, "cost_price": str(cost),
            "stock_value": str((Decimal(remaining) * cost).quantize(Decimal("0.01"))),
            "ledger_check": "OK" if diff == 0 else f"MISMATCH ({diff:+d})",
        })
    rows.sort(key=lambda r: (r["product"].lower(), r["warehouse"]))
    return rows, columns


def customer_report():
    columns = [
        ("name", "Customer"), ("phone", "Phone"), ("total_orders", "Total Orders"),
        ("total_spent", "Total Spent"), ("outstanding_balance", "Outstanding"), ("loyalty_points", "Loyalty Points"),
    ]
    customers = Customer.objects.annotate(
        total_orders=Count("sales", distinct=True),
        total_spent=Sum("sales__total_amount"),
    )
    rows = [
        {
            "name": c.name, "phone": c.phone, "total_orders": c.total_orders,
            "total_spent": str(c.total_spent or 0), "outstanding_balance": str(c.outstanding_balance),
            "loyalty_points": c.loyalty_points,
        }
        for c in customers
    ]
    return rows, columns


def supplier_report(date_from=None, date_to=None):
    """
    Row-per-product Supplier Report: every purchase-order line item, with the
    date it was ordered and which supplier it came from — so you can see
    exactly what was bought from each supplier and when, the same way the
    Sales Report is row-per-invoice rather than one aggregate line per
    customer.
    """
    qs = _date_filter(
        PurchaseOrderItem.objects.exclude(purchase_order__status=PurchaseOrder.Status.CANCELLED)
                                  .select_related("purchase_order__supplier", "purchase_order__warehouse", "product"),
        "purchase_order__created_at", date_from, date_to,
    )
    columns = [
        ("date", "Date"), ("po_number", "PO #"), ("supplier", "Supplier"), ("product", "Product"),
        ("quantity", "Quantity"), ("unit_cost", "Unit Cost"), ("amount", "Amount"),
    ]
    rows = []
    for item in qs.order_by("purchase_order__created_at"):
        po = item.purchase_order
        quantity = item.quantity_received or item.quantity_ordered
        amount = (quantity * item.unit_cost).quantize(Decimal("0.01"))
        rows.append({
            "date": po.created_at.strftime("%Y-%m-%d"),
            "po_number": po.po_number,
            "supplier": po.supplier.name,
            "product": item.product.name,
            "quantity": quantity,
            "unit_cost": str(item.unit_cost),
            "amount": str(amount),
        })
    return rows, columns


def tax_report(date_from=None, date_to=None):
    qs = _date_filter(Sale.objects.exclude(status=Sale.Status.CANCELLED), "created_at", date_from, date_to)
    columns = [("date", "Date"), ("invoice_number", "Invoice #"), ("subtotal", "Subtotal"), ("tax_amount", "Tax Collected")]
    rows = [
        {"date": s.created_at.strftime("%Y-%m-%d"), "invoice_number": s.invoice_number,
         "subtotal": str(s.subtotal), "tax_amount": str(s.tax_amount)}
        for s in qs
    ]
    return rows, columns


def expense_report(date_from=None, date_to=None):
    """
    Category-wise Expense Report. Every approved expense in the date range is
    summed per category (all dates combined), so the report reads e.g.
    Other = 5,000 / Transport = 2,500 / Marketing = 1,200 instead of listing
    each expense separately. The view appends a grand TOTAL row.
    """
    qs = _date_filter(Expense.objects.filter(status=Expense.Status.APPROVED), "expense_date", date_from, date_to, is_datetime=False)
    columns = [("category", "Category"), ("entries", "No. of Expenses"), ("amount", "Total Amount")]
    grouped = (
        qs.values("category__name")
        .annotate(total=Sum("amount"), entries=Count("id"))
        .order_by("category__name")
    )
    rows = [
        {"category": g["category__name"], "entries": str(g["entries"]),
         "amount": str((g["total"] or Decimal("0")).quantize(Decimal("0.01")))}
        for g in grouped
    ]
    return rows, columns


def _profit_amount_label(date_from, date_to):
    """Column header for the amount column: 'This Year' when the range is the
    current calendar year (Jan 1 onwards), otherwise a neutral 'Amount'."""
    from datetime import date
    today = date.today()
    if date_from and date_from.month == 1 and date_from.day == 1 and date_from.year == today.year \
            and (not date_to or date_to.year == today.year):
        return "This Year"
    return "Amount"


def profit_report(date_from=None, date_to=None, include_closing_stock=True):
    """
    Profit & Loss STATEMENT in the standard trading-account layout (Sales,
    Sales Adjustments, Net Sales, Cost of Goods Sold, Gross Profit, Other
    Incomes, Expenses, Net Profit) with an amount column and a % column
    (each line as a % of total Sales). Every figure comes from the POS data.
    Row dicts also carry `kind` / `_bold` so the screen, A4 print and the
    Excel/PDF exports can style headings, sub-totals and totals.
    """
    from apps.finance import services as finance_services
    stmt = finance_services.get_profit_loss_statement(date_from, date_to, include_closing_stock)
    columns = [
        ("code", "Code"), ("description", "Description"),
        ("amount", _profit_amount_label(date_from, date_to)), ("percent", "%"),
    ]
    return stmt["rows"], columns