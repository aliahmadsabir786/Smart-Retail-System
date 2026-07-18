from django.urls import path
from .views import CompanySettingsView

app_name = "settings"

urlpatterns = [
    path("company/", CompanySettingsView.as_view(), name="company-settings"),
]
