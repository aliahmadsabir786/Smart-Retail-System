import csv
import io
import mimetypes
from datetime import date as date_cls
from decimal import Decimal

from django.db.models import Q
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from rest_framework import mixins, status as http_status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.core.exceptions import ServiceException
from apps.core.permissions import IsAdminOrAbove, IsManagerOrAbove
from . import services
from .models import (
    ActivityType, Bank, BankAccount, BankActivity, BankActivityChange, BankAttachment,
    DailyVerification, PaymentContact, VOID_STATUSES,
)
from .serializers import (
    AttachmentSerializer, BankAccountDetailSerializer, BankAccountListSerializer, BankActivitySerializer,
    BankSerializer, ChangeSerializer, DailyVerificationSerializer, PaymentContactDetailSerializer,
    PaymentContactListSerializer,
)

EXPORT_LIMIT = 5000
EXPORT_COLUMNS = [
    ("date", "Date"), ("time", "Time"), ("type", "Type"), ("from", "From Account"), ("to", "To / Recipient"),
    ("bank", "Bank"), ("amount", "Amount"), ("slip_number", "Slip Number"),
    ("system_reference", "System Ref"), ("bank_reference", "Bank Reference"),
    ("purpose", "Purpose"), ("notes", "Notes"), ("status", "Status"),
]


def _company_header_flowables(styles):
    """Company name / address / contact (and logo) at the top of printed PDFs —
    the same details the invoices carry, taken from Company Settings."""
    from xml.sax.saxutils import escape
    from reportlab.lib import colors
    from reportlab.platypus import HRFlowable, Image, Paragraph, Spacer
    from apps.settings.models import CompanySettings

    cs = CompanySettings.load()
    out = []
    try:
        if cs.logo and cs.logo.path:
            from reportlab.lib.utils import ImageReader
            w, h = ImageReader(cs.logo.path).getSize()
            height = 38
            logo = Image(cs.logo.path, width=height * w / h, height=height)
            logo.hAlign = "LEFT"
            out.append(logo)
    except Exception:       # a missing / unreadable logo must never break the export
        pass
    out.append(Paragraph(f"<b>{escape(cs.company_name or '')}</b>", styles["Heading2"]))
    lines = [cs.address, " · ".join(x for x in (cs.phone, cs.email) if x),
             f"NTN/Tax ID: {cs.tax_id}" if cs.tax_id else ""]
    for line in lines:
        if line:
            out.append(Paragraph(escape(line.replace("\n", ", ")), styles["BodyText"]))
    out.append(Spacer(1, 4))
    out.append(HRFlowable(width="100%", thickness=1.2, color=colors.black))
    out.append(Spacer(1, 6))
    return out


class _Base(viewsets.ModelViewSet):
    """Shared rules: managers (and above) read + add; only admins edit.
    Nothing here is ever deleted — use status / cancel / reverse instead."""
    http_method_names = ["get", "post", "patch", "head", "options"]
    filter_backends = []

    def get_permissions(self):
        admin_actions = {"partial_update", "update", "status", "destroy_attachment"}
        return [(IsAdminOrAbove if self.action in admin_actions else IsManagerOrAbove)()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class BankViewSet(_Base):
    queryset = Bank.objects.all()
    serializer_class = BankSerializer
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    @action(detail=True, methods=["post"], url_path="logo")
    def logo(self, request, pk=None):
        """Set (multipart `file`) or remove (`remove=1`) the bank's logo."""
        bank = self.get_object()
        if str(request.data.get("remove", "")).lower() in ("1", "true", "yes"):
            bank.logo_data = ""
        else:
            upload = request.FILES.get("file")
            if not upload:
                raise ServiceException("Choose a logo image (PNG, JPG or WebP).")
            bank.logo_data = services.process_logo(upload)
        bank.updated_by = request.user
        bank.save()
        return Response(self.get_serializer(bank).data)


class BankAccountViewSet(_Base):
    queryset = BankAccount.objects.select_related("bank")

    def get_serializer_class(self):
        return BankAccountListSerializer if self.action == "list" else BankAccountDetailSerializer


class PaymentContactViewSet(_Base):
    queryset = PaymentContact.objects.all()

    def get_serializer_class(self):
        return PaymentContactListSerializer if self.action == "list" else PaymentContactDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        q = (self.request.query_params.get("q") or "").strip()
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(company_name__icontains=q) | Q(bank_name__icontains=q)
                           | Q(account_number__icontains=q) | Q(phone__icontains=q))
        return qs

    @action(detail=True, methods=["get"], url_path="history")
    def history(self, request, pk=None):
        """Every payment recorded for this person, newest first. A plain
        history — there is deliberately no balance / due / receivable here."""
        contact = self.get_object()
        qs = (BankActivity.objects.filter(Q(recipient=contact) | Q(recipient_name__iexact=contact.name),
                                           activity_type=ActivityType.PAYMENT)
              .select_related("from_account__bank", "to_account__bank", "recipient")
              .order_by("-date", "-time", "-id"))
        live = qs.exclude(status__in=[s.value for s in VOID_STATUSES])
        total = sum((a.amount for a in live), Decimal("0"))
        return Response({"success": True, "contact": PaymentContactListSerializer(contact).data,
                         "count": live.count(), "total": f"{total:.2f}",
                         "records": BankActivitySerializer(qs, many=True, context={"request": request, "view": self}).data})


