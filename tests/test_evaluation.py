import pytest

@pytest.mark.asyncio
async def test_exam_session_and_scoring(client, setter_token, admin_token, candidate_token):
    setter_headers = {"Authorization": f"Bearer {setter_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    cand_headers = {"Authorization": f"Bearer {candidate_token}"}

    # Create Question 1 (MCQ: 2 marks, neg: 0.5)
    q1_res = await client.post(
        "/api/questions",
        headers=setter_headers,
        json={
            "question_text": "What is the capital of France?",
            "question_type": "MCQ",
            "subject": "Geography",
            "topic": "Capitals",
            "marks": 2.0,
            "negative_marks": 0.5,
            "options": [
                {"option_text": "Paris", "is_correct": True},
                {"option_text": "London", "is_correct": False}
            ]
        }
    )
    q1 = q1_res.json()
    q1_id = q1["id"]
    correct_opt_id = str(q1["options"][0]["id"])
    incorrect_opt_id = str(q1["options"][1]["id"])

    # Create Question 2 (True/False: 1 mark, neg: 0.25)
    q2_res = await client.post(
        "/api/questions",
        headers=setter_headers,
        json={
            "question_text": "The Earth is round.",
            "question_type": "TRUE_FALSE",
            "subject": "Science",
            "topic": "Earth",
            "marks": 1.0,
            "negative_marks": 0.25,
            "options": [
                {"option_text": "True", "is_correct": True},
                {"option_text": "False", "is_correct": False}
            ]
        }
    )
    q2 = q2_res.json()
    q2_id = q2["id"]
    q2_incorrect_opt_id = str(q2["options"][1]["id"])

    # Create Exam & Publish
    exam_res = await client.post(
        "/api/exams",
        headers=setter_headers,
        json={
            "title": "General Quiz",
            "duration_minutes": 20,
            "negative_marking": True,
            "questions": [
                {"question_id": q1_id, "sequence": 0},
                {"question_id": q2_id, "sequence": 1}
            ]
        }
    )
    exam_id = exam_res.json()["id"]

    await client.post(f"/api/exams/{exam_id}/publish", headers=admin_headers)

    # Candidate Starts Exam
    start_res = await client.post(
        "/api/exam-sessions/start",
        headers=cand_headers,
        json={"exam_id": exam_id}
    )
    assert start_res.status_code == 200
    session_data = start_res.json()
    session_id = session_data["session_id"]
    assert len(session_data["questions"]) == 2

    # Save correct answer for Q1 (+2.0)
    ans1_res = await client.post(
        f"/api/exam-sessions/{session_id}/answers",
        headers=cand_headers,
        json={
            "question_id": q1_id,
            "selected_option": correct_opt_id,
            "is_marked_review": False
        }
    )
    assert ans1_res.status_code == 200

    # Save incorrect answer for Q2 (-0.25)
    ans2_res = await client.post(
        f"/api/exam-sessions/{session_id}/answers",
        headers=cand_headers,
        json={
            "question_id": q2_id,
            "selected_option": q2_incorrect_opt_id,
            "is_marked_review": False
        }
    )
    assert ans2_res.status_code == 200

    # Submit exam
    sub_res = await client.post(
        f"/api/exam-sessions/{session_id}/submit",
        headers=cand_headers
    )
    assert sub_res.status_code == 200
    sub_data = sub_res.json()
    assert sub_data["status"] == "submitted"
    assert sub_data["attempted"] == 2
    # Total score = 2.0 - 0.25 = 1.75
    assert sub_data["score"] == 1.75

    # 1. Candidate lists results -> is_published must be False and score masked
    cand_results_res = await client.get("/api/results", headers=cand_headers)
    assert cand_results_res.status_code == 200
    cand_results = cand_results_res.json()
    assert len(cand_results) >= 1
    my_res = next(r for r in cand_results if r["exam_id"] == exam_id)
    assert my_res["is_published"] is False
    assert my_res["score"] == 0.0
    result_id = my_res["id"]

    # 2. Candidate attempts to access detailed unapproved scorecard -> must be 403 Forbidden
    cand_detail_res = await client.get(f"/api/results/{result_id}", headers=cand_headers)
    assert cand_detail_res.status_code == 403
    assert "under review" in cand_detail_res.json()["detail"].lower()

    # 3. Candidate attempts to self-publish -> must be 403 Forbidden
    cand_pub_res = await client.post(f"/api/results/{result_id}/publish", headers=cand_headers)
    assert cand_pub_res.status_code == 403

    # 4. Examiner (Setter) publishes the result
    setter_pub_res = await client.post(f"/api/results/{result_id}/publish", headers=setter_headers)
    assert setter_pub_res.status_code == 200
    assert setter_pub_res.json()["is_published"] is True

    # 5. Candidate can now access their published scorecard with real score
    cand_published_res = await client.get(f"/api/results/{result_id}", headers=cand_headers)
    assert cand_published_res.status_code == 200
    published_data = cand_published_res.json()
    assert published_data["is_published"] is True
    assert published_data["score"] == 1.75


@pytest.mark.asyncio
async def test_mock_exam_multi_attempt_and_auto_publish(client, setter_token, admin_token, candidate_token):
    setter_headers = {"Authorization": f"Bearer {setter_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    cand_headers = {"Authorization": f"Bearer {candidate_token}"}

    # Create Question
    q_res = await client.post(
        "/api/questions",
        headers=setter_headers,
        json={
            "question_text": "Sample practice question",
            "question_type": "TRUE_FALSE",
            "subject": "Mock",
            "topic": "Testing",
            "marks": 1.0,
            "negative_marks": 0.0,
            "options": [
                {"option_text": "True", "is_correct": True},
                {"option_text": "False", "is_correct": False}
            ]
        }
    )
    q_id = q_res.json()["id"]
    true_opt_id = str(q_res.json()["options"][0]["id"])

    # Create Mock Exam with allow_reattempts=True
    exam_res = await client.post(
        "/api/exams",
        headers=setter_headers,
        json={
            "title": "Practice Mock Assessment",
            "duration_minutes": 15,
            "negative_marking": False,
            "allow_reattempts": True,
            "questions": [{"question_id": q_id, "sequence": 0}]
        }
    )
    exam_id = exam_res.json()["id"]
    await client.post(f"/api/exams/{exam_id}/publish", headers=admin_headers)

    # 1. Candidate starts Attempt 1
    start1 = await client.post("/api/exam-sessions/start", headers=cand_headers, json={"exam_id": exam_id})
    assert start1.status_code == 200
    session1_id = start1.json()["session_id"]

    # Submit Attempt 1
    await client.post(
        f"/api/exam-sessions/{session1_id}/answers",
        headers=cand_headers,
        json={"question_id": q_id, "selected_option": true_opt_id, "is_marked_review": False}
    )
    sub1 = await client.post(f"/api/exam-sessions/{session1_id}/submit", headers=cand_headers)
    assert sub1.status_code == 200

    # Verify Attempt 1 results are automatically published (is_published == True)
    res_list = await client.get("/api/results", headers=cand_headers)
    mock_res = next(r for r in res_list.json() if r["session_id"] == session1_id)
    assert mock_res["is_published"] is True
    assert mock_res["score"] == 1.0

    # 2. Candidate can immediately start Attempt 2 (Re-attempt)
    start2 = await client.post("/api/exam-sessions/start", headers=cand_headers, json={"exam_id": exam_id})
    assert start2.status_code == 200
    session2_id = start2.json()["session_id"]
    assert session2_id != session1_id

@pytest.mark.asyncio
async def test_exam_session_cancellation_on_fullscreen_exits(client, setter_token, admin_token, candidate_token):
    setter_headers = {"Authorization": f"Bearer {setter_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    cand_headers = {"Authorization": f"Bearer {candidate_token}"}

    # Create Question
    q_res = await client.post(
        "/api/questions",
        headers=setter_headers,
        json={
            "question_text": "Is full-screen mode strictly enforced?",
            "question_type": "TRUE_FALSE",
            "subject": "Integrity",
            "topic": "Policies",
            "marks": 1.0,
            "negative_marks": 0.0,
            "options": [
                {"option_text": "Yes", "is_correct": True},
                {"option_text": "No", "is_correct": False}
            ]
        }
    )
    q_id = q_res.json()["id"]

    # Create Exam & Publish
    exam_res = await client.post(
        "/api/exams",
        headers=setter_headers,
        json={
            "title": "Strict Fullscreen Assessment",
            "duration_minutes": 10,
            "negative_marking": False,
            "allow_reattempts": False,
            "questions": [{"question_id": q_id, "sequence": 0}]
        }
    )
    exam_id = exam_res.json()["id"]
    await client.post(f"/api/exams/{exam_id}/publish", headers=admin_headers)

    # Start Session
    start_res = await client.post("/api/exam-sessions/start", headers=cand_headers, json={"exam_id": exam_id})
    assert start_res.status_code == 200
    session_id = start_res.json()["session_id"]

    # Log 3 fullscreen exit proctoring events
    for strike in range(1, 4):
        ev_res = await client.post(
            "/api/proctoring/events",
            headers=cand_headers,
            json={
                "session_id": session_id,
                "event_type": "FULLSCREEN_EXITED",
                "severity": "HIGH" if strike >= 2 else "MEDIUM",
                "duration": 0,
                "confidence": 1.0,
                "metadata_info": {"strike": strike, "max_allowed": 3}
            }
        )
        assert ev_res.status_code == 201

    # Cancel session via submit endpoint with cancellation_reason
    cancel_res = await client.post(
        f"/api/exam-sessions/{session_id}/submit?cancellation_reason=Exceeded+maximum+full-screen+exits+(3+strikes)",
        headers=cand_headers,
        json={"cancellation_reason": "Exceeded maximum full-screen exits (3 strikes)"}
    )
    assert cancel_res.status_code == 200
    cancel_data = cancel_res.json()
    assert cancel_data["status"] == "cancelled"
    assert "Exceeded" in cancel_data["cancellation_reason"]

    # Verify results list reflects CANCELLED session_status
    res_list = await client.get("/api/results", headers=cand_headers)
    assert res_list.status_code == 200
    cancelled_result = next(r for r in res_list.json() if r["session_id"] == session_id)
    assert cancelled_result["session_status"] == "CANCELLED"


