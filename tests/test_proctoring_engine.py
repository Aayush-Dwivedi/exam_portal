import numpy as np
import pytest
from proctoring.event_engine.engine import ProctoringEventEngine
from proctoring.config.settings import ProctoringConfig
from app.services.risk import calculate_risk_signal
from app.models import ProctoringEvent, ProctoringEventType, EventSeverity, ReviewStatus

def test_camera_blocked_detection():
    config = ProctoringConfig(CAMERA_BLOCKED_THRESHOLD_SECONDS=1.0)
    engine = ProctoringEventEngine(config)

    # Completely black frame
    black_frame = np.zeros((480, 640, 3), dtype=np.uint8)

    # Frame at t=0
    events_0 = engine.process_frame(black_frame, current_time=100.0)
    assert len(events_0) == 0 # Threshold not reached yet

    # Frame at t=0.5 (still below 1.0s threshold)
    events_05 = engine.process_frame(black_frame, current_time=100.5)
    assert len(events_05) == 0

    # Frame at t=1.2 (threshold exceeded -> event generated)
    events_12 = engine.process_frame(black_frame, current_time=101.2)
    assert len(events_12) == 1
    assert events_12[0]["event_type"] == "CAMERA_BLOCKED"
    assert events_12[0]["severity"] == "HIGH"

def test_risk_signal_calculation():
    # 1. No events -> LOW risk (0 score)
    score, level = calculate_risk_signal([])
    assert score == 0
    assert level == "LOW"

    # 2. Looking away event (duration 3s, conf 1.0) -> ~10 points -> LOW
    ev_look = ProctoringEvent(
        event_type=ProctoringEventType.LOOKING_AWAY,
        duration=3.0,
        confidence=1.0,
        severity=EventSeverity.LOW,
        review_status=ReviewStatus.UNREVIEWED
    )
    score_look, level_look = calculate_risk_signal([ev_look])
    assert score_look == 10
    assert level_look == "LOW"

    # 3. Phone detected + multiple faces -> HIGH risk
    ev_phone = ProctoringEvent(
        event_type=ProctoringEventType.PHONE_DETECTED,
        duration=3.0,
        confidence=1.0,
        severity=EventSeverity.HIGH,
        review_status=ReviewStatus.UNREVIEWED
    )
    ev_multi = ProctoringEvent(
        event_type=ProctoringEventType.MULTIPLE_FACES,
        duration=3.0,
        confidence=1.0,
        severity=EventSeverity.HIGH,
        review_status=ReviewStatus.UNREVIEWED
    )
    score_high, level_high = calculate_risk_signal([ev_phone, ev_multi])
    assert score_high >= 80
    assert level_high == "HIGH"

    # 4. Audio disturbance + eye tracking anomaly
    ev_audio = ProctoringEvent(
        event_type=ProctoringEventType.AUDIO_DISTURBANCE,
        duration=3.0,
        confidence=1.0,
        severity=EventSeverity.MEDIUM,
        review_status=ReviewStatus.UNREVIEWED
    )
    ev_gaze = ProctoringEvent(
        event_type=ProctoringEventType.EYE_TRACKING_ANOMALY,
        duration=3.0,
        confidence=1.0,
        severity=EventSeverity.MEDIUM,
        review_status=ReviewStatus.UNREVIEWED
    )
    score_audio_gaze, level_audio_gaze = calculate_risk_signal([ev_audio, ev_gaze])
    assert score_audio_gaze >= 40
    assert level_audio_gaze in ["MEDIUM", "HIGH"]

def test_eye_gaze_detection():
    from proctoring.eye_tracking.detector import EyeGazeDetector
    detector = EyeGazeDetector(horizontal_tolerance=0.18, vertical_tolerance=0.20)

    # 1. Neutral centered face
    face = np.full((120, 120, 3), 220, dtype=np.uint8)
    # Eye band y: ~26 to 62
    # Left eye: x ~18 to 54. Center ~36
    # Right eye: x ~66 to 102. Center ~84
    face[35:45, 31:41] = 20 # Dark pupil in center of left eye
    face[35:45, 79:89] = 20 # Dark pupil in center of right eye

    res_center = detector.detect_gaze(face)
    assert res_center["gaze_anomaly"] is False
    assert res_center["gaze_direction"] == "CENTER"

    # 2. Looking Far Left (pupils shifted far left in eye boxes)
    face_left = np.full((120, 120, 3), 220, dtype=np.uint8)
    face_left[35:45, 19:24] = 20 # Shifted far left
    face_left[35:45, 67:72] = 20 # Shifted far left
    res_left = detector.detect_gaze(face_left)
    assert res_left["gaze_anomaly"] is True
    assert res_left["gaze_direction"] == "FAR_LEFT"

    # 3. Looking Far Right (pupils shifted far right in eye boxes)
    face_right = np.full((120, 120, 3), 220, dtype=np.uint8)
    face_right[35:45, 48:53] = 20 # Shifted far right
    face_right[35:45, 96:101] = 20 # Shifted far right
    res_right = detector.detect_gaze(face_right)
    assert res_right["gaze_anomaly"] is True
    assert res_right["gaze_direction"] == "FAR_RIGHT"

def test_audio_disturbance_debouncing():
    config = ProctoringConfig(AUDIO_DISTURBANCE_THRESHOLD_SECONDS=1.0)
    engine = ProctoringEventEngine(config)
    frame = np.full((100, 100, 3), 128, dtype=np.uint8)

    # At t=100.0, speech starts
    evs_1 = engine.process_frame(frame, current_time=100.0, speech_detected=True, audio_level=0.45)
    audio_evs_1 = [e for e in evs_1 if e["event_type"] == "AUDIO_DISTURBANCE"]
    assert len(audio_evs_1) == 0

    # At t=100.5, speech continues (below 1.0s threshold)
    evs_2 = engine.process_frame(frame, current_time=100.5, speech_detected=True, audio_level=0.50)
    audio_evs_2 = [e for e in evs_2 if e["event_type"] == "AUDIO_DISTURBANCE"]
    assert len(audio_evs_2) == 0

    # At t=101.2, speech persists past 1.0s threshold -> generates AUDIO_DISTURBANCE event
    evs_3 = engine.process_frame(frame, current_time=101.2, speech_detected=True, audio_level=0.52)
    audio_evs_3 = [e for e in evs_3 if e["event_type"] == "AUDIO_DISTURBANCE"]
    assert len(audio_evs_3) == 1
    assert audio_evs_3[0]["event_type"] == "AUDIO_DISTURBANCE"
    assert audio_evs_3[0]["severity"] == "MEDIUM"

