/**
 * @module reportPDF
 * @description
 * Generates a clinical PDF report for the patient's blood-pressure history.
 * Uses @react-pdf/renderer (vector PDF, no screenshots, zero backend).
 *
 * Report structure:
 *   Page 1 – Executive summary
 *     • Header with patient/doctor info and monitoring period
 *     • Key metrics row (avg sys/dia/HR, session count)
 *     • ESC/ESH dominant category badge
 *     • Trend line chart (custom SVG)
 *     • Category distribution bar
 *
 *   Page 2 – Clinical detail
 *     • Morning vs Evening analysis (ESC/ESH recommends both slots)
 *     • Weekly averages table
 *     • Full session history table
 *
 *   Every page – Footer with ESC/ESH reference and privacy disclaimer
 *
 * Dynamic import friendly: call generatePDFBlob() for on-demand generation.
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Line,
  Polyline,
  Rect,
  Circle,
  pdf,
} from '@react-pdf/renderer';
import { classifyBP } from '../db/database';
import type { BPCategory, BPSession } from '../types';

// ─── Colour palette ───────────────────────────────────────────────────────────

const C = {
  headerBg:   '#0f172a',
  accentGreen:'#10b981',
  rose:       '#f43f5e',
  indigo:     '#6366f1',
  amber:      '#f59e0b',
  orange:     '#f97316',
  red:        '#ef4444',
  darkRed:    '#b91c1c',
  white:      '#ffffff',
  slate50:    '#f8fafc',
  slate100:   '#f1f5f9',
  slate200:   '#e2e8f0',
  slate400:   '#94a3b8',
  slate500:   '#64748b',
  slate700:   '#334155',
  slate900:   '#0f172a',
  catColors: {
    optimal:       '#10b981',
    normal:        '#34d399',
    'high-normal': '#f59e0b',
    grade1:        '#f97316',
    grade2:        '#ef4444',
    grade3:        '#b91c1c',
  } as Record<BPCategory, string>,
  catLabels: {
    optimal:       'Ottimale',
    normal:        'Normale',
    'high-normal': 'Normale-Alta',
    grade1:        'Grado 1',
    grade2:        'Grado 2',
    grade3:        'Grado 3',
  } as Record<BPCategory, string>,
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily:      'Helvetica',
    backgroundColor: C.white,
    paddingBottom:   48,
  },

  // ── Header ──
  header: {
    backgroundColor: C.headerBg,
    padding:         '24 28',
  },
  headerTop: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'flex-start',
    marginBottom:    10,
  },
  headerTitle: {
    fontSize:    20,
    fontFamily:  'Helvetica-Bold',
    color:       C.white,
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 9,
    color:    C.slate400,
    marginTop: 3,
  },
  headerBadge: {
    fontSize:        7,
    color:           C.accentGreen,
    borderColor:     C.accentGreen,
    borderWidth:     1,
    borderRadius:    3,
    paddingHorizontal: 5,
    paddingVertical:  2,
    marginTop:       2,
  },
  headerMeta: {
    flexDirection: 'row',
    gap:           20,
    marginTop:     10,
  },
  headerMetaItem: {
    flexDirection: 'column',
  },
  headerMetaLabel: {
    fontSize: 7,
    color:    C.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerMetaValue: {
    fontSize:   9,
    color:      C.slate200,
    marginTop:  1,
  },

  // ── Body ──
  body: {
    padding: '16 28',
  },

  // ── Section ──
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize:       8,
    fontFamily:     'Helvetica-Bold',
    color:          C.slate500,
    textTransform:  'uppercase',
    letterSpacing:  0.8,
    marginBottom:   6,
    borderBottomColor: C.slate200,
    borderBottomWidth: 1,
    paddingBottom:  3,
  },

  // ── Metric cards ──
  metricsRow: {
    flexDirection: 'row',
    gap:           8,
    marginBottom:  14,
  },
  metricCard: {
    flex:              1,
    backgroundColor:   C.slate50,
    borderRadius:      6,
    padding:           10,
    borderColor:       C.slate200,
    borderWidth:       1,
    alignItems:        'center',
  },
  metricValue: {
    fontSize:    18,
    fontFamily:  'Helvetica-Bold',
    marginBottom: 2,
  },
  metricSub: {
    fontSize: 7,
    color:    C.slate500,
  },
  metricLabel: {
    fontSize:  7,
    color:     C.slate500,
    marginTop: 3,
    textAlign: 'center',
  },

  // ── Category badge ──
  categoryRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    marginBottom:   14,
    padding:        10,
    borderRadius:   6,
    borderWidth:    1,
  },
  categoryDot: {
    width:        10,
    height:       10,
    borderRadius: 5,
  },
  categoryLabel: {
    fontSize:   11,
    fontFamily: 'Helvetica-Bold',
  },
  categoryDesc: {
    fontSize: 8,
    color:    C.slate500,
    marginTop: 2,
    flexShrink: 1,
  },

  // ── Table ──
  table: {
    borderColor:   C.slate200,
    borderWidth:   1,
    borderRadius:  5,
    overflow:      'hidden',
  },
  tableHeader: {
    flexDirection:   'row',
    backgroundColor: C.slate100,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection:    'row',
    paddingVertical:  5,
    paddingHorizontal: 8,
    borderTopColor:   C.slate200,
    borderTopWidth:   1,
  },
  tableRowAlt: {
    backgroundColor: C.slate50,
  },
  tableCell: {
    fontSize: 7.5,
    color:    C.slate700,
  },
  tableCellHeader: {
    fontSize:   7,
    fontFamily: 'Helvetica-Bold',
    color:      C.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  // ── Morning/Evening split ──
  splitRow: {
    flexDirection: 'row',
    gap:           8,
  },
  splitCard: {
    flex:            1,
    backgroundColor: C.slate50,
    borderRadius:    6,
    padding:         10,
    borderColor:     C.slate200,
    borderWidth:     1,
  },
  splitTitle: {
    fontSize:   8,
    fontFamily: 'Helvetica-Bold',
    color:      C.slate700,
    marginBottom: 6,
  },
  splitValue: {
    fontSize:   14,
    fontFamily: 'Helvetica-Bold',
  },
  splitSub: {
    fontSize: 7,
    color:    C.slate500,
    marginTop: 1,
  },

  // ── Clinical interpretation box ──
  clinicalBox: {
    borderRadius:   6,
    borderWidth:    1.5,
    padding:        '10 14',
    marginBottom:   12,
    flexDirection:  'row',
    alignItems:     'center',
    gap:            16,
  },
  clinicalStatus: {
    fontSize:   15,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: -0.3,
  },
  clinicalLabel: {
    fontSize:   7,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom:  2,
  },
  clinicalSub: {
    fontSize: 7.5,
    color:    C.slate500,
    marginTop: 2,
  },
  clinicalMetaRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 6,
  },
  clinicalMetaItem: {
    flexDirection: 'column',
  },
  clinicalMetaLabel: {
    fontSize: 6.5,
    color:    C.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  clinicalMetaValue: {
    fontSize:   9,
    fontFamily: 'Helvetica-Bold',
    color:      C.slate700,
    marginTop:  1,
  },

  // ── Advanced metrics table ──
  advRow: {
    flexDirection:  'row',
    gap:            6,
    marginBottom:   6,
  },
  advCell: {
    flex:            1,
    backgroundColor: C.slate50,
    borderRadius:    5,
    borderColor:     C.slate200,
    borderWidth:     1,
    padding:         '6 8',
  },
  advCellLabel: {
    fontSize:  6.5,
    color:     C.slate500,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  advCellValue: {
    fontSize:   11,
    fontFamily: 'Helvetica-Bold',
    color:      C.slate700,
    marginTop:  2,
  },
  advCellSub: {
    fontSize: 6.5,
    color:    C.slate500,
    marginTop: 1,
  },

  // ── Footer ──
  footer: {
    position:   'absolute',
    bottom:     0,
    left:       0,
    right:      0,
    padding:    '8 28',
    borderTopColor: C.slate200,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems:    'center',
  },
  footerText: {
    fontSize: 6.5,
    color:    C.slate400,
  },
  footerBold: {
    fontSize:   6.5,
    fontFamily: 'Helvetica-Bold',
    color:      C.slate500,
  },
});

// ─── Statistics helpers ───────────────────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
}
function minOf(arr: number[]): number { return arr.length ? Math.min(...arr) : 0; }
function maxOf(arr: number[]): number { return arr.length ? Math.max(...arr) : 0; }

/** Sample standard deviation, rounded to 1 decimal */
function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / (arr.length - 1);
  return Math.round(Math.sqrt(variance) * 10) / 10;
}

