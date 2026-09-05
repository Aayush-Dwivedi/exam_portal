from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings

# Normalize DATABASE_URL for async SQLAlchemy
raw_db_url = settings.DATABASE_URL.strip()
if raw_db_url.startswith("postgres://"):
    raw_db_url = raw_db_url.replace("postgres://", "postgresql+asyncpg://", 1)
elif raw_db_url.startswith("postgresql://") and not raw_db_url.startswith("postgresql+asyncpg://"):
    raw_db_url = raw_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

# Asyncpg sslmode compatibility
if "sslmode=" in raw_db_url:
    raw_db_url = raw_db_url.replace("sslmode=require", "ssl=require").replace("sslmode=prefer", "ssl=prefer").replace("sslmode=verify-full", "ssl=require")

# Engine configuration based on database dialect
connect_args = {}
if raw_db_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_async_engine(
    raw_db_url,
    echo=False,
    future=True,
    connect_args=connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

async def upgrade_database_schema():
    """
    Ensures newly added columns in ExamSession exist in SQLite databases.
    Skipped for PostgreSQL since tables are initialized from Base metadata.
    """
    if not raw_db_url.startswith("sqlite"):
        return

    from sqlalchemy import text
    async with engine.begin() as conn:
        try:
            res = await conn.execute(text("PRAGMA table_info(exam_sessions)"))
            rows = res.fetchall()
            if rows:
                columns = [row[1] for row in rows]
                if "device_tier" not in columns:
                    await conn.execute(text("ALTER TABLE exam_sessions ADD COLUMN device_tier VARCHAR(50) DEFAULT 'MEDIUM'"))
                if "cv_status" not in columns:
                    await conn.execute(text("ALTER TABLE exam_sessions ADD COLUMN cv_status VARCHAR(50) DEFAULT 'ACTIVE'"))
                if "cv_status_reason" not in columns:
                    await conn.execute(text("ALTER TABLE exam_sessions ADD COLUMN cv_status_reason VARCHAR(255)"))
                if "network_status" not in columns:
                    await conn.execute(text("ALTER TABLE exam_sessions ADD COLUMN network_status VARCHAR(50) DEFAULT 'GOOD'"))
        except Exception:
            pass
