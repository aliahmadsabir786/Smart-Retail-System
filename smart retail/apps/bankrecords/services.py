"""Business rules for the Banking Records register.

Only record-keeping: nothing here touches customers, suppliers, invoices,
sales, purchases or balances.
"""
import os
import re
from collections import OrderedDict, defaultdict
from datetime import date as date_cls
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.core.exceptions import ServiceException
from .models import (
    ActivityStatus, ActivityType, BankActivity, BankActivityChange, BankAttachment,
    ReferenceCounter, REFERENCE_PREFIX, VOID_STATUSES,
)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_EXT = {".jpg": "jpg", ".jpeg": "jpg", ".png": "png", ".pdf": "pdf"}
_SIGNATURES = {"jpg": (b"\xff\xd8\xff",), "png": (b"\x89PNG\r\n\x1a\n",), "pdf": (b"%PDF-",)}

# Fields whose changes are written to the audit trail.
TRACKED_FIELDS = [
    "date", "time", "from_account", "to_account", "recipient", "recipient_name", "recipient_bank",
    "recipient_account_title", "recipient_account_number", "recipient_iban", "amount",
    "payment_method", "bank_reference", "slip_number", "purpose", "description", "notes",
]

ALLOWED_TRANSITIONS = {
    ActivityStatus.PENDING: {ActivityStatus.COMPLETED, ActivityStatus.RECORDED, ActivityStatus.CANCELLED},
    ActivityStatus.RECORDED: {ActivityStatus.COMPLETED, ActivityStatus.CANCELLED, ActivityStatus.REVERSED},
    ActivityStatus.COMPLETED: {ActivityStatus.CANCELLED, ActivityStatus.REVERSED},
    ActivityStatus.CANCELLED: set(),
    ActivityStatus.REVERSED: set(),
}


def _text(value):
    if value is None:
        return ""
    if hasattr(value, "pk"):
        return str(value.pk)
    if isinstance(value, Decimal):
        return f"{value:.2f}"      # 50000 and 50000.00 are the same amount, not a "change"
    return str(value)


# ───────────────────────── create / update / status ─────────────────────────

def _fill_recipient_snapshot(data):
    """Copy the saved contact's details into the record (a snapshot — editing
    the contact later must never rewrite history). Anything typed wins."""
    contact = data.get("recipient")
    if not contact:
        return
    snap = {
        "recipient_name": contact.name,
        "recipient_bank": contact.bank_name,
        "recipient_account_title": contact.account_title,
        "recipient_account_number": contact.account_number,
        "recipient_iban": contact.iban,
    }
    for key, value in snap.items():
        if not (data.get(key) or "").strip():
            data[key] = value


@transaction.atomic
def create_activity(user, data):
    data = dict(data)
    _fill_recipient_snapshot(data)
    prefix = REFERENCE_PREFIX[data["activity_type"]]
    activity = BankActivity(**data)
    activity.system_reference = ReferenceCounter.next(prefix)
    activity.created_by = user
    activity.updated_by = user
    activity.save()
    return activity


@transaction.atomic
def update_activity(activity, user, data, reason=""):
    if activity.status in VOID_STATUSES:
        raise ServiceException("A cancelled or reversed record can't be edited — it is kept as history.")
    data = dict(data)
    data.pop("activity_type", None)          # the type (and its reference prefix) never changes
    data.pop("status", None)                  # status has its own endpoint
    if "recipient" in data and data["recipient"] and data["recipient"] != activity.recipient:
        _fill_recipient_snapshot(data)

    diffs = []
    for field in TRACKED_FIELDS:
        if field not in data:
            continue
        old, new = getattr(activity, field), data[field]
        if _text(old) != _text(new):
            diffs.append((field, _text(old), _text(new)))
    if not diffs:
        return activity

    reason = (reason or "").strip()
    if activity.status == ActivityStatus.COMPLETED and not reason:
        raise ServiceException("A reason is required to change a completed record.")

    for field, value in data.items():
        setattr(activity, field, value)
    activity.updated_by = user
    activity.save()
    BankActivityChange.objects.bulk_create([
        BankActivityChange(activity=activity, field=f, old_value=o, new_value=n, reason=reason, changed_by=user)
        for f, o, n in diffs
    ])
    return activity