/** Unique calendar-day strings for a set of sessions */
function uniqueDaySet(ss: BPSession[]): Set<string> {
  return new Set(ss.map(s => {
    const d = new Date(s.timestamp);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }));
}

interface Stats {
  avgSys: number; minSys: number; maxSys: number; sdSys: number;
  avgDia: number; minDia: number; maxDia: number; sdDia: number;
  avgHR:  number;
  pulsePressure: number;   // avgSys − avgDia
  map: number;             // avgDia + PP/3
  bpLoad: number;          // % sessions above 135/85 (either)
  morningSurge: number | null;  // morning avg sys − evening avg sys
  morningDays: number;     // unique days with 6–10h session
  eveningDays: number;     // unique days with 18–23h session
  totalDays: number;       // unique calendar days total
  arrhythmiaCount: number; // sessions with irregular heartbeat flag
  crisisCount: number;     // sessions with sys>=180 || dia>=120
  dominant: BPCategory;
  catCounts: Record<BPCategory, number>;
}

const ALL_CATS: BPCategory[] = ['optimal','normal','high-normal','grade1','grade2','grade3'];

function computeStats(sessions: BPSession[]): Stats {
  const cats: Record<BPCategory, number> = {
    optimal: 0, normal: 0, 'high-normal': 0, grade1: 0, grade2: 0, grade3: 0,
  };
  for (const s of sessions) cats[s.category]++;

  const sysList = sessions.map(s => s.systolic);
  const diaList = sessions.map(s => s.diastolic);
  const avgSys  = avg(sysList);
  const avgDia  = avg(diaList);
  const pp      = avgSys - avgDia;

  const morningS = sessions.filter(s => { const h = new Date(s.timestamp).getHours(); return h >= 6 && h < 10; });
  const eveningS = sessions.filter(s => { const h = new Date(s.timestamp).getHours(); return h >= 18 && h < 23; });
  const morningSurge = morningS.length >= 1 && eveningS.length >= 1
    ? avg(morningS.map(s => s.systolic)) - avg(eveningS.map(s => s.systolic))
    : null;

  const arrhythmiaCount = sessions.filter(s =>
    s.officialReadings.some(r => r.hasIrregularHeartbeat) ||
    s.warmupReading?.hasIrregularHeartbeat,
  ).length;

  const crisisCount = sessions.filter(s => s.systolic >= 180 || s.diastolic >= 120).length;

  // BP Load: % of sessions exceeding the HBPM threshold (135 sys OR 85 dia)
  const aboveThreshold = sessions.filter(s => s.systolic >= 135 || s.diastolic >= 85).length;
  const bpLoad = sessions.length ? Math.round((aboveThreshold / sessions.length) * 100) : 0;

  return {
    avgSys,
    minSys:   minOf(sysList),
    maxSys:   maxOf(sysList),
    sdSys:    stdDev(sysList),
    avgDia,
    minDia:   minOf(diaList),
    maxDia:   maxOf(diaList),
    sdDia:    stdDev(diaList),
    avgHR:    avg(sessions.map(s => s.heartRate)),
    pulsePressure: pp,
    map:      Math.round(avgDia + pp / 3),
    bpLoad,
    morningSurge,
    morningDays: uniqueDaySet(morningS).size,
    eveningDays: uniqueDaySet(eveningS).size,
    totalDays:   uniqueDaySet(sessions).size,
    arrhythmiaCount,
    crisisCount,
    dominant:  classifyBP(avgSys, avgDia),
    catCounts: cats,
  };
}

