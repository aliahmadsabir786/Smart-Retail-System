import io
from datetime import date
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.authentication.models import User
from apps.bankrecords import services
from apps.bankrecords.models import (
    ActivityStatus, ActivityType, Bank, BankAccount, BankActivity, BankActivityChange, PaymentContact,
)
from apps.core.exceptions import ServiceException

pytestmark = pytest.mark.django_db


def make_user(role, email=None):
    return User.objects.create_user(email=email or f"{role}@t.com", password="x12345678!",
                                    first_name="T", last_name=role, role=role)


@pytest.fixture
def admin():
    return make_user("admin")


@pytest.fixture
def hbl():
    bank = Bank.objects.create(name="HBL")
    return BankAccount.objects.create(bank=bank, account_title="My Business", account_number="0123456781234")


@pytest.fixture
def meezan():
    bank = Bank.objects.create(name="Meezan Bank")
    return BankAccount.objects.create(bank=bank, account_title="My Business", account_number="9988776655")


def payment_data(hbl, **extra):
    d = dict(activity_type=ActivityType.PAYMENT, date=date(2026, 10, 4), time="11:35", from_account=hbl,
             recipient_name="Ali", amount=Decimal("50000"), slip_number="SLIP-0051", bank_reference="TRX-1025",
             purpose="Payment")
    d.update(extra)
    return d


PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32


class TestRecords:
    def test_system_references_are_separate_per_type(self, admin, hbl):
        a = services.create_activity(admin, payment_data(hbl))
        b = services.create_activity(admin, payment_data(hbl))
        d = services.create_activity(admin, dict(activity_type=ActivityType.DEPOSIT, date=date(2026, 10, 4),
                                                 time="10:15", to_account=hbl, amount=Decimal("75000")))
        assert (a.system_reference, b.system_reference, d.system_reference) == ("PAY-000001", "PAY-000002", "DEP-000001")
        assert a.bank_reference == "TRX-1025"          # bank's own number is kept separately

    def test_recipient_snapshot_survives_contact_edit(self, admin, hbl):
        c = PaymentContact.objects.create(name="Usman", bank_name="UBL", account_number="5550001234")
        act = services.create_activity(admin, payment_data(hbl, recipient=c, recipient_name=""))
        c.bank_name = "MCB"
        c.save()
        act.refresh_from_db()
        assert act.recipient_name == "Usman" and act.recipient_bank == "UBL"

    def test_masked_number(self, hbl):
        assert hbl.masked_account_number == "****1234"

    def test_edit_of_completed_record_needs_reason_and_is_audited(self, admin, hbl):
        act = services.create_activity(admin, payment_data(hbl))
        with pytest.raises(ServiceException):
            services.update_activity(act, admin, {"amount": Decimal("55000")}, "")
        services.update_activity(act, admin, {"amount": Decimal("55000")}, "Incorrect amount entered")
        change = BankActivityChange.objects.get(activity=act, field="amount")
        assert (change.old_value, change.new_value) == ("50000.00", "55000.00")
        assert change.reason == "Incorrect amount entered" and change.changed_by == admin

    def test_cancel_keeps_record_and_needs_reason(self, admin, hbl):
        act = services.create_activity(admin, payment_data(hbl))
        with pytest.raises(ServiceException):
            services.change_status(act, admin, "cancelled", "")
        services.change_status(act, admin, "cancelled", "Duplicate payment record")
        assert BankActivity.objects.filter(pk=act.pk).exists()
        act.refresh_from_db()
        assert act.status == ActivityStatus.CANCELLED and act.status_reason == "Duplicate payment record"
        with pytest.raises(ServiceException):                       # cancelled records are frozen
            services.update_activity(act, admin, {"notes": "x"}, "y")

    def test_summary_excludes_cancelled_and_has_no_accounting_terms(self, admin, hbl, meezan):
        services.create_activity(admin, payment_data(hbl))
        gone = services.create_activity(admin, payment_data(hbl, amount=Decimal("999")))
        services.change_status(gone, admin, "cancelled", "dup")
        services.create_activity(admin, dict(activity_type=ActivityType.TRANSFER, date=date(2026, 10, 4),
                                             time="14:20", from_account=hbl, to_account=meezan,
                                             amount=Decimal("100000")))
        s = services.daily_summary(date(2026, 10, 4), BankActivity.objects.all())
        assert s["payments"] == "50000.00" and s["transfers"] == "100000.00" and s["total_activities"] == 2
        assert not any(k in s for k in ("revenue", "expense", "profit", "receivable", "payable"))

    def test_search_by_name_slip_and_amount(self, admin, hbl):
        services.create_activity(admin, payment_data(hbl))
        qs = BankActivity.objects.all()
        for q in ("Ali", "SLIP-0051", "50,000", "TRX-1025"):
            assert services.filter_activities(qs, {"q": q}).count() == 1

    def test_upload_rules(self):
        ok = SimpleUploadedFile("slip.png", PNG)
        assert services.validate_upload(ok) == "png"
        with pytest.raises(ServiceException):
            services.validate_upload(SimpleUploadedFile("x.exe", b"MZ"))
        with pytest.raises(ServiceException):                          # right extension, wrong content
            services.validate_upload(SimpleUploadedFile("fake.pdf", b"not a pdf"))


class TestApi:
    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user)
        return c

    def test_cashier_and_salesperson_have_no_access(self, hbl):
        for role in ("cashier", "salesperson", "inventory_manager", "customer"):
            r = self._client(make_user(role)).get("/api/v1/bank-records/activities/")
            assert r.status_code == 403

    def test_manager_can_add_but_not_edit_or_cancel(self, hbl):
        c = self._client(make_user("manager"))
        r = c.post("/api/v1/bank-records/activities/", dict(
            activity_type="payment", date="2026-10-04", time="11:35:00", from_account=hbl.id,
            recipient_name="Ali", amount="50000"), format="json")
        assert r.status_code == 201, r.content
        pk = r.json()["id"]
        assert c.patch(f"/api/v1/bank-records/activities/{pk}/", {"notes": "x"}, format="json").status_code == 403
        assert c.post(f"/api/v1/bank-records/activities/{pk}/status/",
                      {"status": "cancelled", "reason": "r"}, format="json").status_code == 403

    def test_no_delete_endpoint(self, admin, hbl):
        c = self._client(admin)
        act = services.create_activity(admin, payment_data(hbl))
        assert c.delete(f"/api/v1/bank-records/activities/{act.pk}/").status_code == 405

    def test_lists_show_masked_numbers_only(self, admin, hbl):
        c = self._client(admin)
        row = c.get("/api/v1/bank-records/accounts/").json()["results"][0]
        assert row["masked_account_number"] == "****1234" and "account_number" not in row
        full = c.get(f"/api/v1/bank-records/accounts/{hbl.id}/").json()
        assert full["account_number"] == hbl.account_number

    def test_transfer_validation(self, admin, hbl):
        c = self._client(admin)
        r = c.post("/api/v1/bank-records/activities/", dict(
            activity_type="transfer", date="2026-10-04", time="14:20:00",
            from_account=hbl.id, to_account=hbl.id, amount="1"), format="json")
        assert r.status_code == 400

    def test_export_csv(self, admin, hbl):
        services.create_activity(admin, payment_data(hbl))
        r = self._client(admin).get("/api/v1/bank-records/activities/export/?fmt=csv")
        assert r.status_code == 200 and b"SLIP-0051" in r.content
