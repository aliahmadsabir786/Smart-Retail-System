from rest_framework.routers import DefaultRouter

from .views import (
    AttachmentViewSet, BankAccountViewSet, BankActivityViewSet, BankViewSet, DailyVerificationViewSet,
    PaymentContactViewSet,
)

app_name = "bankrecords"

router = DefaultRouter()
router.register("banks", BankViewSet, basename="bankrec-bank")
router.register("accounts", BankAccountViewSet, basename="bankrec-account")
router.register("contacts", PaymentContactViewSet, basename="bankrec-contact")
router.register("activities", BankActivityViewSet, basename="bankrec-activity")
router.register("attachments", AttachmentViewSet, basename="bankrec-attachment")
router.register("verifications", DailyVerificationViewSet, basename="bankrec-verification")

urlpatterns = router.urls
