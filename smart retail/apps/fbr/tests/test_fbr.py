import json
import urllib.error
from decimal import Decimal

import pytest

from apps.customers.models import Customer
from apps.fbr import services
from apps.fbr.client import ClientResult, FBRClient
from apps.fbr.mapper import MappingError, build_payload, payload_fingerprint
from apps.fbr.models import CustomerFBRProfile, FBRInvoice, FBRSettings, ProductFBRProfile
from .conftest import make_sale, ok_response

pytestmark = pytest.mark.django_db


class FakeClient:
    """Stands in for FBRClient; `script` is a list of ClientResults returned in order."""
    script = []
    calls = []

    def __init__(self, token, timeout=30):
        self.token = token

    def post_invoice(self, url, payload):
        FakeClient.calls.append(("post", url, payload))
        return FakeClient.script.pop(0)

    def validate_invoice(self, url, payload):
        FakeClient.calls.append(("validate", url, payload))
        return FakeClient.script.pop(0)

    def get_reference(self, name):
        return FakeClient.script.pop(0)


@pytest.fixture(autouse=True)
def fake_client(monkeypatch):
    FakeClient.script, FakeClient.calls = [], []
    monkeypatch.setattr(services, "FBRClient", FakeClient)
    return FakeClient


def ok():
    return ClientResult(category="ok", http_status=200, data=ok_response())


# ------------------------------------------------------------------ config
class TestConfiguration:
    def test_disabled_by_default_blocks_everything(self, sale):
        with pytest.raises(Exception, match="turned off"):
            services.submit_sale(sale)

    def test_missing_credentials_reported(self, sale):
        s = FBRSettings.load()
        s.is_enabled = True
        s.save()
        with pytest.raises(Exception, match="API token"):
            services.submit_sale(sale)

    def test_sandbox_and_production_urls(self, cfg):
        assert cfg.post_url.endswith("postinvoicedata_sb")
        cfg.environment = "production"
        assert cfg.post_url.endswith("postinvoicedata") and "_sb" not in cfg.post_url

    def test_token_encrypted_at_rest_and_never_returned(self, cfg, admin_client):
        assert "secret-token-value" not in cfg.api_token_encrypted
        assert cfg.get_token() == "secret-token-value"
        r = admin_client.get("/api/v1/fbr/config/")
        assert r.status_code == 200
        assert "secret-token-value" not in json.dumps(r.json())
        assert r.json()["token_configured"] is True
        assert "api_token" not in r.json()


