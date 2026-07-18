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
    """
    permission_classes = [IsManagerOrAbove]
    report_slug = "report"

    def get_data(self, request):
        raise NotImplementedError

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        rows, columns, title = self.get_data(request)
        file_response = export_response(request, rows, columns, self.report_slug, title=title)
        if file_response is not None:
            return file_response
        return Response({"success": True, "count": len(rows), "results": rows})


class _DateRangeReportView(BaseReportView):
    def _date_range(self, request):
        q = DateRangeQuerySerializer(data=request.query_params)
        q.is_valid(raise_exception=True)
        return q.validated_data.get("date_from"), q.validated_data.get("date_to")


class SalesReportView(_DateRangeReportView):
    report_slug = "sales_report"

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
