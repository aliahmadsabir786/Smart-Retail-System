from rest_framework import viewsets, filters, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend

from apps.core.permissions import IsInventoryManagerOrAbove
from apps.products.models import Product, ProductVariant
from apps.warehouse.models import Warehouse
from . import services
from .models import StockItem, StockTransaction, StockTransfer
from .serializers import (
    StockItemSerializer, StockTransactionSerializer, StockTransferSerializer,
    StockInSerializer, StockOutSerializer, StockAdjustSerializer,
)


class StockItemViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Read-only: current stock balances. Mutations happen exclusively via the actions below."""
    queryset = StockItem.objects.select_related("product", "warehouse", "variant")
    serializer_class = StockItemSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["warehouse", "product"]
    search_fields = ["product__name", "product__sku", "warehouse__name"]
    ordering_fields = ["quantity", "updated_at"]

    @action(detail=False, methods=["get"], url_path="low-stock")
    def low_stock(self, request):
        items = [i for i in self.get_queryset() if i.is_low_stock]
        serializer = self.get_serializer(items, many=True)
        return Response({"success": True, "count": len(items), "results": serializer.data})

    @action(detail=False, methods=["get"], url_path="out-of-stock")
    def out_of_stock(self, request):
        items = self.get_queryset().filter(quantity__lte=0)
        serializer = self.get_serializer(items, many=True)
        return Response({"success": True, "count": items.count(), "results": serializer.data})


class StockTransactionViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Read-only stock ledger — the audit trail of every stock movement."""
    queryset = StockTransaction.objects.select_related("product", "warehouse", "created_by")
    serializer_class = StockTransactionSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["product", "warehouse", "transaction_type"]
    ordering_fields = ["created_at"]
    permission_classes = [IsInventoryManagerOrAbove]


class StockOperationsView(APIView):
    """
    POST /inventory/stock-in/, /inventory/stock-out/, /inventory/adjust/
    Thin API wrapper around apps.inventory.services — keeps stock mutation
    logic centralized and atomic.
    """
    permission_classes = [IsInventoryManagerOrAbove]
    operation = None  # set by subclass
    serializer_class = None

    def _resolve(self, serializer):
        product = Product.objects.get(pk=serializer.validated_data["product"])
        warehouse = Warehouse.objects.get(pk=serializer.validated_data["warehouse"])
        variant_id = serializer.validated_data.get("variant")
        variant = ProductVariant.objects.get(pk=variant_id) if variant_id else None
        return product, warehouse, variant

    def post(self, request):
        serializer = self.serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        product, warehouse, variant = self._resolve(serializer)

        if self.operation == "in":
            txn = services.stock_in(
                product, warehouse, serializer.validated_data["quantity"], variant=variant,
                reference=serializer.validated_data["reference"], notes=serializer.validated_data["notes"],
                user=request.user,
            )
        elif self.operation == "out":
            txn = services.stock_out(
                product, warehouse, serializer.validated_data["quantity"], variant=variant,
                reference=serializer.validated_data["reference"], notes=serializer.validated_data["notes"],
                user=request.user,
            )
        else:  # adjust
            txn = services.adjust_stock(
                product, warehouse, serializer.validated_data["new_quantity"], variant=variant,
                reference=serializer.validated_data["reference"], notes=serializer.validated_data["notes"],
                user=request.user,
            )

        if txn is None:
            return Response({"success": True, "message": "No change — quantity already matches."})

        return Response(
            {"success": True, "transaction": StockTransactionSerializer(txn).data},
            status=status.HTTP_201_CREATED,
        )


class StockInView(StockOperationsView):
    operation = "in"
    serializer_class = StockInSerializer


class StockOutView(StockOperationsView):
    operation = "out"
    serializer_class = StockOutSerializer


class StockAdjustView(StockOperationsView):
    operation = "adjust"
    serializer_class = StockAdjustSerializer


class StockTransferViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                            mixins.CreateModelMixin, viewsets.GenericViewSet):
    """
    Creating a transfer immediately executes it atomically (stock_out at source +
    stock_in at destination) via apps.inventory.services.transfer_stock.
    """
    queryset = StockTransfer.objects.select_related("product", "from_warehouse", "to_warehouse")
    serializer_class = StockTransferSerializer
    permission_classes = [IsInventoryManagerOrAbove]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["status", "from_warehouse", "to_warehouse", "product"]
    ordering_fields = ["created_at"]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data
        transfer = services.transfer_stock(
            product=v["product"], from_warehouse=v["from_warehouse"], to_warehouse=v["to_warehouse"],
            quantity=v["quantity"], variant=v.get("variant"), notes=v.get("notes", ""), user=request.user,
        )
        return Response(StockTransferSerializer(transfer).data, status=status.HTTP_201_CREATED)
