from . import actions, patient, reports, session, staff, staff_session, visits

ROUTERS = (
    staff_session.router,
    visits.router,
    staff.router,
    actions.router,
    session.router,
    patient.router,
    reports.router,
)
