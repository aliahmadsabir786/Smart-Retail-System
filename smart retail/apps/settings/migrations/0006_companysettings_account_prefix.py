from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("settings", "0005_companysettings_show_invoice_qr"),
    ]

    operations = [
        migrations.AddField(
            model_name="companysettings",
            name="account_prefix",
            field=models.CharField(default="ACC-", max_length=10),
        ),
    ]