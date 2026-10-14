from django.core.management.base import BaseCommand

from apps.fbr.services import submit_pending_sales


class Command(BaseCommand):
    help = (
        "Submits completed sales to FBR when FBR integration AND auto-submit are "
        "switched on in FBR settings. Only sales created after auto-submit was "
        "enabled are considered. Safe to run every few minutes (e.g. a cron job); "
        "it never re-posts a submitted invoice and never touches 'needs review' ones."
    )

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=50, help="Max invoices per run.")

    def handle(self, *args, **options):
        result = submit_pending_sales(limit=options["limit"])
        if result.get("skipped"):
            self.stdout.write(f"Skipped: {result['reason']}")
        else:
            self.stdout.write(
                f"Submitted {result['submitted']}, failed {result['failed']}, "
                f"left for later {result['left_for_later']}."
            )
