import random
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import desc
from app.database.session import get_db
from app.models import (
    ExamSession, Exam, Question, Option, Answer, Result, 
    CandidateEnrollment, ExamQuestion, Section,
    User, UserRole, SessionStatus, ExamStatus, utc_now
)
from app.schemas import (
    ExamSessionStart, SaveAnswerRequest, AnswerOut, 
    CandidateExamSessionOut, CandidateQuestionOut, CandidateOptionOut, SectionOut,
    SubmitSessionRequest
)
from app.auth.deps import get_current_user
from app.services.evaluation import evaluate_exam_session
from app.services.audit import log_audit_event
from app.websocket.manager import ws_manager

router = APIRouter(prefix="/exam-sessions", tags=["Exam Sessions (Candidate Engine)"])

@router.post("/start", response_model=CandidateExamSessionOut)
async def start_exam_session(
    start_in: ExamSessionStart,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Fetch exam with sections, questions and options
    stmt = (
        select(Exam)
        .options(
            selectinload(Exam.sections),
            selectinload(Exam.exam_questions).selectinload(ExamQuestion.question).selectinload(Question.options)
        )
        .where(Exam.id == start_in.exam_id)
    )
    res = await db.execute(stmt)
    exam = res.scalars().first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if exam.status not in [ExamStatus.PUBLISHED, ExamStatus.ACTIVE, ExamStatus.APPROVED]:
        raise HTTPException(status_code=400, detail="This exam is not currently available to take")

    now = utc_now()

    # Query the latest session for this candidate
    sess_stmt = (
        select(ExamSession)
        .options(selectinload(ExamSession.answers))
        .where(
            ExamSession.exam_id == exam.id,
            ExamSession.candidate_id == current_user.id
        )
        .order_by(desc(ExamSession.started_at))
    )
    sess_res = await db.execute(sess_stmt)
    latest_session = sess_res.scalars().first()

    session = None

    if latest_session:
        if latest_session.status == SessionStatus.IN_PROGRESS:
            if now >= latest_session.expires_at:
                latest_session.status = SessionStatus.AUTO_SUBMITTED
                latest_session.submitted_at = latest_session.expires_at
                await db.commit()
                await evaluate_exam_session(db, latest_session.id)
                if not getattr(exam, 'allow_reattempts', False):
                    raise HTTPException(status_code=400, detail="Exam session time has expired and has been submitted")
            else:
                session = latest_session
        elif latest_session.status in [SessionStatus.SUBMITTED, SessionStatus.AUTO_SUBMITTED]:
            if not getattr(exam, 'allow_reattempts', False):
                raise HTTPException(status_code=400, detail="You have already submitted this exam")

    if not session:
        # Create new session
        duration = exam.duration_minutes
        expires = now + timedelta(minutes=duration)
        
        # Determine question order
        all_q_ids = [eq.question_id for eq in exam.exam_questions]
        if exam.shuffle_questions:
            random.shuffle(all_q_ids)

        option_orders = {}
        if exam.shuffle_options:
            for eq in exam.exam_questions:
                opts = [opt.id for opt in eq.question.options]
                random.shuffle(opts)
                option_orders[str(eq.question_id)] = opts

        session = ExamSession(
            exam_id=exam.id,
            candidate_id=current_user.id,
            started_at=now,
            expires_at=expires,
            status=SessionStatus.IN_PROGRESS,
            last_activity=now,
            question_order=all_q_ids,
            option_order=option_orders
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)

        await log_audit_event(
            db=db,
            action="EXAM_STARTED",
            resource_type="EXAM_SESSION",
            user_id=current_user.id,
            resource_id=str(session.id),
            details={"exam_id": exam.id, "duration": duration}
        )

    # Build Candidate Questions safely (stripping is_correct, explanation)
    questions_map = {eq.question_id: eq for eq in exam.exam_questions}
    ordered_q_ids = session.question_order or [eq.question_id for eq in exam.exam_questions]
    
    candidate_questions: List[CandidateQuestionOut] = []
    for q_id in ordered_q_ids:
        eq = questions_map.get(q_id)
        if not eq:
            continue
        q = eq.question
        
        # Handle option order
        opts = list(q.options)
        if session.option_order and str(q.id) in session.option_order:
            opt_id_order = session.option_order[str(q.id)]
            opts_map = {opt.id: opt for opt in opts}
            opts = [opts_map[oid] for oid in opt_id_order if oid in opts_map]

        cand_options = [
            CandidateOptionOut(
                id=opt.id,
                option_text=opt.option_text,
                sequence=opt.sequence
            ) for opt in opts
        ]

        q_marks = eq.marks_override if eq.marks_override is not None else q.marks
        q_negative = eq.negative_marks_override if eq.negative_marks_override is not None else (
            q.negative_marks if exam.negative_marking else 0.0
        )

        candidate_questions.append(
            CandidateQuestionOut(
                id=q.id,
                question_text=q.question_text,
                question_type=q.question_type,
                subject=q.subject,
                topic=q.topic,
                difficulty=q.difficulty,
                marks=q_marks,
                negative_marks=q_negative,
                section_id=eq.section_id,
                sequence=eq.sequence,
                options=cand_options
            )
        )

    # Fetch existing saved answers
    answers_stmt = select(Answer).where(Answer.session_id == session.id)
    answers_res = await db.execute(answers_stmt)
    saved_answers_list = answers_res.scalars().all()
    
    saved_answers_dict = {
        ans.question_id: {
            "selected_option": ans.selected_option,
            "answer_text": ans.answer_text,
            "is_marked_review": ans.is_marked_review
        } for ans in saved_answers_list
    }

    sections_out = [SectionOut.model_validate(s) for s in exam.sections]

    return CandidateExamSessionOut(
        session_id=session.id,
        exam_id=exam.id,
        exam_title=exam.title,
        duration_minutes=exam.duration_minutes,
        started_at=session.started_at,
        expires_at=session.expires_at,
        server_time=utc_now(),
        status=session.status,
        questions=candidate_questions,
        sections=sections_out,
        saved_answers=saved_answers_dict,
        rules={
            "negative_marking": exam.negative_marking,
            "allow_navigation": exam.allow_navigation,
            "allow_mark_review": exam.allow_mark_review,
            "proctoring_enabled": exam.proctoring_enabled
        }
    )

@router.post("/{session_id}/answers", response_model=Dict[str, Any])
async def save_answer(
    session_id: int,
    ans_in: SaveAnswerRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(ExamSession).where(ExamSession.id == session_id)
    res = await db.execute(stmt)
    session = res.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")

    if session.candidate_id != current_user.id:
        raise HTTPException(status_code=403, detail="Unauthorized")

    now = utc_now()
    # Check if expired
    if now >= session.expires_at:
        session.status = SessionStatus.AUTO_SUBMITTED
        session.submitted_at = session.expires_at
        await db.commit()
        await evaluate_exam_session(db, session.id)
        raise HTTPException(status_code=400, detail="Time expired. Exam auto-submitted.")

    if session.status in [SessionStatus.SUBMITTED, SessionStatus.AUTO_SUBMITTED]:
        raise HTTPException(status_code=400, detail="Exam session already finalized")

    # Update last activity
    session.last_activity = now

    # Upsert answer
    ans_stmt = select(Answer).where(
        Answer.session_id == session.id,
        Answer.question_id == ans_in.question_id
    )
    ans_res = await db.execute(ans_stmt)
    existing_ans = ans_res.scalars().first()

    if not existing_ans:
        new_ans = Answer(
            session_id=session.id,
            question_id=ans_in.question_id,
            selected_option=ans_in.selected_option,
            answer_text=ans_in.answer_text,
            is_marked_review=ans_in.is_marked_review,
            saved_at=now
        )
        db.add(new_ans)
    else:
        existing_ans.selected_option = ans_in.selected_option
        existing_ans.answer_text = ans_in.answer_text
        existing_ans.is_marked_review = ans_in.is_marked_review
        existing_ans.saved_at = now

    await db.commit()

    # Notify admin monitoring via WebSocket
    await ws_manager.broadcast_to_admins({
        "type": "exam.answer_saved",
        "session_id": session.id,
        "candidate_id": current_user.id,
        "question_id": ans_in.question_id,
        "timestamp": now.isoformat() + "Z"
    })

    return {
        "status": "saved",
        "question_id": ans_in.question_id,
        "server_time": now.isoformat() + "Z"
    }

@router.post("/{session_id}/submit", response_model=Dict[str, Any])
async def submit_exam_session(
    session_id: int,
    payload: Optional[SubmitSessionRequest] = None,
    cancellation_reason: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(ExamSession).where(ExamSession.id == session_id)
    res = await db.execute(stmt)
    session = res.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")

    if session.candidate_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Unauthorized")

    if session.status in [SessionStatus.SUBMITTED, SessionStatus.AUTO_SUBMITTED, SessionStatus.CANCELLED]:
        return {"status": "already_finalized", "message": "Exam session already finalized"}

    actual_cancellation_reason = (payload.cancellation_reason if payload and payload.cancellation_reason else cancellation_reason)

    now = utc_now()
    if actual_cancellation_reason:
        session.status = SessionStatus.CANCELLED
    else:
        session.status = SessionStatus.SUBMITTED
    session.submitted_at = now
    await db.commit()

    # Evaluate immediately
    result = await evaluate_exam_session(db, session.id)

    action_name = "EXAM_CANCELLED" if actual_cancellation_reason else "EXAM_SUBMITTED"
    await log_audit_event(
        db=db,
        action=action_name,
        resource_type="EXAM_SESSION",
        user_id=current_user.id,
        resource_id=str(session.id),
        details={
            "score": result.score, 
            "max_score": result.max_score, 
            "percentage": result.percentage,
            "cancellation_reason": actual_cancellation_reason
        }
    )

    # Broadcast to admin monitor
    await ws_manager.broadcast_to_admins({
        "type": "exam.cancelled" if actual_cancellation_reason else "exam.submitted",
        "session_id": session.id,
        "candidate_id": current_user.id,
        "cancellation_reason": actual_cancellation_reason,
        "score": result.score,
        "percentage": result.percentage
    })

    return {
        "status": "cancelled" if actual_cancellation_reason else "submitted",
        "session_id": session.id,
        "cancellation_reason": actual_cancellation_reason,
        "submitted_at": now.isoformat() + "Z",
        "total_questions": result.total_questions,
        "attempted": result.attempted,
        "score": result.score,
        "percentage": result.percentage
    }

@router.get("/{session_id}/sync")
async def sync_session_timer(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = select(ExamSession).where(ExamSession.id == session_id)
    res = await db.execute(stmt)
    session = res.scalars().first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    now = utc_now()
    remaining_seconds = max(0, int((session.expires_at - now).total_seconds()))

    return {
        "session_id": session.id,
        "server_time": now.isoformat() + "Z",
        "expires_at": session.expires_at.isoformat() + "Z",
        "remaining_seconds": remaining_seconds,
        "status": session.status.value
    }
