"""Public invoice verification.

Every printed sale slip carries a QR code. Scanning it opens a public page
(/verify/<invoice>/<signature>/) that shows the invoice straight from the
database — proof the bill really was issued by this company. The signature is
an HMAC of the invoice number made with SECRET_KEY, so a valid link can't be
guessed or forged, and other invoices can't be browsed by counting up numbers.
"""
import hashlib
import hmac
from urllib.parse import quote

from django.conf import settings


def sign_invoice(invoice_number: str) -> str:
    key = settings.SECRET_KEY.encode()
    msg = f"sale-verify:{invoice_number}".encode()
    return hmac.new(key, msg, hashlib.sha256).hexdigest()[:20]


def is_valid_signature(invoice_number: str, signature: str) -> bool:
    return hmac.compare_digest(sign_invoice(invoice_number), signature or "")


def verify_path(invoice_number: str) -> str:
    return f"/verify/{quote(invoice_number, safe='')}/{sign_invoice(invoice_number)}/"


def verify_url(request, invoice_number: str) -> str:
    """Full link stored in the QR code.

    Uses PUBLIC_BASE_URL when set, so the QR never contains 127.0.0.1 /
    localhost (which only works on the PC itself, not on a customer's phone).
    """
    base = getattr(settings, "PUBLIC_BASE_URL", "")
    path = verify_path(invoice_number)
    return f"{base}{path}" if base else request.build_absolute_uri(path)