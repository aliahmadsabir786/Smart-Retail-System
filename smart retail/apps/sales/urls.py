from rest_framework.routers import DefaultRouter
from .views import SaleViewSet, CouponViewSet, SaleReturnViewSet, PaymentViewSet

app_name = "sales"

router = DefaultRouter()
router.register("coupons", CouponViewSet, basename="coupon")
router.register("returns", SaleReturnViewSet, basename="sale-return")
# Must be registered before the empty-prefix SaleViewSet below — otherwise
# "/sales/payments/{id}/" would first try to match SaleViewSet's
# "/sales/{pk}/" detail route with pk="payments".
router.register("payments", PaymentViewSet, basename="payment")
router.register("", SaleViewSet, basename="sale")

urlpatterns = router.urls