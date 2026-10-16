from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("settings", "0003_companysettings_distributor_address_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="companysettings",
            name="general_auth_password",
            field=models.CharField(blank=True, default="", max_length=128),
        ),
    ]