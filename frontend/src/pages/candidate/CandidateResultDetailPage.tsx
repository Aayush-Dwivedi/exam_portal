import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Award, ArrowLeft, CheckCircle2, XCircle, 
  HelpCircle, BarChart3, Printer, Clock
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Result } from '../../types';
import { Badge } from '../../components/common/Badge';
import { formatISTDateTime } from '../../utils/date';

export const CandidateResultDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    const fetchResult = async () => {
      if (!id || id === 'undefined') {
        setErrorMessage('No assessment session ID provided.');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setErrorMessage(null);
        const res = await apiClient.get<Result>(`/results/${id}`);
        setResult(res.data);
      } catch (err: any) {
        console.error('Failed to load result detail', err);
        setErrorMessage(err.response?.data?.detail || 'Failed to load assessment report.');
      } finally {
        setLoading(false);
      }
    };
    fetchResult();
  }, [id]);

  if (loading) {
    return (
      <div className="py-16 text-center text-stone-500">
        <div className="w-7 h-7 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs">Loading assessment evaluation report...</p>
      </div>
    );
  }

  if (result?.session_status === 'CANCELLED') {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center">
        <div className="card-cream p-8 rounded-2xl space-y-4 border border-rose-200">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700 mx-auto">
            <XCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-stone-900">Examination Disqualified & Cancelled</h2>
          <p className="text-xs text-stone-600 leading-relaxed">
            This examination was terminated and cancelled due to repeated integrity violations (such as exiting full-screen mode multiple times). The attempt is disqualified.
          </p>
          <div className="pt-2">
            <Link to="/candidate/results" className="btn-primary py-2 px-4 text-xs inline-flex items-center gap-1.5 font-medium">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to My Results</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (errorMessage || !result || !result.is_published) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center">
        <div className="card-cream p-8 rounded-2xl space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-stone-900">Scorecard Under Examiner Review</h2>
          <p className="text-xs text-stone-500 leading-relaxed">
            {errorMessage || "This assessment is currently undergoing proctoring audit and examiner verification. Official scores and answer key explanations will be accessible here once approved."}
          </p>
          <div className="pt-2">
            <Link to="/candidate/results" className="btn-primary py-2 px-4 text-xs inline-flex items-center gap-1.5 font-medium">
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to My Results</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isPassed = result.percentage >= 40.0;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/candidate/dashboard"
            className="p-2 rounded-xl bg-white border border-stone-200 text-stone-500 hover:text-stone-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
              <Award className="w-5 h-5 text-amber-600" />
              Assessment Evaluation Report
            </h1>
            <p className="text-stone-500 text-xs mt-0.5">
              Official performance breakdown and section-wise analytics
            </p>
          </div>
        </div>

        <button
          onClick={handlePrint}
          className="btn-secondary py-2 px-3 text-xs self-start sm:self-auto"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Print / Export Scorecard</span>
        </button>
      </div>

      {/* Hero Score Card */}
      <div className="card-cream p-6 sm:p-7 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center sm:text-left">
          <Badge
            label={isPassed ? 'Assessment Passed' : 'Assessment Failed'}
            variant={isPassed ? 'success' : 'danger'}
            size="md"
            dot
          />
          <h2 className="text-xl font-bold text-stone-900 tracking-tight">{result.exam_title}</h2>
          <p className="text-xs text-stone-500">
            Completed on {formatISTDateTime(result.created_at)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="p-4 sm:p-5 rounded-2xl bg-stone-50 border border-stone-200 text-center">
            <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider block">Score Earned</span>
            <p className="text-2xl font-bold text-stone-900 font-mono mt-0.5">
              {result.score} <span className="text-xs text-stone-400 font-normal">/ {result.max_score}</span>
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-stone-50 border border-stone-200 text-center">
            <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider block">Percentage</span>
            <p className="text-2xl font-bold text-stone-900 font-mono mt-0.5">
              {result.percentage}%
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Breakdown Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-cream p-4 sm:p-5 rounded-xl flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-stone-500 font-medium">Correct Answers</span>
            <p className="text-xl font-bold text-stone-900">{result.correct}</p>
          </div>
        </div>

        <div className="card-cream p-4 sm:p-5 rounded-xl flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
            <XCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-stone-500 font-medium">Incorrect Answers</span>
            <p className="text-xl font-bold text-stone-900">{result.incorrect}</p>
          </div>
        </div>

        <div className="card-cream p-4 sm:p-5 rounded-xl flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-stone-100 border border-stone-200 text-stone-600">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-stone-500 font-medium">Unanswered</span>
            <p className="text-xl font-bold text-stone-900">{result.unanswered}</p>
          </div>
        </div>
      </div>

      {/* Section-Wise Breakdown */}
      {result.section_scores && Object.keys(result.section_scores).length > 0 && (
        <div className="card-cream p-5 sm:p-6 rounded-2xl space-y-4">
          <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-stone-700" />
            Section-Wise Performance Breakdown
          </h3>

          <div className="space-y-3 pt-1">
            {Object.entries(result.section_scores).map(([secTitle, data]) => {
              const secPct = data.max_score > 0 ? Math.round((data.score / data.max_score) * 100) : 0;
              return (
                <div key={secTitle} className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-stone-800">{secTitle}</span>
                    <span className="font-mono text-stone-600">{data.score} / {data.max_score} ({secPct}%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-stone-800 rounded-full"
                      style={{ width: `${Math.max(0, Math.min(100, secPct))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
