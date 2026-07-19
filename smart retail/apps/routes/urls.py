from rest_framework.routers import DefaultRouter
from .views import SupplyRouteViewSet

app_name = "routes"

router = DefaultRouter()
router.register("", SupplyRouteViewSet, basename="supply-route")

urlpatterns = router.urls
