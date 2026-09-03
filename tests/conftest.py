import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.models import User, UserRole, UserStatus
from app.auth.security import get_password_hash, create_access_token

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

test_engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    future=True
)

TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

@pytest.fixture(autouse=True)
async def setup_test_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

async def override_get_db():
    async with TestingSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

@pytest.fixture
async def admin_user():
    async with TestingSessionLocal() as db:
        user = User(
            name="Test Admin",
            email="testadmin@example.com",
            password_hash=get_password_hash("adminpass123"),
            role=UserRole.ADMIN,
            status=UserStatus.ACTIVE
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

@pytest.fixture
def admin_token(admin_user):
    return create_access_token(subject=admin_user.id, role=admin_user.role.value)

@pytest.fixture
async def setter_user():
    async with TestingSessionLocal() as db:
        user = User(
            name="Test Setter",
            email="testsetter@example.com",
            password_hash=get_password_hash("setterpass123"),
            role=UserRole.PAPER_SETTER,
            status=UserStatus.ACTIVE
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

@pytest.fixture
def setter_token(setter_user):
    return create_access_token(subject=setter_user.id, role=setter_user.role.value)

@pytest.fixture
async def candidate_user():
    async with TestingSessionLocal() as db:
        user = User(
            name="Test Candidate",
            email="testcandidate@example.com",
            roll_number="CAND-2026-001",
            password_hash=get_password_hash("candpass123"),
            role=UserRole.CANDIDATE,
            status=UserStatus.ACTIVE
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

@pytest.fixture
def candidate_token(candidate_user):
    return create_access_token(subject=candidate_user.id, role=candidate_user.role.value)
