"""Recheck API contract.

Pydantic models for every request and response body. FastAPI turns them into
the OpenAPI spec, and the front end generates its TypeScript types from that.
"""

from typing import Any

from pydantic import TypeAdapter
from pydantic.json_schema import models_json_schema

from .events import DashboardEvent
from .patient import PatientHome
from .push import PushConfig, PushSubscriptionSave
from .reports import PatientReport, ReportReceipt
from .staff import (
    AcknowledgeTask,
    AssessTask,
    FlagHigher,
    SiteSettings,
    SiteSettingsUpdate,
    VitalsCreate,
    VitalsRecord,
)
from .tasks import Task
from .views import ChargeNurseView, Handover, QualitySummary, TriageBoard, VisitDetail, Worklist
from .visits import (
    SessionInfo,
    SignInConflict,
    SignOut,
    StaffSignOut,
    TokenExchange,
    VisitCreate,
    VisitEnrolled,
    VisitExclusionUpdate,
    VisitLink,
    VisitStatusUpdate,
)

REQUEST_MODELS = (
    VisitCreate,
    TokenExchange,
    VisitStatusUpdate,
    VisitExclusionUpdate,
    SignOut,
    StaffSignOut,
    VitalsCreate,
    FlagHigher,
    AcknowledgeTask,
    AssessTask,
    SiteSettingsUpdate,
    PushSubscriptionSave,
)
RESPONSE_MODELS = (
    VisitEnrolled,
    VisitLink,
    SessionInfo,
    SignInConflict,
    ReportReceipt,
    PatientHome,
    VitalsRecord,
    Task,
    Worklist,
    VisitDetail,
    TriageBoard,
    ChargeNurseView,
    Handover,
    QualitySummary,
    DashboardEvent,
    SiteSettings,
    PushConfig,
)

patient_report_adapter: TypeAdapter[PatientReport] = TypeAdapter(PatientReport)


def contract_json_schema() -> dict[str, Any]:
    """JSON Schema for every top-level body, split into request and response shapes."""
    pairs = [(m, "validation") for m in REQUEST_MODELS] + [(m, "serialization") for m in RESPONSE_MODELS]
    _, schema = models_json_schema(pairs, title="Recheck API contract")
    return schema


__all__ = [
    "REQUEST_MODELS",
    "RESPONSE_MODELS",
    "PatientReport",
    "contract_json_schema",
    "patient_report_adapter",
    "AcknowledgeTask",
    "AssessTask",
    "ChargeNurseView",
    "DashboardEvent",
    "FlagHigher",
    "Handover",
    "PatientHome",
    "PushConfig",
    "PushSubscriptionSave",
    "QualitySummary",
    "ReportReceipt",
    "SessionInfo",
    "SignInConflict",
    "SignOut",
    "SiteSettings",
    "SiteSettingsUpdate",
    "StaffSignOut",
    "Task",
    "TokenExchange",
    "TriageBoard",
    "VisitCreate",
    "VisitDetail",
    "VisitEnrolled",
    "VisitExclusionUpdate",
    "VisitLink",
    "VisitStatusUpdate",
    "VitalsCreate",
    "VitalsRecord",
    "Worklist",
]