class BankActivityViewSet(_Base):
    queryset = (BankActivity.objects
                .select_related("from_account__bank", "to_account__bank", "recipient", "created_by")
                .prefetch_related("attachments"))
    serializer_class = BankActivitySerializer
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action in ("list", "export", "reports"):
            qs = services.filter_activities(qs, self.request.query_params)
        return qs

    # ---- status: cancel / reverse / complete (with a reason) -----------------
    @action(detail=True, methods=["post"], url_path="status")
    def status(self, request, pk=None):
        activity = self.get_object()
        services.change_status(activity, request.user, request.data.get("status"), request.data.get("reason", ""))
        return Response(self.get_serializer(activity).data)

    # ---- attachments --------------------------------------------------------
    @action(detail=True, methods=["get", "post"], url_path="attachments")
    def attachments(self, request, pk=None):
        activity = self.get_object()
        if request.method == "POST":
            files = request.FILES.getlist("files") or request.FILES.getlist("file")
            if not files:
                raise ServiceException("Choose at least one file (JPG, PNG or PDF).")
            services.add_attachments(activity, request.user, files, request.data.get("kind") or "slip")
        items = [a for a in activity.attachments.select_related("created_by") if not a.is_deleted]
        return Response({"success": True, "results": AttachmentSerializer(items, many=True).data},
                        status=http_status.HTTP_201_CREATED if request.method == "POST" else 200)

    @action(detail=True, methods=["get"], url_path="changes")
    def changes(self, request, pk=None):
        activity = self.get_object()
        return Response({"success": True,
                         "results": ChangeSerializer(activity.changes.select_related("changed_by"), many=True).data})

    # ---- dashboard ----------------------------------------------------------
    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        raw = (request.query_params.get("date") or "").strip()
        try:
            day = date_cls.fromisoformat(raw) if raw else timezone.localdate()
        except ValueError:
            raise ServiceException("Invalid date.")
        return Response({"success": True, **services.daily_summary(day, BankActivity.objects.all())})

    # ---- reports ------------------------------------------------------------
    @action(detail=False, methods=["get"], url_path="reports")
    def reports(self, request):
        # NOT "type": that name is also the register's Payment/Deposit/Transfer
        # filter, so ?type=daily was filtering every record out (empty reports).
        kind = request.query_params.get("report") or "daily"
        return Response({"success": True, "type": kind, "results": services.build_report(kind, self.get_queryset())})

    # ---- export: csv / xlsx / pdf / json -----------------------------------
    @action(detail=False, methods=["get"], url_path="export")
    def export(self, request):
        # NOT "format": DRF reserves ?format= for renderer selection and would 404.
        fmt = (request.query_params.get("fmt") or "csv").lower()
        qs = self.get_queryset().order_by("date", "time", "id")[:EXPORT_LIMIT]
        rows = [services.activity_row(a) for a in qs]
        stamp = timezone.localtime().strftime("%Y%m%d-%H%M")

        if fmt == "json":
            return Response({"success": True, "columns": EXPORT_COLUMNS, "results": rows})

        if fmt == "csv":
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow([h for _, h in EXPORT_COLUMNS])
            for r in rows:
                w.writerow([r[k] for k, _ in EXPORT_COLUMNS])
            resp = HttpResponse("\ufeff" + buf.getvalue(), content_type="text/csv; charset=utf-8")
            resp["Content-Disposition"] = f'attachment; filename="bank-register-{stamp}.csv"'
            return resp

        if fmt in ("xlsx", "excel"):
            from openpyxl import Workbook
            from openpyxl.styles import Font
            wb = Workbook()
            ws = wb.active
            ws.title = "Bank Register"
            ws.append([h for _, h in EXPORT_COLUMNS])
            for c in ws[1]:
                c.font = Font(bold=True)
            for r in rows:
                ws.append([float(r[k]) if k == "amount" else r[k] for k, _ in EXPORT_COLUMNS])
            for col in ws.columns:
                ws.column_dimensions[col[0].column_letter].width = min(40, max(len(str(c.value or "")) for c in col) + 2)
            out = io.BytesIO()
            wb.save(out)
            resp = HttpResponse(out.getvalue(),
                                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            resp["Content-Disposition"] = f'attachment; filename="bank-register-{stamp}.xlsx"'
            return resp

        if fmt == "pdf":
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4, landscape
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
            cols = [("date", "Date"), ("time", "Time"), ("from", "From"), ("to", "To"), ("amount", "Amount"),
                    ("slip_number", "Slip"), ("bank_reference", "Reference"), ("purpose", "Purpose"), ("status", "Status")]
            styles = getSampleStyleSheet()
            small = styles["BodyText"].clone("small", fontSize=7, leading=8.5)
            data = [[h for _, h in cols]] + [[Paragraph(str(r[k] or ""), small) for k, _ in cols] for r in rows]
            table = Table(data, repeatRows=1, colWidths=[52, 44, 118, 118, 52, 52, 78, 90, 52])
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ea6c4d")), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, 0), 7.5), ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f6f4f2")]),
            ]))
            out = io.BytesIO()
            SimpleDocTemplate(out, pagesize=landscape(A4), leftMargin=24, rightMargin=24, topMargin=24,
                              bottomMargin=24).build(_company_header_flowables(styles) + [
                                  Paragraph("BANK PAYMENT RECORD", styles["Title"]), Spacer(1, 6), table])
            resp = HttpResponse(out.getvalue(), content_type="application/pdf")
            resp["Content-Disposition"] = f'attachment; filename="bank-register-{stamp}.pdf"'
            return resp

        raise ServiceException("Export format must be csv, xlsx or pdf.")


class AttachmentViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Private proof files: only handed out to authorised, logged-in users."""
    queryset = BankAttachment.objects.select_related("activity")
    serializer_class = AttachmentSerializer
    filter_backends = []

    def get_permissions(self):
        return [(IsAdminOrAbove if self.action == "destroy_attachment" else IsManagerOrAbove)()]

    @action(detail=True, methods=["get"], url_path="file")
    def file(self, request, pk=None):
        att = self.get_object()
        content_type = mimetypes.guess_type(att.original_name)[0] or "application/octet-stream"
        resp = FileResponse(att.file.open("rb"), content_type=content_type)
        resp["Content-Disposition"] = f'inline; filename="{att.original_name}"'
        resp["X-Content-Type-Options"] = "nosniff"
        return resp

    @action(detail=True, methods=["post"], url_path="remove")
    def destroy_attachment(self, request, pk=None):
        """Removes a wrongly attached proof from view — logged, never silent."""
        att = self.get_object()
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            raise ServiceException("A reason is required to remove an attachment.")
        att.delete()   # soft delete: the file and the row stay on record
        BankActivityChange.objects.create(
            activity=att.activity, field="attachments", old_value=att.original_name, new_value="(removed)",
            reason=reason, changed_by=request.user)
        return Response({"success": True})


class DailyVerificationViewSet(_Base):
    queryset = DailyVerification.objects.all()
    serializer_class = DailyVerificationSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        day = (self.request.query_params.get("date") or "").strip()
        return qs.filter(date=day) if day else qs

    def create(self, request, *args, **kwargs):
        """One verification per day: saving the same date again updates it."""
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = dict(ser.validated_data)
        day = data.pop("date")
        obj, created = DailyVerification.objects.get_or_create(
            date=day, defaults={**data, "created_by": request.user, "updated_by": request.user})
        if not created:
            for k, v in data.items():
                setattr(obj, k, v)
            obj.updated_by = request.user
            obj.save()
        return Response(self.get_serializer(obj).data,
                        status=http_status.HTTP_201_CREATED if created else http_status.HTTP_200_OK)