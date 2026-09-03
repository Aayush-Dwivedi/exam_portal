from dataclasses import dataclass

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

default_cv_config = ProctoringConfig()
