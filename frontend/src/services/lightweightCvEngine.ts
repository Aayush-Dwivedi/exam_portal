import { apiClient } from '../api/client';
import { DeviceTier, CvStatus, ProctoringEventType, EventSeverity } from '../types';
import { TIER_PROFILES, TierProfile } from '../utils/deviceCapability';

export interface LightweightCvState {
  faceCount: number;
  faceDetected: boolean;
  lookingAway: boolean;
  headPose: 'FORWARD' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'UNKNOWN';
  cameraBlocked: boolean;
  phoneDetected: boolean;
  audioDisturbance: boolean;
  audioLevel: number;
  cvStatus: CvStatus;
  cvStatusReason: string | null;
  activeTier: DeviceTier;
  inferenceLatencyMs: number;
  violationCount: number;
  warningMessage: string | null;
  warningSeverity: 'HIGH' | 'MEDIUM' | 'LOW' | null;
}

export interface ProctoringEventPayload {
  session_id: number;
  event_type: ProctoringEventType;
  duration: number;
  confidence: number;
  severity: EventSeverity;
  metadata_info?: Record<string, any>;
}

export class LightweightCvEngine {
  private sessionId: number;
  private candidateId: number;
  private tier: DeviceTier;
  private profile: TierProfile;

  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private timerId: number | null = null;
  private isProcessing: boolean = false;

  // Native Shape Detection API if available in browser
  private nativeFaceDetector: any = null;

  // Audio pipeline
  private audioCtx: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private audioSourceNode: MediaStreamAudioSourceNode | null = null;
  private audioBuffer: Uint8Array<ArrayBuffer> | null = null;
  private sustainedAudioCounter: number = 0;

  // Temporal condition tracking: condition -> start timestamp (seconds)
  private activeConditions: Map<string, number> = new Map();
  // Cooldowns: condition -> last emitted timestamp (seconds)
  private conditionCooldowns: Map<string, number> = new Map();

  // Performance tracking & adaptive tiering
  private latencyHistory: number[] = [];
  private currentCvStatus: CvStatus = 'ACTIVE';
  private currentCvReason: string | null = null;

  // Offline event queue
  private offlineQueue: ProctoringEventPayload[] = [];
  private isOnline: boolean = navigator.onLine;

  // Server-assisted fallback timer
  private lastServerCheckTime: number = 0;

  // State callback
  private onStateUpdate: ((state: LightweightCvState) => void) | null = null;
  private violationCounter: number = 0;

  // Thresholds (in seconds)
  private thresholds = {
    FACE_NOT_DETECTED: 2.0,
    MULTIPLE_FACES: 2.0,
    LOOKING_AWAY: 2.8,
    CAMERA_BLOCKED: 2.0,
    AUDIO_DISTURBANCE: 1.8,
    PHONE_DETECTED: 2.0,
  };
  private readonly defaultCooldownSec = 12.0;

  constructor(
    sessionId: number,
    candidateId: number,
    initialTier: DeviceTier = 'MEDIUM',
    onStateUpdate?: (state: LightweightCvState) => void
  ) {
    this.sessionId = sessionId;
    this.candidateId = candidateId;
    this.tier = initialTier;
    this.profile = TIER_PROFILES[this.tier] || TIER_PROFILES.MEDIUM;
    if (onStateUpdate) this.onStateUpdate = onStateUpdate;

    this.canvasElement = document.createElement('canvas');
    this.canvasElement.width = this.profile.canvasWidth;
    this.canvasElement.height = this.profile.canvasHeight;
    this.ctx = this.canvasElement.getContext('2d', { willReadFrequently: true });

    this.initNativeFaceDetector();
    this.setupNetworkListeners();
  }

  private async initNativeFaceDetector() {
    try {
      if ('FaceDetector' in window) {
        this.nativeFaceDetector = new (window as any).FaceDetector({
          fastMode: true,
          maxDetectedFaces: 4,
        });
      }
    } catch {
      this.nativeFaceDetector = null;
    }
  }