# ------------------------------------------------------------------ mapping
class TestMapper:
    def test_valid_invoice_with_tax(self, cfg, sale):
        p = build_payload(sale, cfg)
        item = p["items"][0]
        assert item["rate"] == "18%" and item["valueSalesExcludingST"] == 200.0
        assert item["salesTaxApplicable"] == 36.0 and item["totalValues"] == 236.0
        assert p["scenarioId"] == "SN001" and p["buyerRegistrationType"] == "Unregistered"
        assert p["buyerBusinessName"] == "Walk-in Customer"

    def test_production_has_no_scenario(self, cfg, sale):
        cfg.environment = "production"
        assert "scenarioId" not in build_payload(sale, cfg)

    def test_line_discount_matches_pos_total(self, cfg, user, warehouse, product):
        sale = make_sale(user, warehouse, product, qty=3, discount_percent="10")
        item = build_payload(sale, cfg)["items"][0]
        assert Decimal(str(item["totalValues"])) == sale.total_amount
        assert Decimal(str(item["salesTaxApplicable"])) == (Decimal(str(item["valueSalesExcludingST"])) * Decimal("0.18")).quantize(Decimal("0.01"))

    def test_invoice_level_discount_spread_over_lines(self, cfg, user, warehouse, product, product2):
        from apps.inventory import services as inv
        from apps.sales import services as sv
        inv.stock_in(product, warehouse, 50); inv.stock_in(product2, warehouse, 50)
        sale = sv.create_sale(customer=None, warehouse=warehouse, user=user, discount_amount=Decimal("30.00"),
                              items=[{"product": product, "variant": None, "quantity": 1, "unit_price": product.selling_price,
                                      "discount_percent": Decimal("0"), "tax_percent": product.tax_rate},
                                     {"product": product2, "variant": None, "quantity": 5, "unit_price": product2.selling_price,
                                      "discount_percent": Decimal("0"), "tax_percent": product2.tax_rate}])
        items = build_payload(sale, cfg)["items"]
        total = sum(Decimal(str(i["totalValues"])) for i in items)
        assert abs(total - sale.total_amount) <= Decimal("0.02")
        assert len(items) == 2 and items[1]["rate"] == "0%"

    def test_multiple_items(self, cfg, user, warehouse, product, product2):
        from apps.inventory import services as inv
        from apps.sales import services as sv
        inv.stock_in(product, warehouse, 5); inv.stock_in(product2, warehouse, 5)
        sale = sv.create_sale(customer=None, warehouse=warehouse, user=user,
                              items=[{"product": p, "variant": None, "quantity": 1, "unit_price": p.selling_price,
                                      "discount_percent": Decimal("0"), "tax_percent": p.tax_rate} for p in (product, product2)])
        assert len(build_payload(sale, cfg)["items"]) == 2

    def test_missing_hs_code_is_reported_per_product(self, cfg, sale):
        cfg.default_hs_code = ""
        with pytest.raises(MappingError) as e:
            build_payload(sale, cfg)
        assert "HS code" in str(e.value) and "P-1" in str(e.value)

    def test_product_profile_overrides_default(self, cfg, sale, product):
        ProductFBRProfile.objects.create(product=product, hs_code="9999.0000", uom="KG", sale_type="Goods at Reduced Rate")
        item = build_payload(sale, cfg)["items"][0]
        assert item["hsCode"] == "9999.0000" and item["uoM"] == "KG" and item["saleType"] == "Goods at Reduced Rate"

    def test_registered_buyer_needs_ntn(self, cfg, user, warehouse, product):
        c = Customer.objects.create(name="Biz Ltd", address="Karachi")
        CustomerFBRProfile.objects.create(customer=c, registration_type="Registered", ntn_cnic="")
        sale = make_sale(user, warehouse, product, customer=c)
        with pytest.raises(MappingError, match="NTN/CNIC"):
            build_payload(sale, cfg)
        CustomerFBRProfile.objects.filter(customer=c).update(ntn_cnic="7654321", province="Sindh")
        c = Customer.objects.get(pk=c.pk)  # fresh instance, as every real request loads it
        p = build_payload(make_sale(user, warehouse, product, customer=c), cfg)
        assert p["buyerNTNCNIC"] == "7654321" and p["buyerRegistrationType"] == "Registered" and p["buyerProvince"] == "Sindh"

    def test_invalid_invoice_status_rejected(self, cfg, sale):
        sale.status = "draft"
        with pytest.raises(MappingError, match="completed"):
            build_payload(sale, cfg)

    def test_fingerprint_ignores_scenario(self, cfg, sale):
        p = build_payload(sale, cfg)
        q = dict(p, scenarioId="SN002")
        assert payload_fingerprint(p) == payload_fingerprint(q)


