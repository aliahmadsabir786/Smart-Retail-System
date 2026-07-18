from rest_framework.views import APIView
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema
from drf_spectacular.types import OpenApiTypes

from apps.core.permissions import IsManagerOrAbove
from . import services


class DashboardSummaryView(APIView):
    """GET /dashboard/summary/ — today/week/month sales, revenue, profit, inventory
    value, top products, low/out-of-stock, customer/supplier/order counts."""
    permission_classes = [IsManagerOrAbove]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        return Response({"success": True, **services.get_dashboard_summary()})


class DashboardChartsView(APIView):
    """GET /dashboard/charts/sales/?days=30 — daily sales totals for charting."""
    permission_classes = [IsManagerOrAbove]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        days = int(request.query_params.get("days", 30))
        data = services.get_sales_chart_data(days=days)
        return Response({"success": True, "days": days, "series": data})
