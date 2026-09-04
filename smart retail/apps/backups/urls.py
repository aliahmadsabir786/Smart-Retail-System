from rest_framework.routers import DefaultRouter
from .views import BackupViewSet

app_name = "backups"

router = DefaultRouter()
router.register("", BackupViewSet, basename="backup")

urlpatterns = router.urls
