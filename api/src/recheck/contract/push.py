"""Check-in reminders by Web Push, for the signed-in patient or companion device.

The browser subscribes with the server's public key and hands back its push
endpoint and keys. Reminders say only that a check-in is due: never a symptom,
a level or a name, because they show on a lock screen.
"""

from typing import Annotated

from pydantic import Field, StringConstraints

from .common import InputModel, OutputModel

Base64Url = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]+=*$")]


class PushConfig(OutputModel):
    """Whether this server sends reminders, and the key a browser subscribes with."""

    enabled: bool = Field(description="False when the server has no push key; the screen hides the reminder control.")
    public_key: str | None = Field(
        default=None,
        description="VAPID application server key: the uncompressed P-256 public key, base64url. Null when disabled.",
    )


class PushKeys(InputModel):
    p256dh: Annotated[Base64Url, StringConstraints(min_length=86, max_length=88)]
    auth: Annotated[Base64Url, StringConstraints(min_length=22, max_length=24)]


class PushSubscriptionSave(InputModel):
    """`PushSubscription.toJSON()` from the browser, minus `expirationTime`.

    Saving is idempotent: the same endpoint and keys again change nothing; new
    ones replace the device's earlier subscription.
    """

    endpoint: Annotated[str, StringConstraints(pattern=r"^https://", max_length=2048)]
    keys: PushKeys
