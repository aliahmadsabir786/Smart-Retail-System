"""
FBR submission workflow. Everything FBR-specific lives here and in this app;
the existing sales code is never called into and never calls this.

Safety rules (duplicate protection):
  * One FBRInvoice row per sale (DB-enforced one-to-one).
  * The row is claimed under SELECT ... FOR UPDATE and flipped to PENDING
    BEFORE the HTTP call, so two clicks / two workers can't both post.
  * A SUBMITTED row is never posted again.
  * If a request times out or the connection drops after sending, FBR may
    have accepted it and the v1.12 API gives no way to look an invoice up
    afterwards, so the row goes to UNKNOWN ("needs review") and is only
    re-posted after a person explicitly confirms.
  * A sandbox record never blocks a production submission (so testing in
    sandbox first is safe), but a production record is never overwritten by
    a sandbox post.
"""
import logging
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.core.exceptions import ServiceException
from apps.sales.models import Sale
from .client import FBRClient
from .mapper import ELIGIBLE_STATUSES, MappingError, build_payload, payload_fingerprint
from .models import FBRInvoice, FBRSettings

logger = logging.getLogger("apps.fbr")

STALE_PENDING_SECONDS = 180
AUTO_RETRY_MAX = 5
AUTO_RETRY_WAIT = timedelta(minutes=5)

GENERIC_FAILURE = "FBR submission failed. Please retry the invoice submission."


# ----------------------------------------------------------------------
# readiness
# ----------------------------------------------------------------------
def ensure_ready(cfg: FBRSettings):
    if not cfg.is_enabled:
        raise ServiceException("FBR integration is turned off.")
    missing = cfg.missing_configuration()
    if missing:
        raise ServiceException("FBR settings are incomplete: " + ", ".join(missing) + ".")


# ----------------------------------------------------------------------
# FBR response interpretation
# ----------------------------------------------------------------------
def interpret_response(data) -> dict:
    """Turns an FBR post/validate response body into a flat verdict."""
    if not isinstance(data, dict):
        return {"success": False, "invoice_number": "", "error_code": "", "error": "Unexpected response from FBR"}
    vr = data.get("validationResponse") or {}
    top_ok = str(vr.get("statusCode")) == "00" and str(vr.get("status", "")).strip().lower() == "valid"
    items = vr.get("invoiceStatuses") or []
    bad = [i for i in items if str(i.get("statusCode")) != "00"]
    invoice_number = (data.get("invoiceNumber") or "").strip()

    messages, first_code = [], ""
    if vr.get("error"):
        messages.append(str(vr["error"]))
        first_code = str(vr.get("errorCode") or "")
    for i in bad:
        code = str(i.get("errorCode") or "")
        first_code = first_code or code
        messages.append(f"Item {i.get('itemSNo', '?')}: {code} {i.get('error') or ''}".strip())

    return {
        "success": top_ok and not bad,
        "invoice_number": invoice_number,
        "error_code": first_code,
        "error": " | ".join(messages),
    }


