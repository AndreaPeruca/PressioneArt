/**
 * @component InsightChart
 * @description
 * Clinical trend chart built with Recharts.
 *
 * Readability strategy per period:
 *   today / 7d  → raw individual readings (max ~21 pts) — dots visible
 *   30d / all   → daily averages (max 30 pts) — smoother trend line,
 *                 smaller dots, "media" badge in header
 *
 * Reference line labels are removed from the chart area to avoid overlap;
 * the ESC/ESH dot-legend above the chart is the single source of truth.
 */

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
  Dot,
} from 'recharts';
import { classifyBP } from '../db/database';
import type { BPCategory, ChartDataPoint, InsightChartProps, PeriodFilter } from '../types';

// ─── ESC/ESH reference lines (no inline labels) ───────────────────────────────

interface RefLine { y: number; color: string; dash: string; opacity: number }

const SYSTOLIC_REFS: RefLine[] = [
  { y: 120, color: '#10b981', dash: '4 3', opacity: 0.45 },  // normal upper boundary
  { y: 130, color: '#f59e0b', dash: '4 3', opacity: 0.45 },  // high-normal start
  { y: 135, color: '#f97316', dash: '4 3', opacity: 0.45 },  // HBPM Grade 1 (135, not 140)
  { y: 150, color: '#ef4444', dash: '4 3', opacity: 0.45 },  // HBPM Grade 2
  { y: 180, color: '#b91c1c', dash: '4 3', opacity: 0.55 },  // HBPM Grade 3 boundary
];

const DIASTOLIC_REFS: RefLine[] = [
  { y: 80,  color: '#10b981', dash: '2 5', opacity: 0.25 },
  { y: 85,  color: '#f59e0b', dash: '2 5', opacity: 0.25 },
  { y: 90,  color: '#f97316', dash: '2 5', opacity: 0.25 },
  { y: 100, color: '#ef4444', dash: '2 5', opacity: 0.25 },
];

// ─── Color maps ───────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<BPCategory, string> = {
  optimal:       '#10b981',
  normal:        '#34d399',
  'high-normal': '#f59e0b',
  grade1:        '#f97316',
  grade2:        '#ef4444',
  grade3:        '#b91c1c',
};

const CATEGORY_LABELS: Record<BPCategory, string> = {
  optimal:       'Ottimale',
  normal:        'Normale',
  'high-normal': 'Normale-Alta',
  grade1:        'Grado 1',
  grade2:        'Grado 2',
  grade3:        'Grado 3',
};

// ─── Daily aggregation ────────────────────────────────────────────────────────

function aggregateByDay(points: ChartDataPoint[]): ChartDataPoint[] {
  const map = new Map<string, ChartDataPoint[]>();

  for (const p of points) {
    const d   = new Date(p.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // "YYYY-MM-DD"
    const bucket = map.get(key) ?? [];
    bucket.push(p);
    map.set(key, bucket);
  }

  const result: ChartDataPoint[] = [];
  for (const [, bucket] of map.entries()) {
    const n   = bucket.length;
    const sys = Math.round(bucket.reduce((s, p) => s + p.systolic,  0) / n);
    const dia = Math.round(bucket.reduce((s, p) => s + p.diastolic, 0) / n);
    const hr  = Math.round(bucket.reduce((s, p) => s + p.heartRate, 0) / n);
    const d   = new Date(bucket[0].timestamp);
    const displayLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    result.push({
      label:     displayLabel,
      timestamp: bucket[0].timestamp, // first reading of the day
      systolic:  sys,
      diastolic: dia,
      heartRate: hr,
      category:  classifyBP(sys, dia),
    });
  }
  return result; // already in map insertion order (chronological)
}

/** True when period should show aggregated daily averages */
function isAggregated(period: PeriodFilter): boolean {
  return period === '30d' || period === 'all';
}

// ─── Custom Dot ───────────────────────────────────────────────────────────────

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: ChartDataPoint;
  r?: number;
  strokeWidth?: number;
}

function makeDot(outerR: number, innerR: number) {
  const DotComp: React.FC<CustomDotProps> = ({ cx, cy, payload }) => {
    if (cx == null || cy == null || !payload) return null;
    const color = CATEGORY_COLORS[payload.category];
    return (
      <Dot
        cx={cx} cy={cy}
        r={outerR}
        fill={color}
        stroke="#0f172a"
        strokeWidth={innerR}
      />
    );
  };
  return DotComp;
}

const SystolicDotRaw  = makeDot(5, 2);
const DiastolicDotRaw = makeDot(4, 1.5);
const SystolicDotAgg  = makeDot(4, 1.5);
const DiastolicDotAgg = makeDot(3, 1);

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

interface TooltipPayloadEntry {
  name: string;
  value: number;
  payload: ChartDataPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  aggregated?: boolean;
}

