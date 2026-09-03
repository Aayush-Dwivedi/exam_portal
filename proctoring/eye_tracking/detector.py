import cv2
import numpy as np
from typing import Dict, Any, Optional, Tuple

class EyeGazeDetector:
    """
    Computer Vision Eye Movement & Gaze Deviation Detector.
    Isolates the ocular region within the facial frame and tracks the corneal/iris centroid
    relative to eye boundaries to detect off-screen glances, side-channel cheating,
    or looking too far away from the assessment viewport.
    """
    def __init__(self, horizontal_tolerance: float = 0.18, vertical_tolerance: float = 0.22):
        self.horizontal_tolerance = horizontal_tolerance
        self.vertical_tolerance = vertical_tolerance

    def detect_gaze(self, face_crop: np.ndarray) -> Dict[str, Any]:
        """
        Analyzes the facial crop to determine pupil/iris gaze vector.
        Returns:
            {
                "gaze_anomaly": bool,
                "gaze_direction": "CENTER" | "FAR_LEFT" | "FAR_RIGHT" | "FAR_DOWN",
                "deviation": float,
                "confidence": float
            }
        """
        if face_crop is None or face_crop.size == 0:
            return {
                "gaze_anomaly": False,
                "gaze_direction": "CENTER",
                "deviation": 0.0,
                "confidence": 0.0
            }

        h, w = face_crop.shape[:2]
        if h < 30 or w < 30:
            return {
                "gaze_anomaly": False,
                "gaze_direction": "CENTER",
                "deviation": 0.0,
                "confidence": 0.5
            }

        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY) if len(face_crop.shape) == 3 else face_crop

        # 1. Isolate the eye region band (typically 22% to 52% down the face)
        eye_y1, eye_y2 = int(h * 0.22), int(h * 0.52)
        eye_band = gray[eye_y1:eye_y2, :]
        band_h, band_w = eye_band.shape

        if band_h < 10 or band_w < 20:
            return {
                "gaze_anomaly": False,
                "gaze_direction": "CENTER",
                "deviation": 0.0,
                "confidence": 0.6
            }

        # 2. Extract Left and Right Eye sub-regions
        # Left eye: ~15% to ~45% of width; Right eye: ~55% to ~85% of width
        left_eye = eye_band[:, int(band_w * 0.15):int(band_w * 0.45)]
        right_eye = eye_band[:, int(band_w * 0.55):int(band_w * 0.85)]

        def get_pupil_ratios(eye_img: np.ndarray) -> Optional[Tuple[float, float]]:
            if eye_img is None or eye_img.size == 0 or eye_img.shape[0] < 4 or eye_img.shape[1] < 4:
                return None
            blurred = cv2.GaussianBlur(eye_img, (5, 5), 0)
            min_val, _, min_loc, _ = cv2.minMaxLoc(blurred)

            # Threshold darkest 20% intensity to compute centroid of pupil/iris
            thresh_val = min_val + (np.mean(blurred) - min_val) * 0.40
            _, binary = cv2.threshold(blurred, thresh_val, 255, cv2.THRESH_BINARY_INV)

            M = cv2.moments(binary)
            if M["m00"] > 0:
                cx = M["m10"] / M["m00"]
                cy = M["m01"] / M["m00"]
            else:
                cx, cy = min_loc[0], min_loc[1]

            rx = cx / float(eye_img.shape[1])
            ry = cy / float(eye_img.shape[0])
            return rx, ry

        left_r = get_pupil_ratios(left_eye)
        right_r = get_pupil_ratios(right_eye)

        ratios = [r for r in [left_r, right_r] if r is not None]
        if not ratios:
            return {
                "gaze_anomaly": False,
                "gaze_direction": "CENTER",
                "deviation": 0.0,
                "confidence": 0.7
            }

        avg_rx = float(np.mean([r[0] for r in ratios]))
        avg_ry = float(np.mean([r[1] for r in ratios]))

        # Normal centered gaze has horizontal ratio around 0.50 (+/- tolerance)
        h_deviation = avg_rx - 0.50
        v_deviation = avg_ry - 0.50

        # Classify gaze bounds:
        # Looking far left: avg_rx < (0.50 - tolerance)
        # Looking far right: avg_rx > (0.50 + tolerance)
        # Looking far down: avg_ry > (0.50 + vertical_tolerance)
        if h_deviation < -self.horizontal_tolerance:
            return {
                "gaze_anomaly": True,
                "gaze_direction": "FAR_LEFT",
                "deviation": round(abs(h_deviation), 3),
                "confidence": 0.88
            }
        elif h_deviation > self.horizontal_tolerance:
            return {
                "gaze_anomaly": True,
                "gaze_direction": "FAR_RIGHT",
                "deviation": round(abs(h_deviation), 3),
                "confidence": 0.88
            }
        elif v_deviation > self.vertical_tolerance:
            return {
                "gaze_anomaly": True,
                "gaze_direction": "FAR_DOWN",
                "deviation": round(abs(v_deviation), 3),
                "confidence": 0.84
            }
        else:
            return {
                "gaze_anomaly": False,
                "gaze_direction": "CENTER",
                "deviation": round(max(abs(h_deviation), abs(v_deviation)), 3),
                "confidence": 0.92
            }
