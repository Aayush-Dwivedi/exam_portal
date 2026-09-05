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

@pytest.mark.asyncio
async def test_create_demo_candidate_and_login(client):
    # 1. Generate demo candidate
    res1 = await client.post("/api/auth/demo-candidate")
    assert res1.status_code == 200
    data1 = res1.json()
    assert "roll_number" in data1
    assert data1["roll_number"].startswith("DEMO-")
    assert "password" in data1
    assert data1["role"] == "CANDIDATE"
    assert "user_id" in data1

    # 2. Authenticate using the generated credentials
    login_res = await client.post(
        "/api/auth/login",
        json={"identifier": data1["roll_number"], "password": data1["password"]}
    )
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert "access_token" in login_data
    assert login_data["role"] == "CANDIDATE"
    assert login_data["roll_number"] == data1["roll_number"]

    # 3. Generate a second demo candidate and verify uniqueness
    res2 = await client.post("/api/auth/demo-candidate")
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["roll_number"] != data1["roll_number"]
    assert data2["email"] != data1["email"]
