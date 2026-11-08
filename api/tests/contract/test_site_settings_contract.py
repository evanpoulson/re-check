import pytest
from pydantic import TypeAdapter, ValidationError

from recheck.contract.patient import PatientHome
from recheck.contract.staff import SiteSettingsUpdate


def test_site_settings_update_is_one_strict_switch():
    assert SiteSettingsUpdate.model_validate({"show_triage_level": True}).show_triage_level is True
    with pytest.raises(ValidationError):
        SiteSettingsUpdate.model_validate({"show_triage_level": True, "site_id": "other"})
    with pytest.raises(ValidationError):
        SiteSettingsUpdate.model_validate({})


def test_patient_home_triage_level_is_optional_and_never_ctas_1():
    field = PatientHome.model_fields["triage_level"]
    assert field.default is None
    adapter = TypeAdapter(field.annotation)
    assert adapter.validate_python(3) == 3
    with pytest.raises(ValidationError):
        adapter.validate_python(1)
