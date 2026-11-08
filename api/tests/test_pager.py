"""The pager device key, without a database."""

import pytest
from fastapi import HTTPException

from recheck.routes.pager import pager_device

KEY = "pager-key-for-tests-0123456789"


def test_pagers_are_off_without_a_key(monkeypatch):
    monkeypatch.setenv("RECHECK_PAGER_KEY", "")
    with pytest.raises(HTTPException) as e:
        pager_device(KEY)
    assert e.value.status_code == 503


def test_a_short_key_turns_pagers_off(monkeypatch):
    monkeypatch.setenv("RECHECK_PAGER_KEY", "short")
    with pytest.raises(HTTPException) as e:
        pager_device("short")
    assert e.value.status_code == 503


@pytest.mark.parametrize("sent", [None, "", "wrong-key-wrong-key-wrong-key"])
def test_a_missing_or_wrong_key_is_refused(monkeypatch, sent):
    monkeypatch.setenv("RECHECK_PAGER_KEY", KEY)
    with pytest.raises(HTTPException) as e:
        pager_device(sent)
    assert e.value.status_code == 401


def test_the_right_key_passes(monkeypatch):
    monkeypatch.setenv("RECHECK_PAGER_KEY", KEY)
    assert pager_device(KEY) is None
