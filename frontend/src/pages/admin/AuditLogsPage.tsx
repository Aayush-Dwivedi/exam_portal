import React, { useState, useEffect } from 'react';
import { ShieldAlert, Search } from 'lucide-react';
import { apiClient } from '../../api/client';
import { AuditLog } from '../../types';
import { formatISTDateTime } from '../../utils/date';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<AuditLog[]>('/audit-logs?limit=100');
      setLogs(res.data);
    } catch (error) {
      console.error('Failed to fetch audit logs', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(
    (l) =>
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.user_email?.toLowerCase().includes(search.toLowerCase()) ||
      l.resource_type.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-stone-700" />
          System Audit Logs & Security Trails
        </h1>
        <p className="text-stone-500 text-xs mt-0.5">
          Immutable audit log of sensitive administrative actions, examination submissions, and proctoring reviews
        </p>
      </div>

      {/* Search Filter */}
      <div className="card-cream p-3.5 rounded-2xl">
        <div className="relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by action, user email, or resource type..."
            className="input-cream pl-10 py-2 text-xs"
          />
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="card-cream rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-stone-50/80 text-stone-500 border-b border-stone-200 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Action Event</th>
                <th className="py-3 px-4">Resource</th>
                <th className="py-3 px-4">Context / Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-stone-500">
                    <div className="w-4 h-4 border-2 border-stone-400 border-t-stone-800 rounded-full animate-spin mx-auto mb-2" />
                    <span>Loading audit records...</span>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-stone-500">
                    No audit records found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-stone-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono text-stone-500 whitespace-nowrap">
                      {formatISTDateTime(log.timestamp)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-stone-900">{log.user_email || 'System'}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 font-mono text-[11px] font-semibold border border-stone-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-stone-700 font-medium">
                      {log.resource_type} {log.resource_id ? `#${log.resource_id}` : ''}
                    </td>
                    <td className="py-3 px-4 font-mono text-stone-500 max-w-sm truncate">
                      {log.details ? JSON.stringify(log.details) : '--'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
