from django.core.management.base import BaseCommand

from apps.backups.services import create_backup, is_auto_backup_due


class Command(BaseCommand):
    help = (
        "Creates a full data backup (.zip of a dumpdata JSON export) if one is "
        "due per CompanySettings.auto_backup_enabled / backup_frequency_days. "
        "Intended to be run on a schedule (e.g. a Railway Cron Job service) — "
        "safe to call daily, since it no-ops on days a backup isn't due yet."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--force", action="store_true",
            help="Create a backup right now regardless of the due-date check.",
        )

    def handle(self, *args, **options):
        if not options["force"] and not is_auto_backup_due():
            self.stdout.write("No backup due yet — skipping.")
            return

        backup = create_backup(is_automatic=True)
        self.stdout.write(self.style.SUCCESS(
            f"Backup created: {backup.file.name} ({backup.size_display})"
        ))
