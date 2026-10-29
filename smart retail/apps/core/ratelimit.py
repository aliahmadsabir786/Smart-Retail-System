"""
Rate limiting helpers (DRF throttles + a decorator for plain Django views).

Storage: every counter lives in the dedicated "throttle" cache alias
(see CACHES in settings) - Redis when RATELIMIT_REDIS_URL is set, in-process
memory otherwise - so it never mixes with the default application cache.
"""
import hashlib
import time
from functools import wraps

from django.core.cache import caches
from django.http import JsonResponse
from django.utils.connection import ConnectionProxy
from rest_framework.settings import api_settings
from rest_framework.throttling import (
    AnonRateThrottle,
    ScopedRateThrottle,
    SimpleRateThrottle,
    UserRateThrottle,
)

throttle_cache = ConnectionProxy(caches, "throttle")


def get_client_ip(request):
    """
    Best-effort real client IP, never trusting more of X-Forwarded-For than
    configured. Mirrors DRF's own logic so DRF throttles and plain views agree.

    REST_FRAMEWORK["NUM_PROXIES"] (env RATE_LIMIT_NUM_PROXIES) is the number of
    reverse proxies that sit in front of the app:
      0  -> use REMOTE_ADDR only; X-Forwarded-For is ignored (spoof-proof).
      N  -> take the Nth entry from the RIGHT of X-Forwarded-For, i.e. the
            address our own outermost proxy saw, not what the client claims.
    """
    remote = request.META.get("REMOTE_ADDR", "")
    proxies = api_settings.NUM_PROXIES
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if not proxies or not xff:
        return remote
    addrs = [a.strip() for a in xff.split(",") if a.strip()]
    if not addrs:
        return remote
    return addrs[-min(proxies, len(addrs))]


class TrackedThrottleMixin:
    """Uses the 'throttle' cache and remembers the state for X-RateLimit-* headers."""

    cache = throttle_cache

    def allow_request(self, request, view):
        allowed = super().allow_request(request, view)
        if getattr(self, "key", None) is not None and getattr(self, "num_requests", None):
            remaining = max(self.num_requests - len(self.history), 0)
            reset = max(int(self.history[-1] + self.duration - self.now), 0) if self.history else 0
            raw = getattr(request, "_request", request)
            current = getattr(raw, "_ratelimit", None)
            # When several throttles apply, report the tightest one.
            if current is None or remaining < current[1]:
                raw._ratelimit = (self.num_requests, remaining, reset)
        return allowed


class AnonThrottle(TrackedThrottleMixin, AnonRateThrottle):
    """Unauthenticated clients, per IP.  Rate: DEFAULT_THROTTLE_RATES['anon']."""


class UserThrottle(TrackedThrottleMixin, UserRateThrottle):
    """Authenticated users, per user id.  Rate: DEFAULT_THROTTLE_RATES['user']."""


class ScopedThrottle(TrackedThrottleMixin, ScopedRateThrottle):
    """Per-view limits via `throttle_scope = "<name>"` on the view."""


class LoginAccountThrottle(TrackedThrottleMixin, SimpleRateThrottle):
    """
    Limits login attempts per target ACCOUNT (email), independent of IP, so a
    botnet rotating IPs still cannot hammer one account.  The email is hashed
    before it is used as a cache key.
    """
    scope = "login_account"

    def get_cache_key(self, request, view):
        try:
            email = str(request.data.get("email") or "").strip().lower()
        except AttributeError:
            return None
        if not email:
            return None
        ident = hashlib.sha256(email.encode()).hexdigest()
        return self.cache_format % {"scope": self.scope, "ident": ident}


def rate_limited(scope):
    """
    Decorator for plain Django views (no DRF).  Fixed-window counter per client
    IP, rate taken from DEFAULT_THROTTLE_RATES[scope].  Over the limit -> 429 JSON.
    """
    def decorator(view):
        @wraps(view)
        def wrapper(request, *args, **kwargs):
            rate = api_settings.DEFAULT_THROTTLE_RATES.get(scope)
            if not rate:
                return view(request, *args, **kwargs)
            num, period = rate.split("/")
            limit = int(num)
            duration = {"s": 1, "m": 60, "h": 3600, "d": 86400}[period[0].lower()]
            ckey = f"rl:{scope}:{get_client_ip(request)}"
            rkey = ckey + ":reset"
            now = time.time()
            if throttle_cache.add(ckey, 1, duration):
                throttle_cache.add(rkey, now + duration, duration)
                count = 1
            else:
                try:
                    count = throttle_cache.incr(ckey)
                except ValueError:  # key expired between add() and incr()
                    throttle_cache.set(ckey, 1, duration)
                    throttle_cache.set(rkey, now + duration, duration)
                    count = 1
            retry_after = max(int(throttle_cache.get(rkey, now + duration) - now), 1)
            headers = {
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": str(max(limit - count, 0)),
                "X-RateLimit-Reset": str(retry_after),
            }
            if count > limit:
                response = JsonResponse({
                    "success": False,
                    "error": {
                        "code": "rate_limit_exceeded",
                        "message": f"Rate limit exceeded. Try again in {retry_after} seconds.",
                        "details": {"retry_after": retry_after},
                    },
                }, status=429)
                response["Retry-After"] = str(retry_after)
            else:
                response = view(request, *args, **kwargs)
            for name, value in headers.items():
                response[name] = value
            return response
        return wrapper
    return decorator