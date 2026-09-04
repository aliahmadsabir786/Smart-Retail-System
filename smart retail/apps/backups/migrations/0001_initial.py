import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Backup",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("file", models.FileField(upload_to="backups/")),
                ("size_bytes", models.PositiveBigIntegerField(default=0)),
                ("is_automatic", models.BooleanField(
                    default=False,
                    help_text="True if created by the scheduled run_backup command, False if triggered manually from Settings.",
                )),
                ("notes", models.CharField(blank=True, max_length=255)),
                ("created_by", models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name="%(class)s_created", to=settings.AUTH_USER_MODEL,
                )),
                ("updated_by", models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name="%(class)s_updated", to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                "db_table": "backup",
                "ordering": ["-created_at"],
            },
        ),
    ]
