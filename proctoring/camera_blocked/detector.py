import cv2
import numpy as np
from typing import Dict, Any
from proctoring.config.settings import default_cv_config

class CameraBlockedDetector:
    """
    Detects if the webcam is blocked, covered with a finger/sticker, or in complete darkness.
    """
    def __init__(self, config=default_cv_config):
        self.config = config

    def check_blocked(self, frame: np.ndarray) -> Dict[str, Any]:
        if frame is None or frame.size == 0:
            return {"is_blocked": True, "reason": "EMPTY_FEED", "confidence": 1.0}

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mean_brightness = float(np.mean(gray))
        std_variance = float(np.std(gray))

        # Pitch black or covered lens
        if mean_brightness < self.config.DARKNESS_PIXEL_MEAN_THRESHOLD:
            return {
                "is_blocked": True, 
                "reason": "DARK_FRAME", 
                "mean_brightness": mean_brightness,
                "confidence": 0.95
            }

        # Completely flat uniform image (e.g. tape or paper over lens)
        if std_variance < 3.5:
            return {
                "is_blocked": True, 
                "reason": "OCCLUSION_UNIFORM", 
                "std_variance": std_variance,
                "confidence": 0.90
            }

        # Finger or hand covering lens (dark reddish frame with low variance)
        if len(frame.shape) == 3 and frame.shape[2] == 3:
            b_mean = float(np.mean(frame[:, :, 0]))
            g_mean = float(np.mean(frame[:, :, 1]))
            r_mean = float(np.mean(frame[:, :, 2]))
            if (b_mean < 45 and g_mean < 45 and r_mean > 25 and std_variance < 12.0) or (std_variance < 6.5 and mean_brightness < 65):
                return {
                    "is_blocked": True,
                    "reason": "LENS_COVERED_OCCLUSION",
                    "mean_brightness": mean_brightness,
                    "std_variance": std_variance,
                    "confidence": 0.95
                }

        return {
            "is_blocked": False,
            "mean_brightness": mean_brightness,
            "std_variance": std_variance,
            "confidence": 1.0
        }
