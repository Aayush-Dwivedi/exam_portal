import os
import cv2
import numpy as np
from typing import List, Tuple, Dict, Any

try:
    from ultralytics import YOLO
    _YOLO_AVAILABLE = True
except ImportError:
    _YOLO_AVAILABLE = False

class FaceDetector:
    """
    Production Deep Learning YOLOv8 + Dual Color-Space Face & Person Presence Detector.
    Accurately detects candidate presence, candidate absence (empty room), and multiple persons.
    """
    def __init__(self, model_name: str = "yolov8n.pt"):
        self.model = None
        if _YOLO_AVAILABLE:
            try:
                actual_path = model_name
                if not os.path.exists(actual_path):
                    root_candidate = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", model_name))
                    if os.path.exists(root_candidate):
                        actual_path = root_candidate
                    elif os.path.exists(f"/app/{model_name}"):
                        actual_path = f"/app/{model_name}"
                self.model = YOLO(actual_path)
            except Exception as e:
                print(f"Warning: YOLO FaceDetector failed to initialize: {e}")
                self.model = None

    def detect_faces(self, frame: np.ndarray) -> List[Tuple[int, int, int, int]]:
        if frame is None or frame.size == 0:
            return []

        h_img, w_img = frame.shape[:2]
        total_area = h_img * w_img

        # 1. High-Accuracy YOLOv8 Neural Person Detection
        if self.model is not None:
            try:
                results = self.model.predict(
                    source=frame,
                    conf=0.30,
                    verbose=False,
                    device="cpu"
                )
                if len(results) > 0 and results[0].boxes is not None:
                    boxes = results[0].boxes
                    person_faces = []
                    for i in range(len(boxes)):
                        cls_id = int(boxes.cls[i].item())
                        if cls_id == 0: # Person
                            xyxy = boxes.xyxy[i].tolist()
                            px1, py1, px2, py2 = [int(v) for v in xyxy]
                            pw = px2 - px1
                            ph = py2 - py1

                            # Approximate upper head region (top 45% of detected person)
                            head_h = int(ph * 0.45)
                            head_w = int(pw * 0.80)
                            head_x = int(px1 + (pw - head_w) / 2.0)
                            head_y = py1

                            # Clamp to image bounds
                            hx = max(0, min(w_img - 1, head_x))
                            hy = max(0, min(h_img - 1, head_y))
                            hw = max(10, min(w_img - hx, head_w))
                            hh = max(10, min(h_img - hy, head_h))

                            person_faces.append((hx, hy, hw, hh))

                    # If YOLO found 0 persons or multiple persons, return YOLO result directly
                    if len(person_faces) > 0:
                        return person_faces
                    else:
                        # 0 persons in frame according to YOLO
                        return []
            except Exception as e:
                print(f"YOLO Person/Face inference error: {e}")

        # 2. Skin-Color Fusion Fallback (Only if YOLO is unavailable)
        ycrcb = cv2.cvtColor(frame, cv2.COLOR_BGR2YCrCb)
        mask_ycrcb = cv2.inRange(
            ycrcb, 
            np.array([20, 125, 70], dtype=np.uint8), 
            np.array([255, 182, 140], dtype=np.uint8)
        )
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        mask_hsv = cv2.bitwise_or(
            cv2.inRange(hsv, np.array([0, 15, 30], dtype=np.uint8), np.array([30, 255, 255], dtype=np.uint8)),
            cv2.inRange(hsv, np.array([160, 15, 30], dtype=np.uint8), np.array([180, 255, 255], dtype=np.uint8))
        )
        mask = cv2.bitwise_or(mask_ycrcb, mask_hsv)
        kernel_ellipse = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel_ellipse, iterations=2)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_ellipse, iterations=1)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        faces = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if 0.03 * total_area <= area <= 0.80 * total_area:
                x, y, w, h = cv2.boundingRect(cnt)
                aspect = float(h) / max(1, w)
                if 0.65 <= aspect <= 2.2:
                    faces.append((int(x), int(y), int(w), int(h)))

        return faces

    def analyze_frame(self, frame: np.ndarray) -> Dict[str, Any]:
        faces = self.detect_faces(frame)
        count = len(faces)
        return {
            "face_count": count,
            "has_face": count > 0,
            "multiple_faces": count > 1,
            "bounding_boxes": faces
        }
