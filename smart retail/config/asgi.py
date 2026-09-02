import os
from django.core.asgi import get_asgi_application

# Same reasoning as config/wsgi.py — this file is only loaded by a real ASGI
# server in deployment, never by local `manage.py runserver`, so its
# fallback should be "production", not "development" (which needs
# django-debug-toolbar — a dev-only dependency not installed in prod).
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")

application = get_asgi_application()