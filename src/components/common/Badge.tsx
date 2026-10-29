import React from 'react';
import type { InspectionStatus, FindingType } from '../../types/inspection';

interface StatusBadgeProps {
  status: InspectionStatus;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const configs: Record<InspectionStatus, { label: string; bg: string; text: string; dot: string; pulse: boolean }> = {
    completed: {
      label: 'Completed',
      bg: 'bg-[#E7EDE4] border-[#D5E0D1]',
      text: 'text-[#3F513D]',
      dot: 'bg-[#5B7358]',
      pulse: false,
    },
    processing: {
      label: 'Processing',
      bg: 'bg-[#F0EFE8] border-[#E8E5DC]',
      text: 'text-[#343832]',
      dot: 'bg-[#9BAE98]',
      pulse: true,
    },
    queued: {
      label: 'Queued',
      bg: 'bg-[#F8F7F2] border-[#E8E5DC]',
      text: 'text-[#777D73]',
      dot: 'bg-[#9BA297]',
      pulse: false,
    },
    failed: {
      label: 'Failed',
      bg: 'bg-[#F9EFEA] border-[#E8C9BD]',
      text: 'text-[#8F543E]',
      dot: 'bg-[#C98F78]',
      pulse: false,
    },
  };

  const config = configs[status] || configs.queued;
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-md border ${config.bg} ${config.text} ${sizeClasses}`}
    >
      <span className="relative flex h-1.5 w-1.5">
        {config.pulse && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.dot} opacity-60`} />
        )}
        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${config.dot}`} />
      </span>
      {config.label}
    </span>
  );
};

interface FindingBadgeProps {
  type: FindingType;
}

export const FindingBadge: React.FC<FindingBadgeProps> = ({ type }) => {
  const configs: Record<FindingType, { label: string; bg: string; text: string }> = {
    potential_crack: {
      label: 'Potential Crack',
      bg: 'bg-[#F9EFEA] border-[#E8C9BD]',
      text: 'text-[#8F543E]',
    },
    surface_irregularity: {
      label: 'Surface Irregularity',
      bg: 'bg-[#E7EDE4] border-[#D5E0D1]',
      text: 'text-[#3F513D]',
    },
    minor_anomaly: {
      label: 'Minor Anomaly',
      bg: 'bg-[#F0EFE8] border-[#E8E5DC]',
      text: 'text-[#777D73]',
    },
  };

  const config = configs[type] || configs.surface_irregularity;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded border ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
};
