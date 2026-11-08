"""GET /api/events: live "something changed" notices for staff screens (Server-Sent Events).

In the browser:

    const events = new EventSource('/api/events')   // sends the staff cookie; reconnects by itself
    events.onmessage = () => refetch()               // e.data is a DashboardEvent as JSON

Each notice names the visit (and task) that changed; the screen refetches the
view it shows. Only notices for the staff member's site are sent.
"""

import asyncio
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..auth import Staff, current_staff
from ..events import Broker

router = APIRouter(prefix="/api", tags=["live updates"])

HEARTBEAT_SECONDS = 15.0
RETRY_MS = 3000


async def event_stream(
    request: Request, broker: Broker, queue: asyncio.Queue, heartbeat: float = HEARTBEAT_SECONDS
) -> AsyncIterator[str]:
    """SSE frames until the client goes away. Comments (": ...") keep proxies from timing out."""
    try:
        yield f"retry: {RETRY_MS}\n: connected\n\n"
        while not await request.is_disconnected():
            try:
                event = await asyncio.wait_for(queue.get(), heartbeat)
            except TimeoutError:
                yield ": keep-alive\n\n"
                continue
            yield f"id: {event.event_id}\ndata: {event.model_dump_json()}\n\n"
    finally:
        broker.unsubscribe(queue)


@router.get(
    "/events",
    response_class=StreamingResponse,
    responses={
        200: {"content": {"text/event-stream": {}}, "description": "A stream of DashboardEvent notices as SSE `data:` lines"},
        401: {"description": "Staff sign-in required"},
    },
)
async def dashboard_events(request: Request, staff: Annotated[Staff, Depends(current_staff)]) -> StreamingResponse:
    """Live notices for any signed-in staff member's site."""
    broker: Broker = request.app.state.broker
    queue = broker.subscribe(staff.site_id)
    return StreamingResponse(
        event_stream(request, broker, queue),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
