import pytest
import numpy as np
import time
from proctoring.config.settings import ProctoringConfig, default_cv_config, PerformanceTierConfig
from proctoring.event_engine.engine import ProctoringEventEngine
from proctoring.benchmark import run_cv_benchmark
from app.models import ProctoringEvent, ProctoringEventType, EventSeverity, ReviewStatus
from app.services.risk import calculate_risk_signal, is_technical_event, TECHNICAL_EVENT_TYPES

def test_performance_tiers_configuration():
    """Verifies that performance tier profiles have correct settings and CPU-friendly defaults."""
    config = ProctoringConfig()
    tiers = config.TIERS
    assert "HIGH" in tiers
    assert "MEDIUM" in tiers
    assert "LOW" in tiers
    assert "UNSUPPORTED" in tiers

    # HIGH: moderate resolution, moderate frequency
    high = tiers["HIGH"]
    assert high.resolution == (320, 240)
    assert high.frame_interval_ms == 1800
    assert high.face_detection_enabled is True
    assert high.head_pose_enabled is True

    # MEDIUM: lower resolution, lower frequency
    med = tiers["MEDIUM"]
    assert med.resolution == (240, 180)
    assert med.frame_interval_ms == 2800
    assert med.server_assisted_fallback is True

    # LOW: minimal resolution, minimal frequency
    low = tiers["LOW"]
    assert low.resolution == (160, 120)
    assert low.frame_interval_ms == 4000
    assert low.head_pose_enabled is False
    assert low.object_detection_interval_ms == -1

def test_temporal_debouncing_and_cooldown():
    """Verifies that events are debounced and respect cooldowns rather than firing on single frames."""
    config = ProctoringConfig(
        FACE_MISSING_THRESHOLD_SECONDS=2.0,
        EVENT_COOLDOWN_SECONDS=5.0
    )
    engine = ProctoringEventEngine(config)

    # Frame with texture/variance so not camera-blocked, but contains no faces
    rng = np.random.RandomState(42)
    empty_frame = rng.randint(60, 180, (120, 160, 3), dtype=np.uint8)

    # At t=0: Condition begins, no event emitted
    evs_0 = engine.process_frame(empty_frame, current_time=100.0)
    missing_0 = [e for e in evs_0 if e["event_type"] == "FACE_NOT_DETECTED"]
    assert len(missing_0) == 0

    # At t=1.0: Below 2.0s threshold, no event emitted
    evs_1 = engine.process_frame(empty_frame, current_time=101.0)
    missing_1 = [e for e in evs_1 if e["event_type"] == "FACE_NOT_DETECTED"]
    assert len(missing_1) == 0

    # At t=2.2: Threshold (2.0s) exceeded -> single confirmed event emitted
    evs_2 = engine.process_frame(empty_frame, current_time=102.2)
    missing_2 = [e for e in evs_2 if e["event_type"] == "FACE_NOT_DETECTED"]
    assert len(missing_2) == 1
    assert missing_2[0]["event_type"] == "FACE_NOT_DETECTED"
    assert missing_2[0]["duration"] >= 2.0

    # At t=3.0: Condition still active, but within 5.0s cooldown -> NO duplicate event emitted!
    evs_3 = engine.process_frame(empty_frame, current_time=103.0)
    missing_3 = [e for e in evs_3 if e["event_type"] == "FACE_NOT_DETECTED"]
    assert len(missing_3) == 0

    # At t=8.0: Cooldown elapsed (108.0 - 102.2 > 5.0s) -> new alert emitted
    evs_4 = engine.process_frame(empty_frame, current_time=108.0)
    missing_4 = [e for e in evs_4 if e["event_type"] == "FACE_NOT_DETECTED"]
    assert len(missing_4) == 1

