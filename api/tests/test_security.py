from recheck.security import decrypt_token, encrypt_token, new_token, sign, token_hash, unsign
from recheck.submissions import fingerprint
from recheck.contract.visits import SignOut


def test_token_round_trips_through_encryption():
    token = new_token()
    assert len(token) >= 43
    assert decrypt_token(encrypt_token(token)) == token


def test_foreign_ciphertext_is_rejected_not_raised():
    assert decrypt_token(b"seeded-placeholder-bytes") is None


def test_hash_matches_synthetic_loader():
    import hashlib

    assert token_hash("abc") == hashlib.sha256(b"abc").digest()


def test_signed_value_round_trips_and_tampering_fails():
    signed = sign("triage_nurse|foothills-demo")
    assert unsign(signed) == "triage_nurse|foothills-demo"
    assert unsign(signed.replace("triage_nurse", "physician")) is None
    assert unsign(signed[:-2] + "xx") is None
    assert unsign("no-signature") is None


def test_fingerprint_ignores_submission_id_but_not_context():
    a = SignOut(submission_id="00000000-0000-4000-8000-000000000001")
    b = SignOut(submission_id="00000000-0000-4000-8000-000000000002")
    assert fingerprint(a) == fingerprint(b)
    assert fingerprint(a, visit="x") != fingerprint(a, visit="y")
