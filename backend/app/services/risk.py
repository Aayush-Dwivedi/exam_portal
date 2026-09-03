from typing import List, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models import ProctoringEvent, ProctoringEventType, EventSeverity, ReviewStatus
from app.core.config import settings

def calculate_risk_signal(events: List[ProctoringEvent]) -> Tuple[int, str]:
    """
    Computes an AI-assisted Risk Signal Score (0-100) and Level (LOW, MEDIUM, HIGH)
    from recorded proctoring events.
    Does NOT accuse of cheating; prioritizes administrative review.
    """
    raw_score = 0
    
    weights = {
        ProctoringEventType.PHONE_DETECTED: settings.WEIGHT_PHONE_DETECTED,
        ProctoringEventType.MULTIPLE_FACES: settings.WEIGHT_MULTIPLE_FACES,
        ProctoringEventType.CAMERA_BLOCKED: settings.WEIGHT_CAMERA_BLOCKED,
        ProctoringEventType.FACE_NOT_DETECTED: settings.WEIGHT_FACE_NOT_DETECTED,
        ProctoringEventType.LOOKING_AWAY: settings.WEIGHT_LOOKING_AWAY,
        ProctoringEventType.AUDIO_DISTURBANCE: settings.WEIGHT_AUDIO_DISTURBANCE,
        ProctoringEventType.EYE_TRACKING_ANOMALY: settings.WEIGHT_EYE_TRACKING_ANOMALY,
        ProctoringEventType.PERSON_ENTERED_FRAME: 25,
        ProctoringEventType.UNKNOWN_OBJECT: 20
    }

    for ev in events:
        # If admin dismissed the event, ignore it from risk score
        if ev.review_status == ReviewStatus.DISMISSED:
            continue
            
        base_weight = weights.get(ev.event_type, 10)
        # Factor in confidence and duration multiplier (capped)
        duration_multiplier = min(2.0, max(1.0, ev.duration / 3.0))
        confidence_factor = max(0.5, ev.confidence)
        
        event_impact = base_weight * duration_multiplier * confidence_factor
        raw_score += event_impact

    # Normalize to 0-100 scale
    normalized_score = min(100, int(raw_score))

    if normalized_score <= 20:
        level = "LOW"
    elif normalized_score <= 50:
        level = "MEDIUM"
    else:
        level = "HIGH"

    return normalized_score, level

async def get_session_risk_summary(db: AsyncSession, session_id: int) -> Dict[str, Any]:
    stmt = select(ProctoringEvent).where(ProctoringEvent.session_id == session_id)
    res = await db.execute(stmt)
    events = res.scalars().all()

    total_events = len(events)
    low_sev = sum(1 for e in events if e.severity == EventSeverity.LOW)
    med_sev = sum(1 for e in events if e.severity == EventSeverity.MEDIUM)
    high_sev = sum(1 for e in events if e.severity == EventSeverity.HIGH)

    score, level = calculate_risk_signal(events)

    return {
        "total_events": total_events,
        "low_severity_events": low_sev,
        "medium_severity_events": med_sev,
        "high_severity_events": high_sev,
        "risk_score": score,
        "risk_level": level,
        "events": events
    }
