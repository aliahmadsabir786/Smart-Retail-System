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
