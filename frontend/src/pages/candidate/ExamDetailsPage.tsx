import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Clock, ArrowRight, ArrowLeft, Video, AlertCircle
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Exam } from '../../types';
import { Badge } from '../../components/common/Badge';

export const ExamDetailsPage: React.FC = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const [exam, setExam] = useState<Exam | null>(null);
  const [loading, setLoading] = useState(true);
  const [agreeConsent, setAgreeConsent] = useState(false);

  useEffect(() => {
    const fetchExam = async () => {
      if (!examId) return;
      try {
        setLoading(true);
        const res = await apiClient.get<Exam>(`/exams/${examId}`);
        setExam(res.data);
      } catch (err) {
        console.error('Failed to load exam details', err);
      } finally {
        setLoading(false);
      }
    };
    fetchExam();
  }, [examId]);

  if (loading || !exam) {
    return (
      <div className="py-16 text-center text-stone-500">
        <div className="w-7 h-7 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs">Loading examination specifications...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link
          to="/candidate/dashboard"
          className="p-2 rounded-xl bg-white border border-stone-200 text-stone-500 hover:text-stone-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight">
            Examination Briefing & Protocols
          </h1>
          <p className="text-stone-500 text-xs mt-0.5">
            Review time limits, integrity rules, and proctoring expectations
          </p>
        </div>
      </div>

      {/* Main Spec Card */}
      <div className="card-cream p-6 sm:p-7 rounded-2xl space-y-5">
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <Badge label="Online Proctored" variant="primary" size="sm" dot />
            <span className="text-xs font-mono text-stone-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-stone-400" />
              {exam.duration_minutes} Minutes
            </span>
          </div>
          <h2 className="text-xl font-bold text-stone-900 tracking-tight">{exam.title}</h2>
          <p className="text-xs text-stone-600 mt-1.5 leading-relaxed">{exam.description || 'Comprehensive assessment.'}</p>
        </div>

        {/* Specifications Matrix */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-stone-50 border border-stone-200 text-xs">
          <div>
            <span className="text-stone-500 block text-[11px] mb-0.5">Time Allowed</span>
            <strong className="text-stone-900 text-xs font-mono">{exam.duration_minutes} Mins</strong>
          </div>
          <div>
            <span className="text-stone-500 block text-[11px] mb-0.5">Attempts</span>
            <strong className="text-emerald-700 text-xs font-semibold">{exam.allow_reattempts ? 'Unlimited (Practice)' : 'Single Attempt'}</strong>
          </div>
          <div>
            <span className="text-stone-500 block text-[11px] mb-0.5">Navigation</span>
            <strong className="text-stone-900 text-xs">{exam.allow_navigation ? 'Free Jumping' : 'Linear Only'}</strong>
          </div>
          <div>
            <span className="text-stone-500 block text-[11px] mb-0.5">AI Monitoring</span>
            <strong className="text-emerald-700 text-xs">Webcam Active</strong>
          </div>
        </div>

        {/* Instructions */}
        <div>
          <h3 className="text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
            Candidate Instructions & Regulations
          </h3>
          <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-700 space-y-1.5 whitespace-pre-line leading-relaxed">
            {exam.instructions || '1. Ensure your camera is working properly.\n2. Do not leave fullscreen mode.'}
          </div>
        </div>

        {/* Proctoring Notice & Consent */}
        <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <Video className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-1">
              <strong className="font-semibold block">Continuous Computer Vision Monitoring Notice:</strong>
              <p className="text-[11px] leading-relaxed text-amber-800">
                This examination employs automated computer vision to detect observable environmental events (e.g. absence from frame, looking away for extended durations, presence of mobile devices). All events are reviewed by administrators before final validation.
              </p>
            </div>
          </div>

          <label className="flex items-start gap-2.5 pt-2 border-t border-amber-200/60 cursor-pointer">
            <input
              type="checkbox"
              checked={agreeConsent}
              onChange={(e) => setAgreeConsent(e.target.checked)}
              className="w-3.5 h-3.5 mt-0.5 accent-stone-900 rounded"
            />
            <span className="text-xs text-stone-800 font-medium select-none">
              I acknowledge that I am taking this exam in a quiet, well-lit environment and consent to webcam monitoring for academic integrity verification.
            </span>
          </label>
        </div>

        {/* Launch Button */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={() => navigate(`/candidate/exams/${exam.id}/pre-check`)}
            disabled={!agreeConsent}
            className="btn-primary py-2.5 px-6 text-xs font-semibold"
          >
            <span>{exam.allow_reattempts ? 'Proceed to Practice Diagnostics' : 'Proceed to System Diagnostics'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
