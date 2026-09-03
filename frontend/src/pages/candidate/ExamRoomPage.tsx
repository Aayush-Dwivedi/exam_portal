import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Clock, Shield, AlertTriangle, Bookmark, 
  RotateCcw, ArrowRight, ArrowLeft, Send, Camera, Wifi, ShieldAlert,
  Maximize2, ShieldCheck, XCircle
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { ExamSessionData, Question } from '../../types';
import { Modal } from '../../components/common/Modal';
import { Badge } from '../../components/common/Badge';
import { ClientProctoringMonitor, ProctoringState } from '../../services/proctoringService';
import { useAuth } from '../../contexts/AuthContext';
import { 
  registerMediaStream, 
  stopAllHardwareStreams, 
  exitFullscreenSafe,
  isCurrentlyFullscreen,
  requestFullscreenSafe
} from '../../utils/hardware';

export const ExamRoomPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [sessionData, setSessionData] = useState<ExamSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [activeSectionId, setActiveSectionId] = useState<number | null>(null);

  // Local answers cache: questionId -> { selected_option, answer_text, is_marked_review, visited }
  const [answers, setAnswers] = useState<Record<number, {
    selected_option?: string | null;
    answer_text?: string | null;
    is_marked_review: boolean;
    visited: boolean;
  }>>({});

  // Timer
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [networkStatus, setNetworkStatus] = useState<'ONLINE' | 'OFFLINE'>('ONLINE');

  // Submit Modal
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Full-screen enforcement and strike monitoring
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => isCurrentlyFullscreen());
  const [hasEnteredFullscreen, setHasEnteredFullscreen] = useState<boolean>(false);
  const [fullscreenStrikes, setFullscreenStrikes] = useState<number>(0);
  const [warningModalOpen, setWarningModalOpen] = useState<boolean>(false);
  const [isExamCancelled, setIsExamCancelled] = useState<boolean>(false);
  const [cancellationReason, setCancellationReason] = useState<string | null>(null);

  const hasEnteredFullscreenRef = useRef(false);
  const strikesRef = useRef(0);
  const submittingRef = useRef(false);
  const isCancelledRef = useRef(false);
  const sessionDataRef = useRef<ExamSessionData | null>(null);

  useEffect(() => {
    hasEnteredFullscreenRef.current = hasEnteredFullscreen;
  }, [hasEnteredFullscreen]);

  useEffect(() => {
    strikesRef.current = fullscreenStrikes;
  }, [fullscreenStrikes]);

  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);

  useEffect(() => {
    isCancelledRef.current = isExamCancelled;
  }, [isExamCancelled]);

  useEffect(() => {
    sessionDataRef.current = sessionData;
  }, [sessionData]);

  // Live CV Proctoring Widget Diagnostics State
  const [proctorState, setProctorState] = useState<ProctoringState>({
    faceCount: 1,
    lookingAway: false,
    gazeAnomaly: false,
    gazeDirection: 'CENTER',
    cameraBlocked: false,
    phoneDetected: false,
    isSpoof: false,
    audioDisturbance: false,
    audioLevel: 0,
    warningMessage: null,
    warningSeverity: null,
    violationCount: 0,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const monitorRef = useRef<ClientProctoringMonitor | null>(null);

  // 1. Initialize Exam Session
  useEffect(() => {
    const initSession = async () => {
      if (!examId) return;
      try {
        setLoading(true);
        const res = await apiClient.post<ExamSessionData>('/exam-sessions/start', {
          exam_id: parseInt(examId),
        });
        const data = res.data;
        setSessionData(data);

        // Check if session was already cancelled
        if (data.status === 'CANCELLED') {
          setIsExamCancelled(true);
          setCancellationReason('This examination has been cancelled due to prior integrity violations.');
          setLoading(false);
          return;
        }

        // Restore stored strikes for this session
        const storedStrikes = parseInt(sessionStorage.getItem(`exam_fs_strikes_${data.session_id}`) || '0', 10);
        if (!isNaN(storedStrikes) && storedStrikes > 0) {
          setFullscreenStrikes(storedStrikes);
          strikesRef.current = storedStrikes;
          if (storedStrikes >= 3) {
            setIsExamCancelled(true);
            setCancellationReason('Exceeded maximum allowed full-screen exits (3 strikes recorded).');
            setLoading(false);
            return;
          }
        }

        if (data.sections && data.sections.length > 0) {
          setActiveSectionId(data.sections[0].id);
        }

        // Initialize live OpenCV proctoring monitor
        const monitor = new ClientProctoringMonitor(
          data.session_id,
          data.candidate_id ?? 0,
          (state) => {
            setProctorState(state);
          }
        );
        monitorRef.current = monitor;

        // Initialize timer from server
        const now = new Date(data.server_time).getTime();
        const expires = new Date(data.expires_at).getTime();
        const diffSec = Math.max(0, Math.floor((expires - now) / 1000));
        setRemainingSeconds(diffSec);

        // Prepopulate answers from existing saved answers
        const initialAnswers: Record<number, any> = {};
        data.questions.forEach((q, idx) => {
          const saved = data.saved_answers[q.id];
          initialAnswers[q.id] = {
            selected_option: saved?.selected_option || null,
            answer_text: saved?.answer_text || '',
            is_marked_review: saved?.is_marked_review || false,
            visited: idx === 0 || !!saved,
          };
        });
        setAnswers(initialAnswers);
      } catch (err: any) {
        console.error('Failed to start exam session', err);
        alert(err.response?.data?.detail || 'Failed to start exam session.');
        navigate('/candidate/dashboard');
      } finally {
        setLoading(false);
      }
    };

    initSession();
  }, [examId]);

  // Comprehensive Hardware Teardown (both camera and microphone)
  const stopHardware = useCallback(() => {
    if (monitorRef.current) {
      try {
        monitorRef.current.destroy();
      } catch {}
      monitorRef.current = null;
    }
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

  // 2. Start Live Video Stream & Connect to OpenCV Frame Pipeline
  useEffect(() => {
    let isCancelled = false;

    const startWebcam = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
          audio: true,
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => {
            t.stop();
            t.enabled = false;
          });
          return;
        }

        registerMediaStream(stream);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          if (monitorRef.current) {
            monitorRef.current.attachVideo(videoRef.current);
            monitorRef.current.attachAudio(stream);
            monitorRef.current.startMonitoring(1200);
            monitorRef.current.startRecording(stream);
          }
        }
      } catch (e) {
        console.warn('Webcam stream unavailable for local preview', e);
      }
    };

    if (sessionData) {
      startWebcam();
    }

    return () => {
      isCancelled = true;
      // Do NOT call exitFullscreenSafe here — it fires on sessionData load and breaks fullscreen!
      stopHardware();
    };
  }, [sessionData, stopHardware]);

  // Dedicated unmount teardown (do NOT exit fullscreen here as StrictMode fires cleanup on initial mount!)
  useEffect(() => {
    return () => {
      stopHardware();
    };
  }, [stopHardware]);

  // Cancellation handler
  const handleCancelExam = useCallback(async (reason: string) => {
    if (isCancelledRef.current) return;
    const currentSession = sessionDataRef.current;
    if (!currentSession) return;

    setIsExamCancelled(true);
    setCancellationReason(reason);
    setWarningModalOpen(false);

    try {
      // 1. Log proctoring event for audit
      try {
        await apiClient.post('/proctoring/events', {
          session_id: currentSession.session_id,
          event_type: 'FULLSCREEN_EXITED',
          severity: 'HIGH',
          duration: 0,
          confidence: 1.0,
          metadata_info: {
            strike: 3,
            max_allowed: 3,
            action: 'EXAM_CANCELLED',
            reason: reason,
          },
        });
      } catch (e) {
        console.warn('Failed to log cancellation proctoring event', e);
      }

      // 2. Stop and upload recording
      if (monitorRef.current) {
        try {
          await monitorRef.current.stopAndUploadRecording();
        } catch (e) {
          console.warn('Recording upload error during cancellation', e);
        }
      }

      // 3. Submit cancellation to server
      await apiClient.post(
        `/exam-sessions/${currentSession.session_id}/submit?cancellation_reason=${encodeURIComponent(reason)}`,
        { cancellation_reason: reason }
      );
    } catch (err) {
      console.error('Failed to submit exam cancellation', err);
    } finally {
      stopHardware();
      await exitFullscreenSafe();
    }
  }, [stopHardware]);

  // Full-screen exit violation handler
  const handleFullscreenExitViolation = useCallback(() => {
    if (submittingRef.current || isCancelledRef.current || !sessionDataRef.current) return;

    const nextStrikes = strikesRef.current + 1;
    setFullscreenStrikes(nextStrikes);
    strikesRef.current = nextStrikes;
    sessionStorage.setItem(`exam_fs_strikes_${sessionDataRef.current.session_id}`, String(nextStrikes));

    // Log proctoring event to backend
    apiClient.post('/proctoring/events', {
      session_id: sessionDataRef.current.session_id,
      event_type: 'FULLSCREEN_EXITED',
      severity: nextStrikes >= 3 ? 'HIGH' : nextStrikes === 2 ? 'HIGH' : 'MEDIUM',
      duration: 0,
      confidence: 1.0,
      metadata_info: {
        strike: nextStrikes,
        max_allowed: 3,
        chances_remaining: Math.max(0, 3 - nextStrikes),
        violation: `Exited full-screen (Strike ${nextStrikes} of 3)`
      },
    }).catch((e) => console.warn('Failed to log fullscreen proctoring event', e));

    if (nextStrikes >= 3) {
      // 3rd exit: Cancel the exam!
      handleCancelExam('Exceeded maximum allowed full-screen exits (Attempted to exit 3 times)');
    } else {
      // 1st or 2nd exit: Show warning modal
      setWarningModalOpen(true);
      setProctorState((prev) => ({
        ...prev,
        warningMessage: nextStrikes === 1
          ? 'Full-screen exited! Multiple exits will result in exam cancellation (2 chances remaining).'
          : 'CRITICAL WARNING: Second full-screen exit! Exiting one more time will cancel your exam (1 chance remaining).',
        warningSeverity: 'HIGH',
        violationCount: prev.violationCount + 1,
      }));
    }
  }, [handleCancelExam]);

  // Request fullscreen user action
  const handleEnterFullscreen = async () => {
    const success = await requestFullscreenSafe();
    if (success) {
      setIsFullscreen(true);
      setHasEnteredFullscreen(true);
      hasEnteredFullscreenRef.current = true;
      setWarningModalOpen(false);
    } else {
      alert('Unable to enter full-screen mode. Please click anywhere on the page and try again, or check your browser permissions.');
    }
  };

  // Full-screen change event listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const inFs = isCurrentlyFullscreen();
      setIsFullscreen(inFs);

      if (inFs) {
        setHasEnteredFullscreen(true);
        hasEnteredFullscreenRef.current = true;
        setWarningModalOpen(false);
      } else {
        if (
          hasEnteredFullscreenRef.current &&
          !submittingRef.current &&
          !isCancelledRef.current &&
          sessionDataRef.current
        ) {
          handleFullscreenExitViolation();
        }
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    const initialFs = isCurrentlyFullscreen();
    setIsFullscreen(initialFs);
    if (initialFs) {
      setHasEnteredFullscreen(true);
      hasEnteredFullscreenRef.current = true;
    }

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, [handleFullscreenExitViolation]);

  // Window unload cleanup (safeguard against leaving tab / refreshing)
  useEffect(() => {
    const handleUnload = () => {
      stopHardware();
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [stopHardware]);

  // Auto-submit when timer expires
  const handleAutoSubmit = useCallback(async () => {
    if (!sessionData) return;
    try {
      setSubmitting(true);
      if (monitorRef.current) {
        try {
          await monitorRef.current.stopAndUploadRecording();
        } catch (e) {
          console.warn('Auto-submit recording upload failed', e);
        }
      }
      await exitFullscreenSafe();
      stopHardware();
      await apiClient.post(`/exam-sessions/${sessionData.session_id}/submit`);
    } catch {
      // ignore
    } finally {
      await exitFullscreenSafe();
      stopHardware();
      navigate(`/candidate/dashboard`);
    }
  }, [sessionData, navigate, stopHardware]);

  const autoSubmitRef = useRef(handleAutoSubmit);
  useEffect(() => {
    autoSubmitRef.current = handleAutoSubmit;
  }, [handleAutoSubmit]);

  // 3. Server-Authoritative Countdown Timer
  useEffect(() => {
    if (remainingSeconds <= 0 && sessionData && !loading) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          autoSubmitRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [remainingSeconds, sessionData, loading]);

  // 4. Periodic Server Timer Sync & Heartbeat
  useEffect(() => {
    if (!sessionData) return;
    const syncTimer = setInterval(async () => {
      try {
        const res = await apiClient.get(`/exam-sessions/${sessionData.session_id}/sync`);
        setRemainingSeconds(res.data.remaining_seconds);
        setNetworkStatus('ONLINE');
      } catch (e) {
        setNetworkStatus('OFFLINE');
      }
    }, 30000); // every 30 seconds

    return () => clearInterval(syncTimer);
  }, [sessionData]);

  // Format time (HH:MM:SS)
  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const currentQuestion: Question | undefined = sessionData?.questions[currentQIndex];

  // Save current answer to backend
  const saveCurrentAnswerToCloud = useCallback(async (qId: number, currentAns: any) => {
    if (!sessionData) return;
    try {
      setIsSaving(true);
      await apiClient.post(`/exam-sessions/${sessionData.session_id}/answers`, {
        question_id: qId,
        selected_option: currentAns.selected_option,
        answer_text: currentAns.answer_text,
        is_marked_review: currentAns.is_marked_review,
      });
      setLastSavedTime(new Date().toLocaleTimeString());
      setNetworkStatus('ONLINE');
    } catch (e) {
      console.warn('Autosave offline fallback', e);
      setNetworkStatus('OFFLINE');
    } finally {
      setIsSaving(false);
    }
  }, [sessionData]);

  // Handle Option Select
  const handleSelectOption = (optionId: number) => {
    if (!currentQuestion) return;
    const qId = currentQuestion.id;
    const optIdStr = optionId.toString();

    let newSelected: string | null = optIdStr;

    if (currentQuestion.question_type === 'MULTI_SELECT') {
      try {
        const existing = answers[qId]?.selected_option;
        const currentList: string[] = existing ? JSON.parse(existing) : [];
        if (currentList.includes(optIdStr)) {
          const filtered = currentList.filter((id) => id !== optIdStr);
          newSelected = filtered.length > 0 ? JSON.stringify(filtered) : null;
        } else {
          newSelected = JSON.stringify([...currentList, optIdStr]);
        }
      } catch (e) {
        newSelected = JSON.stringify([optIdStr]);
      }
    }

    const updated = {
      ...answers[qId],
      selected_option: newSelected,
      visited: true,
    };

    setAnswers((prev) => ({ ...prev, [qId]: updated }));
    saveCurrentAnswerToCloud(qId, updated);
  };

  // Handle Numerical / Short Answer text change
  const handleAnswerTextChange = (text: string) => {
    if (!currentQuestion) return;
    const qId = currentQuestion.id;
    const updated = {
      ...answers[qId],
      answer_text: text,
      visited: true,
    };
    setAnswers((prev) => ({ ...prev, [qId]: updated }));
  };

  // Save Text on Blur
  const handleAnswerTextBlur = () => {
    if (!currentQuestion) return;
    const qId = currentQuestion.id;
    saveCurrentAnswerToCloud(qId, answers[qId]);
  };

  // Toggle Mark For Review
  const handleToggleMarkReview = () => {
    if (!currentQuestion) return;
    const qId = currentQuestion.id;
    const updated = {
      ...answers[qId],
      is_marked_review: !answers[qId]?.is_marked_review,
      visited: true,
    };
    setAnswers((prev) => ({ ...prev, [qId]: updated }));
    saveCurrentAnswerToCloud(qId, updated);
  };

  // Clear Response
  const handleClearResponse = () => {
    if (!currentQuestion) return;
    const qId = currentQuestion.id;
    const updated = {
      ...answers[qId],
      selected_option: null,
      answer_text: '',
      visited: true,
    };
    setAnswers((prev) => ({ ...prev, [qId]: updated }));
    saveCurrentAnswerToCloud(qId, updated);
  };

  // Navigate to Question
  const handleJumpToQuestion = (index: number) => {
    if (!sessionData) return;
    const nextQ = sessionData.questions[index];
    if (!nextQ) return;

    setAnswers((prev) => ({
      ...prev,
      [nextQ.id]: {
        ...prev[nextQ.id],
        visited: true,
      },
    }));
    setCurrentQIndex(index);
    if (nextQ.section_id) {
      setActiveSectionId(nextQ.section_id);
    }
  };

  const handleNext = () => {
    if (!sessionData) return;
    if (currentQIndex < sessionData.questions.length - 1) {
      handleJumpToQuestion(currentQIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentQIndex > 0) {
      handleJumpToQuestion(currentQIndex - 1);
    }
  };

  // Manual Submit
  const handleConfirmSubmit = async () => {
    if (!sessionData) return;
    try {
      setSubmitting(true);
      if (monitorRef.current) {
        try {
          await monitorRef.current.stopAndUploadRecording();
        } catch (e) {
          console.warn('Recording upload failed', e);
        }
      }
      // Guarantee immediate full-screen exit and hardware shutdown (both camera + mic)
      await exitFullscreenSafe();
      stopHardware();

      await apiClient.post<{ score: number }>(`/exam-sessions/${sessionData.session_id}/submit`);
      setIsSubmitModalOpen(false);
      navigate(`/candidate/dashboard`);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to submit examination.');
    } finally {
      setSubmitting(false);
      await exitFullscreenSafe();
      stopHardware();
    }
  };

  // Question State Color Calculation
  const getQuestionPaletteState = (q: Question) => {
    const ans = answers[q.id];
    const hasAnswer =
      (ans?.selected_option && ans.selected_option !== '') ||
      (ans?.answer_text && ans.answer_text.trim() !== '');

    if (ans?.is_marked_review && hasAnswer) return 'ANSWERED_AND_MARKED';
    if (ans?.is_marked_review) return 'MARKED';
    if (hasAnswer) return 'ANSWERED';
    if (ans?.visited) return 'NOT_ANSWERED';
    return 'UNVISITED';
  };

  const getPaletteButtonClasses = (state: string, isCurrent: boolean) => {
    let base = 'w-9 h-9 rounded-xl text-xs font-semibold font-mono transition-all flex items-center justify-center relative select-none ';
    if (isCurrent) {
      base += 'ring-2 ring-stone-900 ring-offset-2 ring-offset-[#FAF8F5] z-10 font-bold shadow-xs ';
    }

    switch (state) {
      case 'ANSWERED':
        return base + 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700';
      case 'MARKED':
        return base + 'bg-purple-600 text-white shadow-xs hover:bg-purple-700';
      case 'ANSWERED_AND_MARKED':
        return base + 'bg-purple-700 text-white ring-2 ring-emerald-500 hover:bg-purple-800';
      case 'NOT_ANSWERED':
        return base + 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200';
      default:
        return base + 'bg-stone-100 text-stone-600 border border-stone-200 hover:bg-stone-200';
    }
  };

  // Count summaries based on actual question palette states
  const totalQuestions = sessionData?.questions.length || 0;
  
  let answeredCount = 0;
  let notAnsweredCount = 0;
  let markedCount = 0;
  let unvisitedCount = 0;

  if (sessionData) {
    sessionData.questions.forEach((q) => {
      const state = getQuestionPaletteState(q);
      if (state === 'ANSWERED' || state === 'ANSWERED_AND_MARKED') answeredCount++;
      else if (state === 'NOT_ANSWERED') notAnsweredCount++;
      else if (state === 'UNVISITED') unvisitedCount++;

      if (state === 'MARKED' || state === 'ANSWERED_AND_MARKED') markedCount++;
    });
  }
  const unansweredCount = totalQuestions - answeredCount;

  if (loading || !sessionData) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin"></div>
        <p className="mt-3 text-stone-600 font-semibold text-xs">Launching Distraction-Free Exam Room...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 flex flex-col select-none">
      {/* Top Authoritative Header */}
      <header className="bg-white border-b border-stone-200 px-4 sm:px-6 h-14 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3 truncate">
          <div className="w-8 h-8 rounded-lg bg-stone-900 flex items-center justify-center text-white font-bold text-xs shadow-xs">
            EP
          </div>
          <div className="truncate">
            <h1 className="font-bold text-xs sm:text-sm text-stone-900 truncate">{sessionData.exam_title}</h1>
            <div className="flex items-center gap-2 text-[10px] text-stone-500">
              {user?.roll_number && (
                <>
                  <span className="font-mono font-medium text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                    Roll: {user.roll_number}
                  </span>
                  <span>·</span>
                </>
              )}
              <span>Section: <strong className="text-stone-800">{sessionData.sections?.find((s) => s.id === activeSectionId)?.title || 'Core'}</strong></span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Wifi className={`w-3 h-3 ${networkStatus === 'ONLINE' ? 'text-emerald-600' : 'text-rose-600'}`} />
                {networkStatus === 'ONLINE' ? 'Connected' : 'Reconnecting...'}
              </span>
            </div>
          </div>
        </div>

        {/* Server Authoritative Timer Countdown & Full-Screen Status */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {fullscreenStrikes > 0 ? (
            <div className="px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-[11px] font-mono font-bold flex items-center gap-1.5 animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              <span>Strikes: {fullscreenStrikes}/3</span>
            </div>
          ) : isFullscreen ? (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-mono font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Full-Screen Active</span>
            </div>
          ) : (
            <button
              onClick={handleEnterFullscreen}
              type="button"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 text-[11px] font-mono font-bold transition-all animate-pulse cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Enter Full-Screen</span>
            </button>
          )}

          <div className={`px-3 py-1 rounded-xl border flex items-center gap-1.5 font-mono font-bold text-xs transition-all ${
            remainingSeconds < 300
              ? 'bg-rose-50 border-rose-300 text-rose-700 animate-pulse'
              : 'bg-stone-50 border-stone-200 text-stone-800'
          }`}>
            <Clock className="w-3.5 h-3.5 text-stone-600" />
            <span>{formatTime(remainingSeconds)}</span>
          </div>

          <button
            onClick={() => setIsSubmitModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs transition-all flex items-center gap-1.5 shadow-xs"
          >
            <Send className="w-3 h-3" />
            <span>Finish & Submit</span>
          </button>
        </div>
      </header>

      {/* Real-time Computer Vision Live Warning Banner */}
      {proctorState.warningMessage && (
        <div className={`px-4 py-2 text-xs font-semibold flex items-center justify-between transition-all ${
          proctorState.warningSeverity === 'HIGH'
            ? 'bg-rose-600 text-white'
            : 'bg-amber-600 text-white'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="p-0.5 rounded bg-white/20">
              <ShieldAlert className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <div>
              <span className="font-extrabold uppercase tracking-wide mr-1.5">
                [{proctorState.warningSeverity === 'HIGH' ? 'Critical Alert' : 'Integrity Prompt'}]
              </span>
              <span>{proctorState.warningMessage}</span>
            </div>
          </div>
          {proctorState.violationCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-black/20 text-[10px] font-mono font-bold">
              Signals: {proctorState.violationCount}
            </span>
          )}
        </div>
      )}

      {/* Main Examination Workspace Grid */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Side: Question Pane (8 cols) */}
        <div className="lg:col-span-8 space-y-3.5">
          {currentQuestion && (
            <div className="card-cream p-5 sm:p-7 rounded-2xl space-y-5">
              {/* Question Header & Badges */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-stone-200">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-lg bg-stone-100 text-stone-800 font-bold text-xs border border-stone-200">
                    Question {currentQIndex + 1} of {totalQuestions}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs font-mono text-stone-500">
                  <span>Marks: <strong className="text-emerald-700 font-semibold">+{currentQuestion.marks}</strong></span>
                  {sessionData.rules.negative_marking && (
                    <span>Penalty: <strong className="text-rose-700 font-semibold">-{currentQuestion.negative_marks}</strong></span>
                  )}
                </div>
              </div>

              {/* Question Prompt */}
              <div className="text-sm sm:text-base font-medium text-stone-900 leading-relaxed">
                {currentQuestion.question_text}
              </div>

              {/* Options Selector */}
              {['MCQ', 'TRUE_FALSE', 'MULTI_SELECT'].includes(currentQuestion.question_type) ? (
                <div className="space-y-2.5 pt-1">
                  {currentQuestion.options?.map((opt, idx) => {
                    const qId = currentQuestion.id;
                    const optKey = (opt.id ?? idx).toString();
                    const selectedVal = answers[qId]?.selected_option;
                    let isSelected = false;

                    if (currentQuestion.question_type === 'MULTI_SELECT') {
                      try {
                        const list: string[] = selectedVal ? JSON.parse(selectedVal) : [];
                        isSelected = list.includes(optKey);
                      } catch (e) {
                        isSelected = false;
                      }
                    } else {
                      isSelected = selectedVal === optKey;
                    }

                    return (
                      <div
                        key={optKey}
                        onClick={() => handleSelectOption(opt.id ?? idx)}
                        className={`p-3.5 rounded-xl border cursor-pointer flex items-center gap-3 transition-all ${
                          isSelected
                            ? 'bg-stone-100 border-stone-800 text-stone-900 font-semibold shadow-xs'
                            : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50 hover:border-stone-300'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-stone-900 border-stone-900 text-white' : 'border-stone-400 bg-white'
                        }`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span className="text-xs sm:text-sm">{opt.option_text}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Numerical / Short Answer Input */
                <div className="pt-1">
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                    Enter Your Numerical / Text Answer
                  </label>
                  <input
                    type="text"
                    value={answers[currentQuestion.id]?.answer_text || ''}
                    onChange={(e) => handleAnswerTextChange(e.target.value)}
                    onBlur={handleAnswerTextBlur}
                    placeholder="Type your exact response here..."
                    className="input-cream font-mono text-sm"
                  />
                </div>
              )}

              {/* Question Action Controls */}
              <div className="pt-4 border-t border-stone-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleMarkReview}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all ${
                      answers[currentQuestion.id]?.is_marked_review
                        ? 'bg-purple-50 text-purple-700 border-purple-300 font-semibold'
                        : 'btn-secondary'
                    }`}
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>{answers[currentQuestion.id]?.is_marked_review ? 'Marked for Review' : 'Mark for Review'}</span>
                  </button>

                  <button
                    onClick={handleClearResponse}
                    className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear Response</span>
                  </button>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={handlePrev}
                    disabled={currentQIndex === 0}
                    className="btn-secondary px-3.5 py-1.5 text-xs font-medium flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Previous</span>
                  </button>

                  <button
                    onClick={handleNext}
                    disabled={currentQIndex === totalQuestions - 1}
                    className="btn-primary px-4 py-1.5 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <span>Save & Next</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Cloud Auto-Save Status Indicator */}
          <div className="flex items-center justify-between text-xs text-stone-500 px-1">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isSaving ? 'bg-amber-500 animate-spin' : 'bg-emerald-500'}`} />
              <span>{isSaving ? 'Saving answer to cloud...' : `All answers saved (${lastSavedTime || 'Synced'})`}</span>
            </span>
            <span>Server-Authoritative Synchronization</span>
          </div>
        </div>

        {/* Right Side: Palette & Real-Time Computer Vision HUD Widget (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Live Webcam Proctor Viewport */}
          <div className="card-cream p-4 rounded-2xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-emerald-700" />
                Live CV Proctor Stream
              </span>
              <span className="text-[10px] font-mono text-emerald-700 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                Active
              </span>
            </div>

            <div className="relative aspect-video rounded-xl bg-stone-950 border border-stone-200 overflow-hidden group">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
              />

              {/* Minimal Clean Overlay: Only Candidate Roll Number */}
              {user?.roll_number && (
                <div className="absolute bottom-2 left-2 z-20">
                  <span className="px-2 py-0.5 rounded-md bg-stone-900/90 text-stone-200 font-mono text-[10px] font-semibold border border-stone-700/80 shadow-xs">
                    {user.roll_number}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Question Palette */}
          <div className="card-cream p-4 sm:p-5 rounded-2xl space-y-3">
            <h3 className="font-bold text-xs text-stone-900 uppercase tracking-wider">Question Palette</h3>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-2 text-[10px] text-stone-500 border-b border-stone-200 pb-2.5">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-emerald-600 shrink-0" />
                <span>Answered ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-300 shrink-0" />
                <span>Not Answered ({notAnsweredCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-purple-600 shrink-0" />
                <span>Marked ({markedCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-stone-100 border border-stone-200 shrink-0" />
                <span>Unvisited ({unvisitedCount})</span>
              </div>
            </div>

            {/* Palette Buttons Matrix */}
            <div className="grid grid-cols-5 gap-2.5 max-h-52 overflow-y-auto p-1.5">
              {sessionData.questions.map((q, idx) => {
                const state = getQuestionPaletteState(q);
                const isCurrent = idx === currentQIndex;
                return (
                  <button
                    key={q.id}
                    onClick={() => handleJumpToQuestion(idx)}
                    className={getPaletteButtonClasses(state, isCurrent)}
                    title={`Question ${idx + 1}: ${state.replace(/_/g, ' ')}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Submission Confirmation Modal */}
      <Modal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        title="Finalize & Submit Examination"
      >
        <div className="space-y-4">
          <p className="text-xs text-stone-600 leading-relaxed">
            Are you sure you want to submit your examination? Once submitted, answers become immutable and results will be evaluated immediately.
          </p>

          <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-center">
            <div>
              <span className="text-[10px] text-stone-500 uppercase font-semibold">Total</span>
              <p className="text-lg font-bold text-stone-900 mt-0.5">{totalQuestions}</p>
            </div>
            <div>
              <span className="text-[10px] text-stone-500 uppercase font-semibold">Answered</span>
              <p className="text-lg font-bold text-emerald-700 mt-0.5">{answeredCount}</p>
            </div>
            <div>
              <span className="text-[10px] text-stone-500 uppercase font-semibold">Unanswered</span>
              <p className="text-lg font-bold text-rose-700 mt-0.5">{unansweredCount}</p>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-stone-200">
            <button
              onClick={() => setIsSubmitModalOpen(false)}
              className="btn-secondary text-xs"
            >
              Resume Test
            </button>
            <button
              onClick={handleConfirmSubmit}
              disabled={submitting}
              className="btn-primary text-xs bg-emerald-700 hover:bg-emerald-800"
            >
              {submitting ? 'Evaluating...' : 'Confirm Submission'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 1. EXAM CANCELLED / DISQUALIFIED OVERLAY */}
      {isExamCancelled && (
        <div className="fixed inset-0 z-50 bg-stone-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="card-cream max-w-md w-full p-6 sm:p-8 rounded-2xl shadow-2xl border-2 border-rose-300 space-y-5 animate-in fade-in zoom-in-95 text-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-100 border border-rose-200 text-rose-700 flex items-center justify-center mx-auto shadow-inner">
              <ShieldAlert className="w-9 h-9" />
            </div>

            <div>
              <span className="px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-rose-100 text-rose-800 border border-rose-200">
                Examination Terminated
              </span>
              <h2 className="text-xl font-extrabold text-stone-900 mt-2.5">
                Assessment Cancelled
              </h2>
              <p className="text-xs text-stone-600 mt-2 leading-relaxed">
                {cancellationReason || 'Your examination attempt has been cancelled and invalidated due to repeated full-screen exit violations (3 strikes recorded).'}
              </p>
            </div>

            <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3.5 text-left text-xs space-y-1.5 font-mono">
              <div className="flex justify-between text-rose-900">
                <span className="text-stone-500 font-sans">Roll Number:</span>
                <span className="font-bold">{user?.roll_number || 'Candidate'}</span>
              </div>
              <div className="flex justify-between text-rose-900">
                <span className="text-stone-500 font-sans">Violation:</span>
                <span className="font-bold text-rose-700">Full-Screen Exited 3 Times</span>
              </div>
              <div className="flex justify-between text-rose-900">
                <span className="text-stone-500 font-sans">Audit Status:</span>
                <span className="text-stone-700">Logged to Proctor Telemetry</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => navigate('/candidate/dashboard')}
                className="btn-primary w-full py-2.5 text-xs font-semibold bg-stone-900 hover:bg-stone-800 flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Return to Candidate Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. FULLSCREEN EXIT WARNING MODAL (STRIKE 1 & 2) */}
      {!isFullscreen && !isExamCancelled && (fullscreenStrikes === 1 || fullscreenStrikes === 2) && (
        <div className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="card-cream max-w-lg w-full p-6 sm:p-7 rounded-2xl shadow-2xl border-2 border-amber-300 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                    fullscreenStrikes === 2
                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}>
                    {fullscreenStrikes === 2 ? 'Final Warning' : 'Integrity Alert'}
                  </span>
                  <span className="text-[11px] font-mono text-stone-500">
                    Strike {fullscreenStrikes} of 3
                  </span>
                </div>
                <h2 className="text-base font-bold text-stone-900 mt-1">
                  {fullscreenStrikes === 2
                    ? 'Second Full-Screen Exit Detected!'
                    : 'Prohibited Full-Screen Exit Detected!'}
                </h2>
              </div>
            </div>

            {/* Visual Strike Progress Bar */}
            <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-stone-50 border border-stone-200 text-center">
              <div className="p-2 rounded-lg bg-rose-100 border border-rose-300 text-rose-800">
                <span className="block text-[10px] font-bold uppercase">Strike 1</span>
                <span className="text-xs font-semibold">Exited</span>
              </div>
              <div className={`p-2 rounded-lg border ${
                fullscreenStrikes >= 2
                  ? 'bg-rose-100 border-rose-300 text-rose-800'
                  : 'bg-stone-100 border-stone-200 text-stone-400'
              }`}>
                <span className="block text-[10px] font-bold uppercase">Strike 2</span>
                <span className="text-xs font-semibold">
                  {fullscreenStrikes >= 2 ? 'Exited' : 'Pending'}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-stone-100 border border-stone-200 text-stone-400">
                <span className="block text-[10px] font-bold uppercase">Strike 3</span>
                <span className="text-xs font-semibold">Cancellation</span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 leading-relaxed space-y-1">
              <p className="font-semibold">
                {fullscreenStrikes === 1
                  ? 'Exiting full-screen is strictly prohibited during the examination. Multiple full-screen exits will result in immediate exam cancellation. You have 2 chances remaining.'
                  : 'You have exited full-screen mode again! If you exit full-screen ONE MORE TIME, your exam will be permanently cancelled and submitted immediately. You have only 1 chance remaining.'}
              </p>
              <p className="text-[11px] text-amber-800 font-medium">
                Please immediately click the button below to resume the examination in full-screen mode.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleEnterFullscreen}
                className="btn-primary w-full sm:w-auto py-2.5 px-6 text-xs font-bold flex items-center justify-center gap-2 bg-stone-900 hover:bg-stone-800 shadow-xs cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
                <span>Return to Full-Screen Mode</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. INITIAL FULL-SCREEN ENTRY / RETURN GATE (MANDATORY TO PROCEED) */}
      {!isFullscreen && !isExamCancelled && fullscreenStrikes === 0 && (
        <div className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="card-cream max-w-md w-full p-6 sm:p-8 rounded-2xl shadow-2xl border border-stone-200 space-y-5 animate-in fade-in zoom-in-95 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto shadow-inner">
              <Maximize2 className="w-7 h-7" />
            </div>

            <div>
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                Proctoring Protocol
              </span>
              <h2 className="text-lg font-extrabold text-stone-900 mt-2">
                Full-Screen Mode Required
              </h2>
              <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">
                To maintain exam security and continuous proctoring verification, this assessment must be completed entirely in full-screen mode.
              </p>
            </div>

            <div className="bg-stone-50 border border-stone-200 rounded-xl p-3.5 text-left text-xs space-y-2 text-stone-600">
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-stone-800 mt-1.5 shrink-0" />
                <span>Do not press <strong>Escape</strong>, <strong>F11</strong>, or switch to other browser tabs.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-600 mt-1.5 shrink-0" />
                <span className="text-stone-800">
                  Exiting full screen multiple times will result in <strong>immediate exam cancellation (maximum 3 exits allowed)</strong>.
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleEnterFullscreen}
                className="btn-primary w-full py-3 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
                <span>Enter Full-Screen Mode to Proceed</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
