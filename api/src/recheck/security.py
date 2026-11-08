"""Tokens, hashes and encryption.

- QR tokens and visit-session tokens are random, URL-safe and at least 256 bits.
  The database stores only their SHA-256 hash (the same hash the synthetic loader uses).
- The QR token is also stored encrypted, so the desk can show the same QR again.
  The key is derived from RECHECK_SECRET_KEY and never reaches the database.
- The demo staff cookie is signed with HMAC so it can't be forged or edited.
"""

import base64
import hashlib
import hmac
import secrets

from cryptography.fernet import Fernet, InvalidToken

from .settings import secret_key


def new_token() -> str:
    return secrets.token_urlsafe(32)


def token_hash(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def _derived(purpose: bytes) -> bytes:
    return hmac.new(secret_key(), purpose, hashlib.sha256).digest()


def _fernet() -> Fernet:
    return Fernet(base64.urlsafe_b64encode(_derived(b"recheck qr-token encryption v1")))


def encrypt_token(token: str) -> bytes:
    return _fernet().encrypt(token.encode())


def decrypt_token(ciphertext: bytes) -> str | None:
    """None when the ciphertext wasn't made with this key (for example seeded placeholders)."""
    try:
        return _fernet().decrypt(bytes(ciphertext)).decode()
    except (InvalidToken, ValueError):
        return None


def sign(value: str) -> str:
    mac = hmac.new(_derived(b"recheck staff-cookie v1"), value.encode(), hashlib.sha256).digest()
    return f"{value}.{base64.urlsafe_b64encode(mac).decode().rstrip('=')}"


def unsign(signed: str) -> str | None:
    value, _, _mac = signed.rpartition(".")
    if not value:
        return None
    return value if hmac.compare_digest(sign(value), signed) else None
