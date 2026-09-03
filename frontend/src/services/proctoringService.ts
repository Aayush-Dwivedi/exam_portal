import { apiClient } from '../api/client';

export interface ProctoringState {
  faceCount: number;
  lookingAway: boolean;
  gazeAnomaly: boolean;
  gazeDirection: string | null;
  cameraBlocked: boolean;
  phoneDetected: boolean;
  isSpoof: boolean;
  audioDisturbance: boolean;
  audioLevel: number;
  warningMessage: string | null;
  warningSeverity: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  violationCount: number;
  isRecording?: boolean;
}

export class ClientProctoringMonitor {
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private sessionId: number;
  private candidateId: number;
  private intervalId: number | null = null;
  private isProcessing: boolean = false;
  private violationCount: number = 0;
  
  // Audio Proctoring Pipeline
  private audioCtx: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private audioSourceNode: MediaStreamAudioSourceNode | null = null;
  private audioDataArray: Uint8Array<ArrayBuffer> | null = null;
  private sustainedAudioCounter: number = 0;
  private currentAudioLevel: number = 0;
  private currentSpeechDetected: boolean = false;

  // MediaRecorder video audit buffer
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecordingActive: boolean = false;
  private mediaStream: MediaStream | null = null;

  private onStateChange: ((state: ProctoringState) => void) | null = null;

  constructor(sessionId: number, candidateId: number, onStateChange?: (state: ProctoringState) => void) {
    this.sessionId = sessionId;
    this.candidateId = candidateId;
    if (onStateChange) this.onStateChange = onStateChange;

    this.canvasElement = document.createElement('canvas');
    this.canvasElement.width = 320;
    this.canvasElement.height = 240;
    this.ctx = this.canvasElement.getContext('2d', { willReadFrequently: true });
  }

  public attachVideo(video: HTMLVideoElement) {
    this.videoElement = video;
  }

  /**
   * Connect microphone stream for real-time audio disturbance and speech monitoring
   */
  public attachAudio(stream: MediaStream) {
    this.mediaStream = stream;
    try {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.audioSourceNode = this.audioCtx.createMediaStreamSource(stream);
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.audioSourceNode.connect(this.analyserNode);

      const bufferLength = this.analyserNode.frequencyBinCount;
      this.audioDataArray = new Uint8Array(new ArrayBuffer(bufferLength));
    } catch (e) {
      console.warn('Failed to initialize audio proctoring monitor', e);
    }
  }

  /**
   * Samples audio energy levels and detects sustained speech or ambient disturbance
   */
  public sampleAudio(): { audioLevel: number; speechDetected: boolean } {
    if (!this.analyserNode || !this.audioDataArray) {
      return { audioLevel: 0, speechDetected: false };
    }

    this.analyserNode.getByteFrequencyData(this.audioDataArray);

    let sum = 0;
    for (let i = 0; i < this.audioDataArray.length; i++) {
      sum += this.audioDataArray[i];
    }
    const average = sum / this.audioDataArray.length;
    // Normalized level 0.0 to 1.0
    const normalizedLevel = Math.min(1.0, average / 128.0);
    this.currentAudioLevel = Math.round(normalizedLevel * 100) / 100;

    // Speech / loud background sound threshold
    if (normalizedLevel > 0.18) {
      this.sustainedAudioCounter += 1;
    } else {
      this.sustainedAudioCounter = Math.max(0, this.sustainedAudioCounter - 1);
    }

    // Flag disturbance if sound energy persists across consecutive frames
    this.currentSpeechDetected = this.sustainedAudioCounter >= 2;
    return {
      audioLevel: this.currentAudioLevel,
      speechDetected: this.currentSpeechDetected,
    };
  }

