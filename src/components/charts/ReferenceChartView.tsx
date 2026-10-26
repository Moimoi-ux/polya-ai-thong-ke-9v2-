import React from 'react';
import { ReferenceChart } from '../../shared/types.ts';
import { FreqChart } from './FreqChart.tsx';
import { BarChart3, LineChart } from 'lucide-react';

/** Biểu đồ chỉ để xem, lồng vào thẻ đề bài hoặc các bước của quy trình */
export const ReferenceChartView: React.FC<{ chart: ReferenceChart; compact?: boolean }> = ({ chart, compact = false }) => {
  if (!chart || !chart.categories || chart.categories.length === 0) return null;
  const Icon = chart.kind === 'line' ? LineChart : BarChart3;
  return (
    <div className={`bg-white border border-indigo-100 rounded-xl ${compact ? 'p-2' : 'p-3 md:p-4'} shadow-xs`}>
      {chart.caption && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 mb-1.5">
          <Icon className="w-4 h-4" />
          <span>{chart.caption}</span>
        </div>
      )}
      <div className={`text-center font-bold text-blue-900 ${compact ? 'text-xs' : 'text-sm'} mb-1`}>{chart.title}</div>
      <FreqChart
        kind={chart.kind}
        categories={chart.categories}
        values={chart.values}
        axis={chart.axisConfig}
        xAxisLabel={chart.xAxisLabel}
        yAxisLabel={chart.yAxisLabel}
        compact={compact}
      />
    </div>
  );
};
