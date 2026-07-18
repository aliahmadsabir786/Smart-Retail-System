from rest_framework import viewsets, filters, status, mixins
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from apps.core.permissions import IsInventoryManagerOrAbove, IsManagerOrAbove
from apps.suppliers.models import Supplier
from apps.warehouse.models import Warehouse
from . import services
from .models import PurchaseOrder, PurchaseOrderItem
from .serializers import (
    PurchaseOrderSerializer, CreatePurchaseOrderSerializer,
    ReceiveStockSerializer, AddSupplierPaymentSerializer, SupplierPaymentSerializer,
)


class PurchaseOrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                            mixins.CreateModelMixin, viewsets.GenericViewSet):
    queryset = PurchaseOrder.objects.select_related("supplier", "warehouse").prefetch_related(
        "items", "payments"
    )
    permission_classes = [IsInventoryManagerOrAbove]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "supplier", "warehouse"]
    search_fields = ["po_number", "supplier__name"]
    ordering_fields = ["created_at", "total_amount"]

    def get_serializer_class(self):
        return CreatePurchaseOrderSerializer if self.action == "create" else PurchaseOrderSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        v = serializer.validated_data

        supplier = Supplier.objects.get(pk=v["supplier"])
        warehouse = Warehouse.objects.get(pk=v["warehouse"])

        po = services.create_purchase_order(
            supplier=supplier, warehouse=warehouse, items=v["items"], user=request.user,
            expected_date=v.get("expected_date"), notes=v.get("notes", ""),
        )
        return Response(PurchaseOrderSerializer(po).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="receive")
    def receive(self, request, pk=None):
        """POST /purchase-orders/{id}/receive/ — receive some or all pending quantities into stock."""
        po = self.get_object()
        serializer = ReceiveStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        received_items = []
        for entry in serializer.validated_data["items"]:
            po_item = PurchaseOrderItem.objects.get(pk=entry["purchase_order_item"], purchase_order=po)
            received_items.append({"purchase_order_item": po_item, "quantity": entry["quantity"]})

        po = services.receive_stock(po, received_items, user=request.user)
        return Response(PurchaseOrderSerializer(po).data)

    @action(detail=True, methods=["post"], url_path="pay", permission_classes=[IsManagerOrAbove])
    def pay(self, request, pk=None):
        """POST /purchase-orders/{id}/pay/ — record a payment to the supplier."""
        po = self.get_object()
        serializer = AddSupplierPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payment = services.add_supplier_payment(
            po, serializer.validated_data["amount"], serializer.validated_data["method"],
            user=request.user, reference=serializer.validated_data.get("reference", ""),
        )
        return Response(SupplierPaymentSerializer(payment).data, status=status.HTTP_201_CREATED)
