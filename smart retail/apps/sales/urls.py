from rest_framework.routers import DefaultRouter
from .views import SaleViewSet, CouponViewSet, SaleReturnViewSet

app_name = "sales"

router = DefaultRouter()
router.register("coupons", CouponViewSet, basename="coupon")
router.register("returns", SaleReturnViewSet, basename="sale-return")
router.register("", SaleViewSet, basename="sale")

urlpatterns = router.urls
