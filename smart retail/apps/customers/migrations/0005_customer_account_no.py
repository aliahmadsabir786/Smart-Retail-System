from django.db import migrations, models


def backfill_account_no(apps, schema_editor):
    # Every customer that already exists keeps exactly the number it was showing: ACC-0001, ACC-0002 ...
    Customer = apps.get_model("customers", "Customer")
    for c in Customer.objects.filter(account_no=""):
        Customer.objects.filter(pk=c.pk).update(account_no=f"ACC-{c.pk:04d}")


class Migration(migrations.Migration):

    dependencies = [
        ("customers", "0004_advanceclearance_created_by_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="customer",
            name="account_no",
            field=models.CharField(blank=True, db_index=True, default="", max_length=20),
        ),
        migrations.RunPython(backfill_account_no, migrations.RunPython.noop),
    ]