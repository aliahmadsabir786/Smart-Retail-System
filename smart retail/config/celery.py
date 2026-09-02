import os
from celery import Celery

# config/__init__.py imports this module (`from .celery import app as
# celery_app`), and Python always runs a package's __init__.py before any
# of its submodules — so THIS line actually runs before wsgi.py's own
# os.environ.setdefault() call gets a chance to. Whatever default is set
# here wins for the whole process (wsgi.py's setdefault becomes a no-op
# once this has already set it). Must match wsgi.py/asgi.py: "production",
# not "development" — otherwise every deployment silently loads dev
# settings (and crashes on django-debug-toolbar, which isn't installed
# outside the dev requirements) no matter what wsgi.py says.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.production")

app = Celery("smartretail")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()


@app.task(bind=True)
def debug_task(self):
    print(f"Request: {self.request!r}")