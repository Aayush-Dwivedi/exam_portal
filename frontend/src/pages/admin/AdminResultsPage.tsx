import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Award, Search, CheckCircle2, Clock, ShieldAlert, Eye, Check, X, Send } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Result } from '../../types';
import { Badge } from '../../components/common/Badge';

export const AdminResultsPage: React.FC = () => {
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PUBLISHED' | 'PENDING'>('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchResults = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<Result[]>('/results');
      setResults(res.data);
    } catch (error) {
      console.error('Failed to fetch results', error);
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
    if (!window.confirm('Are you sure you want to unpublish this scorecard? The candidate will no longer be able to see their score.')) {
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

    if (!window.confirm(`Are you sure you want to approve and publish all ${pendingCount} pending results? Candidates will immediately be able to view their scorecards.`)) {
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
    const matchesSearch =
      r.candidate_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.exam_title?.toLowerCase().includes(search.toLowerCase()) ||
      r.candidate_email?.toLowerCase().includes(search.toLowerCase());

    if (!matchesSearch) return false;

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
            <Award className="w-5 h-5 text-stone-800" />
            Candidate Results & Publication Authority
          </h1>
          <p className="text-stone-500 text-xs mt-0.5">
            Audit scores, inspect proctoring evidence, and authorize official scorecard publication
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {pendingCount > 0 && (
            <button
              onClick={handlePublishAll}
              disabled={bulkLoading}
              className="btn-primary py-2 px-3 text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{bulkLoading ? 'Publishing...' : `Publish All Pending (${pendingCount})`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="card-cream p-3.5 rounded-2xl flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidate, email, or exam title..."
            className="input-cream pl-9 py-2 text-xs w-full"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
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
      </div>

      {/* Results Table */}
      <div className="card-cream rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-stone-50/80 text-stone-500 border-b border-stone-200 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Candidate</th>
                <th className="py-3 px-4">Exam Title</th>
                <th className="py-3 px-4">Score</th>
                <th className="py-3 px-4">Performance</th>
                <th className="py-3 px-4">Proctoring Risk</th>
                <th className="py-3 px-4">Publication Status</th>
                <th className="py-3 px-4 text-right">Approval Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-stone-500">
                    <div className="w-5 h-5 border-2 border-stone-400 border-t-stone-800 rounded-full animate-spin mx-auto mb-2" />
                    <span>Loading candidate results...</span>
                  </td>
                </tr>
              ) : filteredResults.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-stone-500">
                    No results recorded matching search or filter criteria.
                  </td>
                </tr>
              ) : (
                filteredResults.map((r) => {
                  const isPublished = Boolean(r.is_published);
                  const isActionLoading = actionLoadingId === r.id;

                  return (
                    <tr key={r.id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-stone-900">{r.candidate_name}</p>
                        <p className="text-stone-500 text-[11px] font-mono">{r.candidate_email}</p>
                      </td>
                      <td className="py-3.5 px-4 text-stone-700 font-medium">
                        {r.exam_title}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-stone-900 font-bold">
                        {r.score} <span className="text-stone-400 font-normal text-[11px]">/ {r.max_score}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`font-bold ${r.percentage >= 40 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {r.percentage}%
                        </span>
                        <span className="text-stone-400 text-[10px] block font-mono">
                          {r.correct}C · {r.incorrect}I · {r.unanswered}U
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            label={`${r.risk_level || 'LOW'} (${r.risk_score || 0})`}
                            variant={
                              r.risk_level === 'HIGH'
                                ? 'danger'
                                : r.risk_level === 'MEDIUM'
                                ? 'warning'
                                : 'success'
                            }
                            size="sm"
                            dot
                          />
                          <Link
                            to={`/admin/proctoring/${r.session_id}`}
                            title="Inspect AI Proctoring Event Logs"
                            className="p-1 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {isPublished ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Published</span>
                            </span>
                            {r.approved_by_name && (
                              <p className="text-[10px] text-stone-400 mt-0.5">By {r.approved_by_name}</p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Pending Review</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
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
                        </div>
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
