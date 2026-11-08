from . import session, staff_session, visits

ROUTERS = (staff_session.router, visits.router, session.router)
