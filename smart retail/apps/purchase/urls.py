from rest_framework.routers import DefaultRouter
from .views import PurchaseOrderViewSet, PurchaseReturnViewSet

app_name = "purchase"

router = DefaultRouter()
router.register("returns", PurchaseReturnViewSet, basename="purchase-return")
router.register("", PurchaseOrderViewSet, basename="purchase-order")

urlpatterns = router.urls
