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

import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
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

// ─── Extended chart point with SD fields ──────────────────────────────────────

interface AggPoint extends ChartDataPoint {
  sysSd:        number;
  diaSd:        number;
  sysLow:       number;    // systolic - sysSd (band bottom)
  sysBandWidth: number;    // 2 * sysSd (band height, for recharts stacking)
  diaLow:       number;
  diaBandWidth: number;
}

// ─── Daily aggregation ────────────────────────────────────────────────────────

function sd(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.round(Math.sqrt(variance) * 10) / 10;
}

function aggregateByDay(points: ChartDataPoint[]): AggPoint[] {
  const map = new Map<string, ChartDataPoint[]>();

  for (const p of points) {
    const d   = new Date(p.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const bucket = map.get(key) ?? [];
    bucket.push(p);
    map.set(key, bucket);
  }

  const result: AggPoint[] = [];
  for (const [, bucket] of map.entries()) {
    const n      = bucket.length;
    const sys    = Math.round(bucket.reduce((s, p) => s + p.systolic,  0) / n);
    const dia    = Math.round(bucket.reduce((s, p) => s + p.diastolic, 0) / n);
    const hr     = Math.round(bucket.reduce((s, p) => s + p.heartRate, 0) / n);
    const sysSd  = sd(bucket.map((p) => p.systolic),  sys);
    const diaSd  = sd(bucket.map((p) => p.diastolic), dia);
    const d      = new Date(bucket[0].timestamp);
    const displayLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    result.push({
      label:        displayLabel,
      timestamp:    bucket[0].timestamp,
      systolic:     sys,
      diastolic:    dia,
      heartRate:    hr,
      category:     classifyBP(sys, dia),
      sysSd,
      diaSd,
      sysLow:       Math.max(0, sys - sysSd),
      sysBandWidth: 2 * sysSd,
      diaLow:       Math.max(0, dia - diaSd),
      diaBandWidth: 2 * diaSd,
    });
  }
  return result;
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

  const point         = payload[0].payload as AggPoint;
  const categoryColor = CATEGORY_COLORS[point.category];
  const categoryLabel = CATEGORY_LABELS[point.category];

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-xl text-sm min-w-[175px]">
      <p className="text-slate-400 text-xs mb-2">
        {label}
        {aggregated && (
          <span className="ml-1.5 text-slate-600 font-normal">(media giornaliera)</span>
        )}
      </p>
      <p className="text-rose-400 font-bold">
        Sistolica: <span className="text-white">{point.systolic} mmHg</span>
        {aggregated && point.sysSd > 0 && (
          <span className="text-rose-700 font-normal ml-1 text-xs">±{point.sysSd}</span>
        )}
      </p>
      <p className="text-indigo-400 font-bold">
        Diastolica: <span className="text-white">{point.diastolic} mmHg</span>
        {aggregated && point.diaSd > 0 && (
          <span className="text-indigo-700 font-normal ml-1 text-xs">±{point.diaSd}</span>
        )}
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
  const aggregated  = isAggregated(period) || period === 'custom';
  const [showSdBands, setShowSdBands] = useState(true);

  const displayData = useMemo(
    () => (aggregated ? aggregateByDay(data) : data),
    [data, aggregated],
  );

  // Only show SD bands when aggregated and toggle is on
  const sdVisible = aggregated && showSdBands;

  // X-axis: show fewer ticks when many points
  const xInterval = displayData.length > 20
    ? Math.floor(displayData.length / 8)
    : displayData.length > 10
      ? 2
      : 0;

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
            <button
              type="button"
              onClick={() => setShowSdBands((v) => !v)}
              title={showSdBands ? 'Nascondi bande SD' : 'Mostra bande ±1 SD'}
              className={[
                'text-xs px-2 py-0.5 rounded-full border transition-colors',
                showSdBands
                  ? 'bg-slate-700 border-slate-500 text-slate-300'
                  : 'bg-transparent border-slate-700 text-slate-600 hover:border-slate-500 hover:text-slate-400',
              ].join(' ')}
            >
              ±SD
            </button>
          )}
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
        <ComposedChart
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

          {/* ESC/ESH systolic reference lines */}
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

          {/* ±1 SD bands (aggregated only) — stacked areas: transparent base + colored band */}
          {sdVisible && (
            <>
              {/* Systolic band */}
              <Area type="monotone" dataKey="sysLow"       stroke="none" fill="transparent" legendType="none" stackId="sysBand" isAnimationActive={false} />
              <Area type="monotone" dataKey="sysBandWidth" stroke="none" fill="rgba(244,63,94,0.10)" legendType="none" stackId="sysBand" isAnimationActive={false} />
              {/* Diastolic band */}
              <Area type="monotone" dataKey="diaLow"       stroke="none" fill="transparent" legendType="none" stackId="diaBand" isAnimationActive={false} />
              <Area type="monotone" dataKey="diaBandWidth" stroke="none" fill="rgba(99,102,241,0.10)" legendType="none" stackId="diaBand" isAnimationActive={false} />
            </>
          )}

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
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  );
};

export default InsightChart;
