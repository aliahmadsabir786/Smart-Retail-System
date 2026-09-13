from django.core.management.base import BaseCommand
from django.db import transaction
from apps.authentication.models import User, Role


class Command(BaseCommand):
    help = "Seeds the database with a super admin and one demo user per role."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset", action="store_true",
            help="Delete the existing seeded demo accounts (by email) before creating fresh ones.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        demo_users = [
            ("zubairtrader", "Admin123", Role.SUPER_ADMIN, "Super", "Admin", True),
            ("manager@smartretail.com", "Manager123!", Role.MANAGER, "Store", "Manager", False),
            ("cashier@smartretail.com", "Cashier123!", Role.CASHIER, "Front", "Cashier", False),
            ("sales@smartretail.com", "Sales123!", Role.SALESPERSON, "Sam", "Sales", False),
            ("inventory@smartretail.com", "Inventory123!", Role.INVENTORY_MANAGER, "Ivy", "Inventory", False),
            ("customer@smartretail.com", "Customer123!", Role.CUSTOMER, "Cindy", "Customer", False),
        ]

        if options["reset"]:
            emails = [email for email, *_ in demo_users]
            deleted_count, _ = User.objects.filter(email__in=emails).delete()
            self.stdout.write(self.style.WARNING(f"Deleted {deleted_count} existing seeded account(s)."))

        for email, password, role, first, last, is_super in demo_users:
            if User.objects.filter(email=email).exists():
                self.stdout.write(self.style.WARNING(f"Skipping existing user: {email}"))
                continue

            if is_super:
                user = User.objects.create_superuser(email=email, password=password,
                                                       first_name=first, last_name=last, role=role)
            else:
                user = User.objects.create_user(email=email, password=password,
                                                  first_name=first, last_name=last, role=role)
                user.is_verified = True
                user.save()

            self.stdout.write(self.style.SUCCESS(f"Created {role} user: {email} / {password}"))

        self.stdout.write(self.style.SUCCESS("Seeding complete."))