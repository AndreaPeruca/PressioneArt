/**
 * @component Dashboard
 * @description
 * Main entry point for the Pressione PWA.
 * Displays session-based data (ESC/ESH HBPM protocol).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePressureStore, selectLatestSession } from '../store/usePressureStore';
import SessionForm from './SessionForm';
import InsightChart from './InsightChart';
import PrivacyWidget from './PrivacyWidget';
import StatsCard from './StatsCard';
import ImportModal from './ImportModal';
import ReportModal from './ReportModal';
import { generateDemoData } from '../utils/demoData';
import { isHypertensiveCrisis } from '../db/database';
import type {
  BPCategory,
  BPSession,
  ImportRow,
  PeriodFilter,
  SessionPayload,
} from '../types';

// ─── Period config ────────────────────────────────────────────────────────────

const PERIODS: { key: PeriodFilter; label: string }[] = [
  { key: 'today', label: 'Oggi' },
  { key: '7d',    label: '7 giorni' },
  { key: '30d',   label: '30 giorni' },
  { key: 'all',   label: 'Tutto' },
];

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  today: 'Oggi',
  '7d':  'Ultimi 7 giorni',
  '30d': 'Ultimi 30 giorni',
  all:   'Storico completo',
};

function getPeriodCutoff(period: PeriodFilter): number {
  const now = Date.now();
  switch (period) {
    case 'today': { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
    case '7d':    return now - 7  * 24 * 60 * 60 * 1000;
    case '30d':   return now - 30 * 24 * 60 * 60 * 1000;
    case 'all':   return 0;
  }
}

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_META: Record<BPCategory, {
  label: string; color: string; bg: string; border: string;
}> = {
  optimal:       { label: 'Ottimale',     color: '#10b981', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  normal:        { label: 'Normale',      color: '#34d399', bg: 'bg-emerald-400/10', border: 'border-emerald-400/30' },
  'high-normal': { label: 'Normale-Alta', color: '#f59e0b', bg: 'bg-amber-500/10',   border: 'border-amber-500/30'   },
  grade1:        { label: 'Grado 1',      color: '#f97316', bg: 'bg-orange-500/10',  border: 'border-orange-500/30'  },
  grade2:        { label: 'Grado 2',      color: '#ef4444', bg: 'bg-rose-500/10',    border: 'border-rose-500/30'    },
  grade3:        { label: 'Grado 3',      color: '#b91c1c', bg: 'bg-red-700/10',     border: 'border-red-700/30'     },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByDay(sessions: BPSession[]): { dayLabel: string; items: BPSession[] }[] {
  const map = new Map<string, BPSession[]>();
  for (const s of sessions) {
    const key = new Date(s.timestamp).toLocaleDateString('it-IT', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });
    const arr = map.get(key) ?? [];
    arr.push(s);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([dayLabel, items]) => ({ dayLabel, items }));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const LatestSessionCard: React.FC<{ session: BPSession }> = ({ session }) => {
  const meta = CATEGORY_META[session.category];
  const date = new Date(session.timestamp).toLocaleString('it-IT', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  const isMultiReading = session.readingCount >= 2 && session.warmupReading;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded-2xl p-5 border ${meta.bg} ${meta.border}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
            Ultima sessione
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{date}</p>
        </div>
        <div className="flex items-center gap-2">
          {isMultiReading && (
            <span className="text-xs text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-full">
              ×{session.readingCount} letture
            </span>
          )}
          <span
            className="text-xs font-bold px-2.5 py-1 rounded-full"
            style={{ color: meta.color, backgroundColor: `${meta.color}20` }}
          >
            {meta.label}
          </span>
        </div>
      </div>

      {/* Mean values */}
      <div className="flex items-end gap-3">
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-black tabular-nums" style={{ color: meta.color }}>
            {session.systolic}
          </span>
          <span className="text-2xl font-bold text-slate-400">/</span>
          <span className="text-3xl font-bold text-slate-300">{session.diastolic}</span>
        </div>
        <div className="pb-1">
          <p className="text-xs text-slate-500 font-medium">mmHg {isMultiReading ? '(media)' : ''}</p>
          <p className="text-sm text-slate-300 font-semibold">
            {session.heartRate}{' '}
            <span className="text-xs text-slate-500 font-normal">bpm</span>
          </p>
        </div>
      </div>

      {/* Tags */}
      {session.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {session.tags.map((t) => (
            <span key={t} className="text-xs bg-slate-700/60 text-slate-300 px-2 py-0.5 rounded-full">{t}</span>
          ))}
        </div>
      )}
    </motion.div>
  );
};

