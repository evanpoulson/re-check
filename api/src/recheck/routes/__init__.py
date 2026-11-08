from . import actions, events, pager, patient, push, reports, session, settings, staff, staff_session, visits

ROUTERS = (
    staff_session.router,
    visits.router,
    staff.router,
    actions.router,
    session.router,
    patient.router,
    push.router,
    reports.router,
    pager.router,
    events.router,
    settings.router,
)
