/**
 * @component StatsCard
 * @description
 * Period statistics summary for the selected time window.
 * Shows: avg systolic/diastolic/HR, min/max systolic, category distribution.
 * Inputs are raw `BPMeasurement[]` already filtered by the parent.
 */

import React, { useMemo } from 'react';
import { classifyBP } from '../db/database';
import type { BPCategory, BPMeasurement } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatsCardProps {
  measurements: BPMeasurement[];
  periodLabel: string;
}

interface Stats {
  avgSystolic: number;
  avgDiastolic: number;
  avgHR: number;
  minSystolic: number;
  maxSystolic: number;
  minDiastolic: number;
  maxDiastolic: number;
  pulsePressure: number;       // sys − dia
  map: number;                 // dia + PP/3
  morningSurge: number | null; // morning avg sys − evening avg sys (null = insufficient data)
  uniqueDays: number;
  dominantCategory: BPCategory;
  categoryCount: Record<BPCategory, number>;
}

// ─── Category Config ──────────────────────────────────────────────────────────

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

const CATEGORY_ORDER: BPCategory[] = [
  'optimal', 'normal', 'high-normal', 'grade1', 'grade2', 'grade3',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round(n: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function computeStats(measurements: BPMeasurement[]): Stats {
  const n = measurements.length;

  const sumSys = measurements.reduce((a, m) => a + m.systolic, 0);
  const sumDia = measurements.reduce((a, m) => a + m.diastolic, 0);
  const sumHR  = measurements.reduce((a, m) => a + m.heartRate, 0);

  const avgSys = round(sumSys / n);
  const avgDia = round(sumDia / n);
  const pp     = avgSys - avgDia;
  const map    = round(avgDia + pp / 3);

  // Morning surge: compare morning (5–11h) vs evening (17–23h) average systolic
  const morningM = measurements.filter((m) => { const h = new Date(m.timestamp).getHours(); return h >= 5 && h < 12; });
  const eveningM = measurements.filter((m) => { const h = new Date(m.timestamp).getHours(); return h >= 17 && h < 24; });
  let morningSurge: number | null = null;
  if (morningM.length >= 1 && eveningM.length >= 1) {
    const morningAvg = morningM.reduce((a, m) => a + m.systolic, 0) / morningM.length;
    const eveningAvg = eveningM.reduce((a, m) => a + m.systolic, 0) / eveningM.length;
    morningSurge = round(morningAvg - eveningAvg);
  }

  // Count unique calendar days
  const uniqueDays = new Set(measurements.map((m) => {
    const d = new Date(m.timestamp);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  })).size;

  const categoryCount = CATEGORY_ORDER.reduce(
    (acc, cat) => ({ ...acc, [cat]: 0 }),
    {} as Record<BPCategory, number>,
  );
  for (const m of measurements) categoryCount[m.category]++;

  // ESC/ESH classifies the patient on their overall mean, not the most frequent category
  const dominantCategory = classifyBP(avgSys, avgDia);

  return {
    avgSystolic:    avgSys,
    avgDiastolic:   avgDia,
    avgHR:          round(sumHR / n),
    minSystolic:    Math.min(...measurements.map((m) => m.systolic)),
    maxSystolic:    Math.max(...measurements.map((m) => m.systolic)),
    minDiastolic:   Math.min(...measurements.map((m) => m.diastolic)),
    maxDiastolic:   Math.max(...measurements.map((m) => m.diastolic)),
    pulsePressure:  pp,
    map,
    morningSurge,
    uniqueDays,
    dominantCategory,
    categoryCount,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatCellProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

const StatCell: React.FC<StatCellProps> = ({ label, value, sub, color }) => (
  <div className="flex flex-col items-center gap-0.5 py-3 px-2">
    <span
      className="text-2xl font-black tabular-nums"
      style={color ? { color } : undefined}
    >
      {value}
    </span>
    {sub && <span className="text-xs text-slate-500">{sub}</span>}
    <span className="text-xs text-slate-400 font-medium mt-0.5">{label}</span>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const StatsCard: React.FC<StatsCardProps> = ({ measurements, periodLabel }) => {
  const stats = useMemo(() => computeStats(measurements), [measurements]);

  const domColor  = CATEGORY_COLORS[stats.dominantCategory];
  const domLabel  = CATEGORY_LABELS[stats.dominantCategory];
  const totalMeas = measurements.length;

  // Category distribution bar (sorted by severity)
  const distItems = CATEGORY_ORDER
    .filter((cat) => stats.categoryCount[cat] > 0)
    .map((cat) => ({
      cat,
      count: stats.categoryCount[cat],
      pct: Math.round((stats.categoryCount[cat] / totalMeas) * 100),
      color: CATEGORY_COLORS[cat],
      label: CATEGORY_LABELS[cat],
    }));

  return (
    <section
      className="bg-slate-800/50 rounded-2xl border border-slate-700 overflow-hidden"
      aria-labelledby="stats-heading"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <h2 id="stats-heading" className="text-base font-bold text-white">
          Statistiche
        </h2>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ color: domColor, backgroundColor: `${domColor}20` }}
          >
            {domLabel}
          </span>
          <span className="text-xs text-slate-500">{periodLabel}</span>
        </div>
      </div>

      {/* Main stats grid */}
      <div className="grid grid-cols-3 divide-x divide-slate-700/60 border-t border-slate-700/60">
        <StatCell
          label="Sistolica media"
          value={stats.avgSystolic}
          sub={`${stats.minSystolic}–${stats.maxSystolic} mmHg`}
          color="#f43f5e"
        />
        <StatCell
          label="Diastolica media"
          value={stats.avgDiastolic}
          sub={`${stats.minDiastolic}–${stats.maxDiastolic} mmHg`}
          color="#6366f1"
        />
        <StatCell
          label="FC media"
          value={stats.avgHR}
          sub="bpm"
          color="#94a3b8"
        />
      </div>

      {/* Secondary derived metrics */}
      <div className="grid grid-cols-3 divide-x divide-slate-700/60 border-t border-slate-700/60">
        <StatCell
          label="Press. differenziale"
          value={stats.pulsePressure}
          sub={stats.pulsePressure > 60 ? '⚠ elevata' : 'mmHg'}
          color={stats.pulsePressure > 60 ? '#f59e0b' : '#64748b'}
        />
        <StatCell
          label="PAM media"
          value={stats.map}
          sub="mmHg"
          color="#64748b"
        />
        <StatCell
          label="Surge mattutino"
          value={stats.morningSurge !== null ? (stats.morningSurge > 0 ? `+${stats.morningSurge}` : String(stats.morningSurge)) : '—'}
          sub={stats.morningSurge !== null ? (stats.morningSurge > 20 ? '⚠ elevato' : 'mmHg sys') : 'dati insufficienti'}
          color={stats.morningSurge !== null && stats.morningSurge > 20 ? '#f59e0b' : '#64748b'}
        />
      </div>

      {/* Minimum monitoring days warning */}
      {stats.uniqueDays < 3 && (
        <div className="px-5 py-3 border-t border-slate-700/60 bg-amber-500/5 flex items-start gap-2.5">
          <span className="text-amber-400 text-base flex-shrink-0 mt-0.5" aria-hidden="true">⚠️</span>
          <p className="text-xs text-amber-300 leading-relaxed">
            <strong>Solo {stats.uniqueDays} {stats.uniqueDays === 1 ? 'giorno' : 'giorni'} di dati.</strong>{' '}
            Le linee guida ESC/ESH 2023 raccomandano almeno 7 giorni consecutivi di misurazioni per una diagnosi affidabile.
          </p>
        </div>
      )}

      {/* Category distribution bar */}
      {distItems.length > 1 && (
        <div className="px-5 py-4 border-t border-slate-700/60">
          <p className="text-xs text-slate-500 font-medium mb-2">
            Distribuzione categorie ({totalMeas} misurazioni)
          </p>
          {/* Stacked bar */}
          <div
            className="flex h-2 rounded-full overflow-hidden gap-0.5"
            role="img"
            aria-label="Distribuzione categorie pressione"
          >
            {distItems.map(({ cat, pct, color }) => (
              <div
                key={cat}
                style={{ width: `${pct}%`, backgroundColor: color }}
                title={`${CATEGORY_LABELS[cat]}: ${pct}%`}
              />
            ))}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {distItems.map(({ cat, count, pct, color, label }) => (
              <span key={cat} className="flex items-center gap-1 text-xs text-slate-400">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                {label} {count} ({pct}%)
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default StatsCard;