const SessionItem: React.FC<{
  session: BPSession;
  onDelete: (id: string) => void;
}> = ({ session, onDelete }) => {
  const [expanded, setExpanded]           = useState(false);
  const [confirmingDelete, setConfirming] = useState(false);
  const meta = CATEGORY_META[session.category];
  const time = new Date(session.timestamp).toLocaleTimeString('it-IT', {
    hour: '2-digit', minute: '2-digit',
  });
  const hasMultiple = (session.readingCount >= 2) && !!session.warmupReading;

  return (
    <li className="border-b border-slate-700/40 last:border-0">
      {/* Main row */}
      <div className="flex items-center gap-3 py-2.5">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: meta.color }} aria-hidden="true" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white tabular-nums">
            {session.systolic}/{session.diastolic}
            <span className="text-slate-400 font-normal text-xs ml-1">mmHg</span>
            <span className="text-slate-400 font-normal text-xs ml-2">{session.heartRate} bpm</span>
            {hasMultiple && (
              <span className="text-slate-600 font-normal text-xs ml-2">media ×{session.readingCount}</span>
            )}
          </p>
          {session.tags.length > 0 && (
            <p className="text-xs text-slate-500 mt-0.5">{session.tags.join(' · ')}</p>
          )}
        </div>

        <span className="text-xs text-slate-500 flex-shrink-0">{time}</span>

        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 hidden sm:inline-flex"
          style={{ color: meta.color, backgroundColor: `${meta.color}18` }}
        >
          {meta.label}
        </span>

        {/* Expand button (only for multi-reading sessions) */}
        {hasMultiple && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Nascondi letture' : 'Mostra letture'}
            className="text-slate-600 hover:text-slate-300 transition-colors p-1 flex-shrink-0 focus:outline-none"
          >
            <motion.svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2} strokeLinecap="round"
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </motion.svg>
          </button>
        )}

        {confirmingDelete ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => { setConfirming(false); onDelete(session.sessionId); }}
              aria-label="Conferma cancellazione"
              className="text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 px-2 py-0.5 rounded-lg transition-colors focus:outline-none"
            >
              Elimina
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              aria-label="Annulla cancellazione"
              className="text-xs text-slate-400 hover:text-white px-1.5 py-0.5 rounded-lg transition-colors focus:outline-none"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Cancella sessione delle ${time}`}
            className="text-slate-600 hover:text-rose-400 transition-colors p-1 flex-shrink-0 focus:outline-none"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
            </svg>
          </button>
        )}
      </div>

      {/* Expanded readings */}
      <AnimatePresence>
        {expanded && hasMultiple && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pb-3 pl-5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500">
                    <th className="text-left font-medium pb-1">Lettura</th>
                    <th className="text-right font-medium pb-1">Sys</th>
                    <th className="text-right font-medium pb-1">Dia</th>
                    <th className="text-right font-medium pb-1">FC</th>
                  </tr>
                </thead>
                <tbody>
                  {session.warmupReading && (
                    <tr className="opacity-40">
                      <td className="py-0.5 text-amber-400">Riscaldamento</td>
                      <td className="py-0.5 text-right tabular-nums text-white">{session.warmupReading.systolic}</td>
                      <td className="py-0.5 text-right tabular-nums text-white">{session.warmupReading.diastolic}</td>
                      <td className="py-0.5 text-right tabular-nums text-white">{session.warmupReading.heartRate}</td>
                    </tr>
                  )}
                  {session.officialReadings.map((r, i) => (
                    <tr key={i}>
                      <td className="py-0.5 text-emerald-400">Ufficiale {i + 1}</td>
                      <td className="py-0.5 text-right tabular-nums text-white">{r.systolic}</td>
                      <td className="py-0.5 text-right tabular-nums text-white">{r.diastolic}</td>
                      <td className="py-0.5 text-right tabular-nums text-white">{r.heartRate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
};

const ErrorBanner: React.FC<{ message: string; onDismiss: () => void }> = ({
  message, onDismiss,
}) => (
  <motion.div
    role="alert"
    initial={{ opacity: 0, y: -8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    className="bg-rose-500/10 border border-rose-500/40 text-rose-300 rounded-xl px-4 py-3 flex items-center justify-between text-sm"
  >
    <span>{message}</span>
    <button type="button" onClick={onDismiss} className="text-rose-400 hover:text-rose-200 ml-3 flex-shrink-0" aria-label="Chiudi">✕</button>
  </motion.div>
);

const CrisisBanner: React.FC<{ systolic: number; diastolic: number; onDismiss: () => void }> = ({
  systolic, diastolic, onDismiss,
}) => (
  <motion.div
    role="alert"
    aria-live="assertive"
    initial={{ opacity: 0, y: -8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    className="bg-red-600/20 border-2 border-red-500 rounded-2xl px-5 py-4 flex flex-col gap-3"
  >
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="text-2xl flex-shrink-0" aria-hidden="true">🚨</span>
        <div>
          <p className="font-black text-red-300 text-base leading-tight">
            Crisi ipertensiva — {systolic}/{diastolic} mmHg
          </p>
          <p className="text-red-400 text-xs mt-0.5 leading-relaxed">
            Valori ≥180/120 mmHg richiedono valutazione medica urgente.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="text-red-400 hover:text-red-200 flex-shrink-0 p-1 focus:outline-none"
        aria-label="Chiudi avviso"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
    <div className="bg-red-900/30 rounded-xl px-4 py-3 text-xs text-red-300 leading-relaxed">
      <strong>Cosa fare subito:</strong> siediti, non fare sforzi, misura di nuovo tra 5 minuti.
      Se i valori persistono o hai sintomi (dolore al petto, difficoltà respiratorie, visione offuscata),
      chiama il <strong>118</strong> o recati al pronto soccorso.
    </div>
  </motion.div>
);

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard: React.FC = () => {
  const {
    sessions,
    chartData,
    isLoading,
    error,
    fetchSessions,
    addSession,
    deleteSession,
    importMeasurements,
    clearError,
  } = usePressureStore();

  const latest = usePressureStore(selectLatestSession);

  const [period, setPeriod]                   = useState<PeriodFilter>('7d');
  const [isImportOpen, setImportOpen]         = useState(false);
  const [isReportOpen, setReportOpen]         = useState(false);
  const [isLoadingDemo, setLoadingDemo]       = useState(false);
  const [showDemoConfirm, setShowDemoConfirm] = useState(false);
  const [crisisDismissed, setCrisisDismissed] = useState(false);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // ─── Demo loader ──────────────────────────────────────────────────────

  const handleLoadDemo = useCallback(async () => {
    setLoadingDemo(true);
    try {
      const rows = generateDemoData();
      await importMeasurements(rows);
      setPeriod('30d');
    } finally {
      setLoadingDemo(false);
    }
  }, [importMeasurements]);

  // ─── Filtered data ────────────────────────────────────────────────────

  const cutoff = getPeriodCutoff(period);

  const filteredSessions = useMemo(
    () => sessions.filter((s) => s.timestamp >= cutoff),
    [sessions, cutoff],
  );

  const filteredChartData = useMemo(
    () => chartData.filter((p) => p.timestamp >= cutoff),
    [chartData, cutoff],
  );

  const grouped = useMemo(() => groupByDay(filteredSessions), [filteredSessions]);

  // Crisis alert: show only for recent sessions (< 4 hours old) to avoid
  // generating false emergency panic for old, already-managed readings.
  const CRISIS_WINDOW_MS = 4 * 60 * 60 * 1000;
  const showCrisis = !crisisDismissed &&
    latest != null &&
    isHypertensiveCrisis(latest.systolic, latest.diastolic) &&
    Date.now() - latest.timestamp < CRISIS_WINDOW_MS;

  // StatsCard needs BPMeasurement-like objects; adapt from sessions
  const statsInput = useMemo(
    () => filteredSessions.map((s) => ({
      id: undefined,
      timestamp: s.timestamp,
      systolic: s.systolic,
      diastolic: s.diastolic,
      heartRate: s.heartRate,
      tags: s.tags,
      category: s.category,
    })),
    [filteredSessions],
  );

  // ─── Handlers ─────────────────────────────────────────────────────────

  const handleSave = useCallback(
    async (payload: SessionPayload) => {
      await addSession(payload);
      setCrisisDismissed(false);
    },
    [addSession],
  );

  const handleDelete = useCallback(
    (sessionId: string) => deleteSession(sessionId),
    [deleteSession],
  );

  const handleImport = useCallback(
    (rows: ImportRow[]) => importMeasurements(rows),
    [importMeasurements],
  );

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* App Bar */}
      <header className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur-sm border-b border-slate-800 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl" aria-hidden="true">❤️</span>
            <span className="font-black text-lg tracking-tight">Pressione</span>
          </div>
          <div className="flex items-center gap-2">
            {isLoading && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-4 h-4 border-2 border-slate-600 border-t-emerald-500 rounded-full"
                aria-label="Caricamento"
              />
            )}
            {showDemoConfirm ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-amber-300">Carica dati demo?</span>
                <button
                  type="button"
                  onClick={() => { setShowDemoConfirm(false); handleLoadDemo(); }}
                  className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-2 py-1 rounded-lg transition-colors focus:outline-none"
                >
                  Sì
                </button>
                <button
                  type="button"
                  onClick={() => setShowDemoConfirm(false)}
                  className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg transition-colors focus:outline-none"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => sessions.length > 0 ? setShowDemoConfirm(true) : handleLoadDemo()}
                disabled={isLoadingDemo}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-100 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              >
                {isLoadingDemo
                  ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-3 h-3 border-2 border-emerald-700 border-t-emerald-400 rounded-full" aria-hidden="true" />
                  : <span aria-hidden="true">✨</span>
                }
                Demo
              </button>
            )}
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              disabled={filteredSessions.length === 0}
              className="flex items-center gap-1.5 text-xs font-semibold text-rose-300 hover:text-rose-100 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/40 px-3 py-1.5 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Genera report PDF"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              PDF
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Importa
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 flex flex-col gap-5">

        <AnimatePresence>
          {error && <ErrorBanner message={error} onDismiss={clearError} />}
        </AnimatePresence>

        <AnimatePresence>
          {showCrisis && latest && (
            <CrisisBanner
              systolic={latest.systolic}
              diastolic={latest.diastolic}
              onDismiss={() => setCrisisDismissed(true)}
            />
          )}
        </AnimatePresence>

        {/* Latest session hero */}
        <AnimatePresence mode="wait">
          {latest ? (
            <LatestSessionCard key={latest.sessionId} session={latest} />
          ) : (
            <motion.div
              key="empty-hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-2xl border border-slate-700 border-dashed p-6 flex flex-col items-center gap-4 text-center"
            >
              <div>
                <p className="text-slate-300 font-semibold text-base">Nessuna sessione ancora</p>
                <p className="text-slate-500 text-sm mt-1">
                  Inizia una sessione di misurazione qui sotto,<br />
                  oppure carica i dati demo.
                </p>
              </div>
              <motion.button
                type="button"
                onClick={handleLoadDemo}
                disabled={isLoadingDemo}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm font-semibold hover:bg-emerald-500/25 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
              >
                <span aria-hidden="true">✨</span>
                {isLoadingDemo ? 'Caricamento…' : 'Carica 30 giorni di dati demo'}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Period filter */}
        <div className="flex bg-slate-800/60 border border-slate-700 rounded-2xl p-1 gap-1" role="tablist" aria-label="Filtra per periodo">
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={period === key}
              onClick={() => setPeriod(key)}
              className={[
                'flex-1 py-2 rounded-xl text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500',
                period === key ? 'bg-emerald-500 text-white shadow' : 'text-slate-400 hover:text-slate-200',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Empty state for selected period when data exists in other periods */}
        {sessions.length > 0 && filteredSessions.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl border border-slate-700 border-dashed p-5 flex flex-col items-center gap-2 text-center"
          >
            <p className="text-slate-400 text-sm font-medium">
              Nessuna sessione nel periodo "{PERIOD_LABELS[period]}"
            </p>
            <p className="text-slate-600 text-xs">
              Hai {sessions.length} sessioni in altri periodi.{' '}
              <button
                type="button"
                onClick={() => setPeriod('all')}
                className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 focus:outline-none"
              >
                Mostra tutto
              </button>
            </p>
          </motion.div>
        )}

        {/* Stats card */}
        {filteredSessions.length >= 2 && (
          <StatsCard measurements={statsInput as never} periodLabel={PERIOD_LABELS[period]} />
        )}

        {/* Chart */}
        <InsightChart data={filteredChartData} period={period} />

        {/* History grouped by day */}
        {grouped.length > 0 && (
          <section className="bg-slate-800/50 rounded-2xl border border-slate-700" aria-labelledby="history-heading">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 id="history-heading" className="text-base font-bold text-white">Storico sessioni</h2>
              <span className="text-xs text-slate-500">{filteredSessions.length} sessioni</span>
            </div>
            <div className="px-5 pb-4 flex flex-col gap-4">
              {grouped.map(({ dayLabel, items }) => (
                <div key={dayLabel}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 capitalize">
                    {dayLabel}
                  </p>
                  <ul role="list">
                    <AnimatePresence initial={false}>
                      {items.map((s) => (
                        <SessionItem key={s.sessionId} session={s} onDelete={handleDelete} />
                      ))}
                    </AnimatePresence>
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Session form */}
        <SessionForm onSave={handleSave} />

        <PrivacyWidget />
        <div className="h-6" aria-hidden="true" />
      </main>

      <ImportModal
        isOpen={isImportOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />

      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setReportOpen(false)}
        sessions={filteredSessions}
        periodLabel={PERIOD_LABELS[period]}
      />
    </div>
  );
};

export default Dashboard;