def test_technical_vs_suspicious_events_separation():
    """Verifies that technical issues do NOT inflate the candidate cheating risk score."""
    # 1. Technical events only
    ev_cam = ProctoringEvent(
        event_type=ProctoringEventType.CAMERA_DISCONNECTED,
        duration=5.0,
        confidence=1.0,
        severity=EventSeverity.LOW,
        review_status=ReviewStatus.UNREVIEWED
    )
    ev_net = ProctoringEvent(
        event_type=ProctoringEventType.NETWORK_INTERRUPTION,
        duration=10.0,
        confidence=1.0,
        severity=EventSeverity.LOW,
        review_status=ReviewStatus.UNREVIEWED
    )
    ev_cv = ProctoringEvent(
        event_type=ProctoringEventType.CV_PERFORMANCE_DEGRADED,
        duration=2.0,
        confidence=1.0,
        severity=EventSeverity.LOW,
        review_status=ReviewStatus.UNREVIEWED
    )

    assert is_technical_event(ev_cam.event_type) is True
    assert is_technical_event(ev_net.event_type) is True
    assert is_technical_event(ev_cv.event_type) is True

    # Technical events score must remain 0
    score, level = calculate_risk_signal([ev_cam, ev_net, ev_cv])
    assert score == 0
    assert level == "LOW"

    # 2. Environment / Suspicious event added (Phone detected)
    ev_phone = ProctoringEvent(
        event_type=ProctoringEventType.PHONE_DETECTED,
        duration=3.0,
        confidence=1.0,
        severity=EventSeverity.HIGH,
        review_status=ReviewStatus.UNREVIEWED
    )
    assert is_technical_event(ev_phone.event_type) is False

    score_with_phone, level_with_phone = calculate_risk_signal([ev_cam, ev_net, ev_phone])
    assert score_with_phone >= 45 # Phone weight contributes
    assert level_with_phone in ["MEDIUM", "HIGH"]

def test_cv_benchmark_utility():
    """Verifies that the CPU CV benchmarking utility executes properly across tiers."""
    report = run_cv_benchmark(iterations=3)
    assert "tiers" in report
    tiers = report["tiers"]
    assert "HIGH" in tiers
    assert "MEDIUM" in tiers
    assert "LOW" in tiers

    for tier_name, metrics in tiers.items():
        assert "total_latency_ms" in metrics
        assert "estimated_cpu_fps" in metrics
        assert metrics["total_latency_ms"] > 0
        assert metrics["estimated_cpu_fps"] > 0

@pytest.mark.asyncio
async def test_session_status_and_server_assisted_endpoints(client, setter_token, admin_token, candidate_token):
    """Verifies that session-status and server-assisted-check endpoints work properly."""
    setter_headers = {"Authorization": f"Bearer {setter_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    cand_headers = {"Authorization": f"Bearer {candidate_token}"}

    # 1. Create a published exam and candidate session via API
    q_res = await client.post(
        "/api/questions",
        headers=setter_headers,
        json={
            "question_text": "Sample question for proctoring test?",
            "question_type": "MCQ",
            "subject": "General",
            "topic": "General",
            "marks": 1.0,
            "negative_marks": 0.0,
            "options": [
                {"option_text": "Option A", "is_correct": True},
                {"option_text": "Option B", "is_correct": False}
            ]
        }
    )
    assert q_res.status_code in [200, 201]
    q_id = q_res.json()["id"]

    exam_res = await client.post(
        "/api/exams",
        headers=setter_headers,
        json={
            "title": "Lightweight Proctoring Test Exam",
            "duration_minutes": 30,
            "negative_marking": False,
            "questions": [{"question_id": q_id, "sequence": 0}]
        }
    )
    assert exam_res.status_code in [200, 201]
    exam_id = exam_res.json()["id"]

    pub_res = await client.post(f"/api/exams/{exam_id}/publish", headers=admin_headers)
    assert pub_res.status_code == 200

    start_res = await client.post(
        "/api/exam-sessions/start",
        headers=cand_headers,
        json={"exam_id": exam_id}
    )
    assert start_res.status_code == 200
    session_id = start_res.json()["session_id"]

    # 2. Update session status (e.g. from client lightweight CV engine)
    resp = await client.post(
        "/api/proctoring/session-status",
        json={
            "session_id": session_id,
            "device_tier": "LOW",
            "cv_status": "DEGRADED",
            "cv_status_reason": "High CPU latency: reduced frequency",
            "network_status": "ONLINE"
        },
        headers=cand_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "STATUS_UPDATED"
    assert data["device_tier"] == "LOW"
    assert data["cv_status"] == "DEGRADED"

    # 3. Server assisted check with dummy low-res image
    dummy_base64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="
    check_resp = await client.post(
        "/api/proctoring/server-assisted-check",
        json={
            "session_id": session_id,
            "image_base64": dummy_base64
        },
        headers=cand_headers
    )
    assert check_resp.status_code == 200
    check_data = check_resp.json()
    assert "face_count" in check_data
    assert "phone_detected" in check_data
    assert "looking_away" in check_data
    assert "confidence" in check_data

