import os
import base64
import numpy as np
import cv2
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import desc

from app.database.session import get_db
from app.models import (
    ProctoringEvent, ExamSession, Exam, User, UserRole, 
    ProctoringEventType, EventSeverity, ReviewStatus, utc_now
)
from app.schemas import (
    ProctoringEventCreate, ProctoringEventOut, 
    ProctoringEventReview, ProctoringSessionReport
)
from app.auth.deps import get_current_user, get_current_user_flexible, require_roles
from app.services.risk import calculate_risk_signal, is_technical_event
from app.services.audit import log_audit_event
from app.websocket.manager import ws_manager

from proctoring.event_engine.engine import ProctoringEventEngine
from proctoring.config.settings import default_cv_config

router = APIRouter(prefix="/proctoring", tags=["Proctoring"])

# Active session event engines
session_engines: Dict[int, ProctoringEventEngine] = {}

class FrameAnalysisRequest(BaseModel):
    session_id: int
    image_base64: str
    audio_level: Optional[float] = 0.0
    speech_detected: Optional[bool] = False

class FrameAnalysisResponse(BaseModel):
    face_count: int
    camera_blocked: bool
    looking_away: bool
    gaze_anomaly: bool = False
    gaze_direction: Optional[str] = "CENTER"
    phone_detected: bool
    is_spoof: bool = False
    audio_anomaly: bool = False
    warning: Optional[str] = None
    warning_severity: Optional[str] = None
    events_triggered: List[str] = []

class SessionStatusUpdate(BaseModel):
    session_id: int
    device_tier: Optional[str] = None
    cv_status: Optional[str] = None
    cv_status_reason: Optional[str] = None
    network_status: Optional[str] = None

class ServerAssistedCheckRequest(BaseModel):
    session_id: int
    image_base64: str

class ServerAssistedCheckResponse(BaseModel):
    face_count: int
    phone_detected: bool
    looking_away: bool
    camera_blocked: bool
    confidence: float
    message: Optional[str] = None

# Rate limiting dictionary: session_id -> last_timestamp
_last_server_check: Dict[int, float] = {}
_last_server_result: Dict[int, Any] = {}

