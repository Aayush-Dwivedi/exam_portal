import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Users, Activity, AlertTriangle, 
  Award, TrendingUp, ArrowRight, ShieldCheck, Clock
} from 'lucide-react';
import { StatsCard } from '../../components/common/StatsCard';
import { Badge } from '../../components/common/Badge';
import { apiClient } from '../../api/client';
import { AdminAnalytics, Result } from '../../types';

export const AdminDashboardPage: React.FC = () => {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [recentResults, setRecentResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [analyticsRes, resultsRes] = await Promise.all([
          apiClient.get<AdminAnalytics>('/analytics/admin'),
          apiClient.get<Result[]>('/results?limit=5'),
        ]);
        setAnalytics(analyticsRes.data);
        setRecentResults(resultsRes.data);
      } catch (error) {
        console.error('Failed to load admin dashboard data', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Welcome Banner */}
      <div className="card-cream p-6 sm:p-7 rounded-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-stone-100 border border-stone-200 text-stone-700 text-xs font-medium mb-3">
              <ShieldCheck className="w-3.5 h-3.5 text-stone-700" />
              <span>Platform Administration Active</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
              System Overview & Integrity Control
            </h1>
            <p className="text-stone-500 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
              Monitor real-time candidate examination sessions, approve authored question papers, and audit AI-assisted proctoring signals.
            </p>
          </div>
          <div className="flex items-center gap-2.5 self-start md:self-auto">
            <Link
              to="/admin/live-monitoring"
              className="btn-primary py-2 px-3.5 text-xs font-semibold"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Live Monitoring</span>
            </Link>
            <Link
              to="/admin/exams"
              className="btn-secondary py-2 px-3.5 text-xs font-semibold"
            >
              <span>Review Papers</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Candidates"
          value={analytics?.total_candidates ?? '--'}
          subtitle="Enrolled examinees"
          icon={Users}
          color="brand"
        />
        <StatsCard
          title="Active Exams"
          value={analytics?.active_exams ?? '--'}
          subtitle="Published & in progress"
          icon={Activity}
          color="emerald"
        />
        <StatsCard
          title="Pending Approvals"
          value={analytics?.pending_approvals ?? '--'}
          subtitle="Awaiting admin review"
          icon={Clock}
          color="amber"
        />
        <StatsCard
          title="Suspicious Signals"
          value={analytics?.suspicious_sessions_count ?? '--'}
          subtitle="Flagged for AI review"
          icon={AlertTriangle}
          color="rose"
        />
      </div>

      {/* Secondary Highlights & Quick Action Rows */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Performance & Pass Rate Card */}
        <div className="card-cream p-5 sm:p-6 rounded-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-stone-700" />
                Performance Metrics
              </h2>
              <Badge label="Aggregated" variant="primary" size="sm" />
            </div>
            <div className="space-y-4 my-4">
              <div>
                <div className="flex justify-between text-xs text-stone-500 mb-1.5">
                  <span>Average Examination Score</span>
                  <span className="font-bold text-stone-900">{analytics?.average_score_pct ?? 0}%</span>
                </div>
                <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-stone-900 rounded-full" 
                    style={{ width: `${Math.min(100, analytics?.average_score_pct ?? 0)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs text-stone-500 mb-1.5">
                  <span>Overall Candidate Pass Rate</span>
                  <span className="font-bold text-emerald-700">{analytics?.pass_rate_pct ?? 0}%</span>
                </div>
                <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-600 rounded-full" 
                    style={{ width: `${Math.min(100, analytics?.pass_rate_pct ?? 0)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
          <Link
            to="/admin/analytics"
            className="flex items-center justify-between text-xs font-semibold text-stone-700 hover:text-stone-900 pt-3 border-t border-stone-100"
          >
            <span>View Full Statistical Breakdown</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Recent Examination Results Table */}
        <div className="lg:col-span-2 card-cream p-5 sm:p-6 rounded-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-600" />
                Recent Examination Submissions
              </h2>
              <Link to="/admin/results" className="text-xs font-semibold text-stone-700 hover:text-stone-900 underline underline-offset-2">
                View All
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-stone-500 border-b border-stone-200 text-[11px] font-semibold uppercase tracking-wider">
                    <th className="pb-2.5">Candidate</th>
                    <th className="pb-2.5">Exam Title</th>
                    <th className="pb-2.5">Score</th>
                    <th className="pb-2.5">Percentage</th>
                    <th className="pb-2.5">Proctoring Risk</th>
                    <th className="pb-2.5 text-right">Audit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {recentResults.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-stone-500">
                        No submissions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    recentResults.map((res) => (
                      <tr key={res.id} className="hover:bg-stone-50/60 transition-colors">
                        <td className="py-2.5 font-semibold text-stone-900">
                          {res.candidate_name}
                        </td>
                        <td className="py-2.5 text-stone-600 truncate max-w-[160px]">
                          {res.exam_title}
                        </td>
                        <td className="py-2.5 text-stone-800 font-semibold font-mono">
                          {res.score} / {res.max_score}
                        </td>
                        <td className="py-2.5 font-bold text-stone-900 font-mono">
                          {res.percentage}%
                        </td>
                        <td className="py-2.5">
                          <Badge
                            label={`${res.risk_level || 'LOW'} (${res.risk_score || 0})`}
                            variant={
                              res.risk_level === 'HIGH'
                                ? 'danger'
                                : res.risk_level === 'MEDIUM'
                                ? 'warning'
                                : 'success'
                            }
                            size="sm"
                            dot
                          />
                        </td>
                        <td className="py-2.5 text-right">
                          <Link
                            to={`/admin/proctoring/${res.session_id}`}
                            className="btn-secondary py-1 px-2.5 text-[11px]"
                          >
                            Review CV
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
