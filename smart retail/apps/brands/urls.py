from rest_framework.routers import DefaultRouter
from .views import BrandViewSet

app_name = "brands"

router = DefaultRouter()
router.register("", BrandViewSet, basename="brand")

urlpatterns = router.urls