/** Group sessions by ISO week string (YYYY-Www) */
function groupByWeek(sessions: BPSession[]): { week: string; label: string; sessions: BPSession[] }[] {
  const map = new Map<string, BPSession[]>();
  for (const s of sessions) {
    const d = new Date(s.timestamp);
    // ISO week: simple approach using locale week
    const monday = new Date(d);
    const day = d.getDay() === 0 ? 7 : d.getDay();
    monday.setDate(d.getDate() - day + 1);
    const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    const arr = map.get(key) ?? [];
    arr.push(s);
    map.set(key, arr);
  }
  return Array.from(map.entries())
    .map(([key, ss]) => {
      const [, mm, dd] = key.split('-');
      return { week: key, label: `Sett. dal ${dd}/${mm}`, sessions: ss };
    })
    .slice(-8); // last 8 weeks
}

// ─── Trend Chart (custom SVG) ─────────────────────────────────────────────────

const CHART_W    = 500;
const CHART_H    = 160;
const PAD_TOP    = 10;
const PAD_BTM    = 28;
const PAD_LEFT   = 34;
const PAD_RIGHT  = 10;
const BP_MIN     = 50;

function makeBpToY(bpMax: number) {
  return (mmHg: number) => {
    const ratio = (mmHg - BP_MIN) / (bpMax - BP_MIN);
    return CHART_H - PAD_BTM - ratio * (CHART_H - PAD_TOP - PAD_BTM);
  };
}

function idxToX(i: number, n: number): number {
  return PAD_LEFT + (i / Math.max(n - 1, 1)) * (CHART_W - PAD_LEFT - PAD_RIGHT);
}

// ESC/ESH 2023 HBPM reference lines (corrected from office thresholds)
const REF_LINES = [
  { y: 120, color: '#10b981' },
  { y: 130, color: '#f59e0b' },
  { y: 135, color: '#f97316' },  // HBPM Grade 1 (not 140!)
  { y: 150, color: '#ef4444' },  // HBPM Grade 2
  { y: 180, color: '#b91c1c' },  // HBPM Grade 3 boundary
];

interface TrendChartProps { sessions: BPSession[] }

