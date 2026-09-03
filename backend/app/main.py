import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.core.config import settings
from app.core.logging import setup_logging, logger
from app.database.session import engine, get_db
from app.database.base import Base
import app.models # Ensures all models are registered with Base

# Import API Routers
from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.questions import router as questions_router
from app.api.exams import router as exams_router
from app.api.sessions import router as sessions_router
from app.api.results import router as results_router
from app.api.proctoring import router as proctoring_router
from app.api.analytics import router as analytics_router
from app.api.audit import router as audit_router
from app.websocket.manager import ws_manager

setup_logging()

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Exam Portal Backend Services...")
    # Initialize database tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database schemas verified.")
    yield
    logger.info("Shutting down Exam Portal Backend Services...")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="AI-Proctored Online Examination & Assessment Management API",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# Also expose /api/docs and /api/redoc for convenience
@app.get(f"{settings.API_V1_STR}/docs", include_in_schema=False)
async def api_docs_redirect():
    return RedirectResponse(url="/docs")

@app.get(f"{settings.API_V1_STR}/redoc", include_in_schema=False)
async def api_redoc_redirect():
    return RedirectResponse(url="/redoc")

@app.get("/", include_in_schema=False)
async def root_redirect():
    return RedirectResponse(url="/docs")

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
api_v1_prefix = settings.API_V1_STR
app.include_router(auth_router, prefix=api_v1_prefix)
app.include_router(users_router, prefix=api_v1_prefix)
app.include_router(questions_router, prefix=api_v1_prefix)
app.include_router(exams_router, prefix=api_v1_prefix)
app.include_router(sessions_router, prefix=api_v1_prefix)
app.include_router(results_router, prefix=api_v1_prefix)
app.include_router(proctoring_router, prefix=api_v1_prefix)
app.include_router(analytics_router, prefix=api_v1_prefix)
app.include_router(audit_router, prefix=api_v1_prefix)

# Health check route
@app.get(f"{api_v1_prefix}/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION
    }

# ----------------- WEBSOCKET ENDPOINTS -----------------

@app.websocket("/ws/exam/{session_id}")
async def websocket_exam_endpoint(
    websocket: WebSocket,
    session_id: int,
    candidate_id: int
):
    await ws_manager.connect_candidate(websocket, session_id, candidate_id)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle client heartbeat / ping
            await websocket.send_json({"type": "pong", "session_id": session_id})
    except WebSocketDisconnect:
        ws_manager.disconnect_candidate(websocket, session_id, candidate_id)
        await ws_manager.broadcast_to_admins({
            "type": "candidate.connection",
            "candidate_id": candidate_id,
            "session_id": session_id,
            "status": "OFFLINE"
        })
    except Exception as e:
        logger.error(f"WebSocket error in session {session_id}: {e}")
        ws_manager.disconnect_candidate(websocket, session_id, candidate_id)

@app.websocket("/ws/admin/monitoring")
async def websocket_admin_endpoint(websocket: WebSocket):
    await ws_manager.connect_admin(websocket)
    try:
        while True:
            # Keep admin connection alive
            data = await websocket.receive_text()
            await websocket.send_json({"type": "admin.pong"})
    except WebSocketDisconnect:
        ws_manager.disconnect_admin(websocket)
    except Exception as e:
        logger.error(f"WebSocket error in admin monitor: {e}")
        ws_manager.disconnect_admin(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
