from decimal import Decimal, InvalidOperation

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import serializers
from drf_spectacular.utils import extend_schema
from drf_spectacular.types import OpenApiTypes

from apps.core.permissions import IsManagerOrAbove
from . import services
from .utils.export import export_response


class DateRangeQuerySerializer(serializers.Serializer):
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)


class BaseReportView(APIView):
    """
    Shared plumbing for every report endpoint:
      GET ?export= unset (default) -> {"success": True, "count": N, "results": [...]}
      GET ?export=csv|excel|pdf    -> file download
    Subclasses implement get_data(request) -> (rows, columns, title).

    Subclasses that set `total_columns` get an extra "TOTAL" row appended
    after the real data rows (on screen, in CSV/Excel/PDF exports, and on
    the printed A4 report) — the same way a sale slip/invoice ends with a
    Total line. `count` in the JSON response always reflects the number
    of real records, never counting that extra summary row.
    """
    permission_classes = [IsManagerOrAbove]
    report_slug = "report"
    total_columns = None  # e.g. ["total_amount", "cost_of_sale", "profit"]
    total_label_column = None  # column that gets the "TOTAL" label; defaults to the first column
    total_integer_columns = ()  # subset of total_columns that are counts, not money — no decimals in the sum

    def get_data(self, request):
        raise NotImplementedError

    def _with_totals_row(self, rows, columns):
        if not rows or not self.total_columns:
            return rows

        sums = {key: Decimal("0") for key in self.total_columns}
        for row in rows:
            for key in self.total_columns:
                raw = row.get(key)
                if raw in (None, ""):
                    continue
                try:
                    sums[key] += Decimal(str(raw))
                except InvalidOperation:
                    continue

        totals_row = {key: "" for key, _ in columns}
        label_col = self.total_label_column or columns[0][0]
        totals_row[label_col] = "TOTAL"
        for key in self.total_columns:
            value = sums[key].to_integral_value() if key in self.total_integer_columns else sums[key].quantize(Decimal("0.01"))
            totals_row[key] = str(value)
        return rows + [totals_row]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        rows, columns, title = self.get_data(request)
        count = len(rows)
        display_rows = self._with_totals_row(rows, columns)
        file_response = export_response(request, display_rows, columns, self.report_slug, title=title)
        if file_response is not None:
            return file_response
        return Response({"success": True, "count": count, "results": display_rows})


class _DateRangeReportView(BaseReportView):
    def _date_range(self, request):
        q = DateRangeQuerySerializer(data=request.query_params)
        q.is_valid(raise_exception=True)
        return q.validated_data.get("date_from"), q.validated_data.get("date_to")


class SalesReportView(_DateRangeReportView):
    report_slug = "sales_report"
    total_columns = ["subtotal", "discount_amount", "tax_amount", "total_amount",
                      "cost_of_sale", "profit", "paid_amount"]
    total_label_column = "date"

    def get_data(self, request):
        date_from, date_to = self._date_range(request)
        rows, columns = services.sales_report(date_from, date_to)
        return rows, columns, "Sales Report"


class PurchaseReportView(_DateRangeReportView):
    report_slug = "purchase_report"

    def get_data(self, request):
        date_from, date_to = self._date_range(request)
        rows, columns = services.purchase_report(date_from, date_to)
        return rows, columns, "Purchase Report"


class InventoryReportView(BaseReportView):
    report_slug = "inventory_report"
    total_columns = ["quantity", "stock_value"]
    total_label_column = "product"
    total_integer_columns = ["quantity"]

    def get_data(self, request):
        rows, columns = services.inventory_report()
        return rows, columns, "Inventory Report"


class ProfitReportView(_DateRangeReportView):
    report_slug = "profit_report"

    def get_data(self, request):
        date_from, date_to = self._date_range(request)
        rows, columns = services.profit_report(date_from, date_to)
        return rows, columns, "Profit & Loss Report"


class CustomerReportView(BaseReportView):
    report_slug = "customer_report"

    def get_data(self, request):
        rows, columns = services.customer_report()
        return rows, columns, "Customer Report"


class SupplierReportView(BaseReportView):
    report_slug = "supplier_report"

    def get_data(self, request):
        rows, columns = services.supplier_report()
        return rows, columns, "Supplier Report"


class TaxReportView(_DateRangeReportView):
    report_slug = "tax_report"
    total_columns = ["subtotal", "tax_amount"]
    total_label_column = "date"

    def get_data(self, request):
        date_from, date_to = self._date_range(request)
        rows, columns = services.tax_report(date_from, date_to)
        return rows, columns, "Tax Report"


class ExpenseReportView(_DateRangeReportView):
    report_slug = "expense_report"

    def get_data(self, request):
        date_from, date_to = self._date_range(request)
        rows, columns = services.expense_report(date_from, date_to)
        return rows, columns, "Expense Report"