from django.db import models
from apps.core.models import AuditModel


def backup_upload_path(instance, filename):
    return f"backups/{filename}"


class Backup(AuditModel):
    """
    One row per generated backup archive — a .zip containing a full JSON
    dump (via Django's `dumpdata`) of every business-data app (sales,
    customers, products, inventory, purchase orders, expenses, etc.) plus
    a small manifest. See services.BACKUP_APPS for exactly what's included.

    created_by (from AuditModel) is the admin who triggered a manual
    backup — null for one created automatically by the scheduled
    `run_backup` management command.
    """
    file = models.FileField(upload_to=backup_upload_path)
    size_bytes = models.PositiveBigIntegerField(default=0)
    is_automatic = models.BooleanField(
        default=False,
        help_text="True if created by the scheduled run_backup command, False if triggered manually from Settings.",
    )
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        db_table = "backup"
        ordering = ["-created_at"]

    def __str__(self):
        kind = "auto" if self.is_automatic else "manual"
        return f"Backup {self.created_at:%Y-%m-%d %H:%M} ({kind})"

    @property
    def size_display(self):
        size = float(self.size_bytes)
        for unit in ("B", "KB", "MB", "GB"):
            if size < 1024:
                return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} TB"
