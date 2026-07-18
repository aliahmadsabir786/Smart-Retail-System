from rest_framework.routers import DefaultRouter
from .views import SupplierViewSet

app_name = "suppliers"

router = DefaultRouter()
router.register("", SupplierViewSet, basename="supplier")

urlpatterns = router.urls
