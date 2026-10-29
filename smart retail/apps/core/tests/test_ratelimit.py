import pytest
from django.test import RequestFactory
from django.urls import reverse
from rest_framework import status
from rest_framework.settings import api_settings
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from apps.authentication.models import Role, User
from apps.core.ratelimit import get_client_ip
from apps.sales.verification import verify_path

pytestmark = pytest.mark.django_db


def client_at(ip, **extra):
    """An API client whose connection address (REMOTE_ADDR) is `ip`."""
    return APIClient(REMOTE_ADDR=ip, **extra)


def bad_login(client, email="nobody@example.com", **extra):
    return client.post(reverse("authentication:login"), {"email": email, "password": "wrong"}, **extra)


@pytest.fixture
def user():
    return User.objects.create_user(
        email="cashier@example.com", password="StrongPass123!",
        first_name="A", last_name="B", role=Role.CASHIER,
    )


class TestLoginLimit:
    def test_requests_within_limit_are_not_blocked(self):
        c = client_at("10.0.0.1")
        for _ in range(5):  # limit is 5/min
            assert bad_login(c).status_code == status.HTTP_401_UNAUTHORIZED

    def test_request_over_limit_gets_429_json_and_headers(self):
        c = client_at("10.0.0.1")
        for _ in range(5):
            bad_login(c)
        r = bad_login(c)
        assert r.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert r.data["success"] is False
        assert r.data["error"]["code"] == "rate_limit_exceeded"
        assert "Rate limit exceeded" in r.data["error"]["message"]
        assert r.data["error"]["details"]["retry_after"] >= 1
        assert int(r["Retry-After"]) >= 1
        assert r["X-RateLimit-Limit"] == "5"
        assert r["X-RateLimit-Remaining"] == "0"

    def test_headers_present_on_allowed_requests(self, user):
        r = client_at("10.0.0.2").post(
            reverse("authentication:login"), {"email": user.email, "password": "StrongPass123!"})
        assert r.status_code == status.HTTP_200_OK
        assert r["X-RateLimit-Limit"] == "5"
        assert r["X-RateLimit-Remaining"] == "4"

    def test_different_clients_are_limited_independently(self):
        a, b = client_at("10.0.0.3"), client_at("10.0.0.4")
        for _ in range(6):
            bad_login(a, email="a@example.com")
        assert bad_login(a, email="a@example.com").status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert bad_login(b, email="b@example.com").status_code == status.HTTP_401_UNAUTHORIZED

    def test_one_account_is_limited_even_when_ip_rotates(self):
        # 21 attempts on the SAME email from 21 different IPs (each IP stays under 5/min).
        codes = [bad_login(client_at(f"10.1.0.{i}"), email="victim@example.com").status_code
                 for i in range(1, 22)]
        assert codes[:20] == [status.HTTP_401_UNAUTHORIZED] * 20
        assert codes[20] == status.HTTP_429_TOO_MANY_REQUESTS


class TestRegisterLimit:
    def test_register_is_stricter_than_default(self):
        c = client_at("10.0.0.5")
        url = reverse("authentication:register")
        for _ in range(5):  # limit is 5/hour; an empty body is a 400, but still counts
            assert c.post(url, {}).status_code == status.HTTP_400_BAD_REQUEST
        assert c.post(url, {}).status_code == status.HTTP_429_TOO_MANY_REQUESTS


class TestDefaultLimits:
    def test_anonymous_default_limit(self, monkeypatch):
        monkeypatch.setitem(SimpleRateThrottle.THROTTLE_RATES, "anon", "3/min")
        c = client_at("10.0.0.6")
        url = reverse("authentication:token-refresh")  # public, 30/min of its own
        for _ in range(3):
            assert c.post(url, {"refresh": "x"}).status_code != status.HTTP_429_TOO_MANY_REQUESTS
        assert c.post(url, {"refresh": "x"}).status_code == status.HTTP_429_TOO_MANY_REQUESTS

    def test_authenticated_users_have_their_own_independent_bucket(self, monkeypatch, user):
        monkeypatch.setitem(SimpleRateThrottle.THROTTLE_RATES, "user", "3/min")
        other = User.objects.create_user(email="other@example.com", password="StrongPass123!",
                                         first_name="C", last_name="D", role=Role.CASHIER)
        url = reverse("authentication:profile")
        c1, c2 = client_at("10.0.0.7"), client_at("10.0.0.7")  # same IP on purpose
        c1.force_authenticate(user)
        c2.force_authenticate(other)
        for _ in range(3):
            assert c1.get(url).status_code == status.HTTP_200_OK
        assert c1.get(url).status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert c2.get(url).status_code == status.HTTP_200_OK


class TestClientIdentification:
    def test_spoofed_x_forwarded_for_is_ignored_when_no_proxy(self):
        # NUM_PROXIES defaults to 0: the header must NOT give a fresh bucket.
        c = client_at("10.0.0.8")
        for i in range(5):
            bad_login(c, HTTP_X_FORWARDED_FOR=f"1.2.3.{i}")
        r = bad_login(c, HTTP_X_FORWARDED_FOR="9.9.9.9")
        assert r.status_code == status.HTTP_429_TOO_MANY_REQUESTS

    def test_behind_one_proxy_the_proxy_added_address_is_used(self, settings):
        settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}
        c = client_at("100.64.0.1")  # the proxy
        # Client keeps changing the part it controls (left) - same real IP (right).
        for i in range(5):
            bad_login(c, email=f"x{i}@example.com", HTTP_X_FORWARDED_FOR=f"6.6.6.{i}, 203.0.113.5")
        r = bad_login(c, email="y@example.com", HTTP_X_FORWARDED_FOR="7.7.7.7, 203.0.113.5")
        assert r.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        # A different real client behind the same proxy is unaffected.
        r = bad_login(c, email="z@example.com", HTTP_X_FORWARDED_FOR="7.7.7.7, 203.0.113.99")
        assert r.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_client_ip_helper(self, settings):
        rf = RequestFactory()
        req = rf.get("/", REMOTE_ADDR="100.64.0.1", HTTP_X_FORWARDED_FOR="1.1.1.1, 2.2.2.2")
        assert get_client_ip(req) == "100.64.0.1"            # NUM_PROXIES = 0
        settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 1}
        assert get_client_ip(req) == "2.2.2.2"
        settings.REST_FRAMEWORK = {**settings.REST_FRAMEWORK, "NUM_PROXIES": 2}
        assert get_client_ip(req) == "1.1.1.1"
        assert get_client_ip(rf.get("/", REMOTE_ADDR="5.5.5.5")) == "5.5.5.5"  # no header


class TestPublicVerifyPage:
    def test_verify_page_is_rate_limited_with_json_429(self, monkeypatch):
        monkeypatch.setitem(api_settings.DEFAULT_THROTTLE_RATES, "verify", "3/min")
        c = client_at("10.0.0.9")
        path = verify_path("INV-NOPE-1")
        for _ in range(3):
            assert c.get(path).status_code == status.HTTP_404_NOT_FOUND  # unknown invoice, not blocked
        r = c.get(path)
        assert r.status_code == status.HTTP_429_TOO_MANY_REQUESTS
        assert r.json()["error"]["code"] == "rate_limit_exceeded"
        assert int(r["Retry-After"]) >= 1
        # another visitor is unaffected
        assert client_at("10.0.0.10").get(path).status_code == status.HTTP_404_NOT_FOUND