# ----------------------------------------------------------------------
# claim -> post -> record
# ----------------------------------------------------------------------
def _claim(sale, cfg, payload, allow_unknown_retry):
    """
    Returns (row, proceed, reason). `proceed` False means: do NOT call FBR,
    just report the row as it stands.
    """
    now = timezone.now()
    with transaction.atomic():
        row = FBRInvoice.objects.select_for_update().filter(sale=sale).first()
        if row is None:
            try:
                with transaction.atomic():
                    row = FBRInvoice.objects.create(
                        sale=sale, local_invoice_number=sale.invoice_number,
                        status=FBRInvoice.Status.PENDING, is_sandbox=cfg.is_sandbox,
                        last_attempt_at=now, payload_hash=payload_fingerprint(payload),
                        request_payload=payload,
                    )
                return row, True, ""
            except IntegrityError:
                row = FBRInvoice.objects.select_for_update().get(sale=sale)

        # ---- environment handling ----
        if row.is_sandbox != cfg.is_sandbox:
            if row.is_sandbox and not cfg.is_sandbox:
                # Sandbox test record must not block the real submission. Keep a trace.
                old = dict(row.response_data or {})
                old["previous_sandbox"] = {"fbr_invoice_number": row.fbr_invoice_number,
                                           "status": row.status}
                row.response_data = old
                row.status = FBRInvoice.Status.FAILED  # re-opened below
                row.fbr_invoice_number = ""
                row.submitted_at = None
                row.retry_count = 0
                row.last_attempt_at = None
                row.is_sandbox = False
            else:
                return row, False, "This invoice already has a production record; it can't be posted to the sandbox."

        if row.status == FBRInvoice.Status.SUBMITTED:
            return row, False, "Already submitted to FBR."

        if row.status == FBRInvoice.Status.PENDING:
            fresh = row.last_attempt_at and (now - row.last_attempt_at).total_seconds() < STALE_PENDING_SECONDS
            if fresh:
                return row, False, "A submission for this invoice is already in progress."
            # The earlier attempt died mid-flight — we can't know whether FBR got it.
            row.status = FBRInvoice.Status.UNKNOWN
            row.error_category = "interrupted"
            row.error_message = "An earlier submission was interrupted; FBR may or may not have received it."
            row.save()

        if row.status == FBRInvoice.Status.UNKNOWN and not allow_unknown_retry:
            return row, False, ("The last attempt may have reached FBR. Check the invoice in FBR, "
                                "then confirm to submit again.")

        if row.last_attempt_at is not None:
            row.retry_count += 1
        row.status = FBRInvoice.Status.PENDING
        row.last_attempt_at = now
        row.payload_hash = payload_fingerprint(payload)
        row.request_payload = payload
        row.error_category = ""
        row.error_code = ""
        row.error_message = ""
        row.save()
        return row, True, ""


def _record_result(row_id, res):
    with transaction.atomic():
        row = FBRInvoice.objects.select_for_update().get(pk=row_id)
        row.http_status = res.http_status
        S = FBRInvoice.Status
        # Keep the trace of an earlier sandbox test copy when the real response replaces the body.
        archived = (row.response_data or {}).get("previous_sandbox")

        if res.category == "ok":
            verdict = interpret_response(res.data)
            row.response_data = res.data if isinstance(res.data, dict) else {}
            if verdict["success"] and verdict["invoice_number"]:
                row.status = S.SUBMITTED
                row.fbr_invoice_number = verdict["invoice_number"]
                row.submitted_at = timezone.now()
                row.error_category = row.error_code = row.error_message = ""
            elif verdict["success"]:
                # Reported valid but gave no invoice number: can't tell what FBR stored.
                row.status = S.UNKNOWN
                row.error_category = "no_invoice_number"
                row.error_message = "FBR reported success but returned no invoice number."
            else:
                row.status = S.FAILED
                row.error_category = "rejected"
                row.error_code = verdict["error_code"][:20]
                row.error_message = verdict["error"] or "FBR rejected the invoice."
        elif res.category in ("timeout", "disconnected", "bad_response"):
            row.status = S.UNKNOWN
            row.error_category = res.category
            row.error_message = res.message
        else:  # auth, http_error, network — FBR did not accept anything
            row.status = S.FAILED
            row.error_category = res.category
            row.error_message = res.message
            if res.category == "auth":
                row.error_message += " — check the API token and that it belongs to this seller NTN."
        if archived and isinstance(row.response_data, dict):
            row.response_data = {**row.response_data, "previous_sandbox": archived}
        row.save()
        return row


