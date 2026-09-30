import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from apps.authentication.models import User, Role

pytestmark = pytest.mark.django_db


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def verified_user():
    user = User.objects.create_user(
        email="cashier@smartretail.com",
        password="StrongPass123!",
        first_name="Ali",
        last_name="Ahmad",
        role=Role.CASHIER,
    )
    user.is_verified = True
    user.save()
    return user


class TestRegistration:
    def test_register_success(self, api_client):
        url = reverse("authentication:register")
        payload = {
            "email": "newcustomer@smartretail.com",
            "first_name": "Sara",
            "last_name": "Khan",
            "password": "StrongPass123!",
            "password_confirm": "StrongPass123!",
        }
        response = api_client.post(url, payload)
        assert response.status_code == status.HTTP_201_CREATED
        assert User.objects.filter(email=payload["email"]).exists()
        user = User.objects.get(email=payload["email"])
        assert user.is_verified is False  # must verify email first

    def test_register_password_mismatch(self, api_client):
        url = reverse("authentication:register")
        payload = {
            "email": "x@smartretail.com", "first_name": "X", "last_name": "Y",
            "password": "StrongPass123!", "password_confirm": "Different123!",
        }
        response = api_client.post(url, payload)
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_register_cannot_self_assign_admin_role(self, api_client):
        url = reverse("authentication:register")
        payload = {
            "email": "hacker@smartretail.com", "first_name": "H", "last_name": "K",
            "password": "StrongPass123!", "password_confirm": "StrongPass123!",
            "role": Role.SUPER_ADMIN,
        }
        response = api_client.post(url, payload)
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestLogin:
    def test_login_success_returns_tokens_and_role_claim(self, api_client, verified_user):
        url = reverse("authentication:login")
        response = api_client.post(url, {"email": verified_user.email, "password": "StrongPass123!"})
        assert response.status_code == status.HTTP_200_OK
        assert "access" in response.data
        assert "refresh" in response.data
        assert response.data["user"]["role"] == Role.CASHIER

    def test_login_invalid_credentials(self, api_client, verified_user):
        url = reverse("authentication:login")
        response = api_client.post(url, {"email": verified_user.email, "password": "wrong"})
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


class TestProfile:
    def test_profile_requires_auth(self, api_client):
        url = reverse("authentication:profile")
        response = api_client.get(url)
        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_profile_returns_current_user(self, api_client, verified_user):
        api_client.force_authenticate(verified_user)
        url = reverse("authentication:profile")
        response = api_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data["email"] == verified_user.email


