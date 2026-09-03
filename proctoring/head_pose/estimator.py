import cv2
import numpy as np
from typing import Dict, Any, Optional

class HeadPoseEstimator:
    """
    Estimates head pose (FORWARD, LEFT, RIGHT, UP, DOWN) based on facial symmetry & gradient moments.
    """
    def __init__(self):
        pass

    def estimate_pose(self, face_crop: np.ndarray) -> Dict[str, Any]:
        if face_crop is None or face_crop.size == 0:
            return {"pose": "UNKNOWN", "looking_away": False, "confidence": 0.0}

        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape

        if h < 20 or w < 20:
            return {"pose": "FORWARD", "looking_away": False, "confidence": 0.5}

        # Bilateral symmetry analysis across left and right halves
        left_half = gray[:, :w//2]
        right_half = gray[:, w//2:]
        
        left_mean = float(np.mean(left_half))
        right_mean = float(np.mean(right_half))
        
        denom = max(1.0, left_mean + right_mean)
        diff = (right_mean - left_mean) / denom

        # Calculate vertical head tilt (looking down vs looking forward)
        top_half = gray[:h//2, :]
        bottom_half = gray[h//2:, :]
        v_diff = (float(np.mean(bottom_half)) - float(np.mean(top_half))) / max(1.0, float(np.mean(bottom_half)) + float(np.mean(top_half)))

        # Looking sideways threshold (> 0.40)
        if diff < -0.40:
            return {"pose": "LEFT", "looking_away": True, "confidence": 0.85, "deviation": diff}
        elif diff > 0.40:
            return {"pose": "RIGHT", "looking_away": True, "confidence": 0.85, "deviation": diff}
        elif v_diff > 0.45:
            return {"pose": "DOWN", "looking_away": True, "confidence": 0.80, "deviation": v_diff}
        else:
            return {"pose": "FORWARD", "looking_away": False, "confidence": 0.90, "deviation": diff}
