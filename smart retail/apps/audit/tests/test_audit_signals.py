import pytest
from apps.categories.models import Category
from apps.warehouse.models import Warehouse
from apps.audit.models import AuditLog

pytestmark = pytest.mark.django_db


class TestAuditLogSignals:
    def test_warehouse_create_is_logged(self):
        warehouse = Warehouse.objects.create(name="Depot", code="DPT-1")
        log = AuditLog.objects.filter(object_id=str(warehouse.pk),
                                       content_type__model="warehouse").first()
        assert log is not None
        assert log.action == AuditLog.Action.CREATE
        assert log.changes["code"] == "DPT-1"

    def test_warehouse_update_is_logged(self):
        warehouse = Warehouse.objects.create(name="Depot", code="DPT-2")
        warehouse.name = "Depot Updated"
        warehouse.save()

        update_logs = AuditLog.objects.filter(object_id=str(warehouse.pk),
                                               content_type__model="warehouse",
                                               action=AuditLog.Action.UPDATE)
        assert update_logs.exists()

    def test_untracked_model_is_not_logged(self):
        Category.objects.create(name="Untracked Test")
        # Category is not in TRACKED_MODEL_PATHS
        assert not AuditLog.objects.filter(content_type__model="category").exists()
