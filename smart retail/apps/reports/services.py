from decimal import Decimal
from django.db.models import Sum, Count
from apps.sales.models import Sale, SaleItem
from apps.purchase.models import PurchaseOrder
from apps.inventory.models import StockItem
from apps.customers.models import Customer
from apps.suppliers.models import Supplier
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


def supplier_report():
    columns = [
        ("name", "Supplier"), ("phone", "Phone"), ("total_orders", "Total POs"),
        ("total_purchased", "Total Purchased"), ("outstanding_payable", "Outstanding Payable"),
    ]
    suppliers = Supplier.objects.annotate(
        total_orders=Count("purchase_orders", distinct=True),
        total_purchased=Sum("purchase_orders__total_amount"),
    )
    rows = [
        {
            "name": s.name, "phone": s.phone, "total_orders": s.total_orders,
            "total_purchased": str(s.total_purchased or 0), "outstanding_payable": str(s.outstanding_payable),
        }
        for s in suppliers
    ]
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


def profit_report(date_from=None, date_to=None):
    """
    Row-per-line P&L statement for the Reports table/print/export: Total
    Income, then Expenses broken out as individual line items (name,
    category, date, amount) followed by their total — same layout as a
    standard P&L statement — then Cost of Goods Sold and Net Profit/(Loss).
    """
    from apps.finance import services as finance_services
    pl = finance_services.get_profit_and_loss(date_from, date_to)
    columns = [("description", "Description"), ("date", "Date"), ("amount", "Amount")]

    rows = [{"description": "Total Income", "date": "", "amount": str(pl["income"])}]
    rows.append({"description": "", "date": "", "amount": ""})
    rows.append({"description": "Expenses", "date": "", "amount": ""})
    for item in pl["expense_items"]:
        label = f"{item['title']} ({item['category']})" if item["category"] else item["title"]
        rows.append({"description": label, "date": item["date"], "amount": str(item["amount"])})
    rows.append({"description": "Total Expenses", "date": "", "amount": str(pl["expenses"])})
    rows.append({"description": "", "date": "", "amount": ""})
    rows.append({"description": "Cost of Goods Sold", "date": "", "amount": str(pl["cost_of_goods_sold"])})
    rows.append({"description": "Gross Profit", "date": "", "amount": str(pl["gross_profit"])})
    rows.append({
        "description": "Net Profit" if pl["is_profit"] else "Net Loss",
        "date": "", "amount": str(pl["net_profit"]),
    })

    return rows, columns