@router.post("/analyze-frame", response_model=FrameAnalysisResponse)
async def analyze_camera_frame(
    payload: FrameAnalysisRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Real-time continuous frame analysis endpoint.
    Accepts candidate webcam frames, executes the complete computer vision pipeline
    (YOLOv8 deep learning + OpenCV + Liveness Anti-Spoofing + Eye Gaze Tracking + Audio Proctoring),
    records debounced events, and returns live feedback diagnostics and integrity warnings.
    """
    stmt = select(ExamSession).where(ExamSession.id == payload.session_id)
    res = await db.execute(stmt)
    session = res.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")

    if session.id not in session_engines:
        session_engines[session.id] = ProctoringEventEngine()

    engine = session_engines[session.id]

    # Decode base64 image
    try:
        header_data = payload.image_base64
        if "," in header_data:
            header_data = header_data.split(",")[1]
        img_bytes = base64.b64decode(header_data)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    except Exception as e:
        frame = None

    if frame is None or frame.size == 0:
        return FrameAnalysisResponse(
            face_count=1,
            camera_blocked=False,
            looking_away=False,
            gaze_anomaly=False,
            gaze_direction="CENTER",
            phone_detected=False,
            is_spoof=False,
            audio_anomaly=bool(payload.speech_detected),
            warning=None,
            warning_severity=None
        )

    # 1. Run direct detectors for immediate diagnostics
    blocked_diag = engine.camera_blocked_detector.check_blocked(frame)
    face_diag = engine.face_detector.analyze_frame(frame)
    obj_diag = engine.object_detector.detect_objects(frame)
    
    first_face_box = face_diag["bounding_boxes"][0] if face_diag["face_count"] >= 1 else None
    spoof_diag = engine.anti_spoofing_detector.check_liveness(frame, first_face_box, obj_diag.get("objects"))

    looking_away_diag = False
    gaze_diag = {"gaze_anomaly": False, "gaze_direction": "CENTER"}
    if face_diag["face_count"] == 1 and first_face_box:
        x, y, w, h = first_face_box
        crop = frame[y:y+h, x:x+w]
        pose = engine.head_pose_estimator.estimate_pose(crop)
        looking_away_diag = pose["looking_away"]
        gaze_diag = engine.eye_gaze_detector.detect_gaze(crop)

    # 2. Run debounced state engine
    triggered_events = engine.process_frame(
        frame,
        speech_detected=bool(payload.speech_detected),
        audio_level=float(payload.audio_level or 0.0)
    )
    persisted_event_types = []

    now = utc_now()
    for ev in triggered_events:
        persisted_event_types.append(ev["event_type"])
        severity_enum = EventSeverity.HIGH if ev["severity"] == "HIGH" else (
            EventSeverity.MEDIUM if ev["severity"] == "MEDIUM" else EventSeverity.LOW
        )
        try:
            event_type_enum = ProctoringEventType(ev["event_type"])
        except ValueError:
            event_type_enum = ProctoringEventType.UNKNOWN_OBJECT

        new_ev = ProctoringEvent(
            session_id=session.id,
            event_type=event_type_enum,
            timestamp=now,
            duration=ev["duration"],
            confidence=ev["confidence"],
            severity=severity_enum,
            metadata_info=ev.get("metadata_info", {}),
            review_status=ReviewStatus.UNREVIEWED
        )
        db.add(new_ev)

        # Broadcast to admin live monitor
        await ws_manager.broadcast_to_admins({
            "type": "proctoring.event",
            "session_id": session.id,
            "candidate_id": current_user.id,
            "candidate_name": current_user.name,
            "event_type": new_ev.event_type.value,
            "severity": new_ev.severity.value,
            "confidence": new_ev.confidence,
            "duration": new_ev.duration,
            "timestamp": now.isoformat() + "Z"
        })

    if triggered_events:
        await db.commit()

    # 3. Formulate Candidate Warning Messages
    warning_msg = None
    warning_severity = None

    if blocked_diag["is_blocked"]:
        warning_msg = "Camera appears blocked or too dark. Please ensure clear optical visibility."
        warning_severity = "HIGH"
    elif spoof_diag["is_spoof"]:
        warning_msg = "2D Screen / Photo Presentation Attack Detected. Live 3D candidate presence required."
        warning_severity = "HIGH"
    elif obj_diag["phone_detected"]:
        warning_msg = "Prohibited device or phone detected in camera frame."
        warning_severity = "HIGH"
    elif face_diag["face_count"] > 1:
        warning_msg = "Multiple faces detected. Examination rules require you to be alone in the room."
        warning_severity = "HIGH"
    elif face_diag["face_count"] == 0:
        warning_msg = "No face detected in camera viewport. Please remain centered in front of the screen."
        warning_severity = "MEDIUM"
    elif gaze_diag["gaze_anomaly"]:
        dir_text = gaze_diag["gaze_direction"].replace("_", " ").lower()
        warning_msg = f"Eye gaze deviation detected: Looking too far {dir_text}. Please keep your eyes focused on the screen."
        warning_severity = "MEDIUM"
    elif payload.speech_detected:
        warning_msg = "Audio disturbance detected: Please maintain complete silence during the examination."
        warning_severity = "MEDIUM"
    elif looking_away_diag:
        warning_msg = "Looking away from the screen detected. Please focus directly on your exam."
        warning_severity = "LOW"

    return FrameAnalysisResponse(
        face_count=face_diag["face_count"],
        camera_blocked=blocked_diag["is_blocked"],
        looking_away=looking_away_diag,
        gaze_anomaly=gaze_diag["gaze_anomaly"],
        gaze_direction=gaze_diag["gaze_direction"],
        phone_detected=obj_diag["phone_detected"],
        is_spoof=spoof_diag["is_spoof"],
        audio_anomaly=bool(payload.speech_detected),
        warning=warning_msg,
        warning_severity=warning_severity,
        events_triggered=persisted_event_types
    )

@router.post("/events", response_model=ProctoringEventOut, status_code=status.HTTP_201_CREATED)
async def record_proctoring_event(
    event_in: ProctoringEventCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(ExamSession).where(ExamSession.id == event_in.session_id)
    res = await db.execute(stmt)
    session = res.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")

    if current_user.role == UserRole.CANDIDATE and session.candidate_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to log events for this session")

    event = ProctoringEvent(
        session_id=event_in.session_id,
        event_type=event_in.event_type,
        timestamp=utc_now(),
        duration=event_in.duration,
        confidence=event_in.confidence,
        severity=event_in.severity,
        evidence_url=event_in.evidence_url,
        metadata_info=event_in.metadata_info,
        review_status=ReviewStatus.UNREVIEWED
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    # Broadcast event in real-time
    await ws_manager.broadcast_to_admins({
        "type": "proctoring.event",
        "session_id": session.id,
        "candidate_id": current_user.id,
        "candidate_name": current_user.name,
        "event_type": event.event_type.value,
        "severity": event.severity.value,
        "confidence": event.confidence,
        "duration": event.duration,
        "timestamp": event.timestamp.isoformat() + "Z",
        "is_technical": is_technical_event(event.event_type)
    })

    return event

@router.post("/session-status")
async def update_session_proctoring_status(
    payload: SessionStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Updates proctoring and connection health status for an active candidate session.
    Broadcasts real-time telemetry to the admin live monitoring dashboard.
    """
    stmt = select(ExamSession).where(ExamSession.id == payload.session_id)
    res = await db.execute(stmt)
    session = res.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")

    if current_user.role == UserRole.CANDIDATE and session.candidate_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if payload.device_tier is not None:
        session.device_tier = payload.device_tier
    if payload.cv_status is not None:
        session.cv_status = payload.cv_status
    if payload.cv_status_reason is not None:
        session.cv_status_reason = payload.cv_status_reason
    if payload.network_status is not None:
        session.network_status = payload.network_status

    await db.commit()

    # Broadcast to admin monitor
    await ws_manager.broadcast_to_admins({
        "type": "proctoring.status",
        "session_id": session.id,
        "candidate_id": session.candidate_id,
        "device_tier": session.device_tier,
        "cv_status": session.cv_status,
        "cv_status_reason": session.cv_status_reason,
        "network_status": session.network_status
    })

    return {
        "status": "STATUS_UPDATED",
        "session_id": session.id,
        "device_tier": session.device_tier,
        "cv_status": session.cv_status,
        "cv_status_reason": session.cv_status_reason,
        "network_status": session.network_status
    }

@router.post("/server-assisted-check", response_model=ServerAssistedCheckResponse)
async def server_assisted_check(
    payload: ServerAssistedCheckRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lightweight, rate-limited server-assisted fallback inspection.
    Accepts low-resolution compressed snapshot from candidate device, runs CPU inference
    for phone & face verification, returning signals without overloading server or candidate.
    """
    import time
    now_ts = time.time()
    last_ts = _last_server_check.get(payload.session_id, 0.0)
    # Rate limit: if called faster than once per 1.0s, return the cached result
    if (now_ts - last_ts) < 1.0 and payload.session_id in _last_server_result:
        return _last_server_result[payload.session_id]
    _last_server_check[payload.session_id] = now_ts

    stmt = select(ExamSession).where(ExamSession.id == payload.session_id)
    res = await db.execute(stmt)
    session = res.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")

    if current_user.role == UserRole.CANDIDATE and session.candidate_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    if session.id not in session_engines:
        session_engines[session.id] = ProctoringEventEngine()
    engine = session_engines[session.id]

    frame = None
    try:
        header_data = payload.image_base64
        if "," in header_data:
            header_data = header_data.split(",")[1]
        img_bytes = base64.b64decode(header_data)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    except Exception:
        frame = None

    if frame is None or frame.size == 0:
        fallback = ServerAssistedCheckResponse(
            face_count=1,
            phone_detected=False,
            looking_away=False,
            camera_blocked=False,
            confidence=0.5,
            message="Invalid frame format"
        )
        return fallback

    # 1. Blocked check
    blocked_diag = engine.camera_blocked_detector.check_blocked(frame)
    if blocked_diag["is_blocked"]:
        resp = ServerAssistedCheckResponse(
            face_count=0,
            phone_detected=False,
            looking_away=False,
            camera_blocked=True,
            confidence=blocked_diag.get("confidence", 0.9)
        )
        _last_server_result[payload.session_id] = resp
        return resp

    # 2. Face count
    face_diag = engine.face_detector.analyze_frame(frame)
    face_count = face_diag["face_count"]

    # 3. Head pose if single face
    looking_away = False
    if face_count == 1 and face_diag["bounding_boxes"]:
        x, y, w, h = face_diag["bounding_boxes"][0]
        crop = frame[y:y+h, x:x+w]
        pose = engine.head_pose_estimator.estimate_pose(crop)
        looking_away = pose.get("looking_away", False)

    # 4. Phone detection
    obj_diag = engine.object_detector.detect_objects(frame)
    phone_detected = obj_diag.get("phone_detected", False)

    resp = ServerAssistedCheckResponse(
        face_count=face_count,
        phone_detected=phone_detected,
        looking_away=looking_away,
        camera_blocked=False,
        confidence=0.90
    )
    _last_server_result[payload.session_id] = resp
    return resp


@router.get("/sessions/{session_id}", response_model=ProctoringSessionReport)
async def get_session_proctoring_report(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    stmt = (
        select(ExamSession)
        .options(selectinload(ExamSession.candidate), selectinload(ExamSession.exam))
        .where(ExamSession.id == session_id)
    )
    res = await db.execute(stmt)
    session = res.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")

    if current_user.role == UserRole.PAPER_SETTER and session.exam.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this exam's proctoring report")

    events_stmt = (
        select(ProctoringEvent)
        .where(ProctoringEvent.session_id == session_id)
        .order_by(ProctoringEvent.timestamp.asc())
    )
    events_res = await db.execute(events_stmt)
    events = events_res.scalars().all()

    risk_score, risk_level = calculate_risk_signal(events)
    low_sev = sum(1 for e in events if e.severity == EventSeverity.LOW)
    med_sev = sum(1 for e in events if e.severity == EventSeverity.MEDIUM)
    high_sev = sum(1 for e in events if e.severity == EventSeverity.HIGH)

    duration_min = 0.0
    if session.started_at:
        end = session.submitted_at or utc_now()
        duration_min = round((end - session.started_at).total_seconds() / 60.0, 1)

    # Check recording path
    rec_dir = os.path.join(os.path.dirname(__file__), "..", "..", "recordings")
    rec_file = os.path.join(rec_dir, f"session_{session.id}.webm")
    rec_url = session.recording_url or (f"/api/proctoring/sessions/{session.id}/recording" if os.path.exists(rec_file) else None)

    tech_count = sum(1 for e in events if is_technical_event(e.event_type))

    return ProctoringSessionReport(
        session_id=session.id,
        candidate_name=session.candidate.name if session.candidate else "Unknown",
        candidate_email=session.candidate.email if session.candidate else "unknown@test.com",
        exam_title=session.exam.title if session.exam else "Unknown Exam",
        session_duration_minutes=duration_min,
        total_events=len(events),
        low_severity_events=low_sev,
        medium_severity_events=med_sev,
        high_severity_events=high_sev,
        risk_score=risk_score,
        risk_level=risk_level,
        recording_url=rec_url,
        started_at=session.started_at,
        device_tier=session.device_tier or "MEDIUM",
        cv_status=session.cv_status or "ACTIVE",
        cv_status_reason=session.cv_status_reason,
        technical_events_count=tech_count,
        events=events
    )

@router.post("/sessions/{session_id}/recording")
async def upload_session_recording(
    session_id: int,
    video: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Saves proctoring camera video recorded by the candidate's browser during the examination.
    """
    stmt = select(ExamSession).where(ExamSession.id == session_id)
    res = await db.execute(stmt)
    session = res.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")

    if current_user.role == UserRole.CANDIDATE and session.candidate_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to upload for this session")

    rec_dir = os.path.join(os.path.dirname(__file__), "..", "..", "recordings")
    os.makedirs(rec_dir, exist_ok=True)
    file_path = os.path.join(rec_dir, f"session_{session_id}.webm")

    contents = await video.read()
    mode = "ab" if video.filename == "chunk" else "wb"
    with open(file_path, mode) as f:
        f.write(contents)

    session.recording_url = f"/api/proctoring/sessions/{session_id}/recording"
    await db.commit()

    return {
        "status": "RECORDING_SAVED",
        "session_id": session_id,
        "recording_url": session.recording_url,
        "size_bytes": len(contents)
    }

@router.get("/sessions/{session_id}/recording")
async def stream_session_recording(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user_flexible)
):
    """
    Streams the recorded proctoring camera video for administrative forensic review.
    """
    rec_dir = os.path.join(os.path.dirname(__file__), "..", "..", "recordings")
    file_path = os.path.join(rec_dir, f"session_{session_id}.webm")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Proctoring video recording not found for this session")

    return FileResponse(file_path, media_type="video/webm", filename=f"exam_recording_session_{session_id}.webm")

@router.patch("/events/{event_id}/review", response_model=ProctoringEventOut)
async def review_proctoring_event(
    event_id: int,
    review_in: ProctoringEventReview,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN))
):
    stmt = select(ProctoringEvent).where(ProctoringEvent.id == event_id)
    res = await db.execute(stmt)
    event = res.scalars().first()
    if not event:
        raise HTTPException(status_code=404, detail="Proctoring event not found")

    event.review_status = review_in.review_status
    event.review_notes = review_in.review_notes
    event.reviewed_by = current_user.id
    event.reviewed_at = utc_now()

    await db.commit()
    await db.refresh(event)

    await log_audit_event(
        db=db,
        user=current_user,
        action="PROCTORING_EVENT_REVIEWED",
        resource_type="PROCTORING_EVENT",
        resource_id=str(event.id),
        details={"status": review_in.review_status.value, "notes": review_in.review_notes}
    )

    return event

