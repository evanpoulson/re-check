"""Live dashboard notifications.

Events are small "something changed" notices. A dashboard refetches the view
it shows, so a missed event can't leave it permanently wrong.
"""

from uuid import UUID

from .codes import DashboardEventType
from .common import OutputModel, Timestamp


class DashboardEvent(OutputModel):
    event_id: UUID
    type: DashboardEventType
    at: Timestamp
    visit_id: UUID
    task_id: UUID | None = None
