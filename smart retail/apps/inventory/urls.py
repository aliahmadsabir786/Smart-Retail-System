from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import (
    StockItemViewSet, StockTransactionViewSet, StockTransferViewSet,
    StockInView, StockOutView, StockAdjustView,
)

app_name = "inventory"

router = DefaultRouter()
router.register("stock-items", StockItemViewSet, basename="stock-item")
router.register("transactions", StockTransactionViewSet, basename="stock-transaction")
router.register("transfers", StockTransferViewSet, basename="stock-transfer")

urlpatterns = [
    path("stock-in/", StockInView.as_view(), name="stock-in"),
    path("stock-out/", StockOutView.as_view(), name="stock-out"),
    path("adjust/", StockAdjustView.as_view(), name="stock-adjust"),
] + router.urls
