from . import patient, reports, session, staff, staff_session, visits

ROUTERS = (staff_session.router, visits.router, staff.router, session.router, patient.router, reports.router)