const CustomTooltip: React.FC<CustomTooltipProps> = ({
  active, payload, label, aggregated,
}) => {
  if (!active || !payload?.length) return null;

  const point         = payload[0].payload as ChartDataPoint;
  const categoryColor = CATEGORY_COLORS[point.category];
  const categoryLabel = CATEGORY_LABELS[point.category];

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-xl text-sm min-w-[170px]">
      <p className="text-slate-400 text-xs mb-2">
        {label}
        {aggregated && (
          <span className="ml-1.5 text-slate-600 font-normal">(media giornaliera)</span>
        )}
      </p>
      <p className="text-rose-400 font-bold">
        Sistolica: <span className="text-white">{point.systolic} mmHg</span>
      </p>
      <p className="text-indigo-400 font-bold">
        Diastolica: <span className="text-white">{point.diastolic} mmHg</span>
      </p>
      <p className="text-slate-400">
        FC: <span className="text-white">{point.heartRate} bpm</span>
      </p>
      <div className="mt-2 pt-2 border-t border-slate-700">
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ color: categoryColor, backgroundColor: `${categoryColor}20` }}
        >
          {categoryLabel}
        </span>
      </div>
    </div>
  );
};

// ─── Empty State ──────────────────────────────────────────────────────────────

const EmptyState: React.FC = () => (
  <div className="h-52 flex flex-col items-center justify-center gap-3 text-slate-500">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
    <p className="text-sm text-center leading-relaxed">
      Nessun dato ancora.<br />Aggiungi la prima misurazione!
    </p>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const InsightChart: React.FC<InsightChartProps> = ({ data, period }) => {
  const aggregated = isAggregated(period);

  const displayData = useMemo(
    () => (aggregated ? aggregateByDay(data) : data),
    [data, aggregated],
  );

  // X-axis: show fewer ticks when many points
  const xInterval = displayData.length > 20
    ? Math.floor(displayData.length / 8)
    : displayData.length > 10
      ? 2
      : 0; // 0 = show all

  const SysDot  = aggregated ? SystolicDotAgg  : SystolicDotRaw;
  const DiaDot  = aggregated ? DiastolicDotAgg : DiastolicDotRaw;
  const sysWidth = aggregated ? 2 : 2.5;

  if (data.length === 0) {
    return (
      <section
        className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700"
        aria-label="Grafico pressione – nessun dato"
      >
        <h2 className="text-lg font-bold text-white mb-3">Trend clinico</h2>
        <EmptyState />
      </section>
    );
  }

  return (
    <section
      className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700"
      aria-label="Grafico trend pressione arteriosa"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-white">Trend clinico</h2>
        <div className="flex items-center gap-2">
          {aggregated && (
            <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">
              media/giorno
            </span>
          )}
          <span className="text-xs text-slate-500">
            {displayData.length} {aggregated ? 'giorni' : 'misurazioni'}
          </span>
        </div>
      </div>

      {/* ESC/ESH zone legend — horizontal scrollable on mobile */}
      <div className="flex gap-x-4 gap-y-1 flex-wrap mb-4">
        {/* HBPM thresholds — ESC/ESH 2023, home monitoring (lower than office BP) */}
        {[
          { color: '#10b981', label: '< 120/70 Ottimale' },
          { color: '#f59e0b', label: '≥ 130/80 Normale-Alta' },
          { color: '#f97316', label: '≥ 135/85 Grado 1 (HBPM)' },
          { color: '#ef4444', label: '≥ 150/95 Grado 2+' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            <span className="text-xs text-slate-400">{label}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <LineChart
          data={displayData}
          margin={{ top: 6, right: 6, left: -24, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

          <XAxis
            dataKey="label"
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={xInterval}
          />

          <YAxis
            domain={[(dataMin: number) => Math.max(40, Math.floor(dataMin / 10) * 10 - 10), (dataMax: number) => Math.max(200, Math.ceil(dataMax / 10) * 10 + 10)]}
            tick={{ fill: '#64748b', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickCount={7}
          />

          <Tooltip
            content={<CustomTooltip aggregated={aggregated} />}
            cursor={{ stroke: '#334155', strokeWidth: 1 }}
          />

          <Legend
            wrapperStyle={{ fontSize: '12px', color: '#94a3b8', paddingTop: '8px' }}
            formatter={(value) => value === 'systolic' ? 'Sistolica' : 'Diastolica'}
          />

          {/* ESC/ESH systolic reference lines (no inline labels) */}
          {SYSTOLIC_REFS.map((ref) => (
            <ReferenceLine
              key={`sys-${ref.y}`}
              y={ref.y}
              stroke={ref.color}
              strokeDasharray={ref.dash}
              strokeOpacity={ref.opacity}
              strokeWidth={1}
            />
          ))}

          {/* ESC/ESH diastolic reference lines */}
          {DIASTOLIC_REFS.map((ref) => (
            <ReferenceLine
              key={`dia-${ref.y}`}
              y={ref.y}
              stroke={ref.color}
              strokeDasharray={ref.dash}
              strokeOpacity={ref.opacity}
              strokeWidth={1}
            />
          ))}

          {/* Systolic line */}
          <Line
            type="monotone"
            dataKey="systolic"
            stroke="#f43f5e"
            strokeWidth={sysWidth}
            dot={<SysDot />}
            activeDot={{ r: 7, fill: '#f43f5e', stroke: '#0f172a', strokeWidth: 2 }}
            connectNulls={false}
          />

          {/* Diastolic line */}
          <Line
            type="monotone"
            dataKey="diastolic"
            stroke="#6366f1"
            strokeWidth={aggregated ? 1.5 : 2}
            dot={<DiaDot />}
            activeDot={{ r: 6, fill: '#6366f1', stroke: '#0f172a', strokeWidth: 2 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
};

export default InsightChart;