class TestChangePassword:
    def test_change_password_success(self, api_client, verified_user):
        api_client.force_authenticate(verified_user)
        url = reverse("authentication:change-password")
        response = api_client.post(url, {
            "old_password": "StrongPass123!",
            "new_password": "NewStrongPass456!",
            "new_password_confirm": "NewStrongPass456!",
        })
        assert response.status_code == status.HTTP_200_OK
        verified_user.refresh_from_db()
        assert verified_user.check_password("NewStrongPass456!")

    def test_change_password_wrong_old_password(self, api_client, verified_user):
        api_client.force_authenticate(verified_user)
        url = reverse("authentication:change-password")
        response = api_client.post(url, {
            "old_password": "WrongOldPass",
            "new_password": "NewStrongPass456!",
            "new_password_confirm": "NewStrongPass456!",
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST


class TestPasswordReset:
    @pytest.fixture(autouse=True)
    def _inline_email(self, monkeypatch, settings):
        """Run the background email sender inline so the outbox can be checked,
        and use the in-memory backend (pytest-django already does; explicit here)."""
        from apps.authentication import emailing
        monkeypatch.setattr(emailing, "_run_in_background", lambda fn, *a: fn(*a))
        settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
        settings.EMAIL_SEND_VIA_CELERY = False
        settings.FRONTEND_URL = "http://testserver"
        # The password_reset throttle (5/hour) counts in the cache, which would
        # otherwise carry over from one test to the next.
        from django.core.cache import cache
        cache.clear()

    @staticmethod
    def _link_params(message):
        from urllib.parse import parse_qs, urlparse
        import re
        link = re.search(r"https?://\S+view=reset-password\S*", message.body).group(0)
        qs = parse_qs(urlparse(link).query)
        return qs["uid"][0], qs["token"][0], link

    def test_password_reset_request_always_200(self, api_client):
        from django.core import mail
        url = reverse("authentication:password-reset")
        response = api_client.post(url, {"email": "doesnotexist@smartretail.com"})
        assert response.status_code == status.HTTP_200_OK
        assert len(mail.outbox) == 0

    def test_request_sends_email_with_working_link(self, api_client, verified_user):
        from django.core import mail
        response = api_client.post(reverse("authentication:password-reset"), {"email": verified_user.email})
        assert response.status_code == status.HTTP_200_OK
        assert len(mail.outbox) == 1
        message = mail.outbox[0]
        assert message.to == [verified_user.email]
        _, _, link = self._link_params(message)
        assert link.startswith("http://testserver/?view=reset-password&uid=")
        # HTML alternative carries the same link (with & written as &amp; inside the href, which is correct HTML)
        from django.utils.html import escape
        assert escape(link) in message.alternatives[0][0]

    def test_email_lookup_is_case_insensitive(self, api_client, verified_user):
        from django.core import mail
        api_client.post(reverse("authentication:password-reset"), {"email": verified_user.email.upper()})
        assert len(mail.outbox) == 1

    def test_inactive_account_gets_no_email_but_same_response(self, api_client, verified_user):
        from django.core import mail
        verified_user.is_active = False
        verified_user.save()
        response = api_client.post(reverse("authentication:password-reset"), {"email": verified_user.email})
        assert response.status_code == status.HTTP_200_OK
        assert len(mail.outbox) == 0

    def test_full_flow_reset_then_login_with_new_password(self, api_client, verified_user):
        from django.core import mail
        api_client.post(reverse("authentication:password-reset"), {"email": verified_user.email})
        uid, token, _ = self._link_params(mail.outbox[0])

        confirm = api_client.post(reverse("authentication:password-reset-confirm"), {
            "uid": uid, "token": token,
            "new_password": "BrandNewPass789!", "new_password_confirm": "BrandNewPass789!",
        })
        assert confirm.status_code == status.HTTP_200_OK
        assert confirm.data["email"] == verified_user.email

        login = reverse("authentication:login")
        assert api_client.post(login, {"email": verified_user.email, "password": "StrongPass123!"}).status_code == 401
        ok = api_client.post(login, {"email": verified_user.email, "password": "BrandNewPass789!"})
        assert ok.status_code == status.HTTP_200_OK

    def test_link_is_single_use(self, api_client, verified_user):
        from django.core import mail
        api_client.post(reverse("authentication:password-reset"), {"email": verified_user.email})
        uid, token, _ = self._link_params(mail.outbox[0])
        payload = {"uid": uid, "token": token, "new_password": "BrandNewPass789!", "new_password_confirm": "BrandNewPass789!"}
        assert api_client.post(reverse("authentication:password-reset-confirm"), payload).status_code == 200
        again = api_client.post(reverse("authentication:password-reset-confirm"), {**payload, "new_password": "AnotherPass321!", "new_password_confirm": "AnotherPass321!"})
        assert again.status_code == status.HTTP_400_BAD_REQUEST
        assert "token" in again.data["error"]["details"]

    def test_weak_or_mismatched_password_rejected(self, api_client, verified_user):
        from django.core import mail
        api_client.post(reverse("authentication:password-reset"), {"email": verified_user.email})
        uid, token, _ = self._link_params(mail.outbox[0])
        url = reverse("authentication:password-reset-confirm")
        weak = api_client.post(url, {"uid": uid, "token": token, "new_password": "123", "new_password_confirm": "123"})
        assert weak.status_code == status.HTTP_400_BAD_REQUEST
        mismatch = api_client.post(url, {"uid": uid, "token": token, "new_password": "BrandNewPass789!", "new_password_confirm": "Different789!"})
        assert mismatch.status_code == status.HTTP_400_BAD_REQUEST
        verified_user.refresh_from_db()
        assert verified_user.check_password("StrongPass123!")   # untouched

    def test_garbage_token_rejected(self, api_client, verified_user):
        response = api_client.post(reverse("authentication:password-reset-confirm"), {
            "uid": "MQ", "token": "not-a-real-token",
            "new_password": "BrandNewPass789!", "new_password_confirm": "BrandNewPass789!",
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_reset_revokes_existing_refresh_tokens(self, api_client, verified_user):
        from django.core import mail
        login = api_client.post(reverse("authentication:login"), {"email": verified_user.email, "password": "StrongPass123!"})
        old_refresh = login.data["refresh"]
        api_client.post(reverse("authentication:password-reset"), {"email": verified_user.email})
        uid, token, _ = self._link_params(mail.outbox[0])
        api_client.post(reverse("authentication:password-reset-confirm"), {
            "uid": uid, "token": token,
            "new_password": "BrandNewPass789!", "new_password_confirm": "BrandNewPass789!",
        })
        refreshed = api_client.post(reverse("authentication:token-refresh"), {"refresh": old_refresh})
        assert refreshed.status_code == status.HTTP_401_UNAUTHORIZED

    def test_background_send_failure_never_breaks_the_request(self, api_client, verified_user, monkeypatch):
        from apps.authentication import emailing
        def boom(*a, **k):
            raise RuntimeError("smtp down")
        monkeypatch.setattr(emailing, "send_password_reset_email_now", boom)
        response = api_client.post(reverse("authentication:password-reset"), {"email": verified_user.email})
        assert response.status_code == status.HTTP_200_OK