@transaction.atomic
def change_status(activity, user, new_status, reason=""):
    reason = (reason or "").strip()
    current = ActivityStatus(activity.status)
    try:
        target = ActivityStatus(new_status)
    except ValueError:
        raise ServiceException("Unknown status.")
    if target == current:
        return activity
    if target not in ALLOWED_TRANSITIONS[current]:
        raise ServiceException(f"A {current.label} record can't be changed to {target.label}.")
    if target in VOID_STATUSES and not reason:
        raise ServiceException(f"A reason is required to mark a record as {target.label}.")

    old = activity.status
    activity.status = target
    activity.status_reason = reason if target in VOID_STATUSES else activity.status_reason
    activity.status_changed_by = user
    activity.status_changed_at = timezone.now()
    activity.updated_by = user
    activity.save()
    BankActivityChange.objects.create(
        activity=activity, field="status", old_value=old, new_value=target.value,
        reason=reason, changed_by=user)
    return activity


# ───────────────────────────── attachments ──────────────────────────────

def validate_upload(upload):
    ext = os.path.splitext(upload.name or "")[1].lower()
    if ext not in ALLOWED_EXT:
        raise ServiceException("Only JPG, JPEG, PNG or PDF files are allowed.")
    if upload.size > MAX_UPLOAD_BYTES:
        raise ServiceException("File is too large (maximum 10 MB).")
    kind = ALLOWED_EXT[ext]
    head = upload.read(8)
    upload.seek(0)
    if not any(head.startswith(sig) for sig in _SIGNATURES[kind]):
        raise ServiceException(f"'{upload.name}' is not a genuine {kind.upper()} file.")
    return kind


@transaction.atomic
def add_attachments(activity, user, files, kind="slip"):
    created = []
    for upload in files:
        file_type = validate_upload(upload)
        created.append(BankAttachment.objects.create(
            activity=activity, file=upload, original_name=os.path.basename(upload.name)[:255],
            file_type=file_type, file_size=upload.size, kind=kind, created_by=user, updated_by=user))
    if created:
        BankActivityChange.objects.create(
            activity=activity, field="attachments", old_value="",
            new_value=", ".join(a.original_name for a in created), reason="Attachment added", changed_by=user)
    return created


def process_logo(upload, max_bytes=2 * 1024 * 1024):
    """Validate an uploaded bank logo and return it as a small PNG data URL."""
    import base64
    import io
    from PIL import Image

    if upload.size > max_bytes:
        raise ServiceException("Logo is too large (maximum 2 MB).")
    try:
        probe = Image.open(upload)
        probe.verify()
        upload.seek(0)
        img = Image.open(upload)
        fmt = img.format
        if fmt not in ("PNG", "JPEG", "WEBP"):
            raise ServiceException("Logo must be a PNG, JPG or WebP image.")
        img = img.convert("RGBA")
    except ServiceException:
        raise
    except Exception:
        raise ServiceException("That file is not a valid image.")
    img.thumbnail((160, 160))
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


# ───────────────────────────── filtering ────────────────────────────────

def _to_decimal(raw):
    try:
        value = Decimal(str(raw).replace(",", "").replace("Rs.", "").strip())
    except (InvalidOperation, ValueError):
        return None
    # "NaN" / "Infinity" parse as Decimals but must never reach the database.
    return value if value.is_finite() and abs(value) < Decimal("1e13") else None


