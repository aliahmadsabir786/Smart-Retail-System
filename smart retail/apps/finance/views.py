from rest_framework import viewsets, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema
from drf_spectacular.types import OpenApiTypes

from apps.core.permissions import IsManagerOrAbove
from . import services
from .models import OtherIncome
from .serializers import OtherIncomeSerializer, DateRangeQuerySerializer


class OtherIncomeViewSet(viewsets.ModelViewSet):
    queryset = OtherIncome.objects.all()
    serializer_class = OtherIncomeSerializer
    permission_classes = [IsManagerOrAbove]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    ordering_fields = ["income_date", "amount"]


class ProfitLossView(APIView):
    """GET /finance/profit-loss/?date_from=&date_to= — income, COGS, gross/net profit."""
    permission_classes = [IsManagerOrAbove]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        q = DateRangeQuerySerializer(data=request.query_params)
        q.is_valid(raise_exception=True)
        data = services.get_profit_and_loss(q.validated_data.get("date_from"), q.validated_data.get("date_to"))
        return Response({"success": True, **data})


class CashFlowView(APIView):
    """GET /finance/cash-flow/?date_from=&date_to= — actual cash in/out for the period."""
    permission_classes = [IsManagerOrAbove]

    @extend_schema(responses={200: OpenApiTypes.OBJECT})
    def get(self, request):
        q = DateRangeQuerySerializer(data=request.query_params)
        q.is_valid(raise_exception=True)
        data = services.get_cash_flow(q.validated_data.get("date_from"), q.validated_data.get("date_to"))
        return Response({"success": True, **data})
