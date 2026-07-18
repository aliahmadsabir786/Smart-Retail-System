import threading

_thread_locals = threading.local()


def set_current_request(request):
    _thread_locals.request = request


def get_current_user():
    """
    Reads request.user lazily (not at middleware time). This matters because
    DRF authenticates lazily on first access to request.user *inside* the view
    (e.g. during permission checks) — which happens after this middleware has
    already run. DRF's Request.user setter propagates the authenticated user
    back onto the underlying Django HttpRequest, so by the time a signal
    handler fires (during/after the view body), reading .user here returns
    the correctly authenticated user, not an anonymous one.
    """
    request = getattr(_thread_locals, "request", None)
    return getattr(request, "user", None) if request is not None else None


class CurrentUserMiddleware:
    """Stashes the current request in thread-local storage so that model
    signal handlers (which have no access to the request) can attribute
    audit log entries to the acting user — see get_current_user() above."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        set_current_request(request)
        try:
            response = self.get_response(request)
        finally:
            set_current_request(None)
        return response
