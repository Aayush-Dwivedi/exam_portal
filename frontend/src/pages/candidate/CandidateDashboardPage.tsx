import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  GraduationCap, Clock, Award, CheckCircle2, 
  ArrowRight, ShieldCheck, PlayCircle, BookOpen, AlertCircle, RotateCcw
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Exam, Result } from '../../types';
import { Badge } from '../../components/common/Badge';
import { useAuth } from '../../contexts/AuthContext';
import { exitFullscreenSafe, stopAllHardwareStreams } from '../../utils/hardware';

export const CandidateDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [availableExams, setAvailableExams] = useState<Exam[]>([]);
  const [myResults, setMyResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Immediate failsafe: guarantee full screen is dismissed and all media hardware is released
    exitFullscreenSafe();
    stopAllHardwareStreams();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [examsRes, resultsRes] = await Promise.all([
          apiClient.get<Exam[]>('/exams'),
          apiClient.get<Result[]>('/results'),
        ]);
        setAvailableExams(examsRes.data);
        setMyResults(resultsRes.data);
      } catch (err) {
        console.error('Failed to load candidate data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const completedExamIds = myResults.map((r) => r.exam_id);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="card-cream p-6 sm:p-7 rounded-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-stone-100 border border-stone-200 text-stone-700 text-xs font-medium mb-3">
              <ShieldCheck className="w-3.5 h-3.5 text-stone-700" />
              <span>Secure AI-Proctored Assessment Hub</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
              Welcome, {user?.name || 'Candidate'}
            </h1>
            <p className="text-stone-500 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Select an assessment to perform pre-exam hardware diagnostics and launch your proctored examination room.
            </p>
          </div>

          {user?.roll_number && (
            <div className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-left sm:text-right shrink-0">
              <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">Candidate Roll No</span>
              <p className="font-mono font-bold text-base text-stone-900 mt-0.5">{user.roll_number}</p>
            </div>
          )}
        </div>
      </div>

      {/* Available Exams Section */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-stone-700" />
            Assigned & Published Assessments ({availableExams.length})
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {loading ? (
            <div className="col-span-full py-12 text-center text-stone-500">
              <div className="w-7 h-7 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs">Loading available exams...</p>
            </div>
          ) : availableExams.length === 0 ? (
            <div className="col-span-full card-cream p-10 text-center">
              <AlertCircle className="w-10 h-10 text-stone-400 mx-auto mb-2.5" />
              <h3 className="text-sm font-semibold text-stone-800">No active examinations</h3>
              <p className="text-xs text-stone-500 mt-1">
                You do not have any published examinations scheduled currently.
              </p>
            </div>
          ) : (
            availableExams.map((exam) => {
              const isCompleted = completedExamIds.includes(exam.id);
              const resultObj = myResults.find((r) => r.exam_id === exam.id);
              const isPublished = Boolean(resultObj?.is_published);
              const isMultiAttempt = Boolean(exam.allow_reattempts);

              return (
                <div
                  key={exam.id}
                  className="card-cream card-cream-hover p-5 rounded-2xl flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Badge
                        label={
                          isMultiAttempt
                            ? isCompleted
                              ? isPublished
                                ? `Scorecard (${resultObj?.percentage}%) · Retake Available`
                                : 'Practice Mock · Retake Available'
                              : 'Practice Mock (Unlimited)'
                            : isCompleted
                            ? isPublished
                              ? 'Scorecard Published'
                              : 'Under Review'
                            : 'Available'
                        }
                        variant={
                          isMultiAttempt
                            ? 'primary'
                            : isCompleted
                            ? isPublished
                              ? 'success'
                              : 'warning'
                            : 'neutral'
                        }
                        size="sm"
                        dot={!isCompleted || isMultiAttempt}
                      />
                      <span className="text-xs text-stone-500 flex items-center gap-1 font-mono">
                        <Clock className="w-3.5 h-3.5 text-stone-400" />
                        {exam.duration_minutes} mins
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-stone-900 line-clamp-2 leading-snug">{exam.title}</h3>
                    <p className="text-xs text-stone-500 mt-2 line-clamp-2 leading-relaxed">
                      {exam.description || 'Comprehensive evaluation assessment.'}
                    </p>

                    <div className="mt-4 pt-3.5 border-t border-stone-100 grid grid-cols-2 gap-2 text-xs text-stone-500">
                      <div>
                        <span>Attempts:</span>{' '}
                        <strong className="text-stone-800 font-semibold">{isMultiAttempt ? 'Unlimited' : 'Single'}</strong>
                      </div>
                      <div>
                        <span>AI Proctoring:</span>{' '}
                        <strong className="text-emerald-700 font-semibold">Active</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-stone-100">
                    {isMultiAttempt ? (
                      isCompleted ? (
                        <div className="flex items-center gap-2">
                          {isPublished && resultObj?.id ? (
                            <Link
                              to={`/candidate/results/${resultObj.id}`}
                              className="btn-secondary flex-1 py-2 text-xs justify-center font-medium"
                            >
                              <Award className="w-3.5 h-3.5 text-amber-600" />
                              <span>Scorecard ({resultObj.percentage}%)</span>
                            </Link>
                          ) : (
                            <Link
                              to="/candidate/results"
                              className="btn-secondary flex-1 py-2 text-xs justify-center font-medium text-stone-600"
                            >
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              <span>Review</span>
                            </Link>
                          )}
                          <Link
                            to={`/candidate/exams/${exam.id}/details`}
                            className="btn-primary flex-1 py-2 text-xs justify-center font-medium bg-emerald-700 hover:bg-emerald-800"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Retake Exam</span>
                          </Link>
                        </div>
                      ) : (
                        <Link
                          to={`/candidate/exams/${exam.id}/details`}
                          className="btn-primary w-full py-2 text-xs justify-center font-medium bg-emerald-700 hover:bg-emerald-800"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          <span>Start Practice Exam</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      )
                    ) : isCompleted ? (
                      isPublished && resultObj?.id ? (
                        <Link
                          to={`/candidate/results/${resultObj.id}`}
                          className="btn-secondary w-full py-2 text-xs justify-center font-medium"
                        >
                          <Award className="w-3.5 h-3.5 text-amber-600" />
                          <span>View Scorecard ({resultObj.percentage}%)</span>
                        </Link>
                      ) : (
                        <Link
                          to="/candidate/results"
                          className="w-full py-2 px-3 rounded-xl border border-amber-200 bg-amber-50/70 text-amber-900 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-amber-100/70 transition-colors"
                        >
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span>Under Examiner Review</span>
                        </Link>
                      )
                    ) : (
                      <Link
                        to={`/candidate/exams/${exam.id}/details`}
                        className="btn-primary w-full py-2 text-xs justify-center font-medium"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>Launch Examination</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Completed Results Overview */}
      {myResults.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <Award className="w-4 h-4 text-stone-700" />
              Completed Assessment Status
            </h2>
            <Link
              to="/candidate/results"
              className="text-xs font-semibold text-stone-700 hover:text-stone-900 flex items-center gap-1 underline underline-offset-2"
            >
              <span>View All Results</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="card-cream rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-stone-50/80 text-stone-500 border-b border-stone-200 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Examination</th>
                  <th className="py-3 px-4">Score</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Scorecard</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {myResults.map((r) => {
                  const isPublished = Boolean(r.is_published);
                  return (
                    <tr key={r.id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="py-3 px-4 font-medium text-stone-900">{r.exam_title}</td>
                      <td className="py-3 px-4 font-mono text-stone-800 font-semibold">
                        {isPublished ? (
                          <span>{r.score} / {r.max_score} ({r.percentage}%)</span>
                        ) : (
                          <span className="text-stone-400 font-sans italic text-[11px]">Under review</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {isPublished ? (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                            r.percentage >= 40
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {r.percentage >= 40 ? 'Passed' : 'Failed'}
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Pending Approval
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isPublished ? (
                          <Link
                            to={`/candidate/results/${r.id}`}
                            className="btn-secondary py-1 px-2.5 text-xs inline-flex"
                          >
                            View Scorecard
                          </Link>
                        ) : (
                          <Link
                            to="/candidate/results"
                            className="py-1 px-2.5 text-xs text-amber-700 hover:text-amber-800 font-medium inline-flex items-center gap-1"
                          >
                            <Clock className="w-3 h-3" />
                            <span>Awaiting Sign-off</span>
                          </Link>
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
  );
};
