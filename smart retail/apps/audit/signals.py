import datetime
import decimal
from django.db.models.signals import post_save, post_delete
from django.contrib.contenttypes.models import ContentType

from .middleware import get_current_user
from .models import AuditLog

# Models whose CRUD activity gets logged. Kept to business-critical entities —
# high-volume append-only ledgers (StockTransaction, UserActivityLog) already
# ARE audit trails themselves and don't need a second one layered on top.
TRACKED_MODEL_PATHS = [
    "apps.products.models.Product",
    "apps.sales.models.Sale",
    "apps.purchase.models.PurchaseOrder",
    "apps.customers.models.Customer",
    "apps.suppliers.models.Supplier",
    "apps.expenses.models.Expense",
    "apps.warehouse.models.Warehouse",
]

SNAPSHOT_EXCLUDE_FIELDS = {"password"}


_JSON_PRIMITIVES = (str, int, float, bool, type(None))


def _serializable_value(value):
    if isinstance(value, _JSON_PRIMITIVES):
        return value
    if isinstance(value, decimal.Decimal):
        return str(value)
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        return value.isoformat()
    # FieldFile (Image/FileField), UUID, and anything else not natively
    # JSON-serializable — fall back to its string form.
    return str(value) if value else None


def _snapshot(instance):
    data = {}
    for field in instance._meta.fields:
        if field.name in SNAPSHOT_EXCLUDE_FIELDS or field.is_relation:
            continue
        data[field.name] = _serializable_value(getattr(instance, field.name))
    return data


def _log(instance, action):
    AuditLog.objects.create(
        user=get_current_user() if get_current_user() and get_current_user().is_authenticated else None,
        action=action,
        content_type=ContentType.objects.get_for_model(instance.__class__),
        object_id=str(instance.pk),
        object_repr=str(instance)[:255],
        changes=_snapshot(instance),
    )


def make_save_handler():
    def handler(sender, instance, created, **kwargs):
        _log(instance, AuditLog.Action.CREATE if created else AuditLog.Action.UPDATE)
    return handler


def make_delete_handler():
    def handler(sender, instance, **kwargs):
        _log(instance, AuditLog.Action.DELETE)
    return handler


def _connect():
    from django.apps import apps as django_apps
    for path in TRACKED_MODEL_PATHS:
        app_label_path, model_name = path.rsplit(".", 1)
        try:
            model = django_apps.get_model(app_label_path.split(".")[1], model_name)
        except LookupError:
            continue
        post_save.connect(make_save_handler(), sender=model, weak=False,
                           dispatch_uid=f"audit_save_{path}")
        post_delete.connect(make_delete_handler(), sender=model, weak=False,
                             dispatch_uid=f"audit_delete_{path}")


_connect()
