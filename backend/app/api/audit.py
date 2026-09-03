from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import desc
from app.database.session import get_db
from app.models import AuditLog, User, UserRole
from app.schemas import AuditLogOut
from app.auth.deps import require_roles

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs (Admin)"])

@router.get("", response_model=List[AuditLogOut])
async def list_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.ADMIN))
):
    stmt = (
        select(AuditLog)
        .options(selectinload(AuditLog.user))
        .order_by(desc(AuditLog.timestamp))
        .offset(skip)
        .limit(limit)
    )
    res = await db.execute(stmt)
    logs = res.scalars().all()

    output = []
    for log in logs:
        output.append(
            AuditLogOut(
                id=log.id,
                user_id=log.user_id,
                user_email=log.user.email if log.user else "System",
                action=log.action,
                resource_type=log.resource_type,
                resource_id=log.resource_id,
                timestamp=log.timestamp,
                ip_address=log.ip_address,
                details=log.details
            )
        )
    return output
