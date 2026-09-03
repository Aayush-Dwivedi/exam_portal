from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import AuditLog
from app.core.logging import logger

async def log_audit_event(
    db: AsyncSession,
    action: str,
    resource_type: str,
    user_id: Optional[int] = None,
    resource_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> AuditLog:
    try:
        audit_entry = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id else None,
            ip_address=ip_address,
            details=details or {}
        )
        db.add(audit_entry)
        await db.commit()
        logger.info(f"AUDIT: action={action} user_id={user_id} resource={resource_type}:{resource_id}")
        return audit_entry
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")
        return None
