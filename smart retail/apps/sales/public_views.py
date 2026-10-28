import base64
import mimetypes
from decimal import Decimal

from django.http import Http404, HttpResponse
from django.utils.html import escape
from django.views.decorators.cache import cache_control
from django.views.decorators.http import require_GET

from apps.products.utils.barcode_utils import generate_qr_code_image
from apps.settings.models import CompanySettings

from .models import Sale
from .verification import is_valid_signature, verify_url

_STATUS_NOTE = {
    Sale.Status.CANCELLED: ("This invoice has been CANCELLED.", "#b91c1c"),
    Sale.Status.RETURNED: ("All items on this invoice have been RETURNED.", "#b91c1c"),
    Sale.Status.PARTIALLY_RETURNED: ("Some items on this invoice have been returned.", "#b45309"),
    Sale.Status.EDITED: ("This invoice was edited after it was first issued.", "#b45309"),
    Sale.Status.DRAFT: ("This invoice is still a draft.", "#b45309"),
}


def _get_sale(invoice_number, signature):
    if not is_valid_signature(invoice_number, signature):
        raise Http404
    try:
        return (Sale.objects.select_related("customer")
                .prefetch_related("items__product").get(invoice_number=invoice_number))
    except Sale.DoesNotExist:
        raise Http404


# CNIC is shown MASKED on this public page (35202-*******-1) because anyone who
# holds or photographs the slip can open it. Set to False to show the full number.
MASK_CNIC = True


def _cnic(value):
    value = (value or "").strip()
    if not value or not MASK_CNIC:
        return value
    parts = value.split("-")
    if len(parts) == 3:
        return f"{parts[0]}-{'*' * len(parts[1])}-{parts[2]}"
    return value[:5] + "*" * max(len(value) - 6, 0) + value[-1:]


def _logo_html(company):
    """Company logo embedded straight into the page (no separate image request)."""
    try:
        if not company.logo:
            return ""
        mime = mimetypes.guess_type(company.logo.name)[0] or "image/png"
        with company.logo.open("rb") as fh:
            data = base64.b64encode(fh.read()).decode()
        return f'<img class="logo" src="data:{mime};base64,{data}" alt="">'
    except Exception:
        return ""


def _money(value):
    return f"Rs. {Decimal(value):,.2f}"


def _not_found_page():
    html = """<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Invoice not verified</title></head>
<body style="font-family:Arial,sans-serif;background:#f3f4f6;margin:0;padding:24px">
<div style="max-width:440px;margin:40px auto;background:#fff;border-radius:12px;padding:28px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.08)">
<div style="font-size:44px">&#10060;</div>
<h2 style="margin:8px 0;color:#b91c1c">Invoice not verified</h2>
<p style="color:#555;font-size:14px">This invoice was not found, or the link is not genuine.
Please do not rely on this bill.</p></div></body></html>"""
    return HttpResponse(html, status=404)


_ICON = (
    '<svg width="76" height="76" viewBox="0 0 76 76" fill="none" xmlns="http://www.w3.org/2000/svg">'
    '<path d="M16 26h34v34a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3V26z" stroke="#555" stroke-width="2.2" stroke-linejoin="round"/>'
    '<path d="M24 26v-6a9 9 0 0 1 18 0v6" stroke="#555" stroke-width="2.2" stroke-linecap="round"/>'
    '<circle cx="52" cy="52" r="13" fill="#fff" stroke="#555" stroke-width="2.2"/>'
    '<path d="M46 52l4.5 4.5L58 48" stroke="#555" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
    '</svg>'
)


@require_GET
@cache_control(no_store=True)
def verify_invoice(request, invoice_number, signature):
    try:
        sale = _get_sale(invoice_number, signature)
    except Http404:
        return _not_found_page()

    company = CompanySettings.load()
    note = _STATUS_NOTE.get(sale.status)
    note_html = (f'<div class="note" style="color:{note[1]}">{escape(note[0])}</div>') if note else ""

    cust = sale.customer
    if cust:
        cust_html = f'<p class="row">Customer: <b>{escape(cust.name)}</b></p>'
        if cust.cnic:
            cust_html += f'<p class="row">CNIC: <b>{escape(_cnic(cust.cnic))}</b></p>'
        if cust.address:
            cust_html += f'<p class="row">Address: <b>{escape(cust.address)}</b></p>'
    else:
        cust_html = '<p class="row">Customer: <b>Walk-in</b></p>'

    html = f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Invoice {escape(sale.invoice_number)} - verified</title>
<style>
*{{box-sizing:border-box}}
body{{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#fff;margin:0;padding:48px 20px;color:#222;text-align:center}}
.wrap{{max-width:380px;margin:0 auto}}
.logo{{max-width:120px;max-height:90px;display:block;margin:0 auto 14px}}
h1{{font-size:28px;font-weight:700;margin:22px 0 22px;color:#dc2626}}
.company{{font-size:18px;font-weight:700;margin:0 0 4px}}
.sub{{font-size:14px;color:#555;margin:0 0 22px}}
.row{{font-size:15px;line-height:1.6;margin:0 0 6px;color:#333}}
.row b{{color:#111}}
.amount{{font-size:26px;font-weight:700;margin:14px 0 24px}}
.note{{margin:0 0 18px;font-size:13px;font-weight:700}}
hr{{border:0;border-top:1px solid #e5e5e5;margin:26px 0 18px}}
.foot{{font-size:13px;font-weight:700;letter-spacing:.02em;color:#333;text-transform:uppercase}}
</style></head><body><div class="wrap">
{_logo_html(company)}
{_ICON}
<h1>Verified Invoice</h1>
<p class="company">{escape(company.company_name)}</p>
<p class="sub">This bill was issued by the company above.</p>
{note_html}
<p class="row">Invoice No: <b>{escape(sale.invoice_number)}</b></p>
<p class="row">Date: <b>{sale.created_at:%d %b %Y, %I:%M %p}</b></p>
{cust_html}
<div class="amount">{_money(sale.total_amount)}</div>
<hr>
<p class="foot">All sales are final<br>and ONLY CASH</p>
</div></body></html>"""
    return HttpResponse(html)


@require_GET
@cache_control(max_age=86400, public=True)
def verify_qr(request, invoice_number, signature):
    sale = _get_sale(invoice_number, signature)
    url = verify_url(request, sale.invoice_number)
    return HttpResponse(generate_qr_code_image(url), content_type="image/png")