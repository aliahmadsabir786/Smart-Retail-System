from decimal import Decimal
from django.db.models import Sum, F, DecimalField
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
    net_profit = gross_profit - expenses

    return {
        "income": income,
        "cost_of_goods_sold": cogs,
        "gross_profit": gross_profit,
        "expenses": expenses,
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