  /**
   * Start continuous browser-side webcam video recording for forensic archive
   */
  public startRecording(stream: MediaStream) {
    try {
      if (typeof MediaRecorder === 'undefined') {
        console.warn('MediaRecorder not supported in this environment.');
        return;
      }

      this.recordedChunks = [];
      const options: MediaRecorderOptions = {};
      if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
        options.mimeType = 'video/webm;codecs=vp8,opus';
      } else if (MediaRecorder.isTypeSupported('video/webm')) {
        options.mimeType = 'video/webm';
      }

      const recorder = new MediaRecorder(stream, options);
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      // Slice every 10 seconds to ensure streaming chunks
      recorder.start(10000);
      this.mediaRecorder = recorder;
      this.isRecordingActive = true;
    } catch (e) {
      console.warn('Failed to start proctoring video recorder', e);
    }
  }

  /**
   * Stop video recording and upload entire session video to backend for audit
   */
  public async stopAndUploadRecording(): Promise<string | null> {
    if (this.mediaRecorder && this.isRecordingActive) {
      try {
        this.mediaRecorder.stop();
        this.isRecordingActive = false;
      } catch (e) {
        // ignore
      }
    }

    if (this.recordedChunks.length === 0) return null;

    try {
      const videoBlob = new Blob(this.recordedChunks, { type: 'video/webm' });
      const formData = new FormData();
      formData.append('video', videoBlob, `session_${this.sessionId}.webm`);

      const res = await apiClient.post<{ status: string; recording_url: string }>(
        `/proctoring/sessions/${this.sessionId}/recording`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );
      return res.data.recording_url;
    } catch (e) {
      console.warn('Failed to upload proctoring video recording', e);
      return null;
    }
  }

  public startMonitoring(intervalMs: number = 1200) {
    if (this.intervalId) return;

    this.intervalId = window.setInterval(() => {
      this.analyzeFrame();
    }, intervalMs);
  }

  public stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.audioSourceNode) {
      try {
        this.audioSourceNode.disconnect();
      } catch (e) {
        // ignore
      }
      this.audioSourceNode = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch (e) {
        // ignore
      }
      this.audioCtx = null;
    }
    this.stopAndUploadRecording();
  }

  public destroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.audioSourceNode) {
      try {
        this.audioSourceNode.disconnect();
      } catch {}
      this.audioSourceNode = null;
    }
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close();
      } catch {}
      this.audioCtx = null;
    }
    if (this.mediaRecorder && this.isRecordingActive) {
      try {
        this.mediaRecorder.stop();
        this.isRecordingActive = false;
      } catch {}
    }
    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => {
          try {
            track.stop();
            track.enabled = false;
          } catch {}
        });
      } catch {}
      this.mediaStream = null;
    }
    this.analyserNode = null;
    this.audioDataArray = null;
    this.videoElement = null;
    this.isProcessing = false;
  }

  private playWarningSound() {
    try {
      if (!this.audioCtx) {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) this.audioCtx = new AudioCtxClass();
      }
      if (this.audioCtx) {
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, this.audioCtx.currentTime); // A4
        osc.frequency.exponentialRampToValueAtTime(880, this.audioCtx.currentTime + 0.2); // A5

        gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.3);
      }
    } catch (e) {
      // Audio context might be restricted before interaction
    }
  }

  private async analyzeFrame() {
    if (!this.videoElement || !this.ctx || !this.canvasElement || this.isProcessing) return;
    if (this.videoElement.readyState < 2) return;

    try {
      this.isProcessing = true;
      this.ctx.drawImage(this.videoElement, 0, 0, 320, 240);
      const dataUrl = this.canvasElement.toDataURL('image/jpeg', 0.6);

      const { audioLevel, speechDetected } = this.sampleAudio();

      const res = await apiClient.post<{
        face_count: number;
        camera_blocked: boolean;
        looking_away: boolean;
        gaze_anomaly: boolean;
        gaze_direction: string | null;
        phone_detected: boolean;
        is_spoof: boolean;
        audio_anomaly: boolean;
        warning: string | null;
        warning_severity: 'HIGH' | 'MEDIUM' | 'LOW' | null;
        events_triggered: string[];
      }>('/proctoring/analyze-frame', {
        session_id: this.sessionId,
        image_base64: dataUrl,
        audio_level: audioLevel,
        speech_detected: speechDetected,
      });

      const data = res.data;

      if (data.events_triggered && data.events_triggered.length > 0) {
        this.violationCount += data.events_triggered.length;
        this.playWarningSound();
      }

      if (this.onStateChange) {
        this.onStateChange({
          faceCount: data.face_count,
          lookingAway: data.looking_away,
          gazeAnomaly: data.gaze_anomaly,
          gazeDirection: data.gaze_direction,
          cameraBlocked: data.camera_blocked,
          phoneDetected: data.phone_detected,
          isSpoof: data.is_spoof,
          audioDisturbance: data.audio_anomaly || speechDetected,
          audioLevel: audioLevel,
          warningMessage: data.warning,
          warningSeverity: data.warning_severity,
          violationCount: this.violationCount,
          isRecording: this.isRecordingActive,
        });
      }
    } catch (e) {
      // ignore transient network glitch during frame post
    } finally {
      this.isProcessing = false;
    }
  }
}
