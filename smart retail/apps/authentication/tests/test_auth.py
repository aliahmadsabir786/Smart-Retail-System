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
    def test_password_reset_request_always_200(self, api_client):
        url = reverse("authentication:password-reset")
        response = api_client.post(url, {"email": "doesnotexist@smartretail.com"})
        assert response.status_code == status.HTTP_200_OK
