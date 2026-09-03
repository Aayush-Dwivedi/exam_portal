from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import or_, desc, func
from app.database.session import get_db
from app.models import (
    Exam, Section, Question, ExamQuestion, CandidateEnrollment, 
    User, UserRole, ExamStatus, ExamSession, SessionStatus
)
from app.schemas import (
    ExamCreate, ExamUpdate, ExamOut, ExamDetailOut, 
    ExamApprovalRequest, EnrollmentCreate, SectionCreate, ExamQuestionAssign
)
from app.auth.deps import get_current_user, require_roles
from app.services.audit import log_audit_event

router = APIRouter(prefix="/exams", tags=["Exams"])

@router.get("", response_model=List[ExamOut])
async def list_exams(
    status_filter: Optional[ExamStatus] = None,
    my_exams_only: bool = False,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = (
        select(Exam)
        .options(selectinload(Exam.sections), selectinload(Exam.exam_questions))
        .order_by(desc(Exam.created_at))
    )

    # Role-based filtering
    if current_user.role == UserRole.PAPER_SETTER:
        if my_exams_only:
            query = query.where(Exam.created_by == current_user.id)
    elif current_user.role == UserRole.CANDIDATE:
        # Candidates can only see PUBLISHED or ACTIVE exams they are enrolled in or public
        query = query.join(CandidateEnrollment, CandidateEnrollment.exam_id == Exam.id, isouter=True)
        query = query.where(
            Exam.status.in_([ExamStatus.PUBLISHED, ExamStatus.ACTIVE]),
            or_(
                CandidateEnrollment.candidate_id == current_user.id,
                Exam.id.isnot(None) # Allow browsing available published exams
            )
        ).distinct()

    if status_filter:
        query = query.where(Exam.status == status_filter)

    if search:
        query = query.where(Exam.title.ilike(f"%{search.strip()}%"))

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    exams = result.scalars().all()

    # Calculate total questions & total marks for output
    out = []
    for ex in exams:
        ex_out = ExamOut.model_validate(ex)
        ex_out.total_questions = len(ex.exam_questions)
        out.append(ex_out)
    return out

@router.post("", response_model=ExamOut, status_code=status.HTTP_201_CREATED)
async def create_exam(
    exam_in: ExamCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    new_exam = Exam(
        title=exam_in.title.strip(),
        description=exam_in.description,
        instructions=exam_in.instructions,
        duration_minutes=exam_in.duration_minutes,
        start_time=exam_in.start_time,
        end_time=exam_in.end_time,
        negative_marking=exam_in.negative_marking,
        allow_navigation=exam_in.allow_navigation,
        allow_mark_review=exam_in.allow_mark_review,
        shuffle_questions=exam_in.shuffle_questions,
        shuffle_options=exam_in.shuffle_options,
        proctoring_enabled=exam_in.proctoring_enabled,
        allow_reattempts=exam_in.allow_reattempts,
        status=ExamStatus.DRAFT,
        created_by=current_user.id
    )
    db.add(new_exam)
    await db.flush()

    # Add sections if provided
    if exam_in.sections:
        for idx, sec in enumerate(exam_in.sections):
            new_sec = Section(
                exam_id=new_exam.id,
                title=sec.title.strip(),
                description=sec.description,
                sequence=sec.sequence if sec.sequence is not None else idx
            )
            db.add(new_sec)

    # Add questions if provided
    if exam_in.questions:
        for idx, q_assign in enumerate(exam_in.questions):
            eq = ExamQuestion(
                exam_id=new_exam.id,
                question_id=q_assign.question_id,
                section_id=q_assign.section_id,
                sequence=q_assign.sequence if q_assign.sequence is not None else idx,
                marks_override=q_assign.marks_override,
                negative_marks_override=q_assign.negative_marks_override
            )
            db.add(eq)

    await db.commit()

    # Reload with relations
    stmt = (
        select(Exam)
        .options(selectinload(Exam.sections), selectinload(Exam.exam_questions))
        .where(Exam.id == new_exam.id)
    )
    res = await db.execute(stmt)
    saved_exam = res.scalars().first()

    await log_audit_event(
        db=db,
        action="EXAM_CREATED",
        resource_type="EXAM",
        user_id=current_user.id,
        resource_id=str(new_exam.id),
        details={"title": new_exam.title}
    )

    ex_out = ExamOut.model_validate(saved_exam)
    ex_out.total_questions = len(saved_exam.exam_questions)
    return ex_out

@router.get("/{exam_id}", response_model=ExamDetailOut)
async def get_exam_detail(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    stmt = (
        select(Exam)
        .options(
            selectinload(Exam.sections),
            selectinload(Exam.exam_questions).selectinload(ExamQuestion.question).selectinload(Question.options)
        )
        .where(Exam.id == exam_id)
    )
    res = await db.execute(stmt)
    exam = res.scalars().first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    # Authorization checks
    if current_user.role == UserRole.PAPER_SETTER and exam.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have access to view this exam blueprint")

    # If Candidate, hide question details if exam not active or results not released
    if current_user.role == UserRole.CANDIDATE:
        ex_out = ExamDetailOut.model_validate(exam)
        ex_out.questions = [] # Hide full question bank/answers
        ex_out.total_questions = len(exam.exam_questions)
        return ex_out

    questions_out = [eq.question for eq in exam.exam_questions]
    ex_out = ExamDetailOut.model_validate(exam)
    ex_out.questions = questions_out
    ex_out.total_questions = len(questions_out)
    return ex_out

@router.patch("/{exam_id}", response_model=ExamOut)
async def update_exam(
    exam_id: int,
    exam_in: ExamUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    stmt = select(Exam).options(selectinload(Exam.sections), selectinload(Exam.exam_questions)).where(Exam.id == exam_id)
    res = await db.execute(stmt)
    exam = res.scalars().first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if current_user.role == UserRole.PAPER_SETTER and exam.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You can only update your own exams")

    if exam.status in [ExamStatus.PUBLISHED, ExamStatus.ACTIVE, ExamStatus.COMPLETED] and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="Cannot edit an exam that has already been published or started")

    for field, val in exam_in.dict(exclude_unset=True).items():
        setattr(exam, field, val)

    await db.commit()
    await db.refresh(exam)

    ex_out = ExamOut.model_validate(exam)
    ex_out.total_questions = len(exam.exam_questions)
    return ex_out

@router.post("/{exam_id}/sections", response_model=ExamOut)
async def set_exam_sections(
    exam_id: int,
    sections: List[SectionCreate],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    stmt = select(Exam).options(selectinload(Exam.sections), selectinload(Exam.exam_questions)).where(Exam.id == exam_id)
    res = await db.execute(stmt)
    exam = res.scalars().first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if current_user.role == UserRole.PAPER_SETTER and exam.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Unauthorized")

    # Clear old sections
    for sec in list(exam.sections):
        await db.delete(sec)

    for idx, sec in enumerate(sections):
        new_sec = Section(
            exam_id=exam.id,
            title=sec.title.strip(),
            description=sec.description,
            sequence=sec.sequence if sec.sequence is not None else idx
        )
        db.add(new_sec)

    await db.commit()
    await db.refresh(exam)
    ex_out = ExamOut.model_validate(exam)
    ex_out.total_questions = len(exam.exam_questions)
    return ex_out

@router.post("/{exam_id}/assign-questions", response_model=ExamOut)
async def assign_exam_questions(
    exam_id: int,
    questions: List[ExamQuestionAssign],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    stmt = select(Exam).options(selectinload(Exam.sections), selectinload(Exam.exam_questions)).where(Exam.id == exam_id)
    res = await db.execute(stmt)
    exam = res.scalars().first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if current_user.role == UserRole.PAPER_SETTER and exam.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Unauthorized")

    # Clear existing assigned questions
    for eq in list(exam.exam_questions):
        await db.delete(eq)

    for idx, q_item in enumerate(questions):
        new_eq = ExamQuestion(
            exam_id=exam.id,
            question_id=q_item.question_id,
            section_id=q_item.section_id,
            sequence=q_item.sequence if q_item.sequence is not None else idx,
            marks_override=q_item.marks_override,
            negative_marks_override=q_item.negative_marks_override
        )
        db.add(new_eq)

    await db.commit()
    
    # Reload
    stmt = select(Exam).options(selectinload(Exam.sections), selectinload(Exam.exam_questions)).where(Exam.id == exam_id)
    res = await db.execute(stmt)
    updated_exam = res.scalars().first()

    ex_out = ExamOut.model_validate(updated_exam)
    ex_out.total_questions = len(updated_exam.exam_questions)
    return ex_out

@router.post("/{exam_id}/submit-for-review", response_model=ExamOut)
async def submit_for_review(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    stmt = select(Exam).options(selectinload(Exam.sections), selectinload(Exam.exam_questions)).where(Exam.id == exam_id)
    res = await db.execute(stmt)
    exam = res.scalars().first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if current_user.role == UserRole.PAPER_SETTER and exam.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Unauthorized")

    if len(exam.exam_questions) == 0:
        raise HTTPException(status_code=400, detail="Cannot submit an exam with 0 questions")

    exam.status = ExamStatus.UNDER_REVIEW
    exam.rejection_reason = None
    await db.commit()

    await log_audit_event(
        db=db,
        action="EXAM_SUBMITTED_FOR_REVIEW",
        resource_type="EXAM",
        user_id=current_user.id,
        resource_id=str(exam.id)
    )

    ex_out = ExamOut.model_validate(exam)
    ex_out.total_questions = len(exam.exam_questions)
    return ex_out

@router.post("/{exam_id}/review", response_model=ExamOut)
async def review_exam(
    exam_id: int,
    review_in: ExamApprovalRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN))
):
    stmt = select(Exam).options(selectinload(Exam.sections), selectinload(Exam.exam_questions)).where(Exam.id == exam_id)
    res = await db.execute(stmt)
    exam = res.scalars().first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if review_in.status == ExamStatus.APPROVED:
        exam.status = ExamStatus.APPROVED
        exam.approved_by = admin.id
        exam.rejection_reason = None
    elif review_in.status == ExamStatus.REJECTED:
        exam.status = ExamStatus.REJECTED
        exam.rejection_reason = review_in.rejection_reason or "Changes requested by administrator"
    else:
        raise HTTPException(status_code=400, detail="Status must be APPROVED or REJECTED")

    await db.commit()

    await log_audit_event(
        db=db,
        action=f"EXAM_{exam.status.value}",
        resource_type="EXAM",
        user_id=admin.id,
        resource_id=str(exam.id),
        details={"reason": exam.rejection_reason}
    )

    ex_out = ExamOut.model_validate(exam)
    ex_out.total_questions = len(exam.exam_questions)
    return ex_out

@router.post("/{exam_id}/publish", response_model=ExamOut)
async def publish_exam(
    exam_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN))
):
    stmt = select(Exam).options(selectinload(Exam.sections), selectinload(Exam.exam_questions)).where(Exam.id == exam_id)
    res = await db.execute(stmt)
    exam = res.scalars().first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if exam.status != ExamStatus.APPROVED and exam.status != ExamStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Exam must be in APPROVED state to publish")

    exam.status = ExamStatus.PUBLISHED
    await db.commit()

    await log_audit_event(
        db=db,
        action="EXAM_PUBLISHED",
        resource_type="EXAM",
        user_id=admin.id,
        resource_id=str(exam.id)
    )

    ex_out = ExamOut.model_validate(exam)
    ex_out.total_questions = len(exam.exam_questions)
    return ex_out

@router.post("/{exam_id}/enroll", status_code=status.HTTP_200_OK)
async def enroll_candidates(
    exam_id: int,
    enrollment: EnrollmentCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    stmt = select(Exam).where(Exam.id == exam_id)
    res = await db.execute(stmt)
    exam = res.scalars().first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    enrolled_count = 0
    for email in enrollment.candidate_emails:
        u_stmt = select(User).where(User.email == email.lower().strip())
        u_res = await db.execute(u_stmt)
        candidate = u_res.scalars().first()
        if candidate and candidate.role == UserRole.CANDIDATE:
            # Check existing enrollment
            e_stmt = select(CandidateEnrollment).where(
                CandidateEnrollment.exam_id == exam.id,
                CandidateEnrollment.candidate_id == candidate.id
            )
            e_res = await db.execute(e_stmt)
            if not e_res.scalars().first():
                new_enroll = CandidateEnrollment(
                    candidate_id=candidate.id,
                    exam_id=exam.id,
                    status="ENROLLED"
                )
                db.add(new_enroll)
                enrolled_count += 1

    await db.commit()
    return {"message": f"Successfully enrolled {enrolled_count} candidates"}
