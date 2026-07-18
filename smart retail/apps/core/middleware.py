import logging
import time
import uuid

logger = logging.getLogger("apps")


class RequestLoggingMiddleware:
    """Logs every request with a correlation id, method, path, status, and duration."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.correlation_id = str(uuid.uuid4())
        start = time.monotonic()

        response = self.get_response(request)

        duration_ms = (time.monotonic() - start) * 1000
        logger.info(
            "[%s] %s %s -> %s (%.1fms)",
            request.correlation_id,
            request.method,
            request.get_full_path(),
            response.status_code,
            duration_ms,
        )
        response["X-Correlation-ID"] = request.correlation_id
        return response


class ExceptionLoggingMiddleware:
    """Catches unhandled exceptions outside DRF views (e.g. admin, middleware chain) and logs them."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        logger.exception(
            "Unhandled exception on %s %s: %s",
            request.method, request.get_full_path(), exception,
        )
        return None
