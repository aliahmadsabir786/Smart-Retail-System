from django.db import migrations, models


def backfill_is_credit(apps, schema_editor):
    """Best-effort label for bills that already existed before this field:
    under the old behaviour a cash bill was always paid in full immediately,
    so anything left UNPAID/PARTIAL was — as far as we can tell now — a
    credit bill. Anything already PAID is left as is_credit=False (cash),
    which is right for old auto-settled cash bills and harmless for an old
    credit bill that has since been fully collected."""
    Sale = apps.get_model("sales", "Sale")
    Sale.objects.exclude(payment_status="paid").update(is_credit=True)


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0004_payment_customer_collection"),
    ]

    operations = [
        migrations.AddField(
            model_name="sale",
            name="is_credit",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(backfill_is_credit, migrations.RunPython.noop),
    ]