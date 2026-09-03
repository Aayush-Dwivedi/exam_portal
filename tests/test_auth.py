import pytest

@pytest.mark.asyncio
async def test_health_check(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"

@pytest.mark.asyncio
async def test_login_success(client, admin_user):
    response = await client.post(
        "/api/auth/login",
        json={"email": admin_user.email, "password": "adminpass123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "ADMIN"
    assert data["email"] == admin_user.email

@pytest.mark.asyncio
async def test_candidate_login_by_roll_number(client, candidate_user):
    response = await client.post(
        "/api/auth/login",
        json={"identifier": candidate_user.roll_number, "password": "candpass123"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "CANDIDATE"
    assert data["roll_number"] == "CAND-2026-001"

@pytest.mark.asyncio
async def test_login_invalid_password(client, admin_user):
    response = await client.post(
        "/api/auth/login",
        json={"email": admin_user.email, "password": "wrongpassword"}
    )
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_candidate_registration_disabled(client):
    response = await client.post(
        "/api/auth/register",
        json={
            "name": "New Candidate",
            "email": "newcandidate@example.com",
            "password": "securepassword123"
        }
    )
    # Self registration must be rejected with 403 Forbidden
    assert response.status_code == 403
