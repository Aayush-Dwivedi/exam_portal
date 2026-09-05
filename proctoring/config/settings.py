from dataclasses import dataclass
from typing import Dict, Any, Tuple

@dataclass
class PerformanceTierConfig:
    tier_name: str
    frame_interval_ms: int
    resolution: Tuple[int, int]  # (width, height)
    face_detection_enabled: bool = True
    face_count_enabled: bool = True
    head_pose_enabled: bool = True
    object_detection_interval_ms: int = 15000  # -1 if disabled
    server_assisted_fallback: bool = False

@dataclass
class ProctoringConfig:
    FACE_MISSING_THRESHOLD_SECONDS: float = 1.5
    MULTIPLE_FACES_THRESHOLD_SECONDS: float = 2.0
    LOOKING_AWAY_THRESHOLD_SECONDS: float = 2.5
    PHONE_DETECTED_THRESHOLD_SECONDS: float = 1.0
    SPOOF_DETECTED_THRESHOLD_SECONDS: float = 1.0
    CAMERA_BLOCKED_THRESHOLD_SECONDS: float = 2.0
    
    # Head pose angles (in degrees)
    YAW_THRESHOLD_DEG: float = 28.0
    PITCH_THRESHOLD_DEG: float = 22.0
    
    # Eye gaze & audio thresholds
    EYE_GAZE_THRESHOLD_SECONDS: float = 1.8
    AUDIO_DISTURBANCE_THRESHOLD_SECONDS: float = 1.5
    AUDIO_RMS_THRESHOLD: float = 0.25

    # Darkness threshold for camera blocked
    DARKNESS_PIXEL_MEAN_THRESHOLD: float = 12.0

    # Event debouncing and cooldowns
    EVENT_COOLDOWN_SECONDS: float = 12.0

    # Privacy & Fallback defaults
    RECORD_FULL_VIDEO: bool = False
    SERVER_ASSISTED_ENABLED: bool = True

    # Tier configurations
    TIERS: Dict[str, PerformanceTierConfig] = None

    def __post_init__(self):
        if self.TIERS is None:
            self.TIERS = {
                "HIGH": PerformanceTierConfig("HIGH", 1800, (320, 240), True, True, True, 12000, False),
                "MEDIUM": PerformanceTierConfig("MEDIUM", 2800, (240, 180), True, True, True, 20000, True),
                "LOW": PerformanceTierConfig("LOW", 4000, (160, 120), True, True, False, -1, True),
                "UNSUPPORTED": PerformanceTierConfig("UNSUPPORTED", -1, (0, 0), False, False, False, -1, False),
            }

default_cv_config = ProctoringConfig()
