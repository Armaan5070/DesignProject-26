import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  title,
  subtitle,
  action,
}) => {
  return (
    <div
      className={`bg-white rounded-xl border border-[#E8E5DC] shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden ${className}`}
    >
      {(title || subtitle || action) && (
        <div className="px-6 py-4 border-b border-[#E8E5DC] flex items-center justify-between gap-4">
          <div>
            {title && <h3 className="text-sm font-semibold text-[#343832]">{title}</h3>}
            {subtitle && <p className="text-xs text-[#777D73] mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
};
