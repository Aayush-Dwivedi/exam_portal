import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  Activity, AlertTriangle, 
  Clock, User, ExternalLink, RefreshCw, Radio, Cpu, Wrench
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Badge } from '../../components/common/Badge';
import { formatISTTime } from '../../utils/date';

interface LiveCandidate {
  session_id: number;
  candidate_id: number;
  name: string;
  email: string;
  exam_title: string;
  started_at: string;
  progress: number;
  total_questions: number;
  status: 'ONLINE' | 'OFFLINE' | 'RECONNECTING';
  device_tier?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNSUPPORTED';
  cv_status?: 'ACTIVE' | 'DEGRADED' | 'PAUSED' | 'FAILED' | 'RECOVERING';
  cv_status_reason?: string | null;
  network_status?: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_score: number;
  last_event: string | null;
  last_event_time: string | null;
  is_technical_last_event?: boolean;
}

export const LiveMonitoringPage: React.FC = () => {
  const [candidates, setCandidates] = useState<LiveCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectedToWs, setConnectedToWs] = useState(false);
  const [liveFilter, setLiveFilter] = useState<'ALL' | 'SUSPICIOUS' | 'ONLINE' | 'TECHNICAL'>('ALL');
  const wsRef = useRef<WebSocket | null>(null);

  // 1. Fetch Real Database Live Candidates
  const fetchLiveCandidates = async () => {
    try {
      const res = await apiClient.get<LiveCandidate[]>('/proctoring/live-candidates');
      setCandidates(res.data || []);
    } catch (e) {
      console.warn('Failed to fetch live candidates from API', e);
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveCandidates();
    const interval = setInterval(fetchLiveCandidates, 6000);
    return () => clearInterval(interval);
  }, []);

  // 2. Connect to WebSocket broadcast for real-time live events and status changes
  useEffect(() => {
    let wsUrl = '';
    const customWs = import.meta.env.VITE_WS_BASE_URL;
    const apiBase = import.meta.env.VITE_API_BASE_URL;

    if (customWs) {
      wsUrl = `${customWs.replace(/\/$/, '')}/admin/monitoring`;
    } else if (apiBase && (apiBase.startsWith('http://') || apiBase.startsWith('https://'))) {
      try {
        const parsed = new URL(apiBase);
        const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${wsProto}//${parsed.host}/ws/admin/monitoring`;
      } catch {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname || 'localhost';
        wsUrl = `${protocol}//${host}:8000/ws/admin/monitoring`;
      }
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname || 'localhost';
      wsUrl = `${protocol}//${host}:8000/ws/admin/monitoring`;
    }

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectedToWs(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'proctoring.event') {
            setCandidates((prev) => {
              const exists = prev.some((c) => c.session_id === data.session_id);
              if (exists) {
                return prev.map((c) =>
                  c.session_id === data.session_id || c.candidate_id === data.candidate_id
                    ? {
                        ...c,
                        risk_level:
                          data.is_technical
                            ? c.risk_level
                            : data.severity === 'HIGH'
                            ? 'HIGH'
                            : c.risk_level === 'HIGH'
                            ? 'HIGH'
                            : 'MEDIUM',
                        last_event: `${data.event_type} (${data.duration}s)`,
                        last_event_time: 'Just now',
                        is_technical_last_event: !!data.is_technical,
                      }
                    : c
                );
              } else {
                fetchLiveCandidates();
                return prev;
              }
            });
          } else if (data.type === 'proctoring.status') {
            setCandidates((prev) =>
              prev.map((c) =>
                c.session_id === data.session_id
                  ? {
                      ...c,
                      device_tier: data.device_tier || c.device_tier,
                      cv_status: data.cv_status || c.cv_status,
                      cv_status_reason: data.cv_status_reason !== undefined ? data.cv_status_reason : c.cv_status_reason,
                      network_status: data.network_status || c.network_status,
                    }
                  : c
              )
            );
          } else if (data.type === 'candidate.connection') {
            setCandidates((prev) =>
              prev.map((c) =>
                c.candidate_id === data.candidate_id
                  ? { ...c, status: data.status, network_status: data.status === 'ONLINE' ? 'Good' : 'Offline' }
                  : c
              )
            );
          }
        } catch (e) {
          console.error('Error parsing WS message', e);
        }
      };

      ws.onclose = () => {
        setConnectedToWs(false);
      };
    } catch (e) {
      console.error('WebSocket connection failed', e);
    }

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const filteredCandidates = candidates.filter((c) => {
    if (liveFilter === 'SUSPICIOUS') return c.risk_level === 'HIGH' || c.risk_level === 'MEDIUM';
    if (liveFilter === 'ONLINE') return c.status === 'ONLINE';
    if (liveFilter === 'TECHNICAL') return c.cv_status === 'DEGRADED' || c.cv_status === 'FAILED' || c.is_technical_last_event;
    return true;
  });

  const getCvStatusBadge = (status?: string) => {
    switch (status) {
      case 'DEGRADED':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">Adjusted</span>;
      case 'FAILED':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-300">Needs Attention</span>;
      case 'RECOVERING':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-300">Syncing</span>;
      case 'PAUSED':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-stone-100 text-stone-700 border border-stone-300">Paused</span>;
      default:
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">Active</span>;
    }
  };

  return (
    <div className="space-y-5">
      {/* Header with live heartbeat */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-700" />
              Live Proctoring & Candidate Monitor
            </h1>
            <span className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
              connectedToWs
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}>
              <Radio className="w-3 h-3 animate-pulse" />
              <span>{connectedToWs ? 'LIVE STREAM' : 'SYNCING'}</span>
            </span>
          </div>
          <p className="text-stone-500 text-xs mt-0.5">
            Candidate status, device readiness, connection stability, and integrity alerts
          </p>
        </div>

        {/* Live Filter Tabs & Refresh */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={fetchLiveCandidates}
            className="btn-secondary p-2"
            title="Refresh active candidate sessions"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {(['ALL', 'ONLINE', 'SUSPICIOUS', 'TECHNICAL'] as const).map((filterKey) => (
            <button
              key={filterKey}
              onClick={() => setLiveFilter(filterKey)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                liveFilter === filterKey
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:text-stone-900 border border-stone-200'
              }`}
            >
              {filterKey === 'TECHNICAL' ? 'SYSTEM NOTICES' : filterKey === 'SUSPICIOUS' ? 'FLAGGED' : filterKey}
            </button>
          ))}
        </div>
      </div>

      {/* Candidate Grid */}
      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-6 h-6 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin"></div>
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="card-cream p-12 text-center">
          <Activity className="w-10 h-10 text-stone-400 mx-auto mb-2.5" />
          <h3 className="text-sm font-semibold text-stone-800">No active candidate sessions streaming</h3>
          <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
            When candidates start an examination in the portal, their session status, device readiness, and event updates will appear here in real-time.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCandidates.map((cand) => (
            <div
              key={cand.session_id}
              className="card-cream card-cream-hover rounded-2xl overflow-hidden flex flex-col justify-between"
            >
              {/* Header viewport area */}
              <div className="relative h-40 bg-stone-900 flex items-center justify-center overflow-hidden">
                {/* HUD Overlays */}
                <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5">
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full backdrop-blur-md text-[10px] font-semibold border ${
                    cand.status === 'ONLINE'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                      : 'bg-stone-900/80 text-stone-400 border-stone-700/60'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cand.status === 'ONLINE' ? 'bg-emerald-400 animate-pulse' : 'bg-stone-500'}`} />
                    <span>{cand.status === 'ONLINE' ? 'CONNECTED' : 'OFFLINE'}</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-stone-900/80 backdrop-blur-md text-[10px] font-mono text-stone-300 border border-stone-700">
                    #{cand.session_id}
                  </span>
                </div>

                <div className="absolute top-2.5 right-2.5 z-20">
                  <Badge
                    label={`Review Level: ${cand.risk_level}`}
                    variant={cand.risk_level === 'HIGH' ? 'danger' : cand.risk_level === 'MEDIUM' ? 'warning' : 'success'}
                    size="sm"
                    dot
                  />
                </div>

                {/* Candidate Avatar & Identity */}
                <div className="relative z-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-stone-800 border border-stone-700 flex items-center justify-center mx-auto shadow-md">
                    <User className="w-7 h-7 text-stone-400" />
                  </div>
                  <p className="text-xs font-bold text-stone-200 mt-1.5">{cand.name}</p>
                </div>

                {/* Bottom HUD bar */}
                <div className="absolute bottom-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between text-[10px] text-stone-300">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-stone-400" />
                    Started {formatISTTime(cand.started_at, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-stone-200 font-semibold font-mono">
                    {cand.progress}/{cand.total_questions} Solved
                  </span>
                </div>
              </div>

              {/* Candidate Details & Telemetry Matrix */}
              <div className="p-4 space-y-3">
                <div>
                  <p className="font-bold text-xs text-stone-900 truncate">{cand.exam_title}</p>
                  <p className="text-[11px] text-stone-500 truncate">{cand.email}</p>
                </div>

                {/* Device & Integrity Card */}
                <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-stone-500 flex items-center gap-1">
                      <Cpu className="w-3 h-3 text-stone-600" />
                      <span>Device Readiness:</span>
                    </span>
                    <span className="font-semibold text-stone-800 text-[11px]">
                      {cand.device_tier === 'HIGH' ? 'Optimal' : cand.device_tier === 'LOW' ? 'Standard' : 'Verified'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-stone-500 flex items-center gap-1">
                      <Activity className="w-3 h-3 text-stone-600" />
                      <span>Proctoring Status:</span>
                    </span>
                    {getCvStatusBadge(cand.cv_status)}
                  </div>

                  {cand.cv_status === 'DEGRADED' && cand.cv_status_reason && (
                    <div className="p-1.5 rounded-lg bg-amber-50 text-[10px] text-amber-800 border border-amber-200">
                      <strong>Notice:</strong> Environment optimized for candidate device
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-0.5 border-t border-stone-200/60">
                    <span className="text-[10px] text-stone-500">Connection:</span>
                    <span className="text-[10px] font-medium text-emerald-700">
                      {cand.network_status || (cand.status === 'ONLINE' ? 'Good' : 'Offline')}
                    </span>
                  </div>
                </div>

                {/* Last Observable Event Box */}
                <div className={`p-2.5 rounded-xl border text-xs ${
                  cand.is_technical_last_event
                    ? 'bg-blue-50 border-blue-200 text-blue-900'
                    : cand.risk_level === 'HIGH'
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : cand.risk_level === 'MEDIUM'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-stone-50 border-stone-200 text-stone-700'
                }`}>
                  <div className="flex items-center justify-between font-semibold mb-0.5">
                    <span className="flex items-center gap-1 text-[11px]">
                      {cand.is_technical_last_event ? (
                        <Wrench className="w-3 h-3 text-blue-600" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      <span>
                        {cand.is_technical_last_event ? 'System Notice' : 'Latest Environment Alert'}
                      </span>
                    </span>
                    <span className="text-[10px] text-stone-500">{cand.last_event_time}</span>
                  </div>
                  <p className="font-mono text-xs">{cand.last_event || 'Normal Activity'}</p>
                </div>

                {/* Action Buttons */}
                <div className="pt-1 flex items-center gap-2">
                  <Link
                    to={`/admin/proctoring/${cand.session_id}`}
                    className="btn-secondary py-1.5 px-3 text-xs flex-1 inline-flex justify-center items-center gap-1"
                  >
                    <span>Proctoring Review</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
