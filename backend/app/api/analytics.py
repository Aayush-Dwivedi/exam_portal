from typing import Dict, Any, List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from app.database.session import get_db
from app.models import (
    User, Exam, ExamSession, Result, ProctoringEvent, 
    UserRole, ExamStatus, SessionStatus, Question
)
from app.schemas import AdminAnalyticsOut
from app.auth.deps import require_roles
from app.services.risk import get_session_risk_summary

router = APIRouter(prefix="/analytics", tags=["Analytics"])

@router.get("/admin", response_model=AdminAnalyticsOut)
async def get_admin_analytics(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN))
):
    # Total candidates
    cand_stmt = select(func.count(User.id)).where(User.role == UserRole.CANDIDATE)
    total_candidates = (await db.execute(cand_stmt)).scalar() or 0

    # Total paper setters
    setter_stmt = select(func.count(User.id)).where(User.role == UserRole.PAPER_SETTER)
    total_setters = (await db.execute(setter_stmt)).scalar() or 0

    # Exams counts
    exams_stmt = select(Exam.status, func.count(Exam.id)).group_by(Exam.status)
    exam_counts_res = (await db.execute(exams_stmt)).all()
    exams_by_status = {str(status.value): count for status, count in exam_counts_res}
    
    total_exams = sum(exams_by_status.values())
    active_exams = exams_by_status.get("ACTIVE", 0) + exams_by_status.get("PUBLISHED", 0)
    completed_exams = exams_by_status.get("COMPLETED", 0)
    pending_approvals = exams_by_status.get("UNDER_REVIEW", 0)

    # Average score & pass rate (percentage >= 40%)
    res_stmt = select(func.avg(Result.percentage), func.count(Result.id)).select_from(Result)
    res_row = (await db.execute(res_stmt)).first()
    avg_score = round(res_row[0], 1) if res_row and res_row[0] is not None else 0.0
    total_results = res_row[1] if res_row else 0

    pass_stmt = select(func.count(Result.id)).where(Result.percentage >= 40.0)
    passed_count = (await db.execute(pass_stmt)).scalar() or 0
    pass_rate = round((passed_count / max(1, total_results)) * 100.0, 1) if total_results > 0 else 0.0

    # Suspicious sessions (sessions with high risk events)
    suspicious_stmt = (
        select(func.count(func.distinct(ProctoringEvent.session_id)))
        .where(ProctoringEvent.severity.in_(["HIGH", "MEDIUM"]))
    )
    suspicious_count = (await db.execute(suspicious_stmt)).scalar() or 0

    # Recent proctoring events count
    events_stmt = select(func.count(ProctoringEvent.id))
    recent_events_count = (await db.execute(events_stmt)).scalar() or 0

    return AdminAnalyticsOut(
        total_candidates=total_candidates,
        total_paper_setters=total_setters,
        total_exams=total_exams,
        active_exams=active_exams,
        completed_exams=completed_exams,
        pending_approvals=pending_approvals,
        suspicious_sessions_count=suspicious_count,
        average_score_pct=avg_score,
        pass_rate_pct=pass_rate,
        exams_by_status=exams_by_status,
        recent_events_count=recent_events_count
    )

@router.get("/questions")
async def get_question_analytics(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    # Retrieve question performance across all attempts
    q_stmt = select(Question)
    q_res = await db.execute(q_stmt)
    questions = q_res.scalars().all()

    items = []
    for q in questions:
        items.append({
            "id": q.id,
            "question_text": q.question_text[:80] + ("..." if len(q.question_text) > 80 else ""),
            "subject": q.subject,
            "topic": q.topic,
            "difficulty": q.difficulty.value,
            "type": q.question_type.value,
            "marks": q.marks
        })
    return items
