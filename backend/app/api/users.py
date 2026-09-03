import random
import string
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, desc, func
from app.database.session import get_db
from app.models import User, UserRole, UserStatus
from app.schemas import UserCreate, UserUpdate, UserOut
from app.auth.security import get_password_hash
from app.auth.deps import require_roles
from app.services.audit import log_audit_event

router = APIRouter(prefix="/users", tags=["Users (Admin)"])

def generate_roll_number() -> str:
    suffix = ''.join(random.choices(string.digits, k=4))
    return f"ROLL-2026-{suffix}"

@router.get("", response_model=List[UserOut])
async def list_users(
    role: Optional[UserRole] = None,
    status: Optional[UserStatus] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN))
):
    query = select(User).order_by(desc(User.created_at))
    
    if role:
        query = query.where(User.role == role)
    if status:
        query = query.where(User.status == status)
    if search:
        search_pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                User.name.ilike(search_pattern),
                User.email.ilike(search_pattern),
                User.roll_number.ilike(search_pattern)
            )
        )
    
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()

@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN))
):
    # Check if email exists
    stmt = select(User).where(User.email == user_in.email.lower().strip())
    res = await db.execute(stmt)
    if res.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists"
        )
    
    roll_num = user_in.roll_number.strip().upper() if user_in.roll_number and user_in.roll_number.strip() else None
    
    # Check roll number uniqueness if provided or auto-generate for candidate
    if roll_num:
        r_stmt = select(User).where(func.upper(User.roll_number) == roll_num)
        r_res = await db.execute(r_stmt)
        if r_res.scalars().first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Roll number '{roll_num}' is already assigned to another user."
            )
    elif user_in.role == UserRole.CANDIDATE:
        # Generate unique roll number
        for _ in range(5):
            candidate_roll = generate_roll_number()
            r_stmt = select(User).where(User.roll_number == candidate_roll)
            r_res = await db.execute(r_stmt)
            if not r_res.scalars().first():
                roll_num = candidate_roll
                break
    
    new_user = User(
        name=user_in.name.strip(),
        email=user_in.email.lower().strip(),
        roll_number=roll_num,
        password_hash=get_password_hash(user_in.password),
        role=user_in.role,
        status=user_in.status
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    await log_audit_event(
        db=db,
        action="USER_CREATED",
        resource_type="USER",
        user_id=admin.id,
        resource_id=str(new_user.id),
        details={"created_email": new_user.email, "role": new_user.role.value, "roll_number": new_user.roll_number}
    )

    return new_user

@router.get("/{user_id}", response_model=UserOut)
async def get_user_by_id(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN))
):
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    user = res.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    user_in: UserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN))
):
    stmt = select(User).where(User.id == user_id)
    res = await db.execute(stmt)
    user = res.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_in.name is not None:
        user.name = user_in.name.strip()
    if user_in.email is not None:
        user.email = user_in.email.lower().strip()
    if user_in.roll_number is not None:
        new_roll = user_in.roll_number.strip().upper() if user_in.roll_number.strip() else None
        if new_roll and new_roll != user.roll_number:
            # Check duplicate
            r_stmt = select(User).where(func.upper(User.roll_number) == new_roll, User.id != user_id)
            r_res = await db.execute(r_stmt)
            if r_res.scalars().first():
                raise HTTPException(status_code=400, detail=f"Roll number '{new_roll}' is already in use.")
        user.roll_number = new_roll
    if user_in.role is not None:
        user.role = user_in.role
    if user_in.status is not None:
        user.status = user_in.status
    if user_in.password is not None and user_in.password.strip():
        user.password_hash = get_password_hash(user_in.password.strip())

    await db.commit()
    await db.refresh(user)

    await log_audit_event(
        db=db,
        action="USER_UPDATED",
        resource_type="USER",
        user_id=admin.id,
        resource_id=str(user.id),
        details={"updated_email": user.email, "status": user.status.value, "role": user.role.value, "roll_number": user.roll_number}
    )

    return user
