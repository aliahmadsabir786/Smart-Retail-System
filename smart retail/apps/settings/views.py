from django.db import connection, transaction
from django.db.models.deletion import ProtectedError
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from apps.core.permissions import IsAdminOrAbove, IsSuperAdmin
from .models import CompanySettings
from .serializers import CompanySettingsSerializer


class CompanySettingsView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /settings/company/ — single company-wide settings object (singleton)."""
    serializer_class = CompanySettingsSerializer
    permission_classes = [IsAdminOrAbove]

    def get_object(self):
        return CompanySettings.load()


def _require_confirmation(request):
    """Shared guard for every danger-zone action below: the frontend makes the
    user type the word DELETE before the request is even sent, and this checks
    it server-side too so the endpoint can't be triggered by a bare POST."""
    if (request.data.get("confirm") or "").strip().upper() != "DELETE":
        return Response(
            {"detail": "Type DELETE to confirm. This action is permanent."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


def _reset_auto_increment(*models):
    """
    Reset each table's auto-increment counter (MySQL) / sequence (PostgreSQL)
    / sqlite_sequence row (SQLite) back to 1.

    Without this, deleting every row still leaves the counter at its old
    high-water mark (e.g. deleted products 1-100 → next insert is still 101,
    not 1), because AUTO_INCREMENT / SERIAL never rewinds on DELETE, only on
    TRUNCATE. Call this ONLY right after the table(s) have been fully
    emptied — it does not check row count itself.
    """
    vendor = connection.vendor
    with connection.cursor() as cursor:
        for model in models:
            table = model._meta.db_table
            if vendor == "mysql":
                cursor.execute(f"ALTER TABLE `{table}` AUTO_INCREMENT = 1")
            elif vendor == "postgresql":
                cursor.execute("SELECT setval(pg_get_serial_sequence(%s, 'id'), 1, false)", [table])
            elif vendor == "sqlite":
                cursor.execute("DELETE FROM sqlite_sequence WHERE name = %s", [table])


class ClearProductsView(APIView):
    """
    POST /settings/clear-products/ — "New Business" reset, Products only.

    Permanently deletes the entire product catalog (and the inventory data
    that only exists to describe those products: stock levels, stock-ledger
    entries, warehouse transfers). Sale slips and purchase orders are left
    completely untouched by this endpoint — if any of them still reference a
    product, Product.delete() raises ProtectedError (Django's built-in
    safeguard against orphaning a real business record), which is caught
    below and turned into a clear, actionable message instead of a 500.
    """
    permission_classes = [IsSuperAdmin]

    def post(self, request):
        confirm_error = _require_confirmation(request)
        if confirm_error:
            return confirm_error

        from apps.inventory.models import StockItem, StockTransaction, StockTransfer
        from apps.products.models import Product, ProductImage, ProductVariant

        counts = {}
        try:
            with transaction.atomic():
                # Purely product-derived data (no meaning of their own) — safe
                # to always clear alongside the products they describe.
                counts["stock_transfers"] = StockTransfer.all_objects.all().delete()[0]
                counts["stock_transactions"] = StockTransaction.all_objects.all().delete()[0]
                counts["stock_items"] = StockItem.all_objects.all().delete()[0]

                # Cascades ProductImage, ProductVariant automatically.
                counts["products"] = Product.all_objects.all().delete()[0]
        except ProtectedError:
            return Response(
                {"detail": "Some products can't be deleted because they're still used in existing "
                           "sale slips or purchase orders. Clear Sale Slips (and/or remove those "
                           "purchase orders) first, then try again."},
                status=status.HTTP_409_CONFLICT,
            )

        # Everything is gone now — rewind the ID counters so the next
        # product you add (or import) starts back at 1, not wherever the
        # old catalog left off.
        _reset_auto_increment(StockTransfer, StockTransaction, StockItem,
                               ProductImage, ProductVariant, Product)

        return Response(
            {"detail": "All products have been permanently removed. New products will start from ID 1 again.",
             "deleted": counts},
            status=status.HTTP_200_OK,
        )


class ClearSaleSlipsView(APIView):
    """
    POST /settings/clear-sale-slips/ — "New Business" reset, Sale Slips only.

    Permanently deletes every sale slip: invoices, their line items,
    payments, and returns. Products, stock, customers, and purchase orders
    are left completely untouched.
    """
    permission_classes = [IsSuperAdmin]

    def post(self, request):
        confirm_error = _require_confirmation(request)
        if confirm_error:
            return confirm_error

        from apps.sales.models import Sale, SaleReturn, SaleItem, SaleReturnItem, Payment

        counts = {}
        with transaction.atomic():
            # SaleReturn PROTECTs Sale, so returns must go first (cascades SaleReturnItem).
            counts["sale_returns"] = SaleReturn.all_objects.all().delete()[0]
            # Cascades SaleItem, Payment automatically.
            counts["sales"] = Sale.all_objects.all().delete()[0]

        # Rewind ID counters so the next sale slip starts back at 1.
        _reset_auto_increment(SaleReturnItem, SaleReturn, SaleItem, Payment, Sale)

        return Response(
            {"detail": "All sale slips have been permanently removed. New sale slips will start from ID 1 again.",
             "deleted": counts},
            status=status.HTTP_200_OK,
        )


class ClearCustomersView(APIView):
    """
    POST /settings/clear-customers/ — "New Business" reset, Customers only.

    Permanently deletes every customer record. Sale.customer is SET_NULL,
    so any existing sale slips are kept and simply become "walk-in" sales
    (no linked customer) rather than being blocked or deleted.
    """
    permission_classes = [IsSuperAdmin]

    def post(self, request):
        confirm_error = _require_confirmation(request)
        if confirm_error:
            return confirm_error

        from apps.customers.models import Customer

        counts = {}
        with transaction.atomic():
            counts["customers"] = Customer.all_objects.all().delete()[0]

        # Rewind the ID counter so the next customer starts back at 1.
        _reset_auto_increment(Customer)

        return Response(
            {"detail": "All customers have been permanently removed. New customers will start from ID 1 again.",
             "deleted": counts},
            status=status.HTTP_200_OK,
        )