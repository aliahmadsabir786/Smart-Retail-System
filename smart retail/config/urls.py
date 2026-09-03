from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve as serve_static_file
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView,
)
from . import views as frontend_views

api_v1_patterns = [
    path("auth/", include("apps.authentication.urls")),
    path("warehouses/", include("apps.warehouse.urls")),
    path("categories/", include("apps.categories.urls")),
    path("brands/", include("apps.brands.urls")),
    path("products/", include("apps.products.urls")),
    path("inventory/", include("apps.inventory.urls")),
    path("customers/", include("apps.customers.urls")),
    path("suppliers/", include("apps.suppliers.urls")),
    path("sales/", include("apps.sales.urls")),
    path("purchase-orders/", include("apps.purchase.urls")),
    path("routes/", include("apps.routes.urls")),
    path("expenses/", include("apps.expenses.urls")),
    path("finance/", include("apps.finance.urls")),
    path("notifications/", include("apps.notifications.urls")),
    path("audit-logs/", include("apps.audit.urls")),
    path("dashboard/", include("apps.dashboard.urls")),
    path("reports/", include("apps.reports.urls")),
    path("settings/", include("apps.settings.urls")),
]

FRONTEND_DIR = settings.BASE_DIR / "frontend"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1_patterns)),

    # OpenAPI / Swagger documentation
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),

    # ── Frontend (single-server setup) ──────────────────────────────
    # Serves /frontend/index.html at the root, and its JS/CSS assets
    # alongside it, so `python manage.py runserver` is the only command
    # needed to run both the UI and the API together.
    path("", frontend_views.frontend_index, name="frontend-index"),
    path("script.js", serve_static_file, {"document_root": FRONTEND_DIR, "path": "script.js"}),
    path("api.js", serve_static_file, {"document_root": FRONTEND_DIR, "path": "api.js"}),
    path("style.css", serve_static_file, {"document_root": FRONTEND_DIR, "path": "style.css"}),
]

if settings.DEBUG:
    import debug_toolbar
    urlpatterns += [path("__debug__/", include(debug_toolbar.urls))]

# Serving uploaded media (company logo, product images, etc.) through Django
# itself is normally a DEBUG-only thing — Django's docs recommend a real
# webserver/CDN for this in production. But this project has no such
# webserver in front of it (Railway just proxies straight to gunicorn), so
# without this line NO uploaded file — including the store logo — is ever
# reachable at all once DEBUG=False: the upload succeeds (the file saves to
# disk fine) but its URL 404s for every single request, which is exactly
# why the logo never showed up on the invoice. This is a fine trade-off for
# a small business app's traffic level; a CDN/S3 backend is the "proper"
# fix if this app ever needs to scale that upload traffic.
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)