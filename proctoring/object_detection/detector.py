import os
import cv2
import numpy as np
from typing import Dict, Any, List, Tuple

try:
    from ultralytics import YOLO
    _YOLO_AVAILABLE = True
except ImportError:
    _YOLO_AVAILABLE = False

class ObjectDetector:
    """
    Production Deep Learning YOLOv8 Object & Prohibited Device Detector.
    Runs YOLOv8 Nano for real-time neural inference on cell phones, unauthorized devices,
    and multiple persons in the frame.
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
                # Load YOLOv8 nano model
                self.model = YOLO(actual_path)
            except Exception as e:
                print(f"Warning: Failed to load YOLO model: {e}")
                self.model = None

        # COCO Target Class IDs
        # 67: cell phone, 0: person, 63: laptop, 73: book, 65: remote
        self.PROHIBITED_CLASSES = {
            67: "cell_phone",
            63: "laptop",
            73: "book",
            65: "remote",
        }

    def detect_objects(self, frame: np.ndarray) -> Dict[str, Any]:
        if frame is None or frame.size == 0:
            return {
                "phone_detected": False,
                "objects": [],
                "person_count": 1,
            }

        # 1. High-Performance Deep Learning YOLOv8 Inference
        if self.model is not None:
            try:
                # Run inference with confidence threshold 0.30
                results = self.model.predict(
                    source=frame,
                    conf=0.30,
                    verbose=False,
                    device="cpu"
                )
                
                detected_items = []
                phone_detected = False
                person_count = 0

                if len(results) > 0 and results[0].boxes is not None:
                    boxes = results[0].boxes
                    for i in range(len(boxes)):
                        cls_id = int(boxes.cls[i].item())
                        conf = float(boxes.conf[i].item())
                        xyxy = boxes.xyxy[i].tolist()
                        x1, y1, x2, y2 = [int(v) for v in xyxy]
                        bbox = (x1, y1, x2 - x1, y2 - y1)

                        if cls_id == 0:
                            # Person class
                            person_count += 1
                        elif cls_id in self.PROHIBITED_CLASSES:
                            label = self.PROHIBITED_CLASSES[cls_id]
                            if cls_id == 67: # cell phone
                                phone_detected = True
                            detected_items.append({
                                "type": label,
                                "bbox": bbox,
                                "confidence": round(conf, 2)
                            })

                return {
                    "phone_detected": phone_detected,
                    "objects": detected_items,
                    "person_count": person_count
                }
            except Exception as e:
                print(f"YOLO inference error: {e}")

        # 2. Fallback Heuristic
        h_img, w_img = frame.shape[:2]
        total_area = h_img * w_img
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)

        edges = cv2.Canny(blurred, 40, 130)
        kernel_rect = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel_rect, iterations=2)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        min_area = total_area * 0.025
        max_area = total_area * 0.35
        detected_items = []

        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            box_area = w * h
            if min_area <= box_area <= max_area:
                aspect = float(h) / max(1, w)
                if (1.35 <= aspect <= 2.8) or (0.35 <= aspect <= 0.72):
                    center_x = x + w / 2.0
                    center_y = y + h / 2.0
                    if (0.18 * w_img <= center_x <= 0.82 * w_img) and (0.22 * h_img <= center_y <= 0.95 * h_img):
                        patch = gray[y:y+h, x:x+w]
                        mean_val = float(np.mean(patch))
                        hull = cv2.convexHull(cnt)
                        hull_area = cv2.contourArea(hull)
                        if (hull_area / box_area > 0.65) and (mean_val < 75.0 or mean_val > 195.0):
                            detected_items.append({
                                "type": "cell_phone",
                                "bbox": (x, y, w, h),
                                "confidence": 0.85
                            })

        return {
            "phone_detected": len(detected_items) > 0,
            "objects": detected_items,
            "person_count": 1
        }

PhoneDetector = ObjectDetector
