import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Award, Clock, CheckCircle2, AlertCircle, ArrowRight, 
  ExternalLink, FileText, ShieldAlert, BookOpen, Info
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Result } from '../../types';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';

export const CandidateResultsPage: React.FC = () => {
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPendingResult, setSelectedPendingResult] = useState<Result | null>(null);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        setLoading(true);
        const res = await apiClient.get<Result[]>('/results');
        setResults(res.data);
      } catch (err) {
        console.error('Failed to load candidate results', err);
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, []);

  const publishedCount = results.filter((r) => r.is_published).length;
  const pendingCount = results.filter((r) => !r.is_published).length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="card-cream p-6 sm:p-7 rounded-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-stone-100 border border-stone-200 text-stone-700 text-xs font-medium mb-3">
              <Award className="w-3.5 h-3.5 text-stone-700" />
              <span>Authoritative Examination Records</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
              My Assessment Results
            </h1>
            <p className="text-stone-500 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Official performance scorecards are published after examiner review and proctoring telemetry verification.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-center">
              <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">Published</span>
              <p className="font-mono font-bold text-base text-emerald-700 mt-0.5">{publishedCount}</p>
            </div>
            <div className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-center">
              <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">Under Review</span>
              <p className="font-mono font-bold text-base text-amber-700 mt-0.5">{pendingCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Info Notice */}
      {pendingCount > 0 && (
        <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
          <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Examiner Review in Progress:</strong> You have {pendingCount} assessment{pendingCount > 1 ? 's' : ''} currently awaiting examiner sign-off. Detailed scorecards and question breakdowns unlock automatically once approved by the examination committee.
          </p>
        </div>
      )}

      {/* Results List / Table */}
      <div className="space-y-3.5">
        <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
          <FileText className="w-4 h-4 text-stone-700" />
          Submitted Examination Submissions ({results.length})
        </h2>

        {loading ? (
          <div className="card-cream p-12 text-center text-stone-500 rounded-2xl">
            <div className="w-7 h-7 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin mx-auto mb-2.5" />
            <p className="text-xs">Loading examination records...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="card-cream p-10 text-center rounded-2xl">
            <AlertCircle className="w-10 h-10 text-stone-400 mx-auto mb-2.5" />
            <h3 className="font-bold text-sm text-stone-800">No Assessment Records Found</h3>
            <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
              You haven't completed any examinations yet. Select an available examination from the dashboard to get started.
            </p>
            <Link
              to="/candidate/dashboard"
              className="btn-primary inline-flex items-center gap-1.5 mt-4 py-2 px-4 text-xs font-semibold"
            >
              <span>Go to Available Exams</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (
          <div className="card-cream rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-stone-50/80 text-stone-500 border-b border-stone-200 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Examination</th>
                    <th className="py-3 px-4">Submission Date</th>
                    <th className="py-3 px-4">Publication Status</th>
                    <th className="py-3 px-4">Score</th>
                    <th className="py-3 px-4">Performance</th>
                    <th className="py-3 px-4 text-right">Scorecard Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {results.map((r) => {
                    const isPublished = Boolean(r.is_published);
                    const isPassed = r.percentage >= 40.0;

                    return (
                      <tr key={r.id} className="hover:bg-stone-50/60 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-stone-900">
                          {r.exam_title}
                        </td>
                        <td className="py-3.5 px-4 text-stone-500 font-mono text-[11px]">
                          {new Date(r.created_at).toLocaleDateString()} at {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3.5 px-4">
                          {r.session_status === 'CANCELLED' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              <span>Cancelled (Disqualified)</span>
                            </span>
                          ) : isPublished ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Published</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Under Examiner Review</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-stone-900">
                          {r.session_status === 'CANCELLED' ? (
                            <span className="text-rose-700 font-semibold text-[11px]">Disqualified</span>
                          ) : isPublished ? (
                            <span>{r.score} <span className="text-stone-400 font-normal text-[11px]">/ {r.max_score}</span></span>
                          ) : (
                            <span className="text-stone-400 italic font-sans font-normal text-[11px]">Pending review</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          {r.session_status === 'CANCELLED' ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border bg-rose-50 text-rose-700 border-rose-200">
                              Integrity Violation
                            </span>
                          ) : isPublished ? (
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                              isPassed
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                              {r.percentage}% · {isPassed ? 'Passed' : 'Failed'}
                            </span>
                          ) : (
                            <span className="text-stone-400 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {r.session_status === 'CANCELLED' ? (
                            <span className="text-stone-400 text-xs italic font-medium">Attempt Cancelled</span>
                          ) : isPublished ? (
                            <Link
                              to={`/candidate/results/${r.id}`}
                              className="btn-primary py-1.5 px-3 text-xs inline-flex items-center gap-1.5 font-medium shadow-xs"
                            >
                              <Award className="w-3.5 h-3.5" />
                              <span>View Scorecard</span>
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSelectedPendingResult(r)}
                              className="py-1.5 px-3 rounded-xl border border-stone-200 bg-stone-100 text-stone-600 hover:bg-stone-200 text-xs font-medium inline-flex items-center gap-1.5 transition-colors"
                            >
                              <Clock className="w-3.5 h-3.5 text-stone-500" />
                              <span>Awaiting Approval</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal explaining why result is pending approval */}
      <Modal
        isOpen={Boolean(selectedPendingResult)}
        onClose={() => setSelectedPendingResult(null)}
        title="Result Under Examiner Review"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5">
            <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-xs text-amber-900">
                {selectedPendingResult?.exam_title}
              </h4>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                Your assessment has been submitted successfully and received by the system.
              </p>
            </div>
          </div>

          <p className="text-xs text-stone-600 leading-relaxed">
            In accordance with institutional evaluation regulations, scores and answer key breakdowns are withheld until an authorized <strong>Examiner</strong> or <strong>Paper Setter</strong> audits proctoring telemetry, confirms integrity checks, and approves official score publication.
          </p>

          <p className="text-xs text-stone-500 leading-relaxed">
            Please check back soon. Your full evaluation scorecard and PDF export option will become accessible here as soon as published.
          </p>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => setSelectedPendingResult(null)}
              className="btn-secondary py-2 px-4 text-xs font-semibold"
            >
              Understood
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
