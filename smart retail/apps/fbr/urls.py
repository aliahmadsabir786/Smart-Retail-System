from django.urls import path

from . import views

app_name = "fbr"

urlpatterns = [
    path("config/", views.FBRSettingsView.as_view(), name="config"),
    path("enabled/", views.FBRFeatureStatusView.as_view(), name="enabled"),
    path("test-connection/", views.FBRTestConnectionView.as_view(), name="test-connection"),
    path("reference/<str:name>/", views.FBRReferenceView.as_view(), name="reference"),
    path("products/", views.FBRProductProfileListView.as_view(), name="product-profile-list"),
    path("products/<int:pk>/profile/", views.ProductFBRProfileView.as_view(), name="product-profile"),
    path("customers/<int:pk>/profile/", views.CustomerFBRProfileView.as_view(), name="customer-profile"),
    path("invoices/", views.FBRInvoiceListView.as_view(), name="invoice-list"),
    path("invoices/<int:sale_id>/status/", views.FBRInvoiceStatusView.as_view(), name="invoice-status"),
    path("invoices/<int:sale_id>/submit/", views.FBRInvoiceSubmitView.as_view(), name="invoice-submit"),
    path("invoices/<int:sale_id>/retry/", views.FBRInvoiceRetryView.as_view(), name="invoice-retry"),
    path("invoices/<int:sale_id>/validate/", views.FBRInvoiceValidateView.as_view(), name="invoice-validate"),
]
