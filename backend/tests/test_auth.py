"""Login, token handling, and the protected-route dependency."""

import pytest

from app.core.security import (
    MAX_PASSWORD_BYTES,
    TokenError,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

PROTECTED = ["/auth/me", "/patients", "/therapists", "/invoices", "/notifications"]


class TestPasswordHashing:
    def test_a_correct_password_verifies(self):
        assert verify_password("physiodesk123", hash_password("physiodesk123")) is True

    def test_a_wrong_password_does_not(self):
        assert verify_password("wrong", hash_password("physiodesk123")) is False

    def test_a_malformed_hash_is_a_failed_login_not_a_crash(self):
        assert verify_password("anything", "not-a-bcrypt-hash") is False

    def test_hashes_are_salted(self):
        """The same password hashed twice must not produce the same digest."""
        assert hash_password("same") != hash_password("same")

    def test_an_overlong_password_is_rejected_rather_than_truncated(self):
        """bcrypt ignores bytes past 72; truncating would make a prefix valid."""
        with pytest.raises(ValueError):
            hash_password("p" * (MAX_PASSWORD_BYTES + 1))


class TestTokens:
    def test_a_token_round_trips(self):
        assert decode_access_token(create_access_token("frontdesk"))["sub"] == "frontdesk"

    def test_an_expired_token_is_rejected(self):
        with pytest.raises(TokenError):
            decode_access_token(create_access_token("frontdesk", expires_minutes=-1))

    def test_a_malformed_token_is_rejected(self):
        with pytest.raises(TokenError):
            decode_access_token("not.a.token")

    def test_a_token_signed_with_another_key_is_rejected(self):
        import jwt

        forged = jwt.encode({"sub": "frontdesk"}, "wrong-secret", algorithm="HS256")
        with pytest.raises(TokenError):
            decode_access_token(forged)


class TestLogin:
    def test_valid_credentials_return_a_usable_token(self, client, user):
        response = client.post(
            "/auth/login", json={"username": "frontdesk", "password": "physiodesk123"}
        )
        assert response.status_code == 200
        body = response.json()
        assert body["token_type"] == "bearer"
        assert body["user"]["username"] == "frontdesk"

        me = client.get(
            "/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
        )
        assert me.status_code == 200

    def test_the_response_never_carries_the_password_hash(self, client, user):
        body = client.post(
            "/auth/login", json={"username": "frontdesk", "password": "physiodesk123"}
        ).json()
        assert "hashed_password" not in body["user"]

    def test_a_wrong_password_is_rejected(self, client, user):
        response = client.post(
            "/auth/login", json={"username": "frontdesk", "password": "wrong"}
        )
        assert response.status_code == 401

    def test_an_unknown_user_is_rejected_identically(self, client, user):
        """Differing messages would turn login into a username enumerator."""
        wrong_password = client.post(
            "/auth/login", json={"username": "frontdesk", "password": "wrong"}
        ).json()["detail"]
        unknown_user = client.post(
            "/auth/login", json={"username": "ghost", "password": "wrong"}
        ).json()["detail"]
        assert wrong_password == unknown_user

    def test_an_empty_username_is_a_validation_error(self, client):
        assert client.post("/auth/login", json={"username": "", "password": "x"}).status_code == 422

    def test_a_disabled_account_cannot_sign_in(self, client, db, user):
        user.is_active = False
        db.flush()
        response = client.post(
            "/auth/login", json={"username": "frontdesk", "password": "physiodesk123"}
        )
        assert response.status_code == 403


class TestProtectedRoutes:
    @pytest.mark.parametrize("path", PROTECTED)
    def test_no_token_is_rejected(self, client, path):
        response = client.get(path)
        assert response.status_code == 401
        assert response.headers.get("www-authenticate") == "Bearer"

    @pytest.mark.parametrize("path", PROTECTED)
    def test_a_garbage_token_is_rejected(self, client, path):
        assert client.get(path, headers={"Authorization": "Bearer nonsense"}).status_code == 401

    def test_the_wrong_scheme_is_rejected(self, client, user):
        token = client.post(
            "/auth/login", json={"username": "frontdesk", "password": "physiodesk123"}
        ).json()["access_token"]
        assert client.get("/auth/me", headers={"Authorization": f"Basic {token}"}).status_code == 401

    def test_a_valid_token_is_accepted(self, auth_client):
        assert auth_client.get("/auth/me").status_code == 200

    def test_a_token_for_a_deleted_account_is_rejected(self, client, db, user):
        """The user is re-read per request, so revocation takes effect at once."""
        token = client.post(
            "/auth/login", json={"username": "frontdesk", "password": "physiodesk123"}
        ).json()["access_token"]
        db.delete(user)
        db.flush()
        assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_health_needs_no_token(client):
    assert client.get("/health").status_code == 200
