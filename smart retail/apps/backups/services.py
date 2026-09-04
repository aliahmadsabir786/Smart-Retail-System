import io
import json
import zipfile
from datetime import timedelta

from django.core.files.base import ContentFile
from django.core.management import call_command
from django.utils import timezone

from .models import Backup

# Every app whose data actually matters for a business backup — deliberately
# excludes Django's own housekeeping tables (sessions, admin log, content
# types, permissions) since those are auto-regenerated and would just bloat
# the archive. "authentication" IS included so user accounts (password
# hashes, roles) are recoverable too, not just business data.
BACKUP_APPS = [
    "authentication",
    "warehouse", "categories", "brands", "products", "inventory",
    "customers", "suppliers", "sales", "purchase", "expenses",
    "finance", "routes", "settings",
]

# Keep only the most recent N backups (manual + automatic combined) — an
# unbounded backups/ folder would otherwise grow forever on a small
# Railway disk. 12 comfortably covers a year of monthly auto-backups plus
# some manual ones.
RETENTION_COUNT = 12


def create_backup(user=None, is_automatic=False, notes=""):
    """
    Dumps every app in BACKUP_APPS via Django's `dumpdata` into one JSON
    file, wraps it (with a small manifest) into a .zip, and saves it as a
    Backup record. Also prunes old backups beyond RETENTION_COUNT.
    """
    buffer = io.StringIO()
    call_command("dumpdata", *BACKUP_APPS, indent=2, stdout=buffer)
    data_json = buffer.getvalue()

    timestamp = timezone.now()
    manifest = {
        "created_at": timestamp.isoformat(),
        "is_automatic": is_automatic,
        "apps": BACKUP_APPS,
    }

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("data.json", data_json)
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))
    zip_bytes = zip_buffer.getvalue()

    filename = f"backup_{timestamp:%Y%m%d_%H%M%S}.zip"
    backup = Backup(
        is_automatic=is_automatic, notes=notes,
        created_by=user, size_bytes=len(zip_bytes),
    )
    backup.file.save(filename, ContentFile(zip_bytes), save=False)
    backup.save()

    _prune_old_backups()
    return backup


def _prune_old_backups():
    stale = Backup.objects.order_by("-created_at")[RETENTION_COUNT:]
    for old in stale:
        old.file.delete(save=False)
        old.delete()


def is_auto_backup_due():
    """
    Used by the `run_backup` management command so a Railway Cron Job can
    call it daily/weekly without spamming duplicate backups — it only
    actually creates one if CompanySettings.auto_backup_enabled is on AND
    enough days have passed since the last automatic backup (e.g. 30 days
    for a monthly cadence, configured via backup_frequency_days).
    """
    from apps.settings.models import CompanySettings

    settings_row = CompanySettings.objects.first()
    if not settings_row or not settings_row.auto_backup_enabled:
        return False

    last_auto = Backup.objects.filter(is_automatic=True).order_by("-created_at").first()
    if not last_auto:
        return True

    return timezone.now() - last_auto.created_at >= timedelta(days=settings_row.backup_frequency_days)
