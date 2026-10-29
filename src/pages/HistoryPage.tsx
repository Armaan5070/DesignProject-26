import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, Plus, Calendar, AlertCircle, Eye, RefreshCw, Server, PlayCircle } from 'lucide-react';
import { fetchInspections, getExecutionMode, setExecutionMode, getBackendBaseUrl } from '../services/api';
import type { Inspection, ExecutionMode } from '../types/inspection';
import { StatusBadge } from '../components/common/Badge';
import { Button } from '../components/common/Button';

export const HistoryPage: React.FC = () => {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [mode, setMode] = useState<ExecutionMode>(getExecutionMode());

  const backendBaseUrl = getBackendBaseUrl();

  const loadData = () => {
    fetchInspections()
      .then((data) => {
        setInspections(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Unable to load inspections from server.');
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();

    const handleModeChange = (e: Event) => {
      const customEvent = e as CustomEvent<ExecutionMode>;
      if (customEvent.detail) setMode(customEvent.detail);
      else setMode(getExecutionMode());
      setLoading(true);
      setError(null);
      loadData();
    };

    window.addEventListener('surface-mode-changed', handleModeChange);
    return () => window.removeEventListener('surface-mode-changed', handleModeChange);
  }, []);

  const filteredInspections = inspections.filter((job) => {
    const matchesStatus = statusFilter === 'all' || job.status === statusFilter;
    const matchesQuery =
      job.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.surfaceType.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesQuery;
  });

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#343832] tracking-tight">
            Inspections
          </h1>
          <p className="text-xs text-[#777D73] mt-0.5">
            Previous 3D surface reconstructions, geometric measurements, and crack records.
          </p>
        </div>

        <Link to="/new">
          <Button variant="primary" size="md" icon={<Plus className="w-4 h-4" />}>
            New inspection
          </Button>
        </Link>
      </div>

      {/* Mode Notice */}
      {mode === 'backend' ? (
        <div className="p-3.5 rounded-xl bg-[#E7EDE4] border border-[#D5E0D1] text-xs text-[#3F513D] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[#3F513D] flex-shrink-0" />
            <span>
              Real processing mode active. Connected to backend: <code className="font-mono bg-white/60 px-1 py-0.5 rounded">{backendBaseUrl || 'Default URL'}</code>.
            </span>
          </div>
          <span className="font-mono text-[10px] text-[#3F513D] bg-white/70 px-2 py-0.5 rounded self-start sm:self-auto border border-[#D5E0D1]">
            Live API
          </span>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-[#F0EFE8] border border-[#E8E5DC] text-xs text-[#777D73] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <PlayCircle className="w-4 h-4 text-[#9BA297] flex-shrink-0" />
            <span>
              Operating in <strong className="text-[#343832]">demonstration mode</strong>. Displaying local inspection records and session submissions.
            </span>
          </div>
          <span className="font-mono text-[10px] text-[#777D73] bg-[#E8E5DC] px-2 py-0.5 rounded self-start sm:self-auto">
            Offline Demo
          </span>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#9BA297]" />
          <input
            type="text"
            placeholder="Search by name, ID, or surface type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-[#E8E5DC] rounded-lg pl-9 pr-4 py-2 text-xs text-[#343832] placeholder-[#9BA297] focus:outline-none focus:ring-1 focus:ring-[#9BAE98]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-[#9BA297]" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-[#E8E5DC] rounded-lg px-3 py-2 text-xs text-[#343832] focus:outline-none focus:ring-1 focus:ring-[#9BAE98]"
          >
            <option value="all">All statuses</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="queued">Queued</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-5 rounded-xl bg-[#F9EFEA] border border-[#E8C9BD] space-y-3 text-xs">
          <div className="flex items-center gap-2 text-[#8F543E] font-medium">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Backend error: {error}</span>
          </div>
          <p className="text-[#8F543E]/80 pl-6 leading-relaxed">
            Could not fetch records from the backend service. Ensure FastAPI is running or switch to demonstration mode.
          </p>
          <div className="pl-6 flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setError(null);
                loadData();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#E8C9BD] text-[#8F543E] font-medium hover:bg-[#F8F7F2] transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
            {mode === 'backend' && (
              <button
                type="button"
                onClick={() => setExecutionMode('demo')}
                className="px-3 py-1.5 rounded-lg bg-[#F0EFE8] border border-[#E8E5DC] text-[#343832] font-medium hover:bg-[#E8E5DC] transition-colors cursor-pointer"
              >
                Switch to Demo Mode
              </button>
            )}
          </div>
        </div>
      )}

      {/* History List Table */}
      {loading ? (
        <div className="py-20 text-center text-xs text-[#777D73] space-y-2">
          <div className="w-4 h-4 border-2 border-[#9BAE98] border-t-transparent rounded-full animate-spin mx-auto" />
          <p>Loading inspection records...</p>
        </div>
      ) : filteredInspections.length > 0 ? (
        <div className="bg-white rounded-xl border border-[#E8E5DC] shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E8E5DC] text-[#777D73] font-medium text-[11px] bg-[#F8F7F2]/60">
                  <th className="py-3 px-5">Inspection name</th>
                  <th className="py-3 px-4">Surface</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Findings</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E5DC]">
                {filteredInspections.map((job) => {
                  const cracksCount = job.findings.filter((f) => f.type === 'potential_crack').length;
                  return (
                    <tr key={job.id} className="hover:bg-[#F8F7F2]/60 transition-colors">
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#343832]">{job.name}</span>
                          {job.isDemoMode && (
                            <span className="text-[10px] font-mono text-[#777D73] bg-[#F8F7F2] px-1.5 py-0.2 rounded border border-[#E8E5DC]">
                              Demo
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-[#9BA297] mt-0.5">{job.id}</div>
                      </td>

                      <td className="py-4 px-4 text-[#777D73]">
                        {job.surfaceType}
                      </td>

                      <td className="py-4 px-4 text-[#777D73] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-[#9BA297]" />
                          <span>{formatDate(job.createdAt)}</span>
                        </div>
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap">
                        <StatusBadge status={job.status} size="sm" />
                      </td>

                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        {job.status === 'completed' ? (
                          <span
                            className={`font-mono text-xs ${
                              cracksCount > 0 ? 'text-[#8F543E] font-medium' : 'text-[#777D73]'
                            }`}
                          >
                            {cracksCount} {cracksCount === 1 ? 'crack flagged' : 'cracks flagged'}
                          </span>
                        ) : job.status === 'processing' ? (
                          <span className="text-[11px] text-[#777D73]">
                            Stage {job.currentStepIndex + 1} of 6
                          </span>
                        ) : job.status === 'queued' ? (
                          <span className="text-[11px] text-[#777D73]">
                            Queued
                          </span>
                        ) : job.status === 'failed' ? (
                          <span className="text-[11px] text-[#8F543E]">
                            Stopped
                          </span>
                        ) : (
                          <span className="text-[#9BA297]">—</span>
                        )}
                      </td>

                      <td className="py-4 px-5 text-right whitespace-nowrap">
                        <Link
                          to={
                            job.status === 'processing' || job.status === 'queued'
                              ? `/inspections/${job.id}/progress`
                              : `/inspections/${job.id}`
                          }
                        >
                          <Button variant="secondary" size="sm" icon={<Eye className="w-3.5 h-3.5" />}>
                            {job.status === 'completed' ? 'Inspect 3D' : 'View'}
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="py-16 px-6 text-center bg-white rounded-xl border border-[#E8E5DC] space-y-3">
          <div className="w-10 h-10 rounded-full bg-[#F0EFE8] flex items-center justify-center text-[#777D73] mx-auto">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-[#343832]">No matching inspections found</p>
            <p className="text-xs text-[#777D73] max-w-sm mx-auto">
              Try adjusting your search terms or filter selection.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