const TrendChart: React.FC<TrendChartProps> = ({ sessions }) => {
  if (sessions.length < 2) {
    return (
      <View style={{ padding: '12 0' }}>
        <Text style={{ fontSize: 8, color: '#64748b', textAlign: 'center' }}>
          Sono necessarie almeno 2 sessioni per visualizzare il grafico di andamento.
        </Text>
      </View>
    );
  }
  const n = sessions.length;

  // Dynamic Y ceiling: always at least 200, extends if data exceeds it
  const maxSys  = Math.max(...sessions.map(s => s.systolic));
  const bpMax   = Math.max(200, Math.ceil(maxSys / 20) * 20 + 20);
  const bpToY   = makeBpToY(bpMax);

  const sysPoints  = sessions.map((s, i) => `${idxToX(i, n)},${bpToY(s.systolic)}`).join(' ');
  const diaPoints  = sessions.map((s, i) => `${idxToX(i, n)},${bpToY(s.diastolic)}`).join(' ');

  // X-axis labels: show at most 8 evenly distributed
  const labelStep = Math.max(1, Math.floor(n / 7));
  const xLabels   = sessions
    .filter((_, i) => i % labelStep === 0 || i === n - 1)
    .map((s) => {
      const idx = sessions.indexOf(s);
      const x   = idxToX(idx, n);
      const label = new Date(s.timestamp).toLocaleDateString('it-IT', {
        day: '2-digit', month: '2-digit',
      });
      return { x, label };
    });

  // Y-axis ticks up to bpMax
  const yTicks: number[] = [];
  for (let bp = 60; bp <= bpMax; bp += 20) yTicks.push(bp);

  return (
    <Svg width={CHART_W} height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
      {/* Background */}
      <Rect x={0} y={0} width={CHART_W} height={CHART_H} fill={C.slate50} rx={4} />

      {/* Y-axis grid + labels */}
      {yTicks.map(bp => {
        const y = bpToY(bp);
        return (
          <React.Fragment key={bp}>
            <Line x1={PAD_LEFT} y1={y} x2={CHART_W - PAD_RIGHT} y2={y}
              stroke={C.slate200} strokeWidth={0.5} />
          </React.Fragment>
        );
      })}

      {/* ESC/ESH reference lines */}
      {REF_LINES.map(ref => (
        <Line key={ref.y}
          x1={PAD_LEFT} y1={bpToY(ref.y)} x2={CHART_W - PAD_RIGHT} y2={bpToY(ref.y)}
          stroke={ref.color} strokeWidth={1} strokeDasharray="4 3"
        />
      ))}

      {/* Diastolic line */}
      <Polyline points={diaPoints} stroke={C.indigo} strokeWidth={1.5} fill="none" />

      {/* Systolic line */}
      <Polyline points={sysPoints} stroke={C.rose} strokeWidth={2} fill="none" />

      {/* Dots */}
      {sessions.map((s, i) => (
        <React.Fragment key={i}>
          <Circle cx={idxToX(i, n)} cy={bpToY(s.systolic)} r={3}
            fill={C.catColors[s.category]} stroke={C.white} strokeWidth={1} />
          <Circle cx={idxToX(i, n)} cy={bpToY(s.diastolic)} r={2}
            fill={C.catColors[s.category]} fillOpacity={0.7} stroke={C.white} strokeWidth={0.5} />
        </React.Fragment>
      ))}

      {/* X-axis labels */}
      {xLabels.map(({ x, label }, i) => (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <Text key={i} {...{ x, y: CHART_H - 8, fontSize: 6, fill: C.slate500, textAnchor: 'middle' } as any}>
          {label}
        </Text>
      ))}

      {/* Y-axis labels */}
      {yTicks.filter(bp => bp >= 80).map(bp => (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <Text key={bp} {...{ x: PAD_LEFT - 4, y: bpToY(bp) + 2, fontSize: 6, fill: C.slate500, textAnchor: 'end' } as any}>
          {bp}
        </Text>
      ))}

      {/* Chart legend */}
      <Circle cx={CHART_W - 80} cy={6} r={3} fill={C.rose} />
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Text {...{ x: CHART_W - 75, y: 9, fontSize: 6.5, fill: C.slate700 } as any}>Sistolica</Text>
      <Circle cx={CHART_W - 35} cy={6} r={3} fill={C.indigo} />
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Text {...{ x: CHART_W - 30, y: 9, fontSize: 6.5, fill: C.slate700 } as any}>Diastolica</Text>
    </Svg>
  );
};

// ─── Category Distribution Bar ────────────────────────────────────────────────

