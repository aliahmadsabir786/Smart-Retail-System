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
    qs = _date_filter(Sale.objects.exclude(status=Sale.Status.CANCELLED), "created_at", date_from, date_to)
    columns = [
        ("date", "Date"), ("invoice_number", "Invoice #"), ("customer", "Customer"), ("warehouse", "Warehouse"),
        ("subtotal", "Subtotal"), ("discount_amount", "Discount"), ("tax_amount", "Tax"),
        ("total_amount", "Total"), ("paid_amount", "Paid"), ("status", "Status"),
    ]
    rows = [
        {
            "date": s.created_at.strftime("%Y-%m-%d"),
            "invoice_number": s.invoice_number,
            "customer": s.customer.name if s.customer else "Walk-in",
            "warehouse": s.warehouse.name,
            "subtotal": str(s.subtotal), "discount_amount": str(s.discount_amount),
            "tax_amount": str(s.tax_amount), "total_amount": str(s.total_amount),
            "paid_amount": str(s.paid_amount), "status": s.status,
        }
        for s in qs.select_related("customer", "warehouse")
    ]
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
    from apps.finance import services as finance_services
    pl = finance_services.get_profit_and_loss(date_from, date_to)
    columns = [("metric", "Metric"), ("value", "Value")]
    rows = [{"metric": k.replace("_", " ").title(), "value": str(v)} for k, v in pl.items()]
    return rows, columns