import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus, Box, Calendar, AlertCircle, RefreshCw } from 'lucide-react';
import { fetchInspections, getExecutionMode, setExecutionMode } from '../services/api';
import type { Inspection, ExecutionMode } from '../types/inspection';
import { StatusBadge } from '../components/common/Badge';
import { Button } from '../components/common/Button';

export const OverviewPage: React.FC = () => {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ExecutionMode>(getExecutionMode());

  const loadData = () => {
    fetchInspections()
      .then((data) => {
        setInspections(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Unable to connect to inspection service.');
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
      loadData();
    };

    window.addEventListener('surface-mode-changed', handleModeChange);
    return () => window.removeEventListener('surface-mode-changed', handleModeChange);
  }, []);

  const recentInspections = inspections.slice(0, 3);

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
    <div className="space-y-12 md:space-y-16">
      {/* Hero Welcome Section */}
      <section className="pt-4 md:pt-8 max-w-2xl space-y-4">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#E7EDE4] text-[#3F513D] text-xs font-medium">
          <span>Structural Surface Inspection</span>
        </div>

        <h1 className="text-3xl md:text-4xl font-semibold text-[#343832] tracking-tight leading-tight">
          Understand your surface in three dimensions.
        </h1>

        <p className="text-sm md:text-base text-[#777D73] leading-relaxed">
          Upload a stereo image pair to reconstruct the physical surface, measure geometric deviations,
          and review potential cracks and surface irregularities.
        </p>

        <div className="pt-2 flex flex-wrap items-center gap-3">
          <Link to="/new">
            <Button
              variant="primary"
              size="lg"
              icon={<Plus className="w-4 h-4" />}
            >
              Start a new inspection
            </Button>
          </Link>

          <Link to="/inspections">
            <Button variant="secondary" size="lg">
              Browse previous inspections
            </Button>
          </Link>
        </div>
      </section>

      {/* 3-Step Simple How It Works */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-[#E8E5DC]">
        <div className="space-y-1.5">
          <span className="text-xs font-mono font-medium text-[#9BA297]">01</span>
          <h2 className="text-sm font-semibold text-[#343832]">Upload stereo pair</h2>
          <p className="text-xs text-[#777D73] leading-relaxed">
            Provide left and right photographs along with your camera calibration file to establish spatial scale.
          </p>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-mono font-medium text-[#9BA297]">02</span>
          <h2 className="text-sm font-semibold text-[#343832]">Reconstruct surface</h2>
          <p className="text-xs text-[#777D73] leading-relaxed">
            Surface generates calibrated 3D coordinates, measures out-of-plane deviations, and detects anomalies.
          </p>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-mono font-medium text-[#9BA297]">03</span>
          <h2 className="text-sm font-semibold text-[#343832]">Review findings in 3D</h2>
          <p className="text-xs text-[#777D73] leading-relaxed">
            Explore the interactive point cloud, examine candidate damage regions, and verify measurements.
          </p>
        </div>
      </section>

      {/* Recent Inspections Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-[#E8E5DC]">
          <h2 className="text-sm font-semibold text-[#343832]">Recent inspections</h2>
          <Link
            to="/inspections"
            className="text-xs font-medium text-[#777D73] hover:text-[#343832] flex items-center gap-1 transition-colors"
          >
            <span>View all</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="py-10 text-center text-xs text-[#777D73] space-y-2">
            <div className="w-4 h-4 border-2 border-[#9BAE98] border-t-transparent rounded-full animate-spin mx-auto" />
            <p>Loading inspections...</p>
          </div>
        ) : error ? (
          <div className="p-5 rounded-xl bg-[#F9EFEA] border border-[#E8C9BD] space-y-3 text-xs">
            <div className="flex items-center gap-2 text-[#8F543E] font-medium">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>Backend connection error: {error}</span>
            </div>
            <p className="text-[#8F543E]/80 pl-6 leading-relaxed">
              Real processing mode requires an active backend server. You can retry the connection or switch to Demo Mode.
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
                <span>Retry connection</span>
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
        ) : recentInspections.length > 0 ? (
          <div className="divide-y divide-[#E8E5DC] bg-white rounded-xl border border-[#E8E5DC] shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
            {recentInspections.map((job) => {
              const cracksCount = job.findings.filter((f) => f.type === 'potential_crack').length;
              return (
                <div
                  key={job.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#F8F7F2]/60 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-[#343832]">{job.name}</span>
                      <StatusBadge status={job.status} size="sm" />
                      {job.isDemoMode && (
                        <span className="text-[10px] font-mono text-[#777D73] bg-[#F8F7F2] px-1.5 py-0.2 rounded border border-[#E8E5DC]">
                          Demo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#777D73]">
                      <span>{job.surfaceType}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-[#9BA297]" />
                        {formatDate(job.createdAt)}
                      </span>
                      {job.status === 'completed' && (
                        <>
                          <span>•</span>
                          <span className={cracksCount > 0 ? 'text-[#8F543E] font-medium' : 'text-[#777D73]'}>
                            {cracksCount} {cracksCount === 1 ? 'crack flagged' : 'cracks flagged'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Link
                      to={job.status === 'processing' ? `/inspections/${job.id}/progress` : `/inspections/${job.id}`}
                    >
                      <Button variant="secondary" size="sm">
                        {job.status === 'completed' ? 'View 3D surface' : 'View status'}
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 px-6 text-center bg-white rounded-xl border border-[#E8E5DC] space-y-3">
            <div className="w-10 h-10 rounded-full bg-[#F0EFE8] flex items-center justify-center text-[#777D73] mx-auto">
              <Box className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[#343832]">No inspections yet</p>
              <p className="text-xs text-[#777D73] max-w-sm mx-auto">
                Upload your first stereo image pair to begin inspecting physical surfaces in three dimensions.
              </p>
            </div>
            <Link to="/new" className="inline-block pt-2">
              <Button variant="primary" size="sm" icon={<Plus className="w-3.5 h-3.5" />}>
                Start your first inspection
              </Button>
            </Link>
          </div>
        )}
      </section>
    </div>
  );
};
