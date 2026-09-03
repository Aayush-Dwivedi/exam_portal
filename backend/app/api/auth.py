from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import or_, func
from app.database.session import get_db
from app.models import User, UserRole, UserStatus, utc_now
from app.schemas import Token, LoginRequest, RegisterRequest, UserOut
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

@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