def filter_activities(qs, p):
    """Apply the register's filters. `p` is a dict-like of query params."""
    get = lambda k: (p.get(k) or "").strip()

    if get("date_from"):
        qs = qs.filter(date__gte=get("date_from"))
    if get("date_to"):
        qs = qs.filter(date__lte=get("date_to"))
    if get("bank"):
        qs = qs.filter(Q(from_account__bank_id=get("bank")) | Q(to_account__bank_id=get("bank")))
    if get("account"):
        qs = qs.filter(Q(from_account_id=get("account")) | Q(to_account_id=get("account")))
    if get("from_account"):
        qs = qs.filter(from_account_id=get("from_account"))
    if get("type"):
        qs = qs.filter(activity_type=get("type"))
    if get("method"):
        qs = qs.filter(payment_method=get("method"))
    if get("status"):
        qs = qs.filter(status=get("status"))
    if get("recipient"):
        qs = qs.filter(recipient_id=get("recipient"))
    if get("recipient_q"):
        r = get("recipient_q")
        qs = qs.filter(Q(recipient_name__icontains=r) | Q(recipient__name__icontains=r)
                       | Q(recipient__company_name__icontains=r))
    if get("slip"):
        qs = qs.filter(slip_number__icontains=get("slip"))
    if get("reference"):
        r = get("reference")
        qs = qs.filter(Q(system_reference__icontains=r) | Q(bank_reference__icontains=r))
    if get("amount"):
        amt = _to_decimal(get("amount"))
        if amt is not None:
            qs = qs.filter(amount=amt)
    if get("has_slip") == "1":
        qs = qs.exclude(slip_number="")
    if get("has_attachment") in ("0", "1"):
        qs = qs.filter(attachments__is_deleted=False).distinct() if get("has_attachment") == "1" \
            else qs.exclude(attachments__is_deleted=False)

    q = get("q")
    if q:
        cond = (Q(recipient_name__icontains=q) | Q(recipient__name__icontains=q)
                | Q(recipient__company_name__icontains=q) | Q(recipient_bank__icontains=q)
                | Q(recipient_account_title__icontains=q) | Q(recipient_account_number__icontains=q)
                | Q(from_account__bank__name__icontains=q) | Q(to_account__bank__name__icontains=q)
                | Q(from_account__account_number__icontains=q) | Q(to_account__account_number__icontains=q)
                | Q(from_account__account_title__icontains=q) | Q(to_account__account_title__icontains=q)
                | Q(slip_number__icontains=q) | Q(bank_reference__icontains=q)
                | Q(system_reference__icontains=q) | Q(description__icontains=q)
                | Q(purpose__icontains=q) | Q(notes__icontains=q))
        amt = _to_decimal(q)
        if amt is not None:
            cond |= Q(amount=amt)
        qs = qs.filter(cond)

    sort = get("sort")
    order = {"newest": ("-date", "-time", "-id"), "oldest": ("date", "time", "id"),
             "highest": ("-amount", "-date", "-id"), "lowest": ("amount", "date", "id")}.get(sort)
    return qs.order_by(*order) if order else qs


# ───────────────────────── labels / rows (export, print) ─────────────────────

def account_label(account):
    return f"{account.account_title} ({account.masked_account_number}) — {account.bank.name}" if account else ""


def activity_row(a):
    """One register line. Only MASKED account numbers ever leave through exports."""
    if a.activity_type == ActivityType.DEPOSIT:
        frm, to = "Cash / Depositor", account_label(a.to_account)
    elif a.activity_type == ActivityType.TRANSFER:
        frm, to = account_label(a.from_account), account_label(a.to_account)
    else:
        frm = account_label(a.from_account)
        to = a.recipient_name or (a.recipient.name if a.recipient else "")
    recipient_bank = a.recipient_bank
    if a.activity_type in (ActivityType.TRANSFER, ActivityType.DEPOSIT) and a.to_account:
        recipient_bank = a.to_account.bank.name
    return OrderedDict([
        ("date", a.date.strftime("%d-%b-%Y")),
        ("time", a.time.strftime("%I:%M %p")),
        ("type", a.get_activity_type_display()),
        ("from", frm),
        ("to", to),
        ("bank", recipient_bank),
        ("amount", f"{a.amount:.2f}"),
        ("slip_number", a.slip_number),
        ("system_reference", a.system_reference),
        ("bank_reference", a.bank_reference),
        ("purpose", a.purpose),
        ("notes", a.notes),
        ("status", a.get_status_display()),
    ])


# ───────────────────────────── summaries ────────────────────────────────

def _live(qs):
    return qs.exclude(status__in=[s.value for s in VOID_STATUSES])


def daily_summary(day, base_qs):
    """Activity counts/amounts for one day. Not revenue / expense / profit."""
    rows = list(_live(base_qs.filter(date=day)).select_related("from_account__bank", "to_account__bank"))
    totals = {t.value: {"count": 0, "amount": Decimal("0")} for t in ActivityType}
    per_account = OrderedDict()

    def slot(acc):
        return per_account.setdefault(acc.id, {
            "account": acc.id, "bank": acc.bank.name, "label": account_label(acc),
            "payments": Decimal("0"), "deposits": Decimal("0"), "transfers": Decimal("0"),
            "withdrawals": Decimal("0"), "count": 0})

    for a in rows:
        totals[a.activity_type]["count"] += 1
        totals[a.activity_type]["amount"] += a.amount
        touched = {x.id: x for x in (a.from_account, a.to_account) if x}
        for acc in touched.values():
            slot(acc)["count"] += 1
        if a.activity_type == ActivityType.PAYMENT and a.from_account:
            slot(a.from_account)["payments"] += a.amount
        elif a.activity_type == ActivityType.DEPOSIT and a.to_account:
            slot(a.to_account)["deposits"] += a.amount
        elif a.activity_type == ActivityType.TRANSFER and a.from_account:
            slot(a.from_account)["transfers"] += a.amount
        elif a.activity_type == ActivityType.WITHDRAWAL and a.from_account:
            slot(a.from_account)["withdrawals"] += a.amount

    s = lambda k: f"{totals[k]['amount']:.2f}"
    return {
        "date": str(day),
        "payments": s("payment"), "payments_count": totals["payment"]["count"],
        "deposits": s("deposit"), "deposits_count": totals["deposit"]["count"],
        "transfers": s("transfer"), "transfers_count": totals["transfer"]["count"],
        "withdrawals": s("withdrawal"), "withdrawals_count": totals["withdrawal"]["count"],
        "other": s("other"), "other_count": totals["other"]["count"],
        "total_activities": len(rows),
        "by_account": [{**v, **{k: f"{v[k]:.2f}" for k in ("payments", "deposits", "transfers", "withdrawals")}}
                       for v in per_account.values()],
    }


