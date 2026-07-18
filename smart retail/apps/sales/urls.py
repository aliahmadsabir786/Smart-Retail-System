from rest_framework.routers import DefaultRouter
from .views import SaleViewSet, CouponViewSet

app_name = "sales"

router = DefaultRouter()
router.register("coupons", CouponViewSet, basename="coupon")
router.register("", SaleViewSet, basename="sale")

urlpatterns = router.urls
