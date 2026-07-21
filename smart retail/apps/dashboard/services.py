from decimal import Decimal
from django.db.models import Sum, F, DecimalField
from django.db.models.functions import TruncDate
from django.utils import timezone
from datetime import timedelta

from apps.sales.models import Sale, SaleItem, SaleReturn
from apps.purchase.models import PurchaseOrder
from apps.inventory.models import StockItem
from apps.products.models import Product
from apps.customers.models import Customer
from apps.suppliers.models import Supplier
from apps.finance import services as finance_services


def _sales_total(qs):
    """
    Net revenue for a set of sales: total_amount minus any refunds recorded
    against those sales via SaleReturn. Only CANCELLED sales are excluded
    from the base sum — everything else stays in, but a return (full or
    partial) reduces the total by exactly what was refunded. This means a
    fully-returned sale nets to ~$0 automatically, and today's revenue drops
    the moment a return is processed today, without depending on
    Sale.total_amount being rewritten at return time.
    """
    qs = qs.exclude(status=Sale.Status.CANCELLED)
    gross = qs.aggregate(total=Sum("total_amount"))["total"] or Decimal("0")
    refunds = SaleReturn.objects.filter(sale__in=qs).aggregate(total=Sum("refund_amount"))["total"] or Decimal("0")
    return gross - refunds


def get_sales_summary():
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    today_qs = Sale.objects.filter(created_at__gte=today_start)

    return {
        "today_sales": _sales_total(today_qs),
        "weekly_sales": _sales_total(Sale.objects.filter(created_at__gte=week_start)),
        "monthly_sales": _sales_total(Sale.objects.filter(created_at__gte=month_start)),
        # Orders actually placed today — excludes cancelled and fully
        # returned sales (a return today should bring this back down),
        # but keeps partially-returned ones since those are still real
        # orders, just with part of the amount refunded.
        "today_orders_count": today_qs.exclude(
            status__in=[Sale.Status.CANCELLED, Sale.Status.RETURNED]
        ).count(),
    }


def get_inventory_value():
    """Sum of (current stock quantity * product cost_price) across all warehouses."""
    result = StockItem.objects.aggregate(
        value=Sum(F("quantity") * F("product__cost_price"), output_field=DecimalField(max_digits=16, decimal_places=2))
    )["value"]
    return result or Decimal("0")


def get_top_selling_products(limit=5, days=30):
    since = timezone.now() - timedelta(days=days)
    return list(
        SaleItem.objects.filter(created_at__gte=since)
        .exclude(sale__status=Sale.Status.CANCELLED)
        .values("product__id", "product__name", "product__sku")
        .annotate(total_quantity=Sum("quantity"))
        .order_by("-total_quantity")[:limit]
    )


def get_low_stock_items(limit=10):
    items = [i for i in StockItem.objects.select_related("product", "warehouse") if i.is_low_stock]
    items = items[:limit]
    return [
        {
            "product_id": i.product_id, "product_name": i.product.name, "sku": i.product.sku,
            "warehouse": i.warehouse.name, "quantity": i.quantity, "reorder_level": i.product.reorder_level,
        }
        for i in items
    ]


def get_out_of_stock_count():
    return StockItem.objects.filter(quantity__lte=0).count()


def get_dashboard_summary():
    sales_summary = get_sales_summary()
    pl = finance_services.get_profit_and_loss()

    return {
        **sales_summary,
        "revenue": pl["income"],
        "expenses": pl["expenses"],
        "profit": pl["net_profit"],
        "inventory_value": get_inventory_value(),
        "top_selling_products": get_top_selling_products(),
        "low_stock_items": get_low_stock_items(),
        "out_of_stock_count": get_out_of_stock_count(),
        "total_customers": Customer.objects.filter(is_active=True).count(),
        "total_suppliers": Supplier.objects.filter(is_active=True).count(),
        "purchase_orders_count": PurchaseOrder.objects.exclude(status=PurchaseOrder.Status.CANCELLED).count(),
        "sales_orders_count": Sale.objects.exclude(status=Sale.Status.CANCELLED).count(),
    }


def get_sales_chart_data(days=30):
    """Daily sales totals for the last N days — feeds a line/bar chart on the frontend."""
    now = timezone.now()
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)

    sales = (
        Sale.objects.filter(created_at__gte=start)
        .exclude(status=Sale.Status.CANCELLED)
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(total=Sum("total_amount"))
        .order_by("day")
    )
    return list(sales)