def build_report(kind, qs):
    rows = list(_live(qs).select_related("from_account__bank", "to_account__bank", "recipient")
                .prefetch_related("attachments"))
    zero = lambda: {"count": 0, "payments": Decimal("0"), "deposits": Decimal("0"),
                    "transfers": Decimal("0"), "withdrawals": Decimal("0")}

    def add(bucket, a):
        bucket["count"] += 1
        key = {"payment": "payments", "deposit": "deposits", "transfer": "transfers",
               "withdrawal": "withdrawals"}.get(a.activity_type)
        if key:
            bucket[key] += a.amount

    fmt = lambda b: {k: (f"{v:.2f}" if isinstance(v, Decimal) else v) for k, v in b.items()}

    if kind == "daily":
        buckets = defaultdict(zero)
        for a in rows:
            add(buckets[a.date], a)
        return [{"date": d.strftime("%d-%b-%Y"), **fmt(b)} for d, b in sorted(buckets.items(), reverse=True)]

    if kind == "monthly":
        buckets = defaultdict(zero)
        for a in rows:
            add(buckets[(a.date.year, a.date.month)], a)
        return [{"month": date_cls(y, m, 1).strftime("%B %Y"), **fmt(b)}
                for (y, m), b in sorted(buckets.items(), reverse=True)]

    if kind == "person":
        people = {}
        for a in rows:
            if a.activity_type != ActivityType.PAYMENT:
                continue
            name = a.recipient_name or (a.recipient.name if a.recipient else "—")
            key = a.recipient_id or f"n:{name.lower()}"
            p = people.setdefault(key, {"person": name, "count": 0, "total": Decimal("0"), "last": a.date})
            p["count"] += 1
            p["total"] += a.amount
            p["last"] = max(p["last"], a.date)
        return [{"person": p["person"], "payments": p["count"], "total_amount": f"{p['total']:.2f}",
                 "last_payment_date": p["last"].strftime("%d-%b-%Y")}
                for p in sorted(people.values(), key=lambda x: x["last"], reverse=True)]

    if kind == "bank":
        buckets = {}
        for a in rows:
            for acc in {x.id: x for x in (a.from_account, a.to_account) if x}.values():
                b = buckets.setdefault(acc.id, {"label": account_label(acc), **zero()})
                b["count"] += 1
            if a.activity_type == ActivityType.PAYMENT and a.from_account:
                buckets[a.from_account.id]["payments"] += a.amount
            elif a.activity_type == ActivityType.DEPOSIT and a.to_account:
                buckets[a.to_account.id]["deposits"] += a.amount
            elif a.activity_type == ActivityType.TRANSFER and a.from_account:
                buckets[a.from_account.id]["transfers"] += a.amount
            elif a.activity_type == ActivityType.WITHDRAWAL and a.from_account:
                buckets[a.from_account.id]["withdrawals"] += a.amount
        return [fmt(b) for b in buckets.values()]

    if kind == "slips":
        out = []
        for a in rows:
            if not a.slip_number:
                continue
            r = activity_row(a)
            out.append({"slip_number": a.slip_number, "date": r["date"], "bank": r["from"] or r["to"],
                        "amount": r["amount"], "recipient": r["to"], "reference": a.bank_reference or a.system_reference,
                        "attachment": "Attached" if any(not x.is_deleted for x in a.attachments.all()) else "Missing"})
        return out

    raise ServiceException("Unknown report type.")