from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import or_, desc
from app.database.session import get_db
from app.models import Question, Option, User, UserRole, QuestionType, DifficultyLevel
from app.schemas import QuestionCreate, QuestionUpdate, QuestionOut, OptionCreate
from app.auth.deps import require_roles
from app.services.audit import log_audit_event

router = APIRouter(prefix="/questions", tags=["Question Bank"])

@router.get("", response_model=List[QuestionOut])
async def list_questions(
    subject: Optional[str] = None,
    topic: Optional[str] = None,
    difficulty: Optional[DifficultyLevel] = None,
    question_type: Optional[QuestionType] = None,
    search: Optional[str] = None,
    my_questions_only: bool = False,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    query = (
        select(Question)
        .options(selectinload(Question.options))
        .order_by(desc(Question.created_at))
    )

    if current_user.role == UserRole.PAPER_SETTER and my_questions_only:
        query = query.where(Question.created_by == current_user.id)
    
    if subject:
        query = query.where(Question.subject.ilike(f"%{subject.strip()}%"))
    if topic:
        query = query.where(Question.topic.ilike(f"%{topic.strip()}%"))
    if difficulty:
        query = query.where(Question.difficulty == difficulty)
    if question_type:
        query = query.where(Question.question_type == question_type)
    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                Question.question_text.ilike(search_pattern),
                Question.subject.ilike(search_pattern),
                Question.topic.ilike(search_pattern)
            )
        )

    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()

@router.post("", response_model=QuestionOut, status_code=status.HTTP_201_CREATED)
async def create_question(
    q_in: QuestionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    new_q = Question(
        question_text=q_in.question_text.strip(),
        question_type=q_in.question_type,
        subject=q_in.subject.strip(),
        topic=q_in.topic.strip(),
        difficulty=q_in.difficulty,
        marks=q_in.marks,
        negative_marks=q_in.negative_marks,
        explanation=q_in.explanation.strip() if q_in.explanation else None,
        created_by=current_user.id
    )
    db.add(new_q)
    await db.flush()

    if q_in.options:
        for idx, opt in enumerate(q_in.options):
            new_opt = Option(
                question_id=new_q.id,
                option_text=opt.option_text.strip(),
                sequence=opt.sequence if opt.sequence is not None else idx,
                is_correct=opt.is_correct
            )
            db.add(new_opt)

    await db.commit()
    
    # Reload with options
    stmt = select(Question).options(selectinload(Question.options)).where(Question.id == new_q.id)
    res = await db.execute(stmt)
    saved_q = res.scalars().first()

    await log_audit_event(
        db=db,
        action="QUESTION_CREATED",
        resource_type="QUESTION",
        user_id=current_user.id,
        resource_id=str(new_q.id),
        details={"subject": new_q.subject, "type": new_q.question_type.value}
    )

    return saved_q

@router.get("/{question_id}", response_model=QuestionOut)
async def get_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    stmt = select(Question).options(selectinload(Question.options)).where(Question.id == question_id)
    res = await db.execute(stmt)
    q = res.scalars().first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    return q

@router.patch("/{question_id}", response_model=QuestionOut)
async def update_question(
    question_id: int,
    q_in: QuestionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    stmt = select(Question).options(selectinload(Question.options)).where(Question.id == question_id)
    res = await db.execute(stmt)
    q = res.scalars().first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    
    if current_user.role == UserRole.PAPER_SETTER and q.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit questions you authored")

    if q_in.question_text is not None:
        q.question_text = q_in.question_text.strip()
    if q_in.question_type is not None:
        q.question_type = q_in.question_type
    if q_in.subject is not None:
        q.subject = q_in.subject.strip()
    if q_in.topic is not None:
        q.topic = q_in.topic.strip()
    if q_in.difficulty is not None:
        q.difficulty = q_in.difficulty
    if q_in.marks is not None:
        q.marks = q_in.marks
    if q_in.negative_marks is not None:
        q.negative_marks = q_in.negative_marks
    if q_in.explanation is not None:
        q.explanation = q_in.explanation.strip()

    if q_in.options is not None:
        # Clear existing options and recreate
        for existing_opt in list(q.options):
            await db.delete(existing_opt)
        
        for idx, opt in enumerate(q_in.options):
            new_opt = Option(
                question_id=q.id,
                option_text=opt.option_text.strip(),
                sequence=opt.sequence if opt.sequence is not None else idx,
                is_correct=opt.is_correct
            )
            db.add(new_opt)

    await db.commit()
    
    # Reload
    stmt = select(Question).options(selectinload(Question.options)).where(Question.id == question_id)
    res = await db.execute(stmt)
    updated_q = res.scalars().first()

    await log_audit_event(
        db=db,
        action="QUESTION_UPDATED",
        resource_type="QUESTION",
        user_id=current_user.id,
        resource_id=str(q.id)
    )

    return updated_q

@router.delete("/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    stmt = select(Question).where(Question.id == question_id)
    res = await db.execute(stmt)
    q = res.scalars().first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    
    if current_user.role == UserRole.PAPER_SETTER and q.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete questions you authored")

    await db.delete(q)
    await db.commit()

    await log_audit_event(
        db=db,
        action="QUESTION_DELETED",
        resource_type="QUESTION",
        user_id=current_user.id,
        resource_id=str(question_id)
    )
    return None

@router.post("/{question_id}/duplicate", response_model=QuestionOut)
async def duplicate_question(
    question_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ADMIN, UserRole.PAPER_SETTER))
):
    stmt = select(Question).options(selectinload(Question.options)).where(Question.id == question_id)
    res = await db.execute(stmt)
    q = res.scalars().first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    copy_q = Question(
        question_text=f"{q.question_text} (Copy)",
        question_type=q.question_type,
        subject=q.subject,
        topic=q.topic,
        difficulty=q.difficulty,
        marks=q.marks,
        negative_marks=q.negative_marks,
        explanation=q.explanation,
        created_by=current_user.id
    )
    db.add(copy_q)
    await db.flush()

    for opt in q.options:
        copy_opt = Option(
            question_id=copy_q.id,
            option_text=opt.option_text,
            sequence=opt.sequence,
            is_correct=opt.is_correct
        )
        db.add(copy_opt)

    await db.commit()

    stmt = select(Question).options(selectinload(Question.options)).where(Question.id == copy_q.id)
    res = await db.execute(stmt)
    return res.scalars().first()
