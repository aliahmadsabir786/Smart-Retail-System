from django.http import HttpResponse
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django_filters.rest_framework import DjangoFilterBackend
from drf_spectacular.utils import extend_schema

from apps.core.permissions import IsInventoryManagerOrAbove
from .models import Product, ProductImage, ProductVariant
from .serializers import (
    ProductListSerializer, ProductDetailSerializer,
    ProductImageSerializer, ProductVariantSerializer,
)
from .utils.barcode_utils import generate_barcode_image, generate_qr_code_image


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related("category", "brand").prefetch_related("images", "variants")
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status", "category", "brand", "unit"]
    search_fields = ["sku", "barcode", "name", "description"]
    ordering_fields = ["name", "selling_price", "created_at", "reorder_level"]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_serializer_class(self):
        return ProductListSerializer if self.action == "list" else ProductDetailSerializer

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsInventoryManagerOrAbove()]
        return super().get_permissions()

    @action(detail=False, methods=["get"])
    def low_stock(self, request):
        """GET /products/low_stock/ — products whose total stock is at/below reorder_level."""
        from apps.inventory.models import StockItem
        from django.db.models import Sum

        # Compared per-product against its own reorder_level in Python (fine for typical
        # catalog sizes); for very large catalogs this would move to a DB-level annotation.
        products = self.get_queryset()
        result = []
        for p in products:
            total = StockItem.objects.filter(product=p).aggregate(total=Sum("quantity"))["total"] or 0
            if total <= p.reorder_level:
                data = ProductListSerializer(p, context={"request": request}).data
                data["current_stock"] = total
                result.append(data)
        return Response({"success": True, "count": len(result), "results": result})

    @action(detail=True, methods=["get"], url_path="barcode-image")
    @extend_schema(responses={200: {"content": {"image/png": {}}}})
    def barcode_image(self, request, pk=None):
        """GET /products/{id}/barcode-image/ — returns a PNG barcode for this product."""
        product = self.get_object()
        png_bytes = generate_barcode_image(product.barcode)
        return HttpResponse(png_bytes, content_type="image/png")

    @action(detail=True, methods=["get"], url_path="qr-image")
    def qr_image(self, request, pk=None):
        """GET /products/{id}/qr-image/ — returns a PNG QR code encoding SKU+barcode."""
        product = self.get_object()
        png_bytes = generate_qr_code_image(f"SKU:{product.sku}|BARCODE:{product.barcode}")
        return HttpResponse(png_bytes, content_type="image/png")

    @action(detail=True, methods=["post"], url_path="images", parser_classes=[MultiPartParser, FormParser])
    def upload_image(self, request, pk=None):
        """POST /products/{id}/images/ — attach an image to this product."""
        product = self.get_object()
        serializer = ProductImageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(product=product)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ProductVariantViewSet(viewsets.ModelViewSet):
    queryset = ProductVariant.objects.select_related("product")
    serializer_class = ProductVariantSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ["product", "is_active", "color", "size"]
    search_fields = ["sku", "barcode", "color", "size"]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [IsInventoryManagerOrAbove()]
        return super().get_permissions()
