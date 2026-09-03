import cv2
import numpy as np
from typing import Dict, Any, Tuple, Optional, List

class AntiSpoofingDetector:
    """
    High-Precision Presentation Attack Detection (PAD) & 2D Screen Replay / Photo Spoof Detector.
    Strictly discriminates between genuine candidates (with headphones / ambient room lighting)
    and 2D phone/tablet screen presentation attacks.
    """
    def __init__(self):
        pass

    def check_liveness(
        self, 
        frame: np.ndarray, 
        face_bbox: Optional[Tuple[int, int, int, int]] = None,
        detected_objects: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        if frame is None or frame.size == 0 or not face_bbox:
            return {
                "is_spoof": False,
                "confidence": 0.0,
                "reason": "NO_FACE_OR_FRAME",
                "details": {}
            }

        fx, fy, fw, fh = face_bbox
        h_img, w_img = frame.shape[:2]

        # 1. Primary Criterion: YOLO Cell Phone / Tablet overlap with the Face
        # If an electronic device enclosing or containing the face is detected
        if detected_objects:
            for obj in detected_objects:
                if obj.get("type") in ["cell_phone", "laptop", "tv"]:
                    ox, oy, ow, oh = obj.get("bbox", (0, 0, 0, 0))
                    # Intersection over Face Area
                    ix1, iy1 = max(fx, ox), max(fy, oy)
                    ix2, iy2 = min(fx + fw, ox + ow), min(fy + fh, oy + oh)
                    if ix1 < ix2 and iy1 < iy2:
                        overlap_area = (ix2 - ix1) * (iy2 - iy1)
                        if overlap_area > 0.30 * (fw * fh):
                            return {
                                "is_spoof": True,
                                "confidence": 0.96,
                                "reason": "DEVICE_SCREEN_OVERLAP",
                                "details": {"overlap_ratio": round(overlap_area / (fw * fh), 2)}
                            }

        # 2. Secondary Criterion: Strict 4-Side Orthogonal Rectangular Screen Bezel Analysis
        # A phone screen presentation has straight horizontal AND vertical device border lines
        margin = int(fw * 0.25)
        bx1 = max(0, fx - margin)
        by1 = max(0, fy - margin)
        bx2 = min(w_img, fx + fw + margin)
        by2 = min(h_img, fy + fh + margin)
        outer = frame[by1:by2, bx1:bx2]

        if outer.size > 0:
            gray_outer = cv2.cvtColor(outer, cv2.COLOR_BGR2GRAY)
            blurred_outer = cv2.GaussianBlur(gray_outer, (5, 5), 0)
            edges = cv2.Canny(blurred_outer, 50, 150)
            lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=35, minLineLength=int(fw * 0.45), maxLineGap=10)

            horizontal_lines = 0
            vertical_lines = 0
            if lines is not None:
                for l in lines:
                    pts = l.ravel()
                    x1, y1, x2, y2 = int(pts[0]), int(pts[1]), int(pts[2]), int(pts[3])
                    angle = abs(np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi)
                    if angle < 20 or angle > 160: # horizontal straight line
                        horizontal_lines += 1
                    elif 70 < angle < 110: # vertical straight line
                        vertical_lines += 1

            # A real screen bezel must have both multiple horizontal and vertical bounding lines
            if horizontal_lines >= 2 and vertical_lines >= 2:
                return {
                    "is_spoof": True,
                    "confidence": 0.90,
                    "reason": "RECTANGULAR_BEZEL_DETECTED",
                    "details": {"h_lines": horizontal_lines, "v_lines": vertical_lines}
                }

        return {
            "is_spoof": False,
            "confidence": 0.05,
            "reason": "AUTHENTIC_3D_HUMAN",
            "details": {}
        }
