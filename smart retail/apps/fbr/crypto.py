"""
Encryption for the FBR API token stored in the database.

Each business using this software enters its OWN token through the UI, so it
lives in the DB rather than in an env var. It is encrypted at rest with
Fernet; the key is derived from FBR_TOKEN_ENCRYPTION_KEY if set, otherwise
from Django's SECRET_KEY. If the key changes, the saved token can no longer
be decrypted and must simply be entered again.
"""
import base64
import hashlib
import os

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _fernet() -> Fernet:
    material = os.environ.get("FBR_TOKEN_ENCRYPTION_KEY") or settings.SECRET_KEY
    digest = hashlib.sha256(f"smartretail-fbr::{material}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_token(plain: str) -> str:
    if not plain:
        return ""
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_token(encrypted: str) -> str:
    """Returns "" if there is nothing stored or it can't be decrypted."""
    if not encrypted:
        return ""
    try:
        return _fernet().decrypt(encrypted.encode()).decode()
    except (InvalidToken, ValueError):
        return ""
