import secrets
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, func
from app.database.session import get_db
from app.models import User, UserRole, UserStatus, utc_now, Exam, CandidateEnrollment, ExamStatus
from app.schemas import Token, LoginRequest, RegisterRequest, UserOut, DemoCandidateResponse
from app.auth.security import verify_password, get_password_hash, create_access_token
from app.auth.deps import get_current_user
from app.services.audit import log_audit_event

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=Token)
async def login(
    login_data: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    ident = (login_data.identifier or login_data.email or "").strip()
    if not ident:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide your Candidate Roll Number or Email."
        )
    
    # Query candidate by Roll Number or Email (case-insensitive)
    stmt = select(User).where(
        or_(
            func.lower(User.email) == ident.lower(),
            func.lower(User.roll_number) == ident.lower()
        )
    )
    result = await db.execute(stmt)
    user = result.scalars().first()
    
    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Roll Number/Email or Password. Please check the credentials received on your email.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is deactivated. Please contact an administrator."
        )

    # Update last login
    user.last_login = utc_now()
    await db.commit()

    access_token = create_access_token(subject=user.id, role=user.role.value)
    
    await log_audit_event(
        db=db,
        action="USER_LOGIN",
        resource_type="USER",
        user_id=user.id,
        resource_id=str(user.id),
        details={"identifier": ident, "email": user.email, "role": user.role.value, "roll_number": user.roll_number}
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "role": user.role,
        "user_id": user.id,
        "name": user.name,
        "email": user.email,
        "roll_number": user.roll_number
    }

@router.post("/register")
async def register():
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Public registration is disabled. Candidate Roll Numbers and passwords are provided directly via institutional email."
    )

@router.post("/demo-candidate", response_model=DemoCandidateResponse)
async def create_demo_candidate(
    db: AsyncSession = Depends(get_db)
):
    """
    Creates a unique temporary candidate account with active status and auto-enrolls
    the candidate into available published mock examinations for live testing.
    """
    # Generate unique roll number & email with collision checks
    candidate_roll = ""
    candidate_email = ""
    suffix = ""
    for _ in range(15):
        suffix = f"{secrets.randbelow(90000) + 10000}"
        cand_roll_test = f"DEMO-{suffix}"
        cand_email_test = f"demo.candidate{suffix}@examportal.demo"
        
        check = await db.execute(
            select(User).where(
                or_(
                    func.lower(User.roll_number) == cand_roll_test.lower(),
                    func.lower(User.email) == cand_email_test.lower()
                )
            )
        )
        if not check.scalars().first():
            candidate_roll = cand_roll_test
            candidate_email = cand_email_test
            break

    if not candidate_roll:
        candidate_roll = f"DEMO-{secrets.token_hex(3).upper()}"
        candidate_email = f"demo.{secrets.token_hex(4)}@examportal.demo"

    plain_password = f"MockExam@{secrets.randbelow(9000) + 1000}"
    candidate_name = f"Demo Candidate #{suffix if suffix else secrets.randbelow(900) + 100}"

    user = User(
        name=candidate_name,
        email=candidate_email,
        roll_number=candidate_roll,
        password_hash=get_password_hash(plain_password),
        role=UserRole.CANDIDATE,
        status=UserStatus.ACTIVE
    )
    db.add(user)
    await db.flush()

    # Find all published, active, or approved exams to auto-enroll
    exams_query = select(Exam).where(
        Exam.status.in_([ExamStatus.PUBLISHED, ExamStatus.ACTIVE, ExamStatus.APPROVED])
    )
    published_exams = (await db.execute(exams_query)).scalars().all()

    # If no published exams exist yet, ensure the practice mock exam is created
    if not published_exams:
        try:
            from create_dummy_exam import create_dummy_exam
            await create_dummy_exam()
            published_exams = (await db.execute(exams_query)).scalars().all()
        except Exception:
            pass

    enrolled_count = 0
    for ex in published_exams:
        enr_check = await db.execute(
            select(CandidateEnrollment).where(
                CandidateEnrollment.candidate_id == user.id,
                CandidateEnrollment.exam_id == ex.id
            )
        )
        if not enr_check.scalars().first():
            db.add(CandidateEnrollment(
                candidate_id=user.id,
                exam_id=ex.id,
                status="ENROLLED"
            ))
            enrolled_count += 1

    await db.commit()

    await log_audit_event(
        db=db,
        action="DEMO_CANDIDATE_CREATED",
        resource_type="USER",
        user_id=user.id,
        resource_id=str(user.id),
        details={
            "roll_number": candidate_roll,
            "email": candidate_email,
            "enrolled_exams": enrolled_count
        }
    )

    return {
        "user_id": user.id,
        "name": user.name,
        "email": user.email,
        "roll_number": user.roll_number,
        "password": plain_password,
        "role": user.role,
        "enrolled_exams_count": enrolled_count
    }

@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
