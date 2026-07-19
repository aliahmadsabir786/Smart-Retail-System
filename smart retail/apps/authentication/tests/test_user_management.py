import pytest
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from apps.authentication.models import User, Role

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client():
    user = User.objects.create_user(
        email="admin-mgmt@test.com", password="Pass123!",
        first_name="Admin", last_name="Mgmt", role=Role.ADMIN,
    )
    user.is_verified = True
    user.save()
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def cashier_client():
    user = User.objects.create_user(
        email="cashier-mgmt@test.com", password="Pass123!",
        first_name="Cash", last_name="Mgmt", role=Role.CASHIER,
    )
    user.is_verified = True
    user.save()
    client = APIClient()
    client.force_authenticate(user)
    return client


class TestUserManagementRBAC:
    def test_cashier_cannot_list_users(self, cashier_client):
        response = cashier_client.get("/api/v1/auth/users/")
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_admin_can_list_users(self, admin_client):
        response = admin_client.get("/api/v1/auth/users/")
        assert response.status_code == status.HTTP_200_OK


class TestUserManagementCRUD:
    def test_admin_can_create_user_with_any_role(self, admin_client):
        response = admin_client.post("/api/v1/auth/users/", {
            "first_name": "New", "last_name": "Cashier", "email": "newcashier@test.com",
            "role": Role.CASHIER, "password": "StrongPass123!",
        })
        assert response.status_code == status.HTTP_201_CREATED, response.content
        user = User.objects.get(email="newcashier@test.com")
        assert user.role == Role.CASHIER
        assert user.is_verified is True  # admin-created accounts skip verification
        assert user.check_password("StrongPass123!")

    def test_create_without_password_fails(self, admin_client):
        response = admin_client.post("/api/v1/auth/users/", {
            "first_name": "No", "last_name": "Pass", "email": "nopass@test.com",
            "role": Role.CASHIER,
        })
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    def test_admin_can_update_user_role(self, admin_client):
        target = User.objects.create_user(
            email="target@test.com", password="Pass123!",
            first_name="T", last_name="U", role=Role.CASHIER,
        )
        response = admin_client.patch(f"/api/v1/auth/users/{target.id}/", {"role": Role.MANAGER})
        assert response.status_code == status.HTTP_200_OK
        target.refresh_from_db()
        assert target.role == Role.MANAGER

    def test_delete_is_soft_deactivate_not_hard_delete(self, admin_client):
        target = User.objects.create_user(
            email="softdelete@test.com", password="Pass123!",
            first_name="S", last_name="D", role=Role.CASHIER,
        )
        response = admin_client.delete(f"/api/v1/auth/users/{target.id}/")
        assert response.status_code == status.HTTP_204_NO_CONTENT
        target.refresh_from_db()
        assert target.is_active is False
        assert User.objects.filter(pk=target.id).exists()  # still exists in DB
