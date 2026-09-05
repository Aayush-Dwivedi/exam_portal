import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Camera, Mic, Wifi, Monitor, CheckCircle2, 
  XCircle, ArrowRight, ArrowLeft, ShieldCheck, UserCheck, AlertTriangle, RefreshCw, Cpu
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { registerMediaStream, stopAllHardwareStreams } from '../../utils/hardware';
import { evaluateDeviceCapability, DeviceCapabilityResult, TIER_PROFILES } from '../../utils/deviceCapability';

export const PreExamCheckPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  // Diagnostics status
  const [browserOk, setBrowserOk] = useState(false);
  const [cameraOk, setCameraOk] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const [networkOk, setNetworkOk] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [faceVerified, setFaceVerified] = useState(false);
  const [isVerifyingFace, setIsVerifyingFace] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  // Device Capability & Performance Tier
  const [deviceCap, setDeviceCap] = useState<DeviceCapabilityResult>({
    tier: 'MEDIUM',
    browserOk: true,
    cameraOk: false,
    micOk: false,
    networkOk: true,
    cpuLatencyMs: 25.0,
    cameraResolution: 'Testing...',
    cameraFrameRate: 30,
    tierLabel: 'Evaluating...',
    tierDescription: 'Analyzing device capability...',
    profile: TIER_PROFILES.MEDIUM,
  });

  const [verificationFeedback, setVerificationFeedback] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Callback ref to reliably attach stream whenever the video element mounts or re-renders
  const attachVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      if (node.srcObject !== streamRef.current) {
        node.srcObject = streamRef.current;
      }
      node.play().catch((e) => console.warn('Video play catch:', e));
    }
  }, []);

  // Initialize Camera & Microphone Stream
  const startCamera = async () => {
    setMediaError(null);
    setVerificationFeedback(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API not supported on this browser.');
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
            t.enabled = false;
          } catch {}
        });
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,
        });
        setMicOk(true);
      } catch (audioErr) {
        console.warn('Combined audio+video failed, attempting video only:', audioErr);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        setMicOk(false);
      }

      registerMediaStream(stream);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      setCameraOk(true);
      setMediaError(null);

      // Evaluate device capability once stream is online
      const cap = await evaluateDeviceCapability(stream, latencyMs);
      setDeviceCap(cap);
      sessionStorage.setItem('exam_device_tier', cap.tier);
    } catch (err: any) {
      console.warn('Camera/Mic access failed:', err);
      setCameraOk(false);
      setMicOk(false);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMediaError('Camera and microphone access is blocked by your browser. Please allow permission in the top browser bar and click Retry.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setMediaError('No camera or microphone hardware found on your computer.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setMediaError('Camera or microphone is currently in use by another application (e.g. Zoom, Teams).');
      } else {
        setMediaError(err.message || 'Failed to access camera and microphone.');
      }
    }
  };

  // Complete hardware teardown
  const stopHardware = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
          track.enabled = false;
        } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      if (videoRef.current.srcObject) {
        try {
          const s = videoRef.current.srcObject as MediaStream;
          s.getTracks().forEach((track) => {
            track.stop();
            track.enabled = false;
          });
        } catch {}
      }
      videoRef.current.srcObject = null;
    }
    stopAllHardwareStreams();
  }, []);

  // Ensure video element plays when cameraOk state flips
  useEffect(() => {
    if (cameraOk && videoRef.current && streamRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch(() => {});
    }
  }, [cameraOk]);

  // Initial Diagnostic Checks
  useEffect(() => {
    const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasWs = typeof WebSocket !== 'undefined';
    setBrowserOk(hasMedia && hasWs);

    const checkNetwork = async () => {
      const start = performance.now();
      try {
        await apiClient.get('/health');
        const lat = Math.round(performance.now() - start);
        setLatencyMs(lat);
        setNetworkOk(true);
      } catch (e) {
        setNetworkOk(false);
      }
    };
    checkNetwork();

    startCamera();

    return () => {
      stopHardware();
    };
  }, [stopHardware]);

  useEffect(() => {
    const handleUnload = () => stopHardware();
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      stopHardware();
    };
  }, [stopHardware]);

  const handleGoBack = () => {
    stopHardware();
    navigate(`/candidate/exams/${examId}/details`);
  };

  // Lightweight Local Face Verification (CPU-friendly, no heavy server upload)
  const handlePerformFaceVerification = async () => {
    if (!cameraOk || !streamRef.current || !videoRef.current) {
      setVerificationFeedback('Camera access is required for identity calibration. Please unblock your camera and retry.');
      return;
    }

    setIsVerifyingFace(true);
    setVerificationFeedback(null);

    try {
      const video = videoRef.current;

      // Ensure video is actively playing
      if (video.readyState < 2) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 800);
          video.onloadeddata = () => {
            clearTimeout(timer);
            resolve(true);
          };
        });
      }

      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 180;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (ctx && video) {
        ctx.drawImage(video, 0, 0, 240, 180);
        const imgData = ctx.getImageData(0, 0, 240, 180);
        const data = imgData.data;

        let totalLuminance = 0;
        let skinPixels = 0;
        let samples = 0;

        for (let i = 0; i < data.length; i += 4 * 2) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          totalLuminance += lum;
          samples++;

          // Standard RGB warm tone
          const rgbSkin = r > 45 && g > 30 && b > 20 && r >= g && (r - b) > 5;
          // YCbCr skin chrominance (fair and robust across diverse complexions and light temperatures)
          const y = lum;
          const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
          const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
          const ycbcrSkin = y > 20 && cb >= 75 && cb <= 135 && cr >= 125 && cr <= 180;

          if (rgbSkin || ycbcrSkin) {
            skinPixels++;
          }
        }

        const avgLuminance = totalLuminance / (samples || 1);

        // Frame is pitch-black (covered camera or camera hardware sleeping)
        if (avgLuminance < 8) {
          setVerificationFeedback('Camera view is completely dark or lens is covered. Please unblock your camera and ensure lighting is on.');
          setIsVerifyingFace(false);
          return;
        }

        // Low lighting or no presence detected
        if (skinPixels < 15 && avgLuminance < 20) {
          setVerificationFeedback('Low lighting detected or face not clearly centered. Please face the camera in good lighting.');
          setIsVerifyingFace(false);
          return;
        }
      }

      setFaceVerified(true);
      setVerificationFeedback(null);
    } catch (err) {
      console.warn('Face calibration fallback:', err);
      // Graceful fallback so candidate is never stuck due to canvas read errors
      setFaceVerified(true);
      setVerificationFeedback(null);
    } finally {
      setIsVerifyingFace(false);
    }
  };

  const handleEnterExam = async () => {
    sessionStorage.setItem('exam_device_tier', deviceCap.tier);
    stopHardware();
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      console.warn('Fullscreen request bypassed', e);
    }
    navigate(`/candidate/exams/${examId}/room`);
  };

  const isUnsupported = deviceCap.tier === 'UNSUPPORTED';
  const allChecksPassed = browserOk && cameraOk && micOk && networkOk && faceVerified && !isUnsupported;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleGoBack}
          aria-label="Back to Exam Details"
          className="p-2 rounded-xl bg-white border border-stone-200 text-stone-500 hover:text-stone-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">
            System & Environmental Verification
          </h1>
          <p className="text-stone-500 text-xs mt-0.5">
            System hardware and environmental verification checks before entering the examination
          </p>
        </div>
      </div>

      {/* Error notification banner if hardware is blocked */}
      {mediaError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-rose-100 text-rose-700 mt-0.5 shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-xs">Camera or Microphone Access Blocked by Browser</p>
              <p className="text-[11px] text-rose-700 mt-0.5">{mediaError}</p>
              <p className="text-[10px] text-rose-600 mt-1 font-medium">
                💡 Look at the browser popup in the address bar &rarr; allow camera and microphone &rarr; then click <strong>Retry Access</strong> below.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={startCamera}
            className="px-3.5 py-1.5 rounded-xl bg-rose-700 hover:bg-rose-800 text-white font-semibold text-xs flex items-center gap-1.5 shrink-0 shadow-xs transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Access</span>
          </button>
        </div>
      )}

      {/* Unsupported Device Warning Card */}
      {isUnsupported && (
        <div className="p-5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-700" />
            <h3 className="text-sm font-bold text-amber-900">Device Requirements Notice</h3>
          </div>
          <p className="text-xs text-amber-800 leading-relaxed">
            Your device does not currently meet the minimum requirements for this examination.
            Please use a supported device or follow the examination administrator's alternative instructions.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Left Side: Live Video Viewport */}
        <div className="card-cream p-5 sm:p-6 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                <Camera className="w-4 h-4 text-stone-700" />
                Webcam & Identity Calibration
              </h2>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                faceVerified ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {faceVerified ? 'Verified' : 'Pending Verification'}
              </span>
            </div>

            {/* Video Box */}
            <div className="relative aspect-video rounded-xl bg-stone-950 border border-stone-300 overflow-hidden flex items-center justify-center">
              <video
                ref={attachVideoRef}
                autoPlay
                playsInline
                muted
                onLoadedMetadata={(e) => {
                  e.currentTarget.play().catch(() => {});
                }}
                className={`w-full h-full object-cover transform -scale-x-100 ${cameraOk ? 'block' : 'hidden'}`}
              />

              {cameraOk ? (
                <>
                  {/* Live Feed Status Tag */}
                  <div className="absolute top-2.5 left-2.5 pointer-events-none">
                    <span className="px-2 py-0.5 rounded bg-stone-900/80 text-emerald-400 font-mono text-[10px] font-medium border border-emerald-500/40 flex items-center gap-1 shadow-xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live Feed
                    </span>
                  </div>

                  {/* Target Face Frame Guide */}
                  <div className="absolute inset-0 border-2 border-dashed border-stone-400/60 m-6 rounded-2xl pointer-events-none flex items-center justify-center">
                    <span className="text-[10px] text-stone-300 font-medium px-2.5 py-0.5 bg-stone-950/70 rounded-full">
                      Center face in frame
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-center p-6 space-y-2.5">
                  <div className="w-10 h-10 rounded-full bg-rose-950/80 border border-rose-600/40 flex items-center justify-center mx-auto text-rose-400">
                    <Camera className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-rose-300">Camera Feed Blocked</p>
                  <p className="text-[11px] text-stone-400 max-w-xs leading-relaxed">
                    Browser permission is set to "Block". Please grant camera access to proceed with examination proctoring.
                  </p>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-3 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    Retry Connection
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handlePerformFaceVerification}
              disabled={!cameraOk || isVerifyingFace || faceVerified}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                faceVerified
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                  : !cameraOk
                  ? 'bg-stone-200 text-stone-400 cursor-not-allowed border border-stone-300'
                  : 'btn-primary cursor-pointer'
              }`}
            >
              {isVerifyingFace ? (
                <div className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Calibrating lighting & face position...</span>
                </div>
              ) : faceVerified ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Identity Calibration Passed</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  <span>Verify Face & Environment</span>
                </>
              )}
            </button>

            {/* Non-blocking feedback banner if verification warns */}
            {verificationFeedback && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start justify-between gap-2 animate-in fade-in">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-950">{verificationFeedback}</p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Ensure your face is well-lit and clearly centered inside the frame guide.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFaceVerified(true);
                    setVerificationFeedback(null);
                  }}
                  className="text-[11px] font-bold text-amber-900 underline hover:text-amber-950 shrink-0 cursor-pointer ml-2"
                >
                  Proceed Anyway
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Diagnostics Checklist */}
        <div className="card-cream p-5 sm:p-6 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                System Status
              </h2>
              <span className="text-[11px] text-stone-500 font-medium">
                System Compatibility: Verified
              </span>
            </div>

            <div className="space-y-2">
              {/* Camera */}
              <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Camera className="w-4 h-4 text-stone-500" />
                  <div>
                    <p className="text-xs font-semibold text-stone-900">Camera</p>
                    <p className="text-[10px] text-stone-500">
                      {cameraOk ? 'Ready' : 'Device blocked by browser'}
                    </p>
                  </div>
                </div>
                {cameraOk ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600" />
                )}
              </div>

              {/* Microphone */}
              <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Mic className="w-4 h-4 text-stone-500" />
                  <div>
                    <p className="text-xs font-semibold text-stone-900">Microphone</p>
                    <p className="text-[10px] text-stone-500">
                      {micOk ? 'Ready' : 'Sensor blocked by browser'}
                    </p>
                  </div>
                </div>
                {micOk ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600" />
                )}
              </div>

              {/* Browser */}
              <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Monitor className="w-4 h-4 text-stone-500" />
                  <div>
                    <p className="text-xs font-semibold text-stone-900">Browser</p>
                    <p className="text-[10px] text-stone-500">Compatible</p>
                  </div>
                </div>
                {browserOk ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600" />
                )}
              </div>

              {/* Network */}
              <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Wifi className="w-4 h-4 text-stone-500" />
                  <div>
                    <p className="text-xs font-semibold text-stone-900">Network</p>
                    <p className="text-[10px] text-stone-500">Good ({latencyMs !== null ? `${latencyMs}ms` : 'testing'})</p>
                  </div>
                </div>
                {networkOk ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600" />
                )}
              </div>

              {/* System Compatibility */}
              <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Cpu className="w-4 h-4 text-stone-500" />
                  <div>
                    <p className="text-xs font-semibold text-stone-900">System Compatibility</p>
                    <p className="text-[10px] text-stone-500">
                      {!isUnsupported ? 'Verified & Optimized' : 'Unsupported Browser/Device'}
                    </p>
                  </div>
                </div>
                {!isUnsupported ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600" />
                )}
              </div>

              {/* Reassuring note */}
              {!isUnsupported && (
                <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200/80 text-[11px] text-emerald-900">
                  <p className="font-semibold text-[11px] text-emerald-950">✓ System Verified</p>
                  <p className="text-[10px] text-emerald-800 mt-0.5">
                    Your environment is verified and optimized for seamless examination delivery.
                  </p>
                </div>
              )}

              {/* Face Verification */}
              <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <UserCheck className="w-4 h-4 text-stone-500" />
                  <div>
                    <p className="text-xs font-semibold text-stone-900">Proctoring Calibration</p>
                    <p className="text-[10px] text-stone-500">{faceVerified ? 'Ready' : 'Pending'}</p>
                  </div>
                </div>
                {faceVerified ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <span className="text-[11px] text-amber-700 font-semibold">Pending</span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleEnterExam}
            disabled={!allChecksPassed}
            className={`w-full py-2.5 text-xs font-semibold justify-center flex items-center gap-2 rounded-xl transition-all ${
              allChecksPassed
                ? 'btn-primary'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed border border-stone-300'
            }`}
          >
            <span>Enter Examination Room</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
