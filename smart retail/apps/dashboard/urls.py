from django.urls import path
from .views import DashboardSummaryView, DashboardChartsView

app_name = "dashboard"

urlpatterns = [
    path("summary/", DashboardSummaryView.as_view(), name="summary"),
    path("charts/sales/", DashboardChartsView.as_view(), name="charts-sales"),
]
