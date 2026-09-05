import { DeviceTier } from '../types';

export interface TierProfile {
  tier: DeviceTier;
  frameIntervalMs: number;
  canvasWidth: number;
  canvasHeight: number;
  faceDetection: boolean;
  faceCount: boolean;
  headPose: boolean;
  phoneDetection: boolean;
  phoneCheckIntervalMs: number; // -1 if disabled locally
  serverAssistedFallback: boolean;
}

export interface DeviceCapabilityResult {
  tier: DeviceTier;
  browserOk: boolean;
  cameraOk: boolean;
  micOk: boolean;
  networkOk: boolean;
  cpuLatencyMs: number;
  cameraResolution: string;
  cameraFrameRate: number;
  tierLabel: string;
  tierDescription: string;
  profile: TierProfile;
}

export const TIER_PROFILES: Record<DeviceTier, TierProfile> = {
  HIGH: {
    tier: 'HIGH',
    frameIntervalMs: 1800,
    canvasWidth: 320,
    canvasHeight: 240,
    faceDetection: true,
    faceCount: true,
    headPose: true,
    phoneDetection: true,
    phoneCheckIntervalMs: 15000,
    serverAssistedFallback: false,
  },
  MEDIUM: {
    tier: 'MEDIUM',
    frameIntervalMs: 2800,
    canvasWidth: 240,
    canvasHeight: 180,
    faceDetection: true,
    faceCount: true,
    headPose: true,
    phoneDetection: false,
    phoneCheckIntervalMs: 25000,
    serverAssistedFallback: true,
  },
  LOW: {
    tier: 'LOW',
    frameIntervalMs: 4000,
    canvasWidth: 160,
    canvasHeight: 120,
    faceDetection: true,
    faceCount: true,
    headPose: false,
    phoneDetection: false,
    phoneCheckIntervalMs: -1,
    serverAssistedFallback: true,
  },
  UNSUPPORTED: {
    tier: 'UNSUPPORTED',
    frameIntervalMs: -1,
    canvasWidth: 0,
    canvasHeight: 0,
    faceDetection: false,
    faceCount: false,
    headPose: false,
    phoneDetection: false,
    phoneCheckIntervalMs: -1,
    serverAssistedFallback: false,
  },
};

/**
 * Executes a lightweight CPU vision benchmark in the candidate's browser without requiring a GPU.
 * Evaluates Canvas2D pixel analysis and symmetry math across 6 cycles to estimate processing latency.
 */
export async function benchmarkCpuVision(cycles: number = 6): Promise<number> {
  const w = 240;
  const h = 180;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 45.0; // conservative default

  // Seed sample visual pattern
  ctx.fillStyle = '#c8a882';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#3a2010';
  ctx.fillRect(w * 0.3, h * 0.2, w * 0.4, h * 0.5);

  const start = performance.now();
  for (let i = 0; i < cycles; i++) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    let sumLeft = 0;
    let sumRight = 0;
    const midX = w / 2;

    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

        if (x < midX) {
          sumLeft += luminance;
        } else {
          sumRight += luminance;
        }
      }
    }
    // Prevent compiler optimization elimination
    if (sumLeft === 0 && sumRight === 0) console.log('.');
  }
  const totalMs = performance.now() - start;
  return Math.round((totalMs / cycles) * 10) / 10;
}

/**
 * Assesses complete hardware, browser, and CPU capabilities before exam commencement.
 */
export async function evaluateDeviceCapability(
  existingStream?: MediaStream | null,
  networkLatencyMs?: number | null
): Promise<DeviceCapabilityResult> {
  // 1. Browser Check
  const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const hasWebSocket = typeof WebSocket !== 'undefined';
  const hasCanvas = !!document.createElement('canvas').getContext;
  const hasAudioContext = !!(window.AudioContext || (window as any).webkitAudioContext);
  const browserOk = hasMediaDevices && hasWebSocket && hasCanvas && hasAudioContext;

  // 2. Camera & Microphone Check
  let cameraOk = false;
  let micOk = false;
  let cameraResolution = 'Unknown';
  let cameraFrameRate = 30;

  let stream = existingStream;
  let acquiredStream = false;

  try {
    if (!stream && hasMediaDevices) {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      acquiredStream = true;
    }

    if (stream) {
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        const vTrack = videoTracks[0];
        if (vTrack.readyState === 'live' && vTrack.enabled) {
          cameraOk = true;
          const settings = vTrack.getSettings ? vTrack.getSettings() : {};
          if (settings.width && settings.height) {
            cameraResolution = `${settings.width}x${settings.height}`;
          }
          if (settings.frameRate) {
            cameraFrameRate = Math.round(settings.frameRate);
          }
        }
      }

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0 && audioTracks[0].readyState === 'live') {
        micOk = true;
      }
    }
  } catch (err) {
    cameraOk = false;
    micOk = false;
  } finally {
    if (acquiredStream && stream) {
      // Do not leave stream open if acquired purely for testing
      stream.getTracks().forEach((t) => t.stop());
    }
  }

  // 3. Network Check
  const networkOk = networkLatencyMs !== undefined && networkLatencyMs !== null && networkLatencyMs < 4000;

  // 4. CPU Vision Benchmark
  let cpuLatencyMs = 25.0;
  try {
    cpuLatencyMs = await benchmarkCpuVision(6);
  } catch {
    cpuLatencyMs = 50.0;
  }

  // 5. Tier Classification
  let tier: DeviceTier = 'MEDIUM';
  let tierLabel = 'Good';
  let tierDescription = 'Device is suitable for standard proctoring.';

  if (!browserOk || !cameraOk || !micOk) {
    tier = 'UNSUPPORTED';
    tierLabel = 'Unsupported';
    tierDescription = 'Device does not meet the minimum camera, audio, or browser specifications.';
  } else if (cpuLatencyMs < 35 && cameraFrameRate >= 20) {
    tier = 'HIGH';
    tierLabel = 'Optimal';
    tierDescription = 'High-capability device. Standard proctoring fidelity enabled.';
  } else if (cpuLatencyMs <= 85) {
    tier = 'MEDIUM';
    tierLabel = 'Good';
    tierDescription = 'Standard device performance. Optimized lightweight proctoring active.';
  } else if (cpuLatencyMs <= 170) {
    tier = 'LOW';
    tierLabel = 'Supported — Reduced Proctoring Mode';
    tierDescription = 'The system will use lightweight monitoring to maintain performance on this device.';
  } else {
    tier = 'UNSUPPORTED';
    tierLabel = 'Unsupported';
    tierDescription = 'CPU processing latency is too high to maintain an uninterrupted examination experience.';
  }

  return {
    tier,
    browserOk,
    cameraOk,
    micOk,
    networkOk,
    cpuLatencyMs,
    cameraResolution,
    cameraFrameRate,
    tierLabel,
    tierDescription,
    profile: TIER_PROFILES[tier],
  };
}
