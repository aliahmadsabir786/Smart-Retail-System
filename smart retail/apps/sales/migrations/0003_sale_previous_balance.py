from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0002 sale status add edited"),
    ]

    operations = [
        migrations.AddField(
            model_name="sale",
            name="previous_balance",
            field=models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0")),
        ),
    ]