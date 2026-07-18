from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import OtherIncomeViewSet, ProfitLossView, CashFlowView

app_name = "finance"

router = DefaultRouter()
router.register("other-income", OtherIncomeViewSet, basename="other-income")

urlpatterns = [
    path("profit-loss/", ProfitLossView.as_view(), name="profit-loss"),
    path("cash-flow/", CashFlowView.as_view(), name="cash-flow"),
] + router.urls
