import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ShieldAlert, ArrowLeft, Clock, Info,
  Video, Play, Download
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { ProctoringReport, ProctoringEvent, ReviewStatus } from '../../types';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';

export const ProctoringReviewPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [report, setReport] = useState<ProctoringReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<ProctoringEvent | null>(null);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('REVIEWED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [savingReview, setSavingReview] = useState(false);

  // Forensic Video Player Ref & Speed
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1);

  const fetchReport = async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const res = await apiClient.get<ProctoringReport>(`/proctoring/sessions/${sessionId}`);
      setReport(res.data);
    } catch (error) {
      console.error('Failed to load proctoring report', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [sessionId]);

  const handleOpenReviewModal = (event: ProctoringEvent) => {
    setSelectedEvent(event);
    setReviewStatus(event.review_status === 'UNREVIEWED' ? 'CONFIRMED' : event.review_status);
    setReviewNotes(event.review_notes || '');
    setIsReviewModalOpen(true);
  };

  const handleSaveReview = async () => {
    if (!selectedEvent) return;
    try {
      setSavingReview(true);
      await apiClient.patch(`/proctoring/events/${selectedEvent.id}/review`, {
        review_status: reviewStatus,
        review_notes: reviewNotes.trim() || undefined,
      });
      setIsReviewModalOpen(false);
      fetchReport();
    } catch (error) {
      console.error('Failed to save review', error);
    } finally {
      setSavingReview(false);
    }
  };

  const handleSeekVideoToEvent = (event: ProctoringEvent) => {
    if (!videoRef.current || !report) return;
    const evTime = new Date(event.timestamp).getTime();
    if (report.events.length > 0) {
      const firstTime = new Date(report.events[0].timestamp).getTime();
      const offsetSeconds = Math.max(0, (evTime - firstTime) / 1000);
      videoRef.current.currentTime = offsetSeconds;
      videoRef.current.play();
    }
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'PHONE_DETECTED':
        return <Badge label="Phone Detected" variant="danger" size="sm" dot />;
      case 'SPOOF_DETECTED':
        return <Badge label="2D Spoof Detected" variant="danger" size="sm" dot />;
      case 'MULTIPLE_FACES':
        return <Badge label="Multiple Faces" variant="danger" size="sm" dot />;
      case 'CAMERA_BLOCKED':
        return <Badge label="Camera Blocked" variant="danger" size="sm" dot />;
      case 'FACE_NOT_DETECTED':
        return <Badge label="Face Missing" variant="warning" size="sm" dot />;
      case 'LOOKING_AWAY':
        return <Badge label="Looking Away" variant="info" size="sm" dot />;
      case 'EYE_TRACKING_ANOMALY':
        return <Badge label="Eye Gaze Anomaly" variant="warning" size="sm" dot />;
      case 'AUDIO_DISTURBANCE':
        return <Badge label="Audio Disturbance" variant="warning" size="sm" dot />;
      default:
        return <Badge label={type} variant="neutral" size="sm" />;
    }
  };

  const recordingStreamUrl = report?.recording_url 
    ? (report.recording_url.startsWith('http') ? report.recording_url : `http://127.0.0.1:8000${report.recording_url}`)
    : null;

  return (
    <div className="space-y-5">
      {/* Back Button and Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/live-monitoring"
            className="p-2 rounded-xl bg-white border border-stone-200 text-stone-500 hover:text-stone-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-stone-700" />
              Proctoring Forensic Review & Video Audit
            </h1>
            <p className="text-stone-500 text-xs mt-0.5">
              Session #{sessionId} Forensic Video Replay & AI Signal Verification
            </p>
          </div>
        </div>

        {recordingStreamUrl && (
          <a
            href={recordingStreamUrl}
            download={`exam_recording_session_${sessionId}.webm`}
            className="btn-secondary py-2 px-3 text-xs inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Video Archive</span>
          </a>
        )}
      </div>

      {/* AI Transparency Notice Banner */}
      <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-stone-700 text-xs flex items-start gap-2.5">
        <Info className="w-4 h-4 text-stone-500 flex-shrink-0 mt-0.5" />
        <div>
          <strong className="font-semibold text-stone-900">AI-Assisted Decision Support Policy:</strong>
          <p className="mt-0.5 text-stone-600 leading-relaxed">
            Recorded video and computer vision events are legal-grade decision-support evidence. They assist human proctors and do not constitute automatic disqualification. Review the synchronized video replay before confirming violations.
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      {loading || !report ? (
        <div className="py-12 text-center text-stone-500">
          <div className="w-7 h-7 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs">Generating proctoring timeline and loading recording...</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card-cream p-4 rounded-xl">
              <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">Candidate</span>
              <p className="text-sm font-bold text-stone-900 mt-0.5">{report.candidate_name}</p>
              <p className="text-xs text-stone-500 truncate">{report.candidate_email}</p>
            </div>

            <div className="card-cream p-4 rounded-xl">
              <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">Examination</span>
              <p className="text-sm font-bold text-stone-900 mt-0.5 truncate">{report.exam_title}</p>
              <p className="text-xs text-stone-500">{report.session_duration_minutes} Mins Duration</p>
            </div>

            <div className="card-cream p-4 rounded-xl">
              <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">Total Infractions</span>
              <p className="text-xl font-bold text-stone-900 mt-0.5">{report.total_events}</p>
              <p className="text-xs text-stone-500">
                {report.high_severity_events} High · {report.medium_severity_events} Med · {report.low_severity_events} Low
              </p>
            </div>

            <div className={`card-cream p-4 rounded-xl border ${
              report.risk_level === 'HIGH'
                ? 'bg-rose-50/50 border-rose-200'
                : report.risk_level === 'MEDIUM'
                ? 'bg-amber-50/50 border-amber-200'
                : 'bg-emerald-50/50 border-emerald-200'
            }`}>
              <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">Risk Signal</span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-xl font-bold text-stone-900">{report.risk_score} / 100</span>
                <Badge
                  label={report.risk_level}
                  variant={report.risk_level === 'HIGH' ? 'danger' : report.risk_level === 'MEDIUM' ? 'warning' : 'success'}
                  size="sm"
                  dot
                />
              </div>
            </div>
          </div>

          {/* Forensic Video Replay Player */}
          <div className="card-cream p-5 sm:p-6 rounded-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3.5 pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-stone-100 border border-stone-200 text-stone-700">
                  <Video className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-stone-900">Synchronized Video Forensic Audit Player</h3>
                  <p className="text-xs text-stone-500">Continuous webcam recording stored securely for verification</p>
                </div>
              </div>

              {/* Playback speed selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-stone-500 font-semibold">Speed:</span>
                {[1, 1.5, 2, 4].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => handleSpeedChange(spd)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all ${
                      playbackRate === spd
                        ? 'bg-stone-900 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
              {/* Video Player Box */}
              <div className="lg:col-span-2 relative aspect-video bg-stone-950 rounded-xl overflow-hidden border border-stone-800 flex items-center justify-center">
                {recordingStreamUrl ? (
                  <video
                    ref={videoRef}
                    src={recordingStreamUrl}
                    controls
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-center p-6 text-stone-400 space-y-2">
                    <Video className="w-10 h-10 mx-auto text-stone-500 animate-pulse" />
                    <div>
                      <p className="text-xs font-semibold text-stone-200">Continuous Recording Buffer Active</p>
                      <p className="text-[11px] text-stone-400 mt-0.5 max-w-xs mx-auto">
                        Webcam video is recorded continuously during the exam session and stored upon completion.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Video & AI Event Jump Links */}
              <div className="space-y-2.5">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-stone-600 flex items-center gap-1.5">
                  <Play className="w-3 h-3 text-stone-700" />
                  Jump to Violation Timestamp
                </h4>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {report.events.length === 0 ? (
                    <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-center text-xs text-stone-500">
                      No violations recorded in this session.
                    </div>
                  ) : (
                    report.events.map((ev) => (
                      <div
                        key={ev.id}
                        onClick={() => handleSeekVideoToEvent(ev)}
                        className="p-2.5 rounded-xl bg-stone-50 hover:bg-stone-100 border border-stone-200 cursor-pointer transition-all flex items-center justify-between"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            {getEventBadge(ev.event_type)}
                            <span className="text-[10px] font-mono text-stone-500">
                              {new Date(ev.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-600">
                            Duration: <span className="font-semibold text-stone-800">{ev.duration}s</span> · Conf: <span className="font-semibold text-stone-800">{Math.round(ev.confidence * 100)}%</span>
                          </p>
                        </div>

                        <button className="px-2 py-0.5 rounded-lg bg-stone-900 text-white text-[10px] font-semibold flex items-center gap-1">
                          <Play className="w-2.5 h-2.5 fill-current" />
                          Seek
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Chronological Event Timeline Table */}
          <div className="card-cream rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-stone-100 flex items-center justify-between">
              <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-stone-700" />
                Chronological Event Log ({report.events.length})
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-stone-50/80 text-stone-500 border-b border-stone-200 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Observed Event</th>
                    <th className="py-3 px-4">Duration</th>
                    <th className="py-3 px-4">Confidence</th>
                    <th className="py-3 px-4">Review Status</th>
                    <th className="py-3 px-4">Admin Notes</th>
                    <th className="py-3 px-4 text-right">Audit Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {report.events.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-stone-500">
                        No suspicious events detected during this session.
                      </td>
                    </tr>
                  ) : (
                    report.events.map((ev) => (
                      <tr key={ev.id} className="hover:bg-stone-50/60 transition-colors">
                        <td className="py-3 px-4 font-mono text-stone-700">
                          {new Date(ev.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="py-3 px-4">
                          {getEventBadge(ev.event_type)}
                        </td>
                        <td className="py-3 px-4 text-stone-700 font-medium">
                          {ev.duration > 0 ? `${ev.duration}s` : '< 1s'}
                        </td>
                        <td className="py-3 px-4 text-stone-600 font-mono">
                          {Math.round(ev.confidence * 100)}%
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            label={ev.review_status}
                            variant={
                              ev.review_status === 'CONFIRMED'
                                ? 'danger'
                                : ev.review_status === 'DISMISSED'
                                ? 'neutral'
                                : ev.review_status === 'REVIEWED'
                                ? 'primary'
                                : 'warning'
                            }
                            size="sm"
                          />
                        </td>
                        <td className="py-3 px-4 text-stone-600 max-w-xs truncate">
                          {ev.review_notes || '--'}
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          <button
                            onClick={() => handleSeekVideoToEvent(ev)}
                            className="btn-secondary py-1 px-2.5 text-xs inline-flex items-center gap-1"
                          >
                            <Play className="w-2.5 h-2.5 fill-current" />
                            Seek
                          </button>
                          <button
                            onClick={() => handleOpenReviewModal(ev)}
                            className="btn-primary py-1 px-2.5 text-xs"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Event Review Action Modal */}
      <Modal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        title="Admin Event Verification"
      >
        {selectedEvent && (
          <div className="space-y-3.5">
            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-stone-600">Event Type:</span>
                {getEventBadge(selectedEvent.event_type)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-600">Recorded Duration:</span>
                <span className="font-mono text-stone-900 font-medium">{selectedEvent.duration} seconds</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-600">Model Confidence:</span>
                <span className="font-mono text-stone-900 font-medium">{Math.round(selectedEvent.confidence * 100)}%</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                Administrative Verdict
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setReviewStatus('CONFIRMED')}
                  className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold border transition-all ${
                    reviewStatus === 'CONFIRMED'
                      ? 'bg-rose-50 text-rose-800 border-rose-300'
                      : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  Confirm Event
                </button>
                <button
                  type="button"
                  onClick={() => setReviewStatus('DISMISSED')}
                  className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold border transition-all ${
                    reviewStatus === 'DISMISSED'
                      ? 'bg-stone-200 text-stone-900 border-stone-400'
                      : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  Dismiss (Benign)
                </button>
                <button
                  type="button"
                  onClick={() => setReviewStatus('REVIEWED')}
                  className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold border transition-all ${
                    reviewStatus === 'REVIEWED'
                      ? 'bg-stone-900 text-white border-stone-900'
                      : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  Mark Reviewed
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-stone-700 uppercase tracking-wider mb-1">
                Review Notes & Context
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Candidate looked down briefly to take rough notes on scratch paper."
                className="input-cream text-xs"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-stone-200">
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveReview}
                disabled={savingReview}
                className="btn-primary text-xs"
              >
                {savingReview ? 'Saving...' : 'Save Decision'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