# ------------------------------------------------------------------ submission
class TestSubmission:
    def test_success_stores_fbr_number(self, cfg, sale, fake_client):
        fake_client.script = [ok()]
        r = services.submit_sale(sale)
        assert r["success"] and r["status"] == "submitted"
        row = FBRInvoice.objects.get(sale=sale)
        assert row.fbr_invoice_number == "7000007DI1747119701593" and row.submitted_at

    def test_rejection_is_failed_and_retryable(self, cfg, sale, fake_client):
        fake_client.script = [ClientResult("ok", 200, {"dated": "x", "validationResponse": {
            "statusCode": "01", "status": "Invalid", "errorCode": "0052", "error": "Provide proper HS Code", "invoiceStatuses": None}})]
        r = services.submit_sale(sale)
        row = FBRInvoice.objects.get(sale=sale)
        assert not r["success"] and row.status == "failed" and row.error_code == "0052" and "HS Code" in row.error_message

    def test_item_level_rejection(self, cfg, sale, fake_client):
        fake_client.script = [ClientResult("ok", 200, {"dated": "x", "validationResponse": {
            "statusCode": "00", "status": "invalid", "error": "", "invoiceStatuses": [
                {"itemSNo": "1", "statusCode": "01", "status": "Invalid", "errorCode": "0046", "error": "Provide rate."}]}})]
        services.submit_sale(sale)
        row = FBRInvoice.objects.get(sale=sale)
        assert row.status == "failed" and row.error_code == "0046" and "Item 1" in row.error_message

    @pytest.mark.parametrize("cat,expected", [("auth", "failed"), ("network", "failed"), ("http_error", "failed"),
                                              ("timeout", "unknown"), ("disconnected", "unknown"), ("bad_response", "unknown")])
    def test_failure_categories(self, cfg, sale, fake_client, cat, expected):
        fake_client.script = [ClientResult(cat, 401 if cat == "auth" else None, message="boom", outcome_unknown=expected == "unknown")]
        services.submit_sale(sale)
        row = FBRInvoice.objects.get(sale=sale)
        assert row.status == expected and row.error_category == cat

    def test_failed_then_retry_then_success(self, cfg, sale, fake_client):
        fake_client.script = [ClientResult("network", message="down"), ok()]
        assert not services.submit_sale(sale)["success"]
        assert services.submit_sale(sale)["success"]
        row = FBRInvoice.objects.get(sale=sale)
        assert row.status == "submitted" and row.retry_count == 1 and row.error_message == ""

    def test_submitted_is_never_posted_again(self, cfg, sale, fake_client):
        fake_client.script = [ok()]
        services.submit_sale(sale)
        r = services.submit_sale(sale)
        assert r["status"] == "submitted" and len([c for c in fake_client.calls if c[0] == "post"]) == 1
        assert FBRInvoice.objects.filter(sale=sale).count() == 1

    def test_unknown_not_resent_without_confirmation(self, cfg, sale, fake_client):
        fake_client.script = [ClientResult("timeout", message="slow", outcome_unknown=True), ok()]
        services.submit_sale(sale)
        r = services.submit_sale(sale)
        assert r["status"] == "unknown" and len(fake_client.calls) == 1
        r = services.submit_sale(sale, allow_unknown_retry=True)
        assert r["success"] and len(fake_client.calls) == 2

    def test_pending_in_flight_blocks_second_post(self, cfg, sale, fake_client):
        services.submit_sale(sale) if False else None
        from django.utils import timezone
        FBRInvoice.objects.create(sale=sale, local_invoice_number=sale.invoice_number, status="pending",
                                  is_sandbox=True, last_attempt_at=timezone.now())
        r = services.submit_sale(sale)
        assert "in progress" in r["message"] and not fake_client.calls

    def test_stale_pending_becomes_unknown(self, cfg, sale, fake_client):
        from datetime import timedelta
        from django.utils import timezone
        FBRInvoice.objects.create(sale=sale, local_invoice_number=sale.invoice_number, status="pending",
                                  is_sandbox=True, last_attempt_at=timezone.now() - timedelta(minutes=30))
        r = services.submit_sale(sale)
        assert r["status"] == "unknown" and not fake_client.calls

    def test_missing_data_makes_nothing_leave_the_server(self, cfg, sale, fake_client):
        cfg.default_hs_code = ""
        cfg.save()
        r = services.submit_sale(sale)
        assert not r["success"] and not fake_client.calls
        assert FBRInvoice.objects.get(sale=sale).error_category == "missing_data"

    def test_sandbox_record_does_not_block_production(self, cfg, sale, fake_client):
        fake_client.script = [ok(), ClientResult("ok", 200, ok_response("7000007DI0000000000001"))]
        services.submit_sale(sale)
        cfg.environment = "production"
        cfg.save()
        assert services.status_for_sale(sale)["status"] == "not_submitted"
        r = services.submit_sale(sale)
        row = FBRInvoice.objects.get(sale=sale)
        assert r["success"] and not row.is_sandbox and row.fbr_invoice_number.endswith("0001")
        assert row.response_data["previous_sandbox"]["status"] == "submitted"

    def test_production_record_never_overwritten_by_sandbox(self, cfg, sale, fake_client):
        cfg.environment = "production"; cfg.save()
        fake_client.script = [ok()]
        services.submit_sale(sale)
        cfg.environment = "sandbox"; cfg.save()
        r = services.submit_sale(sale)
        assert "production record" in r["message"] and len(fake_client.calls) == 1

    def test_one_row_per_sale_enforced_by_db(self, cfg, sale):
        from django.db import IntegrityError, transaction
        FBRInvoice.objects.create(sale=sale, local_invoice_number="X", status="failed")
        with pytest.raises(IntegrityError), transaction.atomic():
            FBRInvoice.objects.create(sale=sale, local_invoice_number="Y", status="failed")

    def test_edit_after_submission_is_flagged(self, cfg, user, warehouse, product, sale, fake_client):
        from apps.sales import services as sv
        fake_client.script = [ok()]
        services.submit_sale(sale)
        assert services.status_for_sale(sale)["modified_since_submission"] is False
        sv.edit_completed_sale(sale, customer=None, warehouse=warehouse, user=user, items=[
            {"product": product, "variant": None, "quantity": 5, "unit_price": product.selling_price,
             "discount_percent": Decimal("0"), "tax_percent": product.tax_rate}])
        sale.refresh_from_db()
        st = services.status_for_sale(sale)
        assert st["modified_since_submission"] is True and "warning" in st

    def test_clear_sale_slips_keeps_working_and_ids_can_repeat(self, cfg, sale, fake_client):
        from apps.sales.models import Sale, SaleReturn
        fake_client.script = [ok()]
        services.submit_sale(sale)
        SaleReturn.all_objects.all().delete()
        Sale.all_objects.all().delete()
        row = FBRInvoice.objects.get()
        assert row.sale is None and row.local_invoice_number and row.fbr_invoice_number


