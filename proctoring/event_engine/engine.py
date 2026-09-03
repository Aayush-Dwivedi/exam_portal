import time
from typing import Dict, Any, List, Optional
from proctoring.config.settings import ProctoringConfig, default_cv_config
from proctoring.face_detection.detector import FaceDetector
from proctoring.head_pose.estimator import HeadPoseEstimator
from proctoring.object_detection.detector import ObjectDetector
from proctoring.camera_blocked.detector import CameraBlockedDetector
from proctoring.anti_spoofing.detector import AntiSpoofingDetector
from proctoring.eye_tracking.detector import EyeGazeDetector

class ProctoringEventEngine:
    """
    Temporal event debouncer and state machine.
    Processes raw visual stream detections and generates confirmed, debounced proctoring events.
    """
    def __init__(self, config: ProctoringConfig = default_cv_config):
        self.config = config
        self.face_detector = FaceDetector()
        self.head_pose_estimator = HeadPoseEstimator()
        self.eye_gaze_detector = EyeGazeDetector()
        self.object_detector = ObjectDetector()
        self.camera_blocked_detector = CameraBlockedDetector(config)
        self.anti_spoofing_detector = AntiSpoofingDetector()

        # Active condition tracking: condition_key -> start_timestamp
        self.active_conditions: Dict[str, float] = {}
        # Cooldown to prevent emitting duplicate events continuously
        self.emitted_cooldowns: Dict[str, float] = {}

    def process_frame(
        self, 
        frame, 
        current_time: Optional[float] = None,
        speech_detected: bool = False,
        audio_level: float = 0.0
    ) -> List[Dict[str, Any]]:
        if current_time is None:
            current_time = time.time()

        events_generated: List[Dict[str, Any]] = []

        # Audio Disturbance Monitoring (runs continuously regardless of visual stream state)
        ev_audio = self._track_condition(
            "AUDIO_DISTURBANCE",
            speech_detected,
            current_time,
            getattr(self.config, "AUDIO_DISTURBANCE_THRESHOLD_SECONDS", 1.5),
            "MEDIUM",
            0.90,
            {"audio_level": audio_level}
        )
        if ev_audio:
            events_generated.append(ev_audio)

        # 1. Check Camera Blocked
        blocked_res = self.camera_blocked_detector.check_blocked(frame)
        if blocked_res["is_blocked"]:
            ev = self._track_condition("CAMERA_BLOCKED", True, current_time, self.config.CAMERA_BLOCKED_THRESHOLD_SECONDS, "HIGH", blocked_res["confidence"])
            if ev:
                events_generated.append(ev)
            # If camera is blocked, skip face/pose/gaze visual detection
            return events_generated
        else:
            self._track_condition("CAMERA_BLOCKED", False, current_time, self.config.CAMERA_BLOCKED_THRESHOLD_SECONDS, "HIGH", 1.0)

        # 2. Face Detection
        face_res = self.face_detector.analyze_frame(frame)
        face_count = face_res["face_count"]

        # Face missing
        is_missing = (face_count == 0)
        ev_missing = self._track_condition("FACE_NOT_DETECTED", is_missing, current_time, self.config.FACE_MISSING_THRESHOLD_SECONDS, "MEDIUM", 0.90)
        if ev_missing:
            events_generated.append(ev_missing)

        # Multiple faces
        is_multiple = (face_count > 1)
        ev_multiple = self._track_condition("MULTIPLE_FACES", is_multiple, current_time, self.config.MULTIPLE_FACES_THRESHOLD_SECONDS, "HIGH", 0.95, {"face_count": face_count})
        if ev_multiple:
            events_generated.append(ev_multiple)

        # 3. Head Pose & Eye Movement / Gaze Tracking (if exactly 1 face)
        first_face_box = face_res["bounding_boxes"][0] if face_count >= 1 else None
        if face_count == 1 and first_face_box:
            x, y, w, h = first_face_box
            face_crop = frame[y:y+h, x:x+w] if frame is not None else None
            pose_res = self.head_pose_estimator.estimate_pose(face_crop)
            
            is_looking_away = pose_res["looking_away"]
            ev_pose = self._track_condition(
                "LOOKING_AWAY", 
                is_looking_away, 
                current_time, 
                self.config.LOOKING_AWAY_THRESHOLD_SECONDS, 
                "LOW" if pose_res.get("deviation", 0) < 0.35 else "MEDIUM",
                pose_res.get("confidence", 0.85),
                {"pose": pose_res.get("pose")}
            )
            if ev_pose:
                events_generated.append(ev_pose)

            # Eye gaze deviation detection (pupil / iris tracking)
            gaze_res = self.eye_gaze_detector.detect_gaze(face_crop)
            is_gaze_anomaly = gaze_res["gaze_anomaly"]
            ev_gaze = self._track_condition(
                "EYE_TRACKING_ANOMALY",
                is_gaze_anomaly,
                current_time,
                getattr(self.config, "EYE_GAZE_THRESHOLD_SECONDS", 1.8),
                "MEDIUM",
                gaze_res.get("confidence", 0.88),
                {"direction": gaze_res.get("gaze_direction"), "deviation": gaze_res.get("deviation")}
            )
            if ev_gaze:
                events_generated.append(ev_gaze)
        else:
            self._track_condition("LOOKING_AWAY", False, current_time, self.config.LOOKING_AWAY_THRESHOLD_SECONDS, "LOW", 1.0)
            self._track_condition("EYE_TRACKING_ANOMALY", False, current_time, getattr(self.config, "EYE_GAZE_THRESHOLD_SECONDS", 1.8), "MEDIUM", 1.0)

        # 4. Object / Phone Detection
        obj_res = self.object_detector.detect_objects(frame)
        is_phone = obj_res["phone_detected"]
        ev_phone = self._track_condition("PHONE_DETECTED", is_phone, current_time, self.config.PHONE_DETECTED_THRESHOLD_SECONDS, "HIGH", 0.90, {"objects": obj_res["objects"]})
        if ev_phone:
            events_generated.append(ev_phone)

        # 5. Anti-Spoofing / Presentation Attack Check
        spoof_res = self.anti_spoofing_detector.check_liveness(frame, first_face_box, obj_res.get("objects"))
        is_spoof = spoof_res["is_spoof"]
        ev_spoof = self._track_condition("SPOOF_DETECTED", is_spoof, current_time, self.config.SPOOF_DETECTED_THRESHOLD_SECONDS, "HIGH", spoof_res["confidence"], spoof_res.get("details"))
        if ev_spoof:
            events_generated.append(ev_spoof)

        return events_generated

    def _track_condition(
        self, 
        condition_name: str, 
        is_active: bool, 
        current_time: float, 
        threshold_seconds: float,
        severity: str,
        confidence: float,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        if is_active:
            if condition_name not in self.active_conditions:
                self.active_conditions[condition_name] = current_time
            else:
                elapsed = current_time - self.active_conditions[condition_name]
                last_emitted = self.emitted_cooldowns.get(condition_name, 0)
                
                if elapsed >= threshold_seconds and (current_time - last_emitted) >= 5.0: # 5 sec cooldown between alerts
                    self.emitted_cooldowns[condition_name] = current_time
                    return {
                        "event_type": condition_name,
                        "duration": round(elapsed, 2),
                        "severity": severity,
                        "confidence": confidence,
                        "metadata_info": metadata or {}
                    }
        else:
            if condition_name in self.active_conditions:
                del self.active_conditions[condition_name]
        return None
