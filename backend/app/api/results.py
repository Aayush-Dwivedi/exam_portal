from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import desc
from app.database.session import get_db
from app.models import Result, ExamSession, Exam, User, UserRole, utc_now
from app.schemas import ResultOut, PublishResultRequest, BulkPublishResultRequest
from app.auth.deps import get_current_user, require_roles
from app.services.risk import get_session_risk_summary
from app.services.audit import log_audit_event

router = APIRouter(prefix="/results", tags=["Results & Evaluation"])

@router.get("", response_model=List[ResultOut])
async def list_results(
    exam_id: Optional[int] = None,
    candidate_id: Optional[int] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = (
        select(Result)
        .options(
            selectinload(Result.candidate),
            selectinload(Result.exam),
            selectinload(Result.approver),
            selectinload(Result.session)
        )
        .order_by(desc(Result.created_at))
    )

    if current_user.role == UserRole.CANDIDATE:
        query = query.where(Result.candidate_id == current_user.id)
    elif current_user.role == UserRole.PAPER_SETTER:
        # Paper Setters see submissions for exams they created
        query = query.join(Exam, Result.exam_id == Exam.id).where(Exam.created_by == current_user.id)
        if candidate_id:
            query = query.where(Result.candidate_id == candidate_id)
        if exam_id:
            query = query.where(Result.exam_id == exam_id)
    else:
        # Admin sees all results
        if candidate_id:
            query = query.where(Result.candidate_id == candidate_id)
        if exam_id:
            query = query.where(Result.exam_id == exam_id)

    query = query.offset(skip).limit(limit)
    res = await db.execute(query)
    results = res.scalars().all()

    output = []
    for r in results:
        risk_info = await get_session_risk_summary(db, r.session_id)
        
        # If candidate is viewing an unpublished result, mask raw score & answers
        is_published = bool(r.is_published)
        is_candidate = (current_user.role == UserRole.CANDIDATE)
        
        score_val = r.score if (is_published or not is_candidate) else 0.0
        pct_val = r.percentage if (is_published or not is_candidate) else 0.0
        corr_val = r.correct if (is_published or not is_candidate) else 0
        incorr_val = r.incorrect if (is_published or not is_candidate) else 0
        unans_val = r.unanswered if (is_published or not is_candidate) else 0
        sec_scores = r.section_scores if (is_published or not is_candidate) else None

        r_out = ResultOut(
            id=r.id,
            session_id=r.session_id,
            candidate_id=r.candidate_id,
            candidate_name=r.candidate.name if r.candidate else "Unknown",
            candidate_email=r.candidate.email if r.candidate else "Unknown",
            exam_id=r.exam_id,
            exam_title=r.exam.title if r.exam else "Unknown",
            total_questions=r.total_questions,
            attempted=r.attempted,
            correct=corr_val,
            incorrect=incorr_val,
            unanswered=unans_val,
            score=score_val,
            max_score=r.max_score,
            percentage=pct_val,
            section_scores=sec_scores,
            created_at=r.created_at,
            is_published=is_published,
            approved_by=r.approved_by,
            approved_by_name=r.approver.name if r.approver else None,
            approved_at=r.approved_at,
            approval_notes=r.approval_notes,
            risk_score=risk_info["risk_score"],
            risk_level=risk_info["risk_level"],
            session_status=r.session.status.value if (r.session and r.session.status) else None
        )
        output.append(r_out)

    return output

@router.get("/{result_id}", response_model=ResultOut)
async def get_result_detail(
    result_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = (
        select(Result)
        .options(
            selectinload(Result.candidate),
            selectinload(Result.exam),
            selectinload(Result.approver),
            selectinload(Result.session)
        )
        .where(Result.id == result_id)
    )
    res = await db.execute(stmt)
    r = res.scalars().first()
    if not r:
        raise HTTPException(status_code=404, detail="Result not found")

    if current_user.role == UserRole.CANDIDATE:
        if r.candidate_id != current_user.id:
            raise HTTPException(status_code=403, detail="Unauthorized")
        if not r.is_published:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This assessment result is currently under review and has not yet been approved or published by the examiner."
            )
    elif current_user.role == UserRole.PAPER_SETTER:
        if r.exam and r.exam.created_by != current_user.id:
            raise HTTPException(status_code=403, detail="Unauthorized to view results for this examination.")

    risk_info = await get_session_risk_summary(db, r.session_id)
    return ResultOut(
        id=r.id,
        session_id=r.session_id,
        candidate_id=r.candidate_id,
        candidate_name=r.candidate.name if r.candidate else "Unknown",
        candidate_email=r.candidate.email if r.candidate else "Unknown",
        exam_id=r.exam_id,
        exam_title=r.exam.title if r.exam else "Unknown",
        total_questions=r.total_questions,
        attempted=r.attempted,
        correct=r.correct,
        incorrect=r.incorrect,
        unanswered=r.unanswered,
        score=r.score,
        max_score=r.max_score,
        percentage=r.percentage,
        section_scores=r.section_scores,
        created_at=r.created_at,
        is_published=bool(r.is_published),
        approved_by=r.approved_by,
        approved_by_name=r.approver.name if r.approver else None,
        approved_at=r.approved_at,
        approval_notes=r.approval_notes,
        risk_score=risk_info["risk_score"],
        risk_level=risk_info["risk_level"],
        session_status=r.session.status.value if (r.session and r.session.status) else None
    )

@router.post("/{result_id}/publish", response_model=ResultOut)
async def publish_result(
    result_id: int,
    req: Optional[PublishResultRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    stmt = (
        select(Result)
        .options(
            selectinload(Result.candidate),
            selectinload(Result.exam),
            selectinload(Result.approver)
        )
        .where(Result.id == result_id)
    )
    res = await db.execute(stmt)
    r = res.scalars().first()
    if not r:
        raise HTTPException(status_code=404, detail="Result not found")

    if current_user.role == UserRole.PAPER_SETTER and r.exam and r.exam.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You can only publish results for examinations you authored.")

    now = utc_now()
    r.is_published = True
    r.approved_by = current_user.id
    r.approved_at = now
    if req and req.approval_notes:
        r.approval_notes = req.approval_notes.strip()

    await db.commit()
    await db.refresh(r)

    await log_audit_event(
        db=db,
        action="RESULT_PUBLISHED",
        resource_type="RESULT",
        user_id=current_user.id,
        resource_id=str(r.id),
        details={"session_id": r.session_id, "candidate_id": r.candidate_id, "score": r.score, "percentage": r.percentage}
    )

    risk_info = await get_session_risk_summary(db, r.session_id)
    return ResultOut(
        id=r.id,
        session_id=r.session_id,
        candidate_id=r.candidate_id,
        candidate_name=r.candidate.name if r.candidate else "Unknown",
        candidate_email=r.candidate.email if r.candidate else "Unknown",
        exam_id=r.exam_id,
        exam_title=r.exam.title if r.exam else "Unknown",
        total_questions=r.total_questions,
        attempted=r.attempted,
        correct=r.correct,
        incorrect=r.incorrect,
        unanswered=r.unanswered,
        score=r.score,
        max_score=r.max_score,
        percentage=r.percentage,
        section_scores=r.section_scores,
        created_at=r.created_at,
        is_published=True,
        approved_by=r.approved_by,
        approved_by_name=current_user.name,
        approved_at=r.approved_at,
        approval_notes=r.approval_notes,
        risk_score=risk_info["risk_score"],
        risk_level=risk_info["risk_level"]
    )

@router.post("/{result_id}/unpublish", response_model=ResultOut)
async def unpublish_result(
    result_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    stmt = (
        select(Result)
        .options(
            selectinload(Result.candidate),
            selectinload(Result.exam),
            selectinload(Result.approver)
        )
        .where(Result.id == result_id)
    )
    res = await db.execute(stmt)
    r = res.scalars().first()
    if not r:
        raise HTTPException(status_code=404, detail="Result not found")

    if current_user.role == UserRole.PAPER_SETTER and r.exam and r.exam.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You can only manage results for examinations you authored.")

    r.is_published = False
    r.approved_by = None
    r.approved_at = None

    await db.commit()
    await db.refresh(r)

    await log_audit_event(
        db=db,
        action="RESULT_UNPUBLISHED",
        resource_type="RESULT",
        user_id=current_user.id,
        resource_id=str(r.id),
        details={"session_id": r.session_id, "candidate_id": r.candidate_id}
    )

    risk_info = await get_session_risk_summary(db, r.session_id)
    return ResultOut(
        id=r.id,
        session_id=r.session_id,
        candidate_id=r.candidate_id,
        candidate_name=r.candidate.name if r.candidate else "Unknown",
        candidate_email=r.candidate.email if r.candidate else "Unknown",
        exam_id=r.exam_id,
        exam_title=r.exam.title if r.exam else "Unknown",
        total_questions=r.total_questions,
        attempted=r.attempted,
        correct=r.correct,
        incorrect=r.incorrect,
        unanswered=r.unanswered,
        score=r.score,
        max_score=r.max_score,
        percentage=r.percentage,
        section_scores=r.section_scores,
        created_at=r.created_at,
        is_published=False,
        approved_by=None,
        approved_by_name=None,
        approved_at=None,
        approval_notes=None,
        risk_score=risk_info["risk_score"],
        risk_level=risk_info["risk_level"]
    )

@router.post("/publish-all")
async def publish_all_results(
    req: Optional[BulkPublishResultRequest] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    query = (
        select(Result)
        .options(selectinload(Result.exam))
        .where(Result.is_published == False)
    )

    if req and req.exam_id:
        query = query.where(Result.exam_id == req.exam_id)

    if current_user.role == UserRole.PAPER_SETTER:
        query = query.join(Exam, Result.exam_id == Exam.id).where(Exam.created_by == current_user.id)

    res = await db.execute(query)
    unapproved_results = res.scalars().all()

    now = utc_now()
    count = len(unapproved_results)
    for r in unapproved_results:
        r.is_published = True
        r.approved_by = current_user.id
        r.approved_at = now
        if req and req.approval_notes:
            r.approval_notes = req.approval_notes.strip()

    await db.commit()

    await log_audit_event(
        db=db,
        action="RESULTS_BULK_PUBLISHED",
        resource_type="RESULT",
        user_id=current_user.id,
        resource_id="BULK",
        details={"count": count, "exam_id": req.exam_id if req else None}
    )

    return {
        "status": "success",
        "published_count": count,
        "message": f"Successfully approved and published {count} assessment results."
    }
