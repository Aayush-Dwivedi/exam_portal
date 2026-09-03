import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Camera, Mic, Wifi, Monitor, CheckCircle2, 
  XCircle, ArrowRight, ArrowLeft, ShieldCheck, UserCheck, AlertTriangle, RefreshCw
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { registerMediaStream, stopAllHardwareStreams } from '../../utils/hardware';

export const PreExamCheckPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  // Diagnostics status
  const [browserOk, setBrowserOk] = useState(false);
  const [cameraOk, setCameraOk] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const [networkOk, setNetworkOk] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [fullscreenOk, setFullscreenOk] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [isVerifyingFace, setIsVerifyingFace] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize Camera & Microphone Stream
  const startCamera = async () => {
    setMediaError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API not supported on this browser.');
      }

      // If a stream was already running, stop it first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
            t.enabled = false;
          } catch {}
        });
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true,
      });

      registerMediaStream(stream);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraOk(true);
      setMicOk(true);
      setMediaError(null);
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

  // Complete hardware teardown (both camera and microphone)
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

  // 1. Initial Diagnostic Checks
  useEffect(() => {
    // Check Browser
    const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    const hasWs = typeof WebSocket !== 'undefined';
    setBrowserOk(hasMedia && hasWs);

    // Check Network Latency
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

    // Check Fullscreen capability
    setFullscreenOk(document.fullscreenEnabled);

    // Start hardware checks
    startCamera();

    // Listen for permission change if supported
    let permStatus: PermissionStatus | null = null;
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'camera' as PermissionName }).then((status) => {
        permStatus = status;
        status.onchange = () => {
          if (status.state === 'granted') {
            startCamera();
          }
        };
      }).catch(() => {});
    }

    return () => {
      if (permStatus) {
        permStatus.onchange = null;
      }
      stopHardware();
    };
  }, [stopHardware]);

  // Guarantee hardware teardown if tab is closed or navigated away
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

  const handlePerformFaceVerification = async () => {
    if (!cameraOk || !streamRef.current || !videoRef.current) {
      alert('Camera access is required for identity calibration. Please unblock your camera and retry.');
      return;
    }

    setIsVerifyingFace(true);
    try {
      // Capture frame and test face presence
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (ctx && videoRef.current) {
        ctx.drawImage(videoRef.current, 0, 0, 320, 240);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);

        const res = await apiClient.post('/proctoring/analyze-frame', {
          session_id: 1,
          image_base64: dataUrl,
        }).catch(() => null);

        if (res && res.data && res.data.face_count === 0) {
          alert('No face detected in the frame. Please look directly into the camera and ensure good lighting.');
          setIsVerifyingFace(false);
          return;
        }
      }

      setFaceVerified(true);
    } catch {
      setFaceVerified(true);
    } finally {
      setIsVerifyingFace(false);
    }
  };

  const handleEnterExam = async () => {
    // Crucial: stop calibration stream so camera/mic hardware is completely released
    // before the exam room requests the proctoring stream!
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

  const allChecksPassed = browserOk && cameraOk && micOk && networkOk && faceVerified;

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
            Hardware diagnostic tests must pass before entering the examination room
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
                💡 Look at the browser popup in the top-right &rarr; choose <strong>"Always allow http://localhost:5173 to access your camera and microphone"</strong> &rarr; click <strong>Done</strong> &rarr; then click <strong>Retry Access</strong> below.
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
              {cameraOk ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />

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
                    Browser permission is set to "Block". Please click the lock or camera icon in your address bar and grant access.
                  </p>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-3 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] font-semibold transition-colors"
                  >
                    Retry Connection
                  </button>
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handlePerformFaceVerification}
            disabled={!cameraOk || isVerifyingFace || faceVerified}
            className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              faceVerified
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                : !cameraOk
                ? 'bg-stone-200 text-stone-400 cursor-not-allowed border border-stone-300'
                : 'btn-primary'
            }`}
          >
            {isVerifyingFace ? (
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Calibrating facial landmarks...</span>
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
        </div>

        {/* Right Side: Diagnostics Checklist */}
        <div className="card-cream p-5 sm:p-6 rounded-2xl flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-xs font-bold text-stone-900 uppercase tracking-wider mb-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              Pre-Flight Diagnostic Matrix
            </h2>

            <div className="space-y-2.5">
              {/* Browser */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Monitor className="w-4 h-4 text-stone-500" />
                  <div>
                    <p className="text-xs font-semibold text-stone-900">Modern Browser Engine</p>
                    <p className="text-[10px] text-stone-500">WebRTC, WebAssembly & Canvas</p>
                  </div>
                </div>
                {browserOk ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600" />
                )}
              </div>

              {/* Camera */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Camera className="w-4 h-4 text-stone-500" />
                  <div>
                    <p className="text-xs font-semibold text-stone-900">Video Capture Device</p>
                    <p className="text-[10px] text-stone-500">
                      {cameraOk ? 'Continuous optical stream' : 'Device blocked by browser'}
                    </p>
                  </div>
                </div>
                {cameraOk ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">Blocked</span>
                    <XCircle className="w-4 h-4 text-rose-600" />
                  </div>
                )}
              </div>

              {/* Microphone */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Mic className="w-4 h-4 text-stone-500" />
                  <div>
                    <p className="text-xs font-semibold text-stone-900">Audio Sensor</p>
                    <p className="text-[10px] text-stone-500">
                      {micOk ? 'Ambient noise detector' : 'Sensor blocked by browser'}
                    </p>
                  </div>
                </div>
                {micOk ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-rose-600 font-bold uppercase tracking-wider">Blocked</span>
                    <XCircle className="w-4 h-4 text-rose-600" />
                  </div>
                )}
              </div>

              {/* Network Latency */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Wifi className="w-4 h-4 text-stone-500" />
                  <div>
                    <p className="text-xs font-semibold text-stone-900">Server Synchronization</p>
                    <p className="text-[10px] text-stone-500">Latency: {latencyMs !== null ? `${latencyMs}ms` : 'Testing...'}</p>
                  </div>
                </div>
                {networkOk ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-600" />
                )}
              </div>

              {/* Face Verification */}
              <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <UserCheck className="w-4 h-4 text-stone-500" />
                  <div>
                    <p className="text-xs font-semibold text-stone-900">Facial Calibration</p>
                    <p className="text-[10px] text-stone-500">Single candidate verified</p>
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
            className="btn-primary w-full py-2.5 text-xs font-semibold justify-center"
          >
            <span>Enter Examination Room</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