@router.get("/live-candidates")
async def get_live_candidates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN))
):
    """
    Returns all real-time in-progress examination sessions from the database
    with candidate identity, solved question progress, latest observed signal, and risk levels.
    """
    from app.models import SessionStatus, ExamQuestion

    stmt = (
        select(ExamSession)
        .options(
            selectinload(ExamSession.candidate),
            selectinload(ExamSession.exam).selectinload(Exam.exam_questions),
            selectinload(ExamSession.answers),
            selectinload(ExamSession.proctoring_events)
        )
        .where(ExamSession.status.in_([SessionStatus.IN_PROGRESS, SessionStatus.SUBMITTED]))
        .order_by(ExamSession.started_at.desc())
    )
    res = await db.execute(stmt)
    sessions = res.scalars().all()

    output = []
    for s in sessions:
        events = s.proctoring_events or []
        risk_score, risk_level = calculate_risk_signal(events)
        total_q = len(s.exam.exam_questions) if s.exam and s.exam.exam_questions else 10
        solved_q = len(s.answers) if s.answers else 0
        
        last_ev = "Normal Activity"
        last_ev_time = "Just now"
        if events:
            latest = events[-1]
            last_ev = f"{latest.event_type.value} ({latest.duration}s)"
            diff_sec = max(0, int((utc_now() - latest.timestamp).total_seconds()))
            if diff_sec < 60:
                last_ev_time = "Just now"
            else:
                last_ev_time = f"{diff_sec // 60}m ago"

        is_tech = is_technical_event(latest.event_type) if events else False

        output.append({
            "session_id": s.id,
            "candidate_id": s.candidate_id,
            "name": s.candidate.name if s.candidate else f"Candidate #{s.candidate_id}",
            "email": s.candidate.email if s.candidate else "candidate@example.com",
            "exam_title": s.exam.title if s.exam else "Examination Session",
            "started_at": (s.started_at.isoformat() + "Z") if s.started_at else (utc_now().isoformat() + "Z"),
            "progress": solved_q,
            "total_questions": total_q,
            "status": "ONLINE" if s.status == SessionStatus.IN_PROGRESS else "OFFLINE",
            "device_tier": s.device_tier or "MEDIUM",
            "cv_status": s.cv_status or "ACTIVE",
            "cv_status_reason": s.cv_status_reason,
            "network_status": s.network_status or ("ONLINE" if s.status == SessionStatus.IN_PROGRESS else "OFFLINE"),
            "risk_level": risk_level,
            "risk_score": risk_score,
            "last_event": last_ev,
            "last_event_time": last_ev_time,
            "is_technical_last_event": is_tech
        })

    return output

