from rest_framework.routers import DefaultRouter
from .views import ProductViewSet, ProductVariantViewSet

app_name = "products"

router = DefaultRouter()
router.register("variants", ProductVariantViewSet, basename="product-variant")
router.register("", ProductViewSet, basename="product")

urlpatterns = router.urls
