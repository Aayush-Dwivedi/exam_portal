import sys
import os
import time
import numpy as np
from typing import Dict, Any, List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend")))

from proctoring.face_detection.detector import FaceDetector
from proctoring.head_pose.estimator import HeadPoseEstimator
from proctoring.camera_blocked.detector import CameraBlockedDetector
from proctoring.object_detection.detector import ObjectDetector

def run_cv_benchmark(iterations: int = 10) -> Dict[str, Any]:
    """
    Benchmarks CPU inference speed across various resolutions for proctoring CV components.
    Measures latency per component, aggregate FPS, and confidence metrics.
    """
    resolutions = [
        ("HIGH", 320, 240),
        ("MEDIUM", 240, 180),
        ("LOW", 160, 120),
    ]

    face_detector = FaceDetector()
    head_pose_estimator = HeadPoseEstimator()
    camera_blocked_detector = CameraBlockedDetector()

    results: Dict[str, Any] = {
        "timestamp": time.time(),
        "iterations": iterations,
        "tiers": {}
    }

    for tier_name, w, h in resolutions:
        # Create synthetic realistic frame with a face-like patch in the center
        frame = np.full((h, w, 3), 200, dtype=np.uint8)
        # Add center face-like region
        fx1, fy1, fw, fh = int(w * 0.35), int(h * 0.25), int(w * 0.3), int(h * 0.4)
        frame[fy1:fy1+fh, fx1:fx1+fw] = [150, 130, 110]

        # 1. Measure Camera Blocked Detector
        t0 = time.perf_counter()
        for _ in range(iterations):
            _ = camera_blocked_detector.check_blocked(frame)
        blocked_latency_ms = ((time.perf_counter() - t0) / iterations) * 1000.0

        # 2. Measure Face Detection
        t0 = time.perf_counter()
        for _ in range(iterations):
            face_res = face_detector.analyze_frame(frame)
        face_latency_ms = ((time.perf_counter() - t0) / iterations) * 1000.0

        # 3. Measure Head Pose on face crop
        face_crop = frame[fy1:fy1+fh, fx1:fx1+fw]
        t0 = time.perf_counter()
        for _ in range(iterations):
            _ = head_pose_estimator.estimate_pose(face_crop)
        pose_latency_ms = ((time.perf_counter() - t0) / iterations) * 1000.0

        total_latency_ms = blocked_latency_ms + face_latency_ms + pose_latency_ms
        fps = 1000.0 / total_latency_ms if total_latency_ms > 0 else 999.0

        results["tiers"][tier_name] = {
            "resolution": f"{w}x{h}",
            "blocked_check_ms": round(blocked_latency_ms, 2),
            "face_detection_ms": round(face_latency_ms, 2),
            "head_pose_ms": round(pose_latency_ms, 2),
            "total_latency_ms": round(total_latency_ms, 2),
            "estimated_cpu_fps": round(fps, 1),
            "detection_confidence": face_res.get("face_count", 0) > 0
        }

    return results

if __name__ == "__main__":
    print("Running CPU CV Benchmark...")
    benchmark_results = run_cv_benchmark(iterations=15)
    print("\nBenchmark Results:")
    print("=" * 60)
    for tier, data in benchmark_results["tiers"].items():
        print(f"Tier: {tier:8} | Resolution: {data['resolution']:8} | "
              f"Latency: {data['total_latency_ms']:5.1f}ms | Approx FPS: {data['estimated_cpu_fps']:5.1f}")
    print("=" * 60)