def submit_sale(sale, *, allow_unknown_retry=False) -> dict:
    """Submits one sale to FBR. Never raises for FBR/network trouble."""
    cfg = FBRSettings.load()
    ensure_ready(cfg)

    try:
        payload = build_payload(sale, cfg)
    except MappingError as exc:
        row = _record_missing_data(sale, cfg, exc)
        return _result(row, cfg, ok=False, reason="; ".join(exc.problems))

    row, proceed, reason = _claim(sale, cfg, payload, allow_unknown_retry)
    if not proceed:
        return _result(row, cfg, ok=row.status == FBRInvoice.Status.SUBMITTED, reason=reason)

    client = FBRClient(cfg.get_token(), timeout=cfg.request_timeout_seconds)
    try:
        res = client.post_invoice(cfg.post_url, payload)
    except Exception:  # noqa: BLE001 — a client bug must not leave the row stuck on PENDING
        logger.exception("FBR client crashed sale_id=%s", sale.pk)
        from .client import ClientResult
        res = ClientResult(category="disconnected", message="Unexpected error while contacting FBR",
                           outcome_unknown=True)

    row = _record_result(row.pk, res)
    logger.info("FBR submit sale_id=%s invoice=%s status=%s http=%s category=%s code=%s",
                sale.pk, sale.invoice_number, row.status, row.http_status,
                row.error_category or "-", row.error_code or "-")
    return _result(row, cfg, ok=row.status == FBRInvoice.Status.SUBMITTED)


def _record_missing_data(sale, cfg, exc):
    """Missing HS code etc. — nothing was sent, so this is a plain FAILED the user can fix and retry."""
    with transaction.atomic():
        row = FBRInvoice.objects.select_for_update().filter(sale=sale).first()
        if row and row.status in (FBRInvoice.Status.SUBMITTED, FBRInvoice.Status.UNKNOWN,
                                  FBRInvoice.Status.PENDING) and row.is_sandbox == cfg.is_sandbox:
            return row  # never downgrade a record that may exist at FBR
        if row is None:
            row = FBRInvoice(sale=sale, local_invoice_number=sale.invoice_number)
        row.is_sandbox = cfg.is_sandbox
        row.status = FBRInvoice.Status.FAILED
        row.error_category = "missing_data"
        row.error_code = ""
        row.error_message = "; ".join(exc.problems)[:2000]
        row.last_attempt_at = timezone.now()
        row.save()
        return row


def validate_sale(sale) -> dict:
    """Dry run against FBR's validate endpoint. Stores nothing."""
    cfg = FBRSettings.load()
    ensure_ready(cfg)
    try:
        payload = build_payload(sale, cfg)
    except MappingError as exc:
        return {"ok": False, "stage": "local", "problems": exc.problems}
    res = FBRClient(cfg.get_token(), timeout=cfg.request_timeout_seconds).validate_invoice(cfg.validate_url, payload)
    if res.category != "ok":
        return {"ok": False, "stage": "network", "problems": [res.message]}
    verdict = interpret_response(res.data)
    return {"ok": verdict["success"], "stage": "fbr",
            "problems": [verdict["error"]] if verdict["error"] else []}


def test_connection() -> dict:
    cfg = FBRSettings.load()
    if not cfg.token_configured:
        return {"ok": False, "message": "No API token saved yet."}
    res = FBRClient(cfg.get_token(), timeout=cfg.request_timeout_seconds).get_reference("provinces")
    if res.category == "ok" and isinstance(res.data, list):
        return {"ok": True, "message": "Connected to FBR — token accepted."}
    if res.category == "auth":
        return {"ok": False, "message": "FBR rejected the token (401). Check the token."}
    return {"ok": False, "message": res.message or "Could not reach FBR."}


# ----------------------------------------------------------------------
# status for the UI
# ----------------------------------------------------------------------
def _current_env_row(sale, cfg):
    row = FBRInvoice.objects.filter(sale=sale).first()
    return row