# ------------------------------------------------------------------ client
class TestClientHttp:
    def _patch(self, monkeypatch, effect):
        import urllib.request
        monkeypatch.setattr(urllib.request, "urlopen", effect)

    def test_timeout_is_unknown_outcome(self, monkeypatch):
        import socket
        def boom(*a, **k): raise socket.timeout()
        self._patch(monkeypatch, boom)
        r = FBRClient("t").post_invoice("https://x.test/p", {})
        assert r.category == "timeout" and r.outcome_unknown

    def test_connection_refused_is_network(self, monkeypatch):
        def boom(*a, **k): raise urllib.error.URLError(ConnectionRefusedError())
        self._patch(monkeypatch, boom)
        r = FBRClient("t").post_invoice("https://x.test/p", {})
        assert r.category == "network" and not r.outcome_unknown

    def test_401_is_auth(self, monkeypatch):
        import io
        def boom(*a, **k): raise urllib.error.HTTPError("u", 401, "Unauthorized", {}, io.BytesIO(b"{}"))
        self._patch(monkeypatch, boom)
        assert FBRClient("t").post_invoice("https://x.test/p", {}).category == "auth"

    def test_token_not_in_result_or_logs(self, monkeypatch, caplog):
        def boom(*a, **k): raise urllib.error.URLError(ConnectionRefusedError())
        self._patch(monkeypatch, boom)
        with caplog.at_level("DEBUG"):
            r = FBRClient("SUPER-SECRET").post_invoice("https://x.test/p", {})
        assert "SUPER-SECRET" not in caplog.text and "SUPER-SECRET" not in repr(r)

    def test_bad_json_is_bad_response(self, monkeypatch):
        class R:
            status = 200
            def read(self): return b"<html>"
            def __enter__(self): return self
            def __exit__(self, *a): return False
        self._patch(monkeypatch, lambda *a, **k: R())
        assert FBRClient("t").post_invoice("https://x.test/p", {}).category == "bad_response"


