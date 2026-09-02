import os
from django.core.wsgi import get_wsgi_application

# wsgi.py is only ever loaded by gunicorn (Dockerfile / docker-compose.yml,
# i.e. real deployments) — local dev always runs `manage.py runserver` via
# docker-compose.dev.yml, which explicitly sets DJANGO_SETTINGS_MODULE to
# "development" itself. So if this default is ever actually used, it means
# whatever platform is running the container (e.g. Railway) forgot to set
# DJANGO_SETTINGS_MODULE — and "development" is the wrong thing to fall
# back to there: it turns on django-debug-toolbar, which isn't even
# installed in the production image (see requirements/prod.txt vs dev.txt),
# and used to crash every gunicorn worker with
# "ModuleNotFoundError: No module named 'debug_toolbar'". Falling back to
# "production" instead is a safe default either way.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")

application = get_wsgi_application()