from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("settings", "0004_companysettings_general_auth_password"),
    ]

    operations = [
        migrations.AddField(
            model_name="companysettings",
            name="show_invoice_qr",
            field=models.BooleanField(default=True),
        ),
    ]