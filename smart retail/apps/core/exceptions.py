import logging
from rest_framework.views import exception_handler
from rest_framework.exceptions import APIException
from rest_framework import status

logger = logging.getLogger("apps")


class ServiceException(APIException):
    """Base exception for service-layer business rule violations."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = "A business rule was violated."
    default_code = "service_error"


class InsufficientStockException(ServiceException):
    default_detail = "Insufficient stock available for this operation."
    default_code = "insufficient_stock"


class InvalidTransitionException(ServiceException):
    default_detail = "This status transition is not allowed."
    default_code = "invalid_transition"


class CreditLimitExceededException(ServiceException):
    default_detail = "This operation would exceed the customer's credit limit."
    default_code = "credit_limit_exceeded"


def custom_exception_handler(exc, context):
    """
    Wraps every DRF error response in a consistent envelope:
    {
        "success": false,
        "error": {"code": ..., "message": ..., "details": ...},
    }
    Unhandled exceptions are logged with full context before falling
    back to DRF's default 500 handling.
    """
    response = exception_handler(exc, context)

    if response is not None:
        error_code = getattr(exc, "default_code", "error")
        response.data = {
            "success": False,
            "error": {
                "code": error_code,
                "message": str(exc.detail) if hasattr(exc, "detail") else str(exc),
                "details": response.data,
            },
        }
        return response

    # Unhandled exception — log full context, return generic 500
    request = context.get("request")
    logger.exception(
        "Unhandled exception on %s %s: %s",
        getattr(request, "method", "?"),
        getattr(request, "path", "?"),
        exc,
    )
    return None
