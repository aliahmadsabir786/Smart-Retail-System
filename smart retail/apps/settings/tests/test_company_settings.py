import pytest
from rest_framework.test import APIClient
from rest_framework import status
from apps.authentication.models import User, Role
from apps.settings.models import CompanySettings

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin_client():
    user = User.objects.create_user(
        email="admin-settings@test.com", password="Pass123!",
        first_name="Admin", last_name="Settings", role=Role.ADMIN,
    )
    user.is_verified = True
    user.save()
    client = APIClient()
    client.force_authenticate(user)
    return client


@pytest.fixture
def cashier_client():
    user = User.objects.create_user(
        email="cashier-settings@test.com", password="Pass123!",
        first_name="Cash", last_name="Settings", role=Role.CASHIER,
    )
    user.is_verified = True
    user.save()
    client = APIClient()
    client.force_authenticate(user)
    return client


class TestCompanySettings:
    def test_get_creates_singleton_on_first_access(self, admin_client):
        assert CompanySettings.objects.count() == 0
        response = admin_client.get("/api/v1/settings/company/")
        assert response.status_code == status.HTTP_200_OK
        assert CompanySettings.objects.count() == 1

    def test_update_persists_and_stays_singleton(self, admin_client):
        admin_client.get("/api/v1/settings/company/")  # ensure it exists
        response = admin_client.patch("/api/v1/settings/company/", {
            "company_name": "Test Retail Co", "default_currency": "PKR", "default_tax_percent": "17.00",
        })
        assert response.status_code == status.HTTP_200_OK
        assert response.data["company_name"] == "Test Retail Co"
        assert CompanySettings.objects.count() == 1  # still just one row

        # Re-fetching returns the same updated values
        response2 = admin_client.get("/api/v1/settings/company/")
        assert response2.data["company_name"] == "Test Retail Co"
        assert response2.data["default_currency"] == "PKR"

    def test_cashier_cannot_update_settings(self, cashier_client):
        response = cashier_client.patch("/api/v1/settings/company/", {"company_name": "Hacked"})
        assert response.status_code == status.HTTP_403_FORBIDDEN
