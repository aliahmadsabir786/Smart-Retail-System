from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="sale",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("completed", "Completed"),
                    ("cancelled", "Cancelled"),
                    ("returned", "Returned"),
                    ("partially_returned", "Partially Returned"),
                    ("edited", "Edited"),
                ],
                default="completed",
                max_length=20,
            ),
        ),
    ]