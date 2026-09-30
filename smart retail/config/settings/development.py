from .base import *  # noqa

DEBUG = True

INSTALLED_APPS += ["debug_toolbar"]  # noqa
MIDDLEWARE.insert(0, "debug_toolbar.middleware.DebugToolbarMiddleware")  # noqa

INTERNAL_IPS = ["127.0.0.1"]

# In dev, allow browsable API for convenience
REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = (  # noqa
    "rest_framework.renderers.JSONRenderer",
    "rest_framework.renderers.BrowsableAPIRenderer",
)

# No SMTP credentials configured? Print emails (including the password-reset
# link) in the runserver terminal instead of failing silently, so the whole
# forgot-password flow can be tested locally. Put real EMAIL_HOST_USER /
# EMAIL_HOST_PASSWORD in .env to have mail actually delivered.
if not EMAIL_HOST_USER and EMAIL_BACKEND == "django.core.mail.backends.smtp.EmailBackend":  # noqa
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
