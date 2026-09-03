import React, { useState, useEffect } from 'react';
import { Award, CheckCircle2, Clock, Check, X, ShieldAlert } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Result } from '../../types';

export const SetterResultsPage: React.FC = () => {
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PUBLISHED' | 'PENDING'>('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchResults = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<Result[]>('/results');
      setResults(res.data);
    } catch (err) {
      console.error('Failed to fetch results', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, []);

  const handlePublish = async (id: number) => {
    try {
      setActionLoadingId(id);
      const res = await apiClient.post<Result>(`/results/${id}/publish`);
      setResults((prev) => prev.map((r) => (r.id === id ? res.data : r)));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to publish result.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUnpublish = async (id: number) => {
    if (!window.confirm('Are you sure you want to unpublish this result? The candidate will no longer be able to see their score.')) {
      return;
    }
    try {
      setActionLoadingId(id);
      const res = await apiClient.post<Result>(`/results/${id}/unpublish`);
      setResults((prev) => prev.map((r) => (r.id === id ? res.data : r)));
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to unpublish result.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePublishAll = async () => {
    const pendingCount = results.filter((r) => !r.is_published).length;
    if (pendingCount === 0) return;

    if (!window.confirm(`Are you sure you want to approve and publish all ${pendingCount} pending results for your examinations?`)) {
      return;
    }

    try {
      setBulkLoading(true);
      await apiClient.post('/results/publish-all');
      await fetchResults();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to bulk publish results.');
    } finally {
      setBulkLoading(false);
    }
  };

  const filteredResults = results.filter((r) => {
    if (filterStatus === 'PUBLISHED') return r.is_published;
    if (filterStatus === 'PENDING') return !r.is_published;
    return true;
  });

  const pendingCount = results.filter((r) => !r.is_published).length;
  const publishedCount = results.filter((r) => r.is_published).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
            <Award className="w-5 h-5 text-stone-700" />
            Candidate Assessment Evaluation & Sign-off
          </h1>
          <p className="text-stone-500 text-xs mt-0.5">
            Review submissions, audit scoring distributions, and release official scorecards to candidates
          </p>
        </div>

        {pendingCount > 0 && (
          <button
            onClick={handlePublishAll}
            disabled={bulkLoading}
            className="btn-primary py-2 px-3 text-xs font-semibold flex items-center gap-1.5 shadow-xs"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{bulkLoading ? 'Publishing...' : `Approve & Publish All (${pendingCount})`}</span>
          </button>
        )}
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        <button
          onClick={() => setFilterStatus('ALL')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
            filterStatus === 'ALL'
              ? 'bg-stone-900 text-white shadow-xs'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          All Submissions ({results.length})
        </button>
        <button
          onClick={() => setFilterStatus('PENDING')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
            filterStatus === 'PENDING'
              ? 'bg-amber-800 text-white shadow-xs'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          <Clock className="w-3 h-3 text-amber-600" />
          <span>Pending Review ({pendingCount})</span>
        </button>
        <button
          onClick={() => setFilterStatus('PUBLISHED')}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
            filterStatus === 'PUBLISHED'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          <span>Published ({publishedCount})</span>
        </button>
      </div>

      <div className="card-cream rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-stone-50/80 text-stone-500 border-b border-stone-200 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Candidate</th>
                <th className="py-3 px-4">Exam Title</th>
                <th className="py-3 px-4">Score</th>
                <th className="py-3 px-4">Percentage</th>
                <th className="py-3 px-4">Breakdown (C / I)</th>
                <th className="py-3 px-4">Publication Status</th>
                <th className="py-3 px-4 text-right">Approval Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-stone-500">
                    <div className="w-5 h-5 border-2 border-stone-400 border-t-stone-800 rounded-full animate-spin mx-auto mb-2" />
                    <span>Loading candidate scores...</span>
                  </td>
                </tr>
              ) : filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-stone-500">
                    No submissions recorded matching this filter.
                  </td>
                </tr>
              ) : (
                filteredResults.map((r) => {
                  const isPublished = Boolean(r.is_published);
                  const isActionLoading = actionLoadingId === r.id;

                  return (
                    <tr key={r.id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="py-3 px-4 font-semibold text-stone-900">
                        {r.candidate_name}
                      </td>
                      <td className="py-3 px-4 text-stone-700">
                        {r.exam_title}
                      </td>
                      <td className="py-3 px-4 font-mono text-stone-900 font-semibold">
                        {r.score} <span className="text-stone-400 font-normal text-[11px]">/ {r.max_score}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`font-bold ${r.percentage >= 40 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {r.percentage}%
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-stone-500">
                        <span className="text-emerald-700 font-semibold">{r.correct}</span> / <span className="text-rose-700 font-semibold">{r.incorrect}</span>
                      </td>
                      <td className="py-3 px-4">
                        {isPublished ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Published</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Pending Sign-off</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isPublished ? (
                          <button
                            onClick={() => handleUnpublish(r.id)}
                            disabled={isActionLoading}
                            className="py-1 px-2.5 rounded-xl border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-600 text-xs font-medium transition-colors"
                          >
                            {isActionLoading ? 'Updating...' : 'Unpublish'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePublish(r.id)}
                            disabled={isActionLoading}
                            className="btn-primary py-1 px-2.5 text-xs font-semibold inline-flex items-center gap-1 shadow-xs"
                          >
                            <Check className="w-3 h-3" />
                            <span>{isActionLoading ? 'Publishing...' : 'Approve & Publish'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
