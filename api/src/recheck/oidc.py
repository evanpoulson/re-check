"""Staff sign-in with Auth0: OpenID Connect, authorization code flow with PKCE.

The API is the OAuth client, and the browser only carries Recheck's own cookies:

1. `GET /api/staff/login` makes a state, a nonce and a PKCE verifier, keeps them
   in a short-lived signed cookie, and redirects to Auth0.
2. Auth0 signs the person in (Google, Microsoft, GitHub, or a demo password
   account). Its Post-Login Action (`auth0/post-login-action.js`) refuses
   anyone without a staff role and adds the role to the ID token.
3. `GET /api/staff/callback` checks the state, swaps the one-time code for
   tokens over a back channel, verifies the ID token and reads the role.

Auth0's tokens never reach the browser or the database. Patients don't use
this: they sign in with the visit's QR token (`routes/session.py`).
"""

import asyncio
import base64
import hashlib
import secrets
from dataclasses import dataclass
from functools import cache
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt

from .contract.codes import StaffRole
from .settings import Auth0

# Custom claim the Post-Login Action sets. Auth0 needs custom claims to be namespaced.
ROLES_CLAIM = "https://recheck/roles"
SCOPE = "openid profile email"
HTTP_TIMEOUT_SECONDS = 10.0


class SignInError(Exception):
    """Sign-in failed. `code` goes back to the sign-in page as `?error=`; details stay in the log."""

    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code


@dataclass(frozen=True)
class SignInFlow:
    """What the callback needs to finish the sign-in the login route started."""

    state: str
    nonce: str
    verifier: str
    return_to: str


def new_flow(return_to: str) -> SignInFlow:
    return SignInFlow(
        state=secrets.token_urlsafe(32),
        nonce=secrets.token_urlsafe(32),
        verifier=secrets.token_urlsafe(64),
        return_to=return_to,
    )


def _challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def authorize_url(cfg: Auth0, flow: SignInFlow) -> str:
    params = {
        "response_type": "code",
        "client_id": cfg.client_id,
        "redirect_uri": cfg.callback_url,
        "scope": SCOPE,
        "state": flow.state,
        "nonce": flow.nonce,
        "code_challenge": _challenge(flow.verifier),
        "code_challenge_method": "S256",
    }
    return f"https://{cfg.domain}/authorize?{urlencode(params)}"


def logout_url(cfg: Auth0, return_to: str) -> str:
    """Ends the Auth0 session too, so the next sign-in can pick a different account."""
    return f"https://{cfg.domain}/v2/logout?{urlencode({'client_id': cfg.client_id, 'returnTo': return_to})}"


async def exchange_code(cfg: Auth0, code: str, verifier: str) -> str:
    """Swap the one-time code for tokens and return the ID token."""
    form = {
        "grant_type": "authorization_code",
        "client_id": cfg.client_id,
        "client_secret": cfg.client_secret,
        "code": code,
        "code_verifier": verifier,
        "redirect_uri": cfg.callback_url,
    }
    try:
        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS) as client:
            response = await client.post(f"https://{cfg.domain}/oauth/token", data=form)
    except httpx.HTTPError as exc:
        raise SignInError("sign_in_failed", f"Auth0 token request failed: {exc}") from exc
    if response.status_code != 200:
        raise SignInError("sign_in_failed", f"Auth0 token request returned {response.status_code}: {response.text}")
    id_token = response.json().get("id_token")
    if not isinstance(id_token, str):
        raise SignInError("sign_in_failed", "Auth0 token response had no ID token")
    return id_token


@cache
def _jwks(domain: str) -> jwt.PyJWKClient:
    # Caches Auth0's public keys and refetches when a token names a new key ID.
    return jwt.PyJWKClient(f"https://{domain}/.well-known/jwks.json", cache_keys=True, timeout=int(HTTP_TIMEOUT_SECONDS))


async def signing_key(cfg: Auth0, id_token: str) -> Any:
    try:
        # PyJWKClient blocks on its HTTP fetch; keep it off the event loop.
        found = await asyncio.to_thread(_jwks(cfg.domain).get_signing_key_from_jwt, id_token)
    except jwt.PyJWTError as exc:
        raise SignInError("sign_in_failed", f"no Auth0 signing key for the ID token: {exc}") from exc
    return found.key


async def verify_id_token(cfg: Auth0, id_token: str, nonce: str) -> dict[str, Any]:
    """Check signature, issuer, audience, expiry and nonce; return the claims."""
    key = await signing_key(cfg, id_token)
    try:
        claims = jwt.decode(
            id_token,
            key,
            algorithms=["RS256"],
            audience=cfg.client_id,
            issuer=cfg.issuer,
            leeway=60,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise SignInError("sign_in_failed", f"ID token rejected: {exc}") from exc
    if not secrets.compare_digest(str(claims.get("nonce", "")), nonce):
        raise SignInError("sign_in_failed", "ID token nonce doesn't match this sign-in")
    return claims


def staff_role(claims: dict[str, Any]) -> StaffRole:
    """Each staff account has exactly one role, set in Auth0."""
    roles = claims.get(ROLES_CLAIM)
    known = {r for r in roles if r in StaffRole._value2member_map_} if isinstance(roles, list) else set()
    if len(known) != 1:
        raise SignInError("no_staff_role", f"{claims.get('sub')} has roles {roles!r}; needs exactly one staff role")
    return StaffRole(known.pop())


def display_name(claims: dict[str, Any]) -> str | None:
    for key in ("name", "nickname", "email"):
        value = claims.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:120]
    return None