const DistributionBar: React.FC<{ stats: Stats; total: number }> = ({ stats, total }) => {
  const items = ALL_CATS
    .filter(c => stats.catCounts[c] > 0)
    .map(c => ({
      cat: c,
      pct: (stats.catCounts[c] / total) * 100,
      color: C.catColors[c],
      label: C.catLabels[c],
      count: stats.catCounts[c],
    }));

  let offset = 0;
  return (
    <View>
      {/* Stacked bar */}
      <Svg width={500} height={14} viewBox="0 0 500 14">
        <Rect x={0} y={0} width={500} height={14} fill={C.slate200} rx={4} />
        {items.map(({ pct, color }) => {
          const w = (pct / 100) * 500;
          const x = offset;
          offset += w;
          return <Rect key={color} x={x} y={0} width={w} height={14} fill={color} />;
        })}
      </Svg>
      {/* Legend */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 }}>
        {items.map(({ cat, label, count, pct, color }) => (
          <View key={cat} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
            <Text style={{ fontSize: 6.5, color: C.slate500 as string }}>
              {label}: {count} ({Math.round(pct)}%)
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// ─── Footer ───────────────────────────────────────────────────────────────────

const Footer: React.FC = () => (
  <View style={s.footer} fixed>
    <Text style={s.footerText}>
      ESC/ESH 2023 HBPM — Ottimale: &lt;120/70 | Normale: 120-129/70-79 | Norm-Alta: 130-134/80-84 | Grado 1: 135-149/85-94 | Grado 2: 150-179/95-109 | Grado 3: &gt;=180/&gt;=110
    </Text>
    <Text style={s.footerBold}>Pressione PWA · Dati locali, zero cloud</Text>
  </View>
);

// ─── PDF Document ─────────────────────────────────────────────────────────────

export interface ReportOptions {
  sessions:      BPSession[];
  periodLabel:   string;
  patientName?:  string;
  doctorName?:   string;
  generatedAt?:  Date;
}

const C_SLATE_600 = '#475569';

const ReportDocument: React.FC<ReportOptions> = ({
  sessions,
  periodLabel,
  patientName,
  doctorName,
  generatedAt = new Date(),
}) => {
  if (sessions.length === 0) return <Document><Page size="A4" style={s.page}><Text>Nessun dato.</Text></Page></Document>;

  const stats    = computeStats(sessions);
  const weeks    = groupByWeek(sessions);
  // ESC/ESH 2023: morning window = within 1h of waking, before medication/breakfast (6–10h)
  // Evening window = before bedtime (18–22h)
  const morning  = sessions.filter(s => { const h = new Date(s.timestamp).getHours(); return h >= 6 && h < 10; });
  const evening  = sessions.filter(s => { const h = new Date(s.timestamp).getHours(); return h >= 18 && h < 23; });
  const domColor = C.catColors[stats.dominant];
  const domLabel = C.catLabels[stats.dominant];

  // Sessions for table — all of them, sorted oldest first
  const tableSessions = [...sessions].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <Document
      title="Rapporto Pressione Arteriosa"
      author="Pressione PWA"
      subject="Monitoraggio Domiciliare — ESC/ESH 2023"
    >
      {/* ═══════════════════ PAGE 1 ═══════════════════ */}
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerTop}>
            <View>
              <Text style={s.headerTitle}>Rapporto Pressione Arteriosa</Text>
              <Text style={s.headerSubtitle}>Monitoraggio Domiciliare · Protocollo ESC/ESH 2023</Text>
            </View>
            <Text style={s.headerBadge}>HBPM Report</Text>
          </View>
          <View style={s.headerMeta}>
            {patientName && (
              <View style={s.headerMetaItem}>
                <Text style={s.headerMetaLabel}>Paziente</Text>
                <Text style={s.headerMetaValue}>{patientName}</Text>
              </View>
            )}
            {doctorName && (
              <View style={s.headerMetaItem}>
                <Text style={s.headerMetaLabel}>Medico di riferimento</Text>
                <Text style={s.headerMetaValue}>Dr. {doctorName}</Text>
              </View>
            )}
            <View style={s.headerMetaItem}>
              <Text style={s.headerMetaLabel}>Periodo analizzato</Text>
              <Text style={s.headerMetaValue}>{periodLabel}</Text>
            </View>
            <View style={s.headerMetaItem}>
              <Text style={s.headerMetaLabel}>Sessioni totali</Text>
              <Text style={s.headerMetaValue}>{sessions.length}</Text>
            </View>
            <View style={s.headerMetaItem}>
              <Text style={s.headerMetaLabel}>Generato il</Text>
              <Text style={s.headerMetaValue}>
                {generatedAt.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' })}
              </Text>
            </View>
          </View>
        </View>

        <View style={s.body}>

          {/* ── Clinical interpretation box ── */}
          {(() => {
            const isInsufficient = stats.totalDays < 3;
            const isControlled   = !isInsufficient && stats.avgSys < 135 && stats.avgDia < 85;
            const boxColor = isInsufficient ? C.slate400 : isControlled ? C.accentGreen : C.rose;
            const statusText = isInsufficient
              ? 'DATI INSUFFICIENTI'
              : isControlled ? 'PRESSIONE CONTROLLATA' : 'PRESSIONE NON CONTROLLATA';
            const alerts = [];
            if (stats.crisisCount > 0)     alerts.push(`${stats.crisisCount} episod${stats.crisisCount === 1 ? 'io' : 'i'} crisi ipertensiva (>=180/120)`);
            if (stats.arrhythmiaCount > 0) alerts.push(`${stats.arrhythmiaCount} sessioni con battito irregolare`);
            return (
              <View style={[s.clinicalBox, { borderColor: boxColor, backgroundColor: `${boxColor}0F` }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.clinicalLabel, { color: boxColor }]}>
                    Sintesi clinica HBPM ESC/ESH 2023
                  </Text>
                  <Text style={[s.clinicalStatus, { color: boxColor }]}>{statusText}</Text>
                  {isInsufficient
                    ? <Text style={s.clinicalSub}>Solo {stats.totalDays} giorni di dati — servono almeno 3 per una valutazione (ideale: 7)</Text>
                    : <Text style={s.clinicalSub}>
                        Media {stats.avgSys}/{stats.avgDia} mmHg (soglia HBPM: 135/85) · {stats.totalDays} giorni · {sessions.length} sessioni
                      </Text>
                  }
                  {alerts.length > 0 && (
                    <Text style={[s.clinicalSub, { color: C.amber, marginTop: 3 }]}>
                      Attenzione: {alerts.join(' — ')}
                    </Text>
                  )}
                </View>
                <View style={s.clinicalMetaRow}>
                  <View style={s.clinicalMetaItem}>
                    <Text style={s.clinicalMetaLabel}>BP Load</Text>
                    <Text style={[s.clinicalMetaValue, { color: stats.bpLoad > 25 ? C.rose : C.accentGreen }]}>
                      {stats.bpLoad}%
                    </Text>
                  </View>
                  <View style={s.clinicalMetaItem}>
                    <Text style={s.clinicalMetaLabel}>Giorni</Text>
                    <Text style={s.clinicalMetaValue}>{stats.totalDays}</Text>
                  </View>
                  <View style={s.clinicalMetaItem}>
                    <Text style={s.clinicalMetaLabel}>SD Sys</Text>
                    <Text style={[s.clinicalMetaValue, { color: stats.sdSys > 10 ? C.amber : C.slate700 }]}>
                      {stats.sdSys}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })()}

          {/* Key metrics */}
          <View style={s.metricsRow}>
            <View style={s.metricCard}>
              <Text style={[s.metricValue, { color: C.rose }]}>{stats.avgSys}</Text>
              <Text style={s.metricSub}>{stats.minSys}–{stats.maxSys} mmHg</Text>
              <Text style={s.metricLabel}>Sistolica media</Text>
            </View>
            <View style={s.metricCard}>
              <Text style={[s.metricValue, { color: C.indigo }]}>{stats.avgDia}</Text>
              <Text style={s.metricSub}>{stats.minDia}–{stats.maxDia} mmHg</Text>
              <Text style={s.metricLabel}>Diastolica media</Text>
            </View>
            <View style={s.metricCard}>
              <Text style={[s.metricValue, { color: C_SLATE_600 }]}>{stats.avgHR}</Text>
              <Text style={s.metricSub}>bpm</Text>
              <Text style={s.metricLabel}>Frequenza cardiaca media</Text>
            </View>
            <View style={s.metricCard}>
              <Text style={[s.metricValue, { color: stats.bpLoad > 25 ? C.rose : C.accentGreen }]}>{stats.bpLoad}%</Text>
              <Text style={s.metricSub}>letture oltre 135/85</Text>
              <Text style={s.metricLabel}>BP Load (soglia HBPM)</Text>
            </View>
          </View>

          {/* Dominant category */}
          <View style={[s.categoryRow, { borderColor: domColor, backgroundColor: `${domColor}12` }]}>
            <View style={[s.categoryDot, { backgroundColor: domColor }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.categoryLabel, { color: domColor }]}>
                Categoria prevalente: {domLabel}
              </Text>
              <Text style={s.categoryDesc}>
                {stats.dominant === 'optimal'
                  ? 'Eccellente. Continuare con lo stile di vita attuale.'
                  : stats.dominant === 'normal'
                  ? 'Nella norma. Mantenere lo stile di vita e continuare il monitoraggio.'
                  : stats.dominant === 'high-normal'
                  ? 'Pressione normale-alta. Si consiglia di discuterne con il medico curante.'
                  : stats.dominant === 'grade1'
                  ? 'Ipertensione di Grado 1. Consultare il medico per valutare un intervento terapeutico.'
                  : stats.dominant === 'grade2'
                  ? 'Ipertensione di Grado 2. Consultare il medico urgentemente.'
                  : 'Ipertensione di Grado 3. Contattare il medico immediatamente.'}
              </Text>
            </View>
          </View>

          {/* Trend chart */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Andamento nel tempo (media per sessione)</Text>
            <TrendChart sessions={[...sessions].sort((a, b) => a.timestamp - b.timestamp)} />
          </View>

          {/* Distribution */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Distribuzione categorie ESC/ESH</Text>
            <DistributionBar stats={stats} total={sessions.length} />
          </View>

        </View>

        <Footer />
      </Page>

      {/* ═══════════════════ PAGE 2 ═══════════════════ */}
      <Page size="A4" style={s.page}>

        <View style={[s.header, { paddingVertical: 14 }]}>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.white }}>
            Dettaglio clinico
          </Text>
          <Text style={s.headerSubtitle}>
            {patientName ? `${patientName} · ` : ''}{periodLabel}
          </Text>
        </View>

        <View style={s.body}>

          {/* ── Advanced clinical metrics ── */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Metriche cliniche avanzate</Text>
            <View style={s.advRow}>
              <View style={s.advCell}>
                <Text style={s.advCellLabel}>BP Load sistolica</Text>
                <Text style={[s.advCellValue, { color: stats.bpLoad > 25 ? C.rose : C.accentGreen }]}>
                  {stats.bpLoad}%
                </Text>
                <Text style={s.advCellSub}>sessioni sopra 135 mmHg — normale: &lt;25%</Text>
              </View>
              <View style={s.advCell}>
                <Text style={s.advCellLabel}>Variabilita sistolica (SD)</Text>
                <Text style={[s.advCellValue, { color: stats.sdSys > 10 ? C.amber : C.slate700 }]}>
                  {stats.sdSys} mmHg
                </Text>
                <Text style={s.advCellSub}>fattore di rischio CV indipendente se &gt;10</Text>
              </View>
              <View style={s.advCell}>
                <Text style={s.advCellLabel}>Variabilita diastolica (SD)</Text>
                <Text style={[s.advCellValue, { color: stats.sdDia > 8 ? C.amber : C.slate700 }]}>
                  {stats.sdDia} mmHg
                </Text>
                <Text style={s.advCellSub}>normale: &lt;8 mmHg</Text>
              </View>
            </View>
            <View style={s.advRow}>
              <View style={s.advCell}>
                <Text style={s.advCellLabel}>Pressione differenziale (PP)</Text>
                <Text style={[s.advCellValue, { color: stats.pulsePressure > 60 ? C.amber : C.slate700 }]}>
                  {stats.pulsePressure} mmHg
                </Text>
                <Text style={s.advCellSub}>marker rigidita arteriosa se &gt;60</Text>
              </View>
              <View style={s.advCell}>
                <Text style={s.advCellLabel}>Pressione arteriosa media (PAM)</Text>
                <Text style={s.advCellValue}>{stats.map} mmHg</Text>
                <Text style={s.advCellSub}>perfusione organi — normale: &lt;100</Text>
              </View>
              <View style={s.advCell}>
                <Text style={s.advCellLabel}>Surge mattutino</Text>
                <Text style={[s.advCellValue, { color: stats.morningSurge !== null && stats.morningSurge > 15 ? C.amber : C.slate700 }]}>
                  {stats.morningSurge !== null ? `${stats.morningSurge > 0 ? '+' : ''}${stats.morningSurge} mmHg` : 'N/D'}
                </Text>
                <Text style={s.advCellSub}>mattina vs sera — rischio eventi se &gt;15</Text>
              </View>
            </View>
            <View style={s.advRow}>
              <View style={s.advCell}>
                <Text style={s.advCellLabel}>Aderenza protocollo mattina</Text>
                <Text style={[s.advCellValue, { color: stats.morningDays >= 7 ? C.accentGreen : stats.morningDays >= 3 ? C.amber : C.rose }]}>
                  {stats.morningDays} giorni
                </Text>
                <Text style={s.advCellSub}>sessioni 06:00–10:00 — ideale: 7</Text>
              </View>
              <View style={s.advCell}>
                <Text style={s.advCellLabel}>Aderenza protocollo sera</Text>
                <Text style={[s.advCellValue, { color: stats.eveningDays >= 7 ? C.accentGreen : stats.eveningDays >= 3 ? C.amber : C.rose }]}>
                  {stats.eveningDays} giorni
                </Text>
                <Text style={s.advCellSub}>sessioni 18:00–23:00 — ideale: 7</Text>
              </View>
              {(stats.arrhythmiaCount > 0 || stats.crisisCount > 0) ? (
                <View style={[s.advCell, { borderColor: C.amber, backgroundColor: `${C.amber}10` }]}>
                  <Text style={[s.advCellLabel, { color: C.amber }]}>Segnalazioni</Text>
                  {stats.crisisCount > 0 && (
                    <Text style={[s.advCellValue, { fontSize: 8, color: C.rose }]}>
                      {stats.crisisCount} crisi ipertensiv{stats.crisisCount === 1 ? 'a' : 'e'}
                    </Text>
                  )}
                  {stats.arrhythmiaCount > 0 && (
                    <Text style={[s.advCellValue, { fontSize: 8, color: C.amber }]}>
                      {stats.arrhythmiaCount} battiti irregolari
                    </Text>
                  )}
                </View>
              ) : (
                <View style={s.advCell}>
                  <Text style={s.advCellLabel}>Segnalazioni</Text>
                  <Text style={[s.advCellValue, { color: C.accentGreen, fontSize: 9 }]}>Nessuna</Text>
                  <Text style={s.advCellSub}>nessuna crisi o aritmia rilevata</Text>
                </View>
              )}
            </View>
          </View>

          {/* Morning vs Evening */}
          {(morning.length > 0 || evening.length > 0) && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Analisi mattina vs sera (ESC/ESH raccomanda entrambe le finestre)</Text>
              <View style={s.splitRow}>
                {morning.length > 0 && (
                  <View style={s.splitCard}>
                    <Text style={s.splitTitle}>Mattina  (06:00–10:00, ESC/ESH)</Text>
                    <Text style={[s.splitValue, { color: C.rose }]}>
                      {avg(morning.map(s => s.systolic))}/{avg(morning.map(s => s.diastolic))}
                    </Text>
                    <Text style={s.splitSub}>mmHg media · FC {avg(morning.map(s => s.heartRate))} bpm</Text>
                    <Text style={[s.splitSub, { marginTop: 3 }]}>
                      {morning.length} sessioni · Cat. {C.catLabels[classifyBP(
                        avg(morning.map(s => s.systolic)),
                        avg(morning.map(s => s.diastolic)),
                      )]}
                    </Text>
                  </View>
                )}
                {evening.length > 0 && (
                  <View style={s.splitCard}>
                    <Text style={s.splitTitle}>Sera  (18:00–23:00, ESC/ESH)</Text>
                    <Text style={[s.splitValue, { color: C.indigo }]}>
                      {avg(evening.map(s => s.systolic))}/{avg(evening.map(s => s.diastolic))}
                    </Text>
                    <Text style={s.splitSub}>mmHg media · FC {avg(evening.map(s => s.heartRate))} bpm</Text>
                    <Text style={[s.splitSub, { marginTop: 3 }]}>
                      {evening.length} sessioni · Cat. {C.catLabels[classifyBP(
                        avg(evening.map(s => s.systolic)),
                        avg(evening.map(s => s.diastolic)),
                      )]}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* Weekly averages */}
          {weeks.length >= 2 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Medie settimanali</Text>
              <View style={s.table}>
                <View style={s.tableHeader}>
                  {['Settimana', 'Sistolica', 'Diastolica', 'FC', 'Sessioni', 'Categoria'].map(h => (
                    <Text key={h} style={[s.tableCellHeader, { flex: h === 'Settimana' ? 2 : 1 }]}>{h}</Text>
                  ))}
                </View>
                {weeks.map(({ label, sessions: ws }, i) => {
                  const aSys = avg(ws.map(s => s.systolic));
                  const aDia = avg(ws.map(s => s.diastolic));
                  const aHR  = avg(ws.map(s => s.heartRate));
                  const cat  = classifyBP(aSys, aDia);
                  return (
                    <View key={label} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                      <Text style={[s.tableCell, { flex: 2 }]}>{label}</Text>
                      <Text style={[s.tableCell, { flex: 1, color: C.rose }]}>{aSys}</Text>
                      <Text style={[s.tableCell, { flex: 1, color: C.indigo }]}>{aDia}</Text>
                      <Text style={[s.tableCell, { flex: 1 }]}>{aHR}</Text>
                      <Text style={[s.tableCell, { flex: 1 }]}>{ws.length}</Text>
                      <Text style={[s.tableCell, { flex: 1, color: C.catColors[cat] }]}>
                        {C.catLabels[cat]}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Session history */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              Registro sessioni ({tableSessions.length} totali · prima scartata per protocollo)
            </Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                {['Data e ora', 'Sistolica', 'Diastolica', 'FC', 'Letture', 'Cat.', 'Tag'].map(h => (
                  <Text key={h} style={[s.tableCellHeader, {
                    flex: h === 'Data e ora' ? 2.2 : h === 'Tag' ? 2 : 1,
                  }]}>{h}</Text>
                ))}
              </View>
              {tableSessions.slice(0, 60).map((s2, i) => {
                const dt = new Date(s2.timestamp);
                const dateStr = dt.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })
                  + ' ' + dt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
                const tagParts = s2.device === 'wrist' ? ['polso', ...s2.tags] : [...s2.tags];
                const tagStr = tagParts.length > 3
                  ? tagParts.slice(0, 3).join(', ') + ` +${tagParts.length - 3}`
                  : tagParts.join(', ');
                const isMulti = s2.readingCount >= 2 && !!s2.warmupReading;
                return (
                  <View key={s2.sessionId} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                    <Text style={[s.tableCell, { flex: 2.2 }]}>{dateStr}</Text>
                    <Text style={[s.tableCell, { flex: 1, color: C.rose, fontFamily: 'Helvetica-Bold' }]}>
                      {s2.systolic}
                    </Text>
                    <Text style={[s.tableCell, { flex: 1, color: C.indigo, fontFamily: 'Helvetica-Bold' }]}>
                      {s2.diastolic}
                    </Text>
                    <Text style={[s.tableCell, { flex: 1 }]}>{s2.heartRate}</Text>
                    <Text style={[s.tableCell, { flex: 1, color: isMulti ? C.accentGreen : C_SLATE_600 }]}>
                      {isMulti ? `×${s2.readingCount + 1}` : '×1'}
                    </Text>
                    <Text style={[s.tableCell, { flex: 1, color: C.catColors[s2.category] }]}>
                      {C.catLabels[s2.category]}
                    </Text>
                    <Text style={[s.tableCell, { flex: 2, color: C_SLATE_600 }]}>{tagStr}</Text>
                  </View>
                );
              })}
              {tableSessions.length > 60 && (
                <View style={[s.tableRow, { justifyContent: 'center' }]}>
                  <Text style={[s.tableCell, { color: C.slate500, textAlign: 'center' }]}>
                    ... e altre {tableSessions.length - 60} sessioni non mostrate
                  </Text>
                </View>
              )}
            </View>
          </View>

        </View>

        <Footer />
      </Page>
    </Document>
  );
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a PDF Blob from session data.
 * Use dynamic import to call this lazily and keep the main bundle lean.
 */
export async function generatePDFBlob(options: ReportOptions): Promise<Blob> {
  const element = React.createElement(ReportDocument, options);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instance = pdf(element as any);
  return instance.toBlob();
}