# ------------------------------------------------------------------ api
class TestApi:
    def test_config_admin_only(self, cashier_client, admin_client):
        assert cashier_client.get("/api/v1/fbr/config/").status_code == 403
        assert admin_client.get("/api/v1/fbr/config/").status_code == 200

    def test_save_config_with_token_and_clear(self, admin_client):
        r = admin_client.patch("/api/v1/fbr/config/", {"is_enabled": True, "seller_ntn_cnic": "123-4567",
                                                       "seller_province": "Punjab", "api_token": "abc"}, format="json")
        assert r.status_code == 200 and r.json()["token_configured"] and r.json()["seller_ntn_cnic"] == "1234567"
        r = admin_client.patch("/api/v1/fbr/config/", {"clear_token": True}, format="json")
        assert r.json()["token_configured"] is False

    def test_bad_ntn_rejected(self, admin_client):
        assert admin_client.patch("/api/v1/fbr/config/", {"seller_ntn_cnic": "12345"}, format="json").status_code == 400

    def test_enabling_auto_submit_sets_cutoff(self, admin_client):
        r = admin_client.patch("/api/v1/fbr/config/", {"auto_submit_enabled": True}, format="json")
        assert r.json()["auto_submit_from"]

    def test_feature_flag_visible_to_cashier(self, cashier_client, cfg):
        assert cashier_client.get("/api/v1/fbr/enabled/").json()["enabled"] is True

    def test_submit_requires_manager(self, cashier_client, admin_client, cfg, sale, fake_client):
        assert cashier_client.post(f"/api/v1/fbr/invoices/{sale.pk}/submit/").status_code == 403
        fake_client.script = [ok()]
        r = admin_client.post(f"/api/v1/fbr/invoices/{sale.pk}/submit/")
        assert r.status_code == 200 and r.json()["success"]

    def test_status_hides_technical_details_from_cashier(self, cashier_client, admin_client, cfg, sale, fake_client):
        fake_client.script = [ClientResult("auth", 401, message="FBR returned HTTP 401")]
        admin_client.post(f"/api/v1/fbr/invoices/{sale.pk}/submit/")
        c = cashier_client.get(f"/api/v1/fbr/invoices/{sale.pk}/status/").json()
        a = admin_client.get(f"/api/v1/fbr/invoices/{sale.pk}/status/").json()
        assert "details" not in c and c["message"].startswith("FBR submission failed")
        assert a["details"]["category"] == "auth"

    def test_retry_unknown_needs_confirmation(self, admin_client, cfg, sale, fake_client):
        fake_client.script = [ClientResult("timeout", message="slow", outcome_unknown=True), ok()]
        admin_client.post(f"/api/v1/fbr/invoices/{sale.pk}/submit/")
        r = admin_client.post(f"/api/v1/fbr/invoices/{sale.pk}/retry/")
        assert r.json()["status"] == "unknown"
        r = admin_client.post(f"/api/v1/fbr/invoices/{sale.pk}/retry/", {"confirm_unknown": True}, format="json")
        assert r.json()["success"]

    def test_everything_off_when_disabled(self, admin_client, sale):
        st = admin_client.get(f"/api/v1/fbr/invoices/{sale.pk}/status/").json()
        assert st["status"] == "disabled" and st["can_submit"] is False
        assert admin_client.post(f"/api/v1/fbr/invoices/{sale.pk}/submit/").status_code == 400

    def test_validate_does_not_store(self, admin_client, cfg, sale, fake_client):
        fake_client.script = [ClientResult("ok", 200, {"dated": "x", "validationResponse": {
            "statusCode": "00", "status": "Valid", "errorCode": None, "error": "",
            "invoiceStatuses": [{"itemSNo": "1", "statusCode": "00", "status": "Valid"}]}})]
        assert admin_client.post(f"/api/v1/fbr/invoices/{sale.pk}/validate/").json()["ok"] is True
        assert FBRInvoice.objects.count() == 0

    def test_product_and_customer_profiles(self, admin_client, product):
        r = admin_client.put(f"/api/v1/fbr/products/{product.pk}/profile/", {"hs_code": "1234.5678", "uom": "KG"}, format="json")
        assert r.status_code == 200 and admin_client.get(f"/api/v1/fbr/products/{product.pk}/profile/").json()["hs_code"] == "1234.5678"
        c = Customer.objects.create(name="X")
        r = admin_client.put(f"/api/v1/fbr/customers/{c.pk}/profile/", {"registration_type": "Registered", "ntn_cnic": "1234567"}, format="json")
        assert r.status_code == 200

    def test_test_connection(self, admin_client, cfg, fake_client):
        fake_client.script = [ClientResult("ok", 200, [{"stateProvinceCode": 7}])]
        assert admin_client.post("/api/v1/fbr/test-connection/").json()["ok"] is True
        fake_client.script = [ClientResult("auth", 401, message="x")]
        assert admin_client.post("/api/v1/fbr/test-connection/").json()["ok"] is False


# ------------------------------------------------------------------ sweep
class TestSweep:
    def test_off_by_default(self, cfg, sale, fake_client):
        assert services.submit_pending_sales()["skipped"] is True and not fake_client.calls

    def test_only_sales_after_cutoff_and_never_resubmits(self, cfg, user, warehouse, product, fake_client):
        old = make_sale(user, warehouse, product)
        from django.utils import timezone
        cfg.auto_submit_enabled = True
        cfg.auto_submit_from = timezone.now()
        cfg.save()
        new = make_sale(user, warehouse, product)
        fake_client.script = [ok()]
        res = services.submit_pending_sales()
        assert res["submitted"] == 1 and FBRInvoice.objects.filter(sale=new).exists() and not FBRInvoice.objects.filter(sale=old).exists()
        res = services.submit_pending_sales()
        assert res["submitted"] == 0 and len(fake_client.calls) == 1


class TestProductProfileList:
    def test_list_shows_effective_hs_and_missing(self, admin_client, cfg, product, product2):
        ProductFBRProfile.objects.create(product=product, hs_code="1111.1111")
        cfg.default_hs_code = ""
        cfg.save()
        rows = {r["sku"]: r for r in admin_client.get("/api/v1/fbr/products/").json()["results"]}
        assert rows["P-1"]["effective_hs_code"] == "1111.1111" and rows["P-1"]["missing_hs_code"] is False
        assert rows["P-2"]["missing_hs_code"] is True

    def test_search_and_permission(self, admin_client, cashier_client, product, product2):
        assert [r["sku"] for r in admin_client.get("/api/v1/fbr/products/?q=pen").json()["results"]] == ["P-2"]
        assert cashier_client.get("/api/v1/fbr/products/").status_code == 403
