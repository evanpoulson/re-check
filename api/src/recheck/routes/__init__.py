from . import patient, reports, session, staff_session, visits

ROUTERS = (staff_session.router, visits.router, session.router, patient.router, reports.router)
