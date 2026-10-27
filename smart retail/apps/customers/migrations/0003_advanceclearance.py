from decimal import Decimal
import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0002_customer_cnic"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AdvanceClearance",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("amount", models.DecimalField(decimal_places=2, max_digits=12,
                    validators=[django.core.validators.MinValueValidator(Decimal("0.01"))])),
                ("method", models.CharField(default="cash", max_length=20)),
                ("note", models.CharField(blank=True, max_length=200)),
                ("cleared_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    to=settings.AUTH_USER_MODEL)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,
                    related_name="advance_clearances", to="customers.customer")),
            ],
            options={"db_table": "customer_advance_clearance", "ordering": ["-created_at"]},
        ),
    ]