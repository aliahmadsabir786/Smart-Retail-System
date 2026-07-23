from django.urls import path
from .views import CompanySettingsView, ClearProductsView, ClearSaleSlipsView, ClearCustomersView

app_name = "settings"

urlpatterns = [
    path("company/", CompanySettingsView.as_view(), name="company-settings"),
    path("clear-products/", ClearProductsView.as_view(), name="clear-products"),
    path("clear-sale-slips/", ClearSaleSlipsView.as_view(), name="clear-sale-slips"),
    path("clear-customers/", ClearCustomersView.as_view(), name="clear-customers"),
]