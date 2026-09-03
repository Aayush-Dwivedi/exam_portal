import pytest

@pytest.mark.asyncio
async def test_rbac_boundaries(client, admin_token, setter_token, candidate_token):
    cand_headers = {"Authorization": f"Bearer {candidate_token}"}
    setter_headers = {"Authorization": f"Bearer {setter_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Candidate tries to list users -> 403
    res1 = await client.get("/api/users", headers=cand_headers)
    assert res1.status_code == 403

    # 2. Paper Setter tries to list users -> 403
    res2 = await client.get("/api/users", headers=setter_headers)
    assert res2.status_code == 403

    # 3. Admin can list users -> 200
    res3 = await client.get("/api/users", headers=admin_headers)
    assert res3.status_code == 200

    # 4. Candidate tries to access admin analytics -> 403
    res4 = await client.get("/api/analytics/admin", headers=cand_headers)
    assert res4.status_code == 403

    # 5. Paper Setter tries to access admin analytics -> 403
    res5 = await client.get("/api/analytics/admin", headers=setter_headers)
    assert res5.status_code == 403

    # 6. Admin can access analytics -> 200
    res6 = await client.get("/api/analytics/admin", headers=admin_headers)
    assert res6.status_code == 200
