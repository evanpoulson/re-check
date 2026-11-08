from recheck import settings


def test_timers_are_off_unless_turned_on(monkeypatch):
    monkeypatch.setattr(settings, "load_dotenv", lambda *a, **k: None)
    monkeypatch.delenv("RECHECK_SCHEDULER_SECONDS", raising=False)
    assert settings.scheduler_seconds() == 0
    monkeypatch.setenv("RECHECK_SCHEDULER_SECONDS", "15")
    assert settings.scheduler_seconds() == 15
