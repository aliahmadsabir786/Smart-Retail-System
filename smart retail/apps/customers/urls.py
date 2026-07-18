from rest_framework.routers import DefaultRouter
from .views import CustomerViewSet, CustomerGroupViewSet

app_name = "customers"

router = DefaultRouter()
router.register("groups", CustomerGroupViewSet, basename="customer-group")
router.register("", CustomerViewSet, basename="customer")

urlpatterns = router.urls
