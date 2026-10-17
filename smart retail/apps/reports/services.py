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


def inventory_report():
    columns = [
        ("sku", "SKU"), ("product", "Product"), ("warehouse", "Warehouse"),
        ("quantity", "Quantity"), ("reorder_level", "Reorder Level"), ("stock_value", "Stock Value"),
    ]
    rows = [
        {
            "sku": item.product.sku, "product": item.product.name, "warehouse": item.warehouse.name,
            "quantity": item.quantity, "reorder_level": item.product.reorder_level,
            "stock_value": str(item.quantity * item.product.cost_price),
        }
        for item in StockItem.objects.select_related("product", "warehouse")
    ]
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
    qs = _date_filter(Expense.objects.filter(status=Expense.Status.APPROVED), "expense_date", date_from, date_to, is_datetime=False)
    columns = [("date", "Date"), ("title", "Title"), ("category", "Category"), ("amount", "Amount")]
    rows = [
        {"date": e.expense_date.strftime("%Y-%m-%d"), "title": e.title, "category": e.category.name,
         "amount": str(e.amount)}
        for e in qs.select_related("category")
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