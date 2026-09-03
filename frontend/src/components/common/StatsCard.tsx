import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: string;
  color?: 'brand' | 'emerald' | 'amber' | 'rose' | 'purple';
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'brand',
}) => {
  const colorMap = {
    brand: 'text-stone-800 bg-stone-100 border-stone-200',
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    rose: 'text-rose-700 bg-rose-50 border-rose-200',
    purple: 'text-purple-700 bg-purple-50 border-purple-200',
  };

  return (
    <div className="card-cream card-cream-hover p-5 sm:p-6 rounded-2xl relative overflow-hidden group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">{title}</p>
          <p className="text-2xl sm:text-3xl font-bold text-stone-900 mt-1.5 tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-xs text-stone-500 mt-1 flex items-center gap-1">
              {subtitle}
            </p>
          )}
        </div>
        <div className={`p-2.5 rounded-xl border ${colorMap[color]} transition-transform duration-200 group-hover:scale-105`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {trend && (
        <div className="mt-4 pt-3 border-t border-stone-100 flex items-center text-xs text-stone-500">
          <span className="text-emerald-600 font-semibold mr-1.5">{trend}</span>
          <span>vs last period</span>
        </div>
      )}
    </div>
  );
};
