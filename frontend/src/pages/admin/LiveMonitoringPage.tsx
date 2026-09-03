import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  Activity, AlertTriangle, 
  Clock, User, ExternalLink, RefreshCw, Radio
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { Badge } from '../../components/common/Badge';

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
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_score: number;
  last_event: string | null;
  last_event_time: string | null;
}

export const LiveMonitoringPage: React.FC = () => {
  const [candidates, setCandidates] = useState<LiveCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectedToWs, setConnectedToWs] = useState(false);
  const [liveFilter, setLiveFilter] = useState<'ALL' | 'SUSPICIOUS' | 'ONLINE'>('ALL');
  const wsRef = useRef<WebSocket | null>(null);

  // 1. Fetch Real Database Live Candidates (No fallback dummy users)
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
    const interval = setInterval(fetchLiveCandidates, 6000); // sync every 6 seconds
    return () => clearInterval(interval);
  }, []);

  // 2. Connect to WebSocket broadcast for real-time live events
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//localhost:8000/ws/admin/monitoring`;

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
                          data.severity === 'HIGH'
                            ? 'HIGH'
                            : c.risk_level === 'HIGH'
                            ? 'HIGH'
                            : 'MEDIUM',
                        last_event: `${data.event_type} (${data.duration}s)`,
                        last_event_time: 'Just now',
                      }
                    : c
                );
              } else {
                fetchLiveCandidates();
                return prev;
              }
            });
          } else if (data.type === 'candidate.connection') {
            setCandidates((prev) =>
              prev.map((c) =>
                c.candidate_id === data.candidate_id
                  ? { ...c, status: data.status }
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
    return true;
  });

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
            Real-time visual stream status, connection health, and AI-assisted risk indicators
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

          {(['ALL', 'ONLINE', 'SUSPICIOUS'] as const).map((filterKey) => (
            <button
              key={filterKey}
              onClick={() => setLiveFilter(filterKey)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                liveFilter === filterKey
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-600 hover:text-stone-900 border border-stone-200'
              }`}
            >
              {filterKey}
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
            When candidates start an examination in the portal, their live video feed, question progress, and automated AI proctoring telemetry will appear here in real-time.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCandidates.map((cand) => (
            <div
              key={cand.session_id}
              className="card-cream card-cream-hover rounded-2xl overflow-hidden flex flex-col justify-between"
            >
              {/* Live Camera Viewport Simulation */}
              <div className="relative h-44 bg-stone-900 flex items-center justify-center overflow-hidden">
                {/* Grid scanning overlay */}
                <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:24px_24px]" />

                {/* Status HUD Overlays */}
                <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5">
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full backdrop-blur-md text-[10px] font-semibold border ${
                    cand.status === 'ONLINE'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                      : 'bg-stone-900/80 text-stone-400 border-stone-700/60'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${cand.status === 'ONLINE' ? 'bg-emerald-400 animate-pulse' : 'bg-stone-500'}`} />
                    <span>{cand.status === 'ONLINE' ? 'CAM ON' : 'OFFLINE'}</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-stone-900/80 backdrop-blur-md text-[10px] font-mono text-stone-300 border border-stone-700">
                    #{cand.session_id}
                  </span>
                </div>

                <div className="absolute top-2.5 right-2.5 z-20">
                  <Badge
                    label={`Risk: ${cand.risk_level}`}
                    variant={cand.risk_level === 'HIGH' ? 'danger' : cand.risk_level === 'MEDIUM' ? 'warning' : 'success'}
                    size="sm"
                    dot
                  />
                </div>

                {/* Candidate Face Avatar Frame */}
                <div className="relative z-10 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-stone-800 border border-stone-700 flex items-center justify-center mx-auto shadow-md">
                    <User className="w-8 h-8 text-stone-400" />
                  </div>
                  <p className="text-xs font-bold text-stone-200 mt-1.5">{cand.name}</p>
                </div>

                {/* Bottom HUD bar */}
                <div className="absolute bottom-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between text-[10px] text-stone-300">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-stone-400" />
                    Started {new Date(cand.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-stone-200 font-semibold font-mono">
                    {cand.progress}/{cand.total_questions} Solved
                  </span>
                </div>
              </div>

              {/* Candidate Details & Event Signal Box */}
              <div className="p-4 space-y-3">
                <div>
                  <p className="font-bold text-xs text-stone-900 truncate">{cand.exam_title}</p>
                  <p className="text-[11px] text-stone-500 truncate">{cand.email}</p>
                </div>

                {/* Last Observable Event Box */}
                <div className={`p-2.5 rounded-xl border text-xs ${
                  cand.risk_level === 'HIGH'
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : cand.risk_level === 'MEDIUM'
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-stone-50 border-stone-200 text-stone-700'
                }`}>
                  <div className="flex items-center justify-between font-semibold mb-0.5">
                    <span className="flex items-center gap-1 text-[11px]">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Latest Observed Signal</span>
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
                    <span>Forensic Report</span>
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
