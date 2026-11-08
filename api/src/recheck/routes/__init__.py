from . import actions, events, patient, reports, session, settings, staff, staff_session, visits

ROUTERS = (
    staff_session.router,
    visits.router,
    staff.router,
    actions.router,
    session.router,
    patient.router,
    reports.router,
    events.router,
    settings.router,
)
