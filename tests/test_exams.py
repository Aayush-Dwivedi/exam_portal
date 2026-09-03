import pytest

@pytest.mark.asyncio
async def test_question_crud_and_exam_workflow(client, setter_token, admin_token):
    headers = {"Authorization": f"Bearer {setter_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create a Question
    q_res = await client.post(
        "/api/questions",
        headers=headers,
        json={
            "question_text": "What is 2 + 2?",
            "question_type": "MCQ",
            "subject": "Mathematics",
            "topic": "Arithmetic",
            "difficulty": "EASY",
            "marks": 1.0,
            "negative_marks": 0.25,
            "explanation": "2 + 2 equals 4.",
            "options": [
                {"option_text": "4", "sequence": 0, "is_correct": True},
                {"option_text": "5", "sequence": 1, "is_correct": False},
                {"option_text": "3", "sequence": 2, "is_correct": False}
            ]
        }
    )
    assert q_res.status_code == 201
    q_data = q_res.json()
    q_id = q_data["id"]
    assert len(q_data["options"]) == 3

    # 2. Create an Exam
    exam_res = await client.post(
        "/api/exams",
        headers=headers,
        json={
            "title": "Basic Math Test",
            "description": "Simple test",
            "duration_minutes": 30,
            "negative_marking": True,
            "sections": [
                {"title": "Section A", "sequence": 0}
            ],
            "questions": [
                {"question_id": q_id, "sequence": 0}
            ]
        }
    )
    assert exam_res.status_code == 201
    exam_data = exam_res.json()
    exam_id = exam_data["id"]
    assert exam_data["status"] == "DRAFT"

    # 3. Submit for Review
    sub_res = await client.post(
        f"/api/exams/{exam_id}/submit-for-review",
        headers=headers
    )
    assert sub_res.status_code == 200
    assert sub_res.json()["status"] == "UNDER_REVIEW"

    # 4. Admin Approves Exam
    appr_res = await client.post(
        f"/api/exams/{exam_id}/review",
        headers=admin_headers,
        json={"status": "APPROVED"}
    )
    assert appr_res.status_code == 200
    assert appr_res.json()["status"] == "APPROVED"

    # 5. Admin Publishes Exam
    pub_res = await client.post(
        f"/api/exams/{exam_id}/publish",
        headers=admin_headers
    )
    assert pub_res.status_code == 200
    assert pub_res.json()["status"] == "PUBLISHED"
