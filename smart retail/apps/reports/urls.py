from django.urls import path
from . import views

app_name = "reports"

urlpatterns = [
    path("sales/", views.SalesReportView.as_view(), name="sales-report"),
    path("purchase/", views.PurchaseReportView.as_view(), name="purchase-report"),
    path("inventory/", views.InventoryReportView.as_view(), name="inventory-report"),
    path("profit/", views.ProfitReportView.as_view(), name="profit-report"),
    path("customers/", views.CustomerReportView.as_view(), name="customer-report"),
    path("suppliers/", views.SupplierReportView.as_view(), name="supplier-report"),
    path("tax/", views.TaxReportView.as_view(), name="tax-report"),
    path("expenses/", views.ExpenseReportView.as_view(), name="expense-report"),
]