  private setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flushOfflineQueue();
      this.updateBackendSessionStatus('GOOD');
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.recordTechnicalEvent('NETWORK_INTERRUPTION', 1.0, 'Internet connection temporarily lost');
      this.updateBackendSessionStatus('OFFLINE');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.recordTechnicalEvent('BROWSER_TAB_HIDDEN', 1.0, 'Candidate navigated away from examination tab');
      }
    });
  }

  public attachVideo(video: HTMLVideoElement) {
    this.videoElement = video;
  }

  public attachAudio(stream: MediaStream) {
    try {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      this.audioCtx = new AudioCtxClass();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.audioSourceNode = this.audioCtx.createMediaStreamSource(stream);
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 128; // Small FFT size for CPU efficiency
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.audioSourceNode.connect(this.analyserNode);

      this.audioBuffer = new Uint8Array(new ArrayBuffer(this.analyserNode.frequencyBinCount));
    } catch (e) {
      console.warn('Lightweight audio initialization skipped:', e);
    }
  }

  public start() {
    if (this.timerId !== null) return;
    this.currentCvStatus = 'ACTIVE';
    this.currentCvReason = null;
    this.updateBackendSessionStatus();

    this.timerId = window.setInterval(() => {
      this.processFrameCycle();
    }, this.profile.frameIntervalMs);
  }

  public stop() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  public destroy() {
    this.stop();
    if (this.audioSourceNode) {
      try { this.audioSourceNode.disconnect(); } catch {}
      this.audioSourceNode = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try { this.audioCtx.close(); } catch {}
      this.audioCtx = null;
    }
    this.videoElement = null;
  }

  /**
   * Main sampled processing cycle running on the candidate's CPU thread.
   */
  private async processFrameCycle() {
    if (!this.videoElement || !this.ctx || this.isProcessing) return;
    if (this.videoElement.readyState < 2) return;

    const startPerf = performance.now();
    this.isProcessing = true;

    try {
      const w = this.profile.canvasWidth;
      const h = this.profile.canvasHeight;
      this.canvasElement.width = w;
      this.canvasElement.height = h;
      this.ctx.drawImage(this.videoElement, 0, 0, w, h);

      // 1. Audio check
      const { audioLevel, speechDetected } = this.sampleAudio();

      // 2. Camera Blocked / Darkness Check (< 1ms CPU)
      const blockedRes = this.checkCameraBlocked(w, h);

      // 3. Face Count & Presence Detection
      let faceCount = 1;
      let headPose: 'FORWARD' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN' | 'UNKNOWN' = 'FORWARD';
      let lookingAway = false;
      let phoneDetected = false;

      if (blockedRes.isBlocked) {
        faceCount = 0;
      } else if (this.nativeFaceDetector) {
        const faceRes = await this.detectFaces(w, h);
        faceCount = faceRes.faceCount;

        // Head Pose (Only when single face is detected)
        if (faceCount === 1 && faceRes.faceBox && this.profile.headPose) {
          const poseRes = this.estimateHeadPose(faceRes.faceBox, w, h);
          headPose = poseRes.pose;
          lookingAway = poseRes.lookingAway;
        }
      } else {
        // Run fast local JS face check first
        const localFaceRes = await this.detectFaces(w, h);
        faceCount = localFaceRes.faceCount;

        // If local check is suspicious (0 faces or multiple) or periodically, verify with OpenCV backend
        const nowSec = Date.now() / 1000;
        const timeSinceServer = (nowSec - this.lastServerCheckTime) * 1000;
        if (faceCount !== 1 || timeSinceServer >= 2500) {
          this.lastServerCheckTime = nowSec;
          const serverRes = await this.executeServerAssistedCheck();
          if (serverRes) {
            faceCount = serverRes.face_count;
            if (serverRes.camera_blocked) {
              blockedRes.isBlocked = true;
            }
            lookingAway = serverRes.looking_away;
            phoneDetected = serverRes.phone_detected;
          }
        }
      }

      const nowSec = Date.now() / 1000;

      // 6. Temporal Event Evaluation & Debouncing
      this.evaluateTemporalConditions(nowSec, {
        cameraBlocked: blockedRes.isBlocked,
        faceCount,
        lookingAway,
        audioDisturbance: speechDetected,
        phoneDetected,
      });

      // 7. Adaptive Performance Latency Monitoring
      const cycleLatency = performance.now() - startPerf;
      this.monitorAdaptivePerformance(cycleLatency);

      // 8. Warning Formulation & State Publishing
      const warningInfo = this.formulateWarning({
        cameraBlocked: blockedRes.isBlocked,
        faceCount,
        lookingAway,
        phoneDetected,
        audioDisturbance: speechDetected,
      });

      if (this.onStateUpdate) {
        this.onStateUpdate({
          faceCount,
          faceDetected: faceCount > 0,
          lookingAway,
          headPose,
          cameraBlocked: blockedRes.isBlocked,
          phoneDetected,
          audioDisturbance: speechDetected,
          audioLevel,
          cvStatus: this.currentCvStatus,
          cvStatusReason: this.currentCvReason,
          activeTier: this.tier,
          inferenceLatencyMs: Math.round(cycleLatency),
          violationCount: this.violationCounter,
          warningMessage: warningInfo.message,
          warningSeverity: warningInfo.severity,
        });
      }
    } catch (e) {
      console.warn('Proctoring cycle error, recovering gracefully:', e);
      this.currentCvStatus = 'RECOVERING';
      this.currentCvReason = 'Transient visual frame read glitch';
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Lightweight camera blocked detector via luminance and standard deviation variance.
   */
  private checkCameraBlocked(w: number, h: number): { isBlocked: boolean; confidence: number } {
    if (!this.ctx) return { isBlocked: false, confidence: 1.0 };
    const step = 4; // Sample every 4th pixel for speed
    const imgData = this.ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let totalLum = 0;
    let totalR = 0, totalG = 0, totalB = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4 * step) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      totalLum += lum;
      totalR += r;
      totalG += g;
      totalB += b;
      count++;
    }
    const mean = totalLum / Math.max(1, count);
    const meanR = totalR / Math.max(1, count);
    const meanG = totalG / Math.max(1, count);
    const meanB = totalB / Math.max(1, count);

    // Completely pitch black
    if (mean < 10) {
      return { isBlocked: true, confidence: 0.95 };
    }

    // Variance check for lens covering (e.g. finger/paper)
    let varianceSum = 0;
    for (let i = 0; i < data.length; i += 4 * step) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      varianceSum += Math.abs(lum - mean);
    }
    const avgDeviation = varianceSum / Math.max(1, count);

    // Finger or hand occlusion over lens (dark reddish uniform frame)
    if (
      (meanB < 50 && meanG < 50 && meanR > 25 && avgDeviation < 12.0) ||
      (avgDeviation < 6.5 && mean < 65) ||
      (avgDeviation < 3.2 && mean < 90)
    ) {
      return { isBlocked: true, confidence: 0.95 };
    }

    return { isBlocked: false, confidence: 1.0 };
  }

  /**
   * Fast face presence & count detector.
   * Uses native Shape Detection API if present, with fast skin-chrominance & geometric fallback.
   */
  private async detectFaces(
    w: number,
    h: number
  ): Promise<{ faceCount: number; faceBox: { x: number; y: number; w: number; h: number } | null }> {
    // 1. Try Native Browser FaceDetector (OS-accelerated, ~2ms)
    if (this.nativeFaceDetector) {
      try {
        const detected = await this.nativeFaceDetector.detect(this.canvasElement);
        if (detected && detected.length > 0) {
          const first = detected[0].boundingBox;
          return {
            faceCount: detected.length,
            faceBox: { x: first.x, y: first.y, w: first.width, h: first.height },
          };
        }
        return { faceCount: 0, faceBox: null };
      } catch {
        // Fallback to JS engine
      }
    }

    // 2. High-speed JS skin-chrominance & bilateral facial geometry analyzer
    if (!this.ctx) return { faceCount: 1, faceBox: null };
    const imgData = this.ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    let minX = w, maxX = 0, minY = h, maxY = 0;
    let skinPixelCount = 0;

    // Scan central region (10% to 90% bounds)
    const startX = Math.floor(w * 0.1);
    const endX = Math.floor(w * 0.9);
    const startY = Math.floor(h * 0.1);
    const endY = Math.floor(h * 0.9);

    for (let y = startY; y < endY; y += 3) {
      for (let x = startX; x < endX; x += 3) {
        const idx = (y * w + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Standard normalized skin-color chrominance heuristic
        if (r > 60 && g > 40 && b > 20 && r > g && r > b && (r - g) > 12) {
          skinPixelCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const boxW = Math.max(0, maxX - minX);
    const boxH = Math.max(0, maxY - minY);
    const boxArea = boxW * boxH;
    const totalArea = w * h;

    // If skin area is negligible or bounding box too small -> no face
    if (skinPixelCount < 60 || boxArea < totalArea * 0.05 || boxW < 24 || boxH < 24) {
      return { faceCount: 0, faceBox: null };
    }

    // Aspect ratio check: Human faces have aspect ratio between 0.6 and 2.2
    const aspect = boxH / Math.max(1, boxW);
    if (aspect < 0.6 || aspect > 2.2) {
      return { faceCount: 0, faceBox: null };
    }

    // Feature contrast check: A real face has facial contours with internal contrast
    let boxLumSum = 0;
    let boxCount = 0;
    for (let y = minY; y < maxY; y += 3) {
      for (let x = minX; x < maxX; x += 3) {
        const idx = (y * w + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        boxLumSum += lum;
        boxCount++;
      }
    }
    const boxMean = boxLumSum / Math.max(1, boxCount);
    let boxDevSum = 0;
    for (let y = minY; y < maxY; y += 3) {
      for (let x = minX; x < maxX; x += 3) {
        const idx = (y * w + x) * 4;
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        boxDevSum += Math.abs(lum - boxMean);
      }
    }
    const boxAvgDev = boxDevSum / Math.max(1, boxCount);
    if (boxAvgDev < 9.0) {
      // Flat surface (e.g. wall, wooden desk, painted door) -> no facial features
      return { faceCount: 0, faceBox: null };
    }

    // If bounding box spans abnormally wide -> multiple persons
    if (boxW > w * 0.85 && skinPixelCount > 800) {
      return { faceCount: 2, faceBox: { x: minX, y: minY, w: boxW, h: boxH } };
    }

    return {
      faceCount: 1,
      faceBox: { x: minX, y: minY, w: boxW, h: boxH },
    };
  }


  /**
   * Head pose classification via facial symmetry & vertical gradient moment analysis.
   */
  private estimateHeadPose(
    box: { x: number; y: number; w: number; h: number },
    w: number,
    h: number
  ): { pose: 'FORWARD' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN'; lookingAway: boolean } {
    if (!this.ctx || box.w < 20 || box.h < 20) {
      return { pose: 'FORWARD', lookingAway: false };
    }

    try {
      const cropW = Math.min(box.w, w - box.x);
      const cropH = Math.min(box.h, h - box.y);
      if (cropW < 10 || cropH < 10) return { pose: 'FORWARD', lookingAway: false };

      const imgData = this.ctx.getImageData(box.x, box.y, cropW, cropH);
      const data = imgData.data;

      const midX = Math.floor(cropW / 2);
      let leftSum = 0;
      let rightSum = 0;
      let topSum = 0;
      let bottomSum = 0;

      for (let y = 0; y < cropH; y += 2) {
        for (let x = 0; x < cropW; x += 2) {
          const idx = (y * cropW + x) * 4;
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          if (x < midX) leftSum += lum;
          else rightSum += lum;

          if (y < cropH / 2) topSum += lum;
          else bottomSum += lum;
        }
      }

      const hDenom = Math.max(1, leftSum + rightSum);
      const hDiff = (rightSum - leftSum) / hDenom;

      const vDenom = Math.max(1, topSum + bottomSum);
      const vDiff = (bottomSum - topSum) / vDenom;

      if (hDiff < -0.38) {
        return { pose: 'LEFT', lookingAway: true };
      } else if (hDiff > 0.38) {
        return { pose: 'RIGHT', lookingAway: true };
      } else if (vDiff > 0.42) {
        return { pose: 'DOWN', lookingAway: true };
      }

      return { pose: 'FORWARD', lookingAway: false };
    } catch {
      return { pose: 'FORWARD', lookingAway: false };
    }
  }

  /**
   * Evaluates conditions over time. Only generates events when threshold is exceeded.
   */
  private evaluateTemporalConditions(
    nowSec: number,
    conditions: {
      cameraBlocked: boolean;
      faceCount: number;
      lookingAway: boolean;
      audioDisturbance: boolean;
      phoneDetected: boolean;
    }
  ) {
    // 1. Camera Blocked
    this.trackCondition(
      'CAMERA_BLOCKED',
      conditions.cameraBlocked,
      nowSec,
      this.thresholds.CAMERA_BLOCKED,
      'HIGH',
      0.95
    );

    // 2. Face Not Detected
    this.trackCondition(
      'FACE_NOT_DETECTED',
      conditions.faceCount === 0 && !conditions.cameraBlocked,
      nowSec,
      this.thresholds.FACE_NOT_DETECTED,
      'MEDIUM',
      0.90
    );

    // 3. Multiple Faces
    this.trackCondition(
      'MULTIPLE_FACES',
      conditions.faceCount > 1,
      nowSec,
      this.thresholds.MULTIPLE_FACES,
      'HIGH',
      0.95,
      { face_count: conditions.faceCount }
    );

    // 4. Looking Away
    this.trackCondition(
      'LOOKING_AWAY',
      conditions.lookingAway,
      nowSec,
      this.thresholds.LOOKING_AWAY,
      'LOW',
      0.85
    );

    // 5. Audio Disturbance
    this.trackCondition(
      'AUDIO_DISTURBANCE',
      conditions.audioDisturbance,
      nowSec,
      this.thresholds.AUDIO_DISTURBANCE,
      'MEDIUM',
      0.88
    );

    // 6. Phone Detected
    if (conditions.phoneDetected) {
      this.trackCondition(
        'PHONE_DETECTED',
        true,
        nowSec,
        this.thresholds.PHONE_DETECTED,
        'HIGH',
        0.92
      );
    } else {
      this.trackCondition('PHONE_DETECTED', false, nowSec, 1.0, 'HIGH', 1.0);
    }
  }

  private trackCondition(
    conditionName: ProctoringEventType,
    isActive: boolean,
    nowSec: number,
    thresholdSec: number,
    severity: EventSeverity,
    confidence: number,
    metadata?: Record<string, any>
  ) {
    if (isActive) {
      if (!this.activeConditions.has(conditionName)) {
        this.activeConditions.set(conditionName, nowSec);
      } else {
        const elapsed = nowSec - (this.activeConditions.get(conditionName) || nowSec);
        const lastEmitted = this.conditionCooldowns.get(conditionName) || 0;

        if (elapsed >= thresholdSec && (nowSec - lastEmitted) >= this.defaultCooldownSec) {
          this.conditionCooldowns.set(conditionName, nowSec);
          this.violationCounter++;

          const payload: ProctoringEventPayload = {
            session_id: this.sessionId,
            event_type: conditionName,
            duration: Math.round(elapsed * 10) / 10,
            confidence,
            severity,
            metadata_info: metadata || {},
          };

          this.dispatchProctoringEvent(payload);
        }
      }
    } else {
      this.activeConditions.delete(conditionName);
    }
  }

  /**
   * Emits a confirmed debounced event to the backend API or stores in offline buffer.
   */
  private async dispatchProctoringEvent(event: ProctoringEventPayload) {
    if (!this.isOnline) {
      this.offlineQueue.push(event);
      return;
    }

    try {
      await apiClient.post('/proctoring/events', event);
    } catch {
      // Network hiccup &rarr; queue for sync
      this.offlineQueue.push(event);
    }
  }

  private async flushOfflineQueue() {
    if (this.offlineQueue.length === 0) return;
    const toSend = [...this.offlineQueue];
    this.offlineQueue = [];

    for (const ev of toSend) {
      try {
        await apiClient.post('/proctoring/events', ev);
      } catch {
        this.offlineQueue.push(ev);
        break;
      }
    }
  }

  /**
   * Logs non-suspicious technical telemetry events (disconnections, degraded CV).
   */
  public recordTechnicalEvent(eventType: ProctoringEventType, duration: number = 0, reason?: string) {
    const payload: ProctoringEventPayload = {
      session_id: this.sessionId,
      event_type: eventType,
      duration,
      confidence: 1.0,
      severity: 'LOW',
      metadata_info: { technical: true, reason },
    };
    this.dispatchProctoringEvent(payload);
  }

  /**
   * Adaptive Performance Monitor: tracks inference latency and automatically steps down tier if CPU struggles.
   */
  private monitorAdaptivePerformance(cycleLatencyMs: number) {
    this.latencyHistory.push(cycleLatencyMs);
    if (this.latencyHistory.length > 5) this.latencyHistory.shift();

    const avgLatency = this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length;

    // If latency is excessive for multiple cycles, step down tier automatically
    if (avgLatency > 180 && this.tier === 'HIGH') {
      this.tier = 'MEDIUM';
      this.profile = TIER_PROFILES.MEDIUM;
      this.currentCvStatus = 'DEGRADED';
      this.currentCvReason = 'High inference latency: reduced frequency automatically';
      this.recordTechnicalEvent('CV_PERFORMANCE_DEGRADED', 1.0, this.currentCvReason);
      this.restartSamplingTimer();
      this.updateBackendSessionStatus();
    } else if (avgLatency > 220 && this.tier === 'MEDIUM') {
      this.tier = 'LOW';
      this.profile = TIER_PROFILES.LOW;
      this.currentCvStatus = 'DEGRADED';
      this.currentCvReason = 'CPU pressure: switched to minimal proctoring tier';
      this.recordTechnicalEvent('CV_PERFORMANCE_DEGRADED', 1.0, this.currentCvReason);
      this.restartSamplingTimer();
      this.updateBackendSessionStatus();
    }
  }

  private restartSamplingTimer() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = window.setInterval(() => {
        this.processFrameCycle();
      }, this.profile.frameIntervalMs);
    }
  }

  /**
   * Sends session status updates to the backend to sync with the admin dashboard.
   */
  private async updateBackendSessionStatus(networkOverride?: string) {
    try {
      await apiClient.post('/proctoring/session-status', {
        session_id: this.sessionId,
        device_tier: this.tier,
        cv_status: this.currentCvStatus,
        cv_status_reason: this.currentCvReason,
        network_status: networkOverride || (this.isOnline ? 'ONLINE' : 'OFFLINE'),
      });
    } catch {}
  }

  /**
   * Rate-limited server-assisted fallback for face presence, phone and anomaly detection.
   */
  private async executeServerAssistedCheck(): Promise<{
    face_count: number;
    phone_detected: boolean;
    looking_away: boolean;
    camera_blocked: boolean;
  } | null> {
    if (!this.canvasElement) return null;
    try {
      const dataUrl = this.canvasElement.toDataURL('image/jpeg', 0.5);
      const res = await apiClient.post<{
        face_count: number;
        phone_detected: boolean;
        looking_away: boolean;
        camera_blocked: boolean;
      }>(
        '/proctoring/server-assisted-check',
        {
          session_id: this.sessionId,
          image_base64: dataUrl,
        }
      );
      return res.data;
    } catch {
      return null;
    }
  }


  private sampleAudio(): { audioLevel: number; speechDetected: boolean } {
    if (!this.analyserNode || !this.audioBuffer) {
      return { audioLevel: 0, speechDetected: false };
    }

    this.analyserNode.getByteFrequencyData(this.audioBuffer);
    let sum = 0;
    for (let i = 0; i < this.audioBuffer.length; i++) {
      sum += this.audioBuffer[i];
    }
    const avg = sum / this.audioBuffer.length;
    const normalized = Math.min(1.0, avg / 128.0);

    if (normalized > 0.18) {
      this.sustainedAudioCounter++;
    } else {
      this.sustainedAudioCounter = Math.max(0, this.sustainedAudioCounter - 1);
    }

    return {
      audioLevel: Math.round(normalized * 100) / 100,
      speechDetected: this.sustainedAudioCounter >= 2,
    };
  }

  private formulateWarning(cond: {
    cameraBlocked: boolean;
    faceCount: number;
    lookingAway: boolean;
    phoneDetected: boolean;
    audioDisturbance: boolean;
  }): { message: string | null; severity: 'HIGH' | 'MEDIUM' | 'LOW' | null } {
    if (cond.cameraBlocked) {
      return { message: 'Camera feed blocked or dark. Ensure adequate lighting.', severity: 'HIGH' };
    }
    if (cond.phoneDetected) {
      return { message: 'Prohibited device detected in camera frame.', severity: 'HIGH' };
    }
    if (cond.faceCount > 1) {
      return { message: 'Multiple people detected. You must be alone in the room.', severity: 'HIGH' };
    }
    if (cond.faceCount === 0) {
      return { message: 'No face detected. Please remain centered in front of your camera.', severity: 'MEDIUM' };
    }
    if (cond.audioDisturbance) {
      return { message: 'Audio disturbance detected. Maintain silence during the examination.', severity: 'MEDIUM' };
    }
    if (cond.lookingAway) {
      return { message: 'Looking away detected. Keep eyes focused on the screen.', severity: 'LOW' };
    }
    return { message: null, severity: null };
  }
}