def status_for_sale(sale, *, detailed=False) -> dict:
    cfg = FBRSettings.load()
    base = {
        "enabled": cfg.is_enabled,
        "environment": cfg.environment,
        "sale_id": sale.pk,
        "local_invoice_number": sale.invoice_number,
        "sale_eligible": sale.status in ELIGIBLE_STATUSES,
    }
    if not cfg.is_enabled:
        return {**base, "status": "disabled", "can_submit": False, "can_retry": False}

    row = _current_env_row(sale, cfg)
    other_env = bool(row and row.is_sandbox != cfg.is_sandbox)

    if row is None or other_env:
        out = {**base, "status": "not_submitted", "fbr_invoice_number": "", "submitted_at": None,
               "retry_count": 0, "message": "", "needs_review": False,
               "can_submit": base["sale_eligible"], "can_retry": False}
        if other_env and row.is_sandbox:
            out["note"] = "Only a sandbox test copy exists; nothing has been sent to production."
        return out

    S = FBRInvoice.Status
    modified = None
    if row.status == S.SUBMITTED and sale.status in ELIGIBLE_STATUSES:
        try:
            modified = payload_fingerprint(build_payload(sale, cfg)) != row.payload_hash
        except MappingError:
            modified = None
    elif row.status == S.SUBMITTED:
        modified = True   # returned / cancelled after FBR accepted it

    out = {
        **base,
        "status": row.status,
        "fbr_invoice_number": row.fbr_invoice_number,
        "submitted_at": row.submitted_at,
        "retry_count": row.retry_count,
        "needs_review": row.status == S.UNKNOWN,
        "modified_since_submission": modified,
        "can_submit": False,
        "can_retry": row.status in (S.FAILED, S.UNKNOWN) and base["sale_eligible"],
    }
    if row.status == S.SUBMITTED:
        out["message"] = ""
        if modified:
            out["warning"] = ("This invoice was changed or reversed after FBR accepted it. "
                              "FBR still holds the original version.")
    elif row.status == S.PENDING:
        out["message"] = "Submission in progress."
    elif row.status == S.UNKNOWN:
        out["message"] = "FBR may have received this invoice. A manager must review it before re-sending."
    else:
        out["message"] = GENERIC_FAILURE
    if detailed and row.status in (S.FAILED, S.UNKNOWN):
        out["details"] = {"category": row.error_category, "code": row.error_code,
                          "error": row.error_message, "http_status": row.http_status}
    return out


def _result(row, cfg, ok, reason=""):
    out = {"success": ok, "status": row.status, "fbr_invoice_number": row.fbr_invoice_number,
           "submitted_at": row.submitted_at, "message": reason or (GENERIC_FAILURE if not ok else ""),
           "sale_id": row.sale_id, "local_invoice_number": row.local_invoice_number}
    if not ok and row.status in (FBRInvoice.Status.FAILED, FBRInvoice.Status.UNKNOWN):
        out["details"] = {"category": row.error_category, "code": row.error_code,
                          "error": row.error_message, "http_status": row.http_status}
    return out


# ----------------------------------------------------------------------
# optional background sweep (management command)
# ----------------------------------------------------------------------
def submit_pending_sales(limit=50) -> dict:
    cfg = FBRSettings.load()
    if not (cfg.is_enabled and cfg.auto_submit_enabled and cfg.auto_submit_from):
        return {"skipped": True, "reason": "FBR or auto-submit is off", "submitted": 0, "failed": 0}
    ensure_ready(cfg)

    S = FBRInvoice.Status
    now = timezone.now()
    qs = (Sale.objects.filter(status__in=ELIGIBLE_STATUSES, created_at__gte=cfg.auto_submit_from)
          .exclude(fbr_invoice__status__in=[S.SUBMITTED, S.UNKNOWN, S.PENDING],
                   fbr_invoice__is_sandbox=cfg.is_sandbox)
          .order_by("id"))
    done = failed = skipped = 0
    for sale in qs[: limit * 4]:
        if done + failed >= limit:
            break
        row = FBRInvoice.objects.filter(sale=sale).first()
        if row and row.is_sandbox == cfg.is_sandbox and row.status == S.FAILED:
            if row.retry_count + 1 >= AUTO_RETRY_MAX:
                skipped += 1
                continue
            if row.last_attempt_at and now - row.last_attempt_at < AUTO_RETRY_WAIT:
                skipped += 1
                continue
        result = submit_sale(sale)
        if result["success"]:
            done += 1
        else:
            failed += 1
    return {"skipped": False, "submitted": done, "failed": failed, "left_for_later": skipped}
