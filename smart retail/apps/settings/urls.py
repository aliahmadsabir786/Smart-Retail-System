from django.urls import path
from .views import (
    CompanySettingsView, PublicCompanyBrandingView,
    ClearProductsView, ClearSaleSlipsView, ClearCustomersView,
)

app_name = "settings"

urlpatterns = [
    # Must be registered before "company/" so Django's path matching doesn't
    # need this route to double as a sub-path of it — kept separate and
    # explicit since this one is intentionally unauthenticated.
    path("company/public/", PublicCompanyBrandingView.as_view(), name="company-branding-public"),
    path("company/", CompanySettingsView.as_view(), name="company-settings"),
    path("clear-products/", ClearProductsView.as_view(), name="clear-products"),
    path("clear-sale-slips/", ClearSaleSlipsView.as_view(), name="clear-sale-slips"),
    path("clear-customers/", ClearCustomersView.as_view(), name="clear-customers"),
]