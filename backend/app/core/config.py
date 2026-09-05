from typing import List, Union
from pydantic_settings import BaseSettings, SettingsConfigDict
import os

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DEFAULT_DB_PATH = os.path.join(ROOT_DIR, "exam_portal.db").replace("\\", "/")

class Settings(BaseSettings):
    PROJECT_NAME: str = "Exam Portal"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    SECRET_KEY: str = "exam-portal-secure-secret-key-development-2026-xyz-abc"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DEFAULT_DB_PATH}"
    
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*"
    ]
    
    # Computer Vision / Proctoring Thresholds
    FACE_MISSING_THRESHOLD_SECONDS: float = 1.5
    MULTIPLE_FACES_THRESHOLD_SECONDS: float = 2.0
    LOOKING_AWAY_THRESHOLD_SECONDS: float = 2.5
    PHONE_DETECTED_THRESHOLD_SECONDS: float = 1.0
    CAMERA_BLOCKED_THRESHOLD_SECONDS: float = 2.0
    
    # Lightweight Performance Tiers & Sampling
    CV_MIN_CONFIDENCE: float = 0.60
    CV_FRAME_INTERVAL_HIGH_MS: int = 1800
    CV_FRAME_INTERVAL_MEDIUM_MS: int = 2800
    CV_FRAME_INTERVAL_LOW_MS: int = 4000
    EVENT_COOLDOWN_SECONDS: float = 12.0
    SERVER_ASSISTED_ENABLED: bool = True
    RECORD_FULL_VIDEO: bool = False
    MAX_FRAME_WIDTH: int = 320
    MAX_FRAME_HEIGHT: int = 240
    
    # Risk weights
    WEIGHT_PHONE_DETECTED: int = 45
    WEIGHT_MULTIPLE_FACES: int = 35
    WEIGHT_CAMERA_BLOCKED: int = 30
    WEIGHT_FACE_NOT_DETECTED: int = 20
    WEIGHT_LOOKING_AWAY: int = 10
    WEIGHT_AUDIO_DISTURBANCE: int = 25
    WEIGHT_EYE_TRACKING_ANOMALY: int = 15

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow"
    )

settings = Settings()
