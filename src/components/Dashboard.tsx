/**
 * @component Dashboard
 * @description
 * Main entry point for the Pressione PWA.
 * Displays session-based data (ESC/ESH HBPM protocol).
 */

import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePressureStore, selectLatestSession } from '../store/usePressureStore';
import SessionForm from './SessionForm';
import InsightChart from './InsightChart';
import PrivacyWidget from './PrivacyWidget';
import StatsCard from './StatsCard';
import ImportModal from './ImportModal';
import CalendarReminderModal from './CalendarReminderModal';

// Lazy-loaded: @react-pdf/renderer is ~1.5 MB — defer until the user opens the modal
const ReportModal = lazy(() => import('./ReportModal'));
import { generateDemoData } from '../utils/demoData';
import { exportSessionsCSV } from '../utils/csvExport';
import { exportBackupJSON, parseBackupJSON } from '../utils/jsonBackup';
import { isHypertensiveCrisis } from '../db/database';
import type {
  BPCategory,
  BPSession,
  ImportRow,
  MeasurementDevice,
  MeasurementTag,
  PeriodFilter,
  SessionPayload,
} from '../types';

// ─── Tag config (used in edit form) ──────────────────────────────────────────

const ALL_TAGS: { value: MeasurementTag; label: string; emoji: string; symptom: boolean }[] = [
  { value: 'stress',             label: 'Stress',           emoji: '😤', symptom: false },
  { value: 'caffeine',           label: 'Caffè',            emoji: '☕', symptom: false },
  { value: 'work',               label: 'Lavoro',           emoji: '💼', symptom: false },
  { value: 'post-sport',         label: 'Post-Sport',       emoji: '🏃', symptom: false },
  { value: 'rest',               label: 'Riposo',           emoji: '🛋️', symptom: false },
  { value: 'medication',         label: 'Farmaco',          emoji: '💊', symptom: false },
  { value: 'headache',           label: 'Mal di testa',     emoji: '🤕', symptom: true  },
  { value: 'dizziness',          label: 'Vertigini',        emoji: '😵', symptom: true  },
  { value: 'chest-pain',         label: 'Dolore al petto',  emoji: '💔', symptom: true  },
  { value: 'visual-disturbance', label: 'Visione offuscata',emoji: '👁️', symptom: true  },
  { value: 'palpitations',       label: 'Palpitazioni',     emoji: '💓', symptom: true  },
];

// ─── Period config ────────────────────────────────────────────────────────────

const PERIODS: { key: PeriodFilter; label: string }[] = [
  { key: 'today',  label: 'Oggi' },
  { key: '7d',     label: '7 giorni' },
  { key: '30d',    label: '30 giorni' },
  { key: 'all',    label: 'Tutto' },
  { key: 'custom', label: 'Intervallo' },
];

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  today:  'Oggi',
  '7d':   'Ultimi 7 giorni',
  '30d':  'Ultimi 30 giorni',
  all:    'Storico completo',
  custom: 'Intervallo personalizzato',
};

function getPeriodCutoff(period: PeriodFilter, customFrom?: number): number {
  const now = Date.now();
  switch (period) {
    case 'today':  { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }
    case '7d':     return now - 7  * 24 * 60 * 60 * 1000;
    case '30d':    return now - 30 * 24 * 60 * 60 * 1000;
    case 'all':    return 0;
    case 'custom': return customFrom ?? 0;
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

// ─── Control status (ESC/ESH 2023 HBPM) ──────────────────────────────────────
// "Controlled" home BP: mean systolic <135 AND diastolic <85 over ≥3 unique days
// in the last 7 calendar days (minimum evidence threshold before ESH considers
// the assessment valid; ideally ≥7 days but 3 is the practical minimum).

type ControlStatus =
  | { status: 'controlled';   avgSys: number; avgDia: number; days: number; sessionCount: number }
  | { status: 'uncontrolled'; avgSys: number; avgDia: number; days: number; sessionCount: number }
  | { status: 'insufficient'; days: number; sessionCount: number };

function computeControlStatus(sessions: BPSession[]): ControlStatus {
  const cutoff7d = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent   = sessions.filter((s) => s.timestamp >= cutoff7d);

  const daySet = new Set(
    recent.map((s) => {
      const d = new Date(s.timestamp);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    }),
  );
  const days         = daySet.size;
  const sessionCount = recent.length;

  if (days < 3) return { status: 'insufficient', days, sessionCount };

  const avgSys = Math.round(recent.reduce((sum, s) => sum + s.systolic,  0) / recent.length);
  const avgDia = Math.round(recent.reduce((sum, s) => sum + s.diastolic, 0) / recent.length);

  return {
    status: avgSys < 135 && avgDia < 85 ? 'controlled' : 'uncontrolled',
    avgSys, avgDia, days, sessionCount,
  };
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
          {session.device === 'wrist' && (
            <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
              Polso
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
  onEdit:   (id: string, meta: { tags: MeasurementTag[]; note?: string; device?: MeasurementDevice }) => Promise<void>;
}> = ({ session, onDelete, onEdit }) => {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTags, setEditTags]           = useState<MeasurementTag[]>([]);
  const [editNote, setEditNote]           = useState('');
  const [editDevice, setEditDevice]       = useState<MeasurementDevice>('arm');
  const [isSavingEdit, setIsSavingEdit]   = useState(false);

  const meta        = CATEGORY_META[session.category];
  const time        = new Date(session.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const hasMultiple = (session.readingCount >= 2) && !!session.warmupReading;

  const startEdit = () => {
    setEditTags([...session.tags]);
    setEditNote(session.note ?? '');
    setEditDevice(session.device ?? 'arm');
    setIsEditing(true);
    setExpanded(false);
  };

  const cancelEdit = () => setIsEditing(false);

  const saveEdit = async () => {
    setIsSavingEdit(true);
    try {
      await onEdit(session.sessionId, {
        tags:   editTags,
        note:   editNote.trim() || undefined,
        device: editDevice,
      });
      setIsEditing(false);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const toggleEditTag = (tag: MeasurementTag) =>
    setEditTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);

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
            {hasMultiple && <span className="text-slate-600 font-normal text-xs ml-2">media ×{session.readingCount}</span>}
            {session.device === 'wrist' && <span className="text-amber-500 font-normal text-xs ml-2">· polso</span>}
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

        {/* Expand button — only for multi-reading sessions, hidden in edit mode */}
        {hasMultiple && !isEditing && (
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

        {/* Action buttons */}
        {!isEditing && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {/* Edit */}
            <button
              type="button"
              onClick={startEdit}
              aria-label={`Modifica sessione delle ${time}`}
              className="text-slate-600 hover:text-emerald-400 transition-colors p-1 focus:outline-none"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            {/* Delete */}
            <button
              type="button"
              onClick={() => onDelete(session.sessionId)}
              aria-label={`Cancella sessione delle ${time}`}
              className="text-slate-600 hover:text-rose-400 transition-colors p-1 focus:outline-none"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
                <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Edit panel */}
      <AnimatePresence>
        {isEditing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="pb-3 pl-5 pr-1 flex flex-col gap-3">
              {/* Device */}
              <div className="flex gap-2">
                {(['arm', 'wrist'] as MeasurementDevice[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setEditDevice(d)}
                    className={[
                      'flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all',
                      editDevice === d
                        ? d === 'wrist'
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-700/60 border-slate-600 text-slate-400',
                    ].join(' ')}
                  >
                    {d === 'arm' ? 'Braccio' : 'Polso'}
                  </button>
                ))}
              </div>
              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {ALL_TAGS.map(({ value, label, emoji, symptom }) => {
                  const active = editTags.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleEditTag(value)}
                      className={[
                        'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-all',
                        active
                          ? symptom
                            ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                            : 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : 'bg-slate-700/60 border-slate-600 text-slate-400',
                      ].join(' ')}
                    >
                      <span aria-hidden="true">{emoji}</span>{label}
                    </button>
                  );
                })}
              </div>
              {/* Note */}
              <textarea
                rows={2}
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Nota (opzionale)"
                maxLength={500}
                className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-600 resize-none focus:outline-none transition-colors"
              />
              {/* Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={isSavingEdit}
                  className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-400 text-xs hover:border-slate-400 transition-colors focus:outline-none"
                >
                  Annulla
                </button>
                <motion.button
                  type="button"
                  onClick={saveEdit}
                  disabled={isSavingEdit}
                  whileTap={{ scale: 0.97 }}
                  className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors disabled:opacity-50 focus:outline-none"
                >
                  {isSavingEdit ? 'Salvataggio…' : 'Salva modifiche'}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded readings */}
      <AnimatePresence>
        {expanded && hasMultiple && !isEditing && (
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

const ControlBadge: React.FC<{ status: ControlStatus }> = ({ status }) => {
  const insufficient = status.status === 'insufficient';
  const controlled   = status.status === 'controlled';

  if (insufficient) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-800/40 px-4 py-3.5 flex items-center gap-4">
        {/* Icon */}
        <div className="w-9 h-9 rounded-full bg-slate-700/80 flex items-center justify-center flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pressione controllata · HBPM</p>
          <p className="text-sm font-bold text-slate-400 mt-0.5">Dati insufficienti</p>
          <p className="text-xs text-slate-600 mt-0.5 leading-snug">
            {status.days}/7 giorni · {status.sessionCount} sessioni negli ultimi 7 giorni
            {' '}— servono almeno 3 giorni di misurazioni
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border px-4 py-3.5 flex items-center gap-4 ${
        controlled
          ? 'bg-emerald-500/10 border-emerald-500/35'
          : 'bg-rose-500/10 border-rose-500/35'
      }`}
    >
      {/* Icon */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
        controlled ? 'bg-emerald-500/20' : 'bg-rose-500/20'
      }`}>
        {controlled ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="13" /><circle cx="12" cy="17" r="1" fill="#f43f5e" stroke="none" />
          </svg>
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold uppercase tracking-wider ${
          controlled ? 'text-emerald-500' : 'text-rose-500'
        }`}>
          Pressione controllata · HBPM ESC/ESH 2023
        </p>
        <p className={`text-base font-black mt-0.5 tracking-tight ${
          controlled ? 'text-emerald-300' : 'text-rose-300'
        }`}>
          {controlled ? 'CONTROLLATA' : 'NON CONTROLLATA'}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 leading-snug">
          {'avgSys' in status && `Media ${status.avgSys}/${status.avgDia} mmHg · `}
          {status.days}/7 giorni · {status.sessionCount} sessioni · soglia HBPM: &lt;135/&lt;85
        </p>
      </div>
    </motion.div>
  );
};

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
    clearAll,
    importMeasurements,
    updateSessionMeta,
    clearError,
  } = usePressureStore();

  const latest = usePressureStore(selectLatestSession);

  const [period, setPeriod]                   = useState<PeriodFilter>('7d');
  const [customFrom, setCustomFrom]           = useState('');
  const [customTo, setCustomTo]               = useState('');
  const [isImportOpen, setImportOpen]         = useState(false);
  const [isReportOpen, setReportOpen]         = useState(false);
  const [isCalendarOpen, setCalendarOpen]     = useState(false);
  const [isLoadingDemo, setLoadingDemo]       = useState(false);
  const [showDemoConfirm, setShowDemoConfirm] = useState(false);
  const [crisisDismissed, setCrisisDismissed] = useState(false);
  const [historyOpen, setHistoryOpen]         = useState(true);
  const [tagFilter, setTagFilter]             = useState<MeasurementTag | null>(null);
  const [undoDelete, setUndoDelete]           = useState<{
    session: BPSession;
    timeoutId: ReturnType<typeof setTimeout>;
    remaining: number;
  } | null>(null);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Clean up pending-delete timer on unmount
  useEffect(() => {
    return () => { if (undoDelete) clearTimeout(undoDelete.timeoutId); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Demo loader ──────────────────────────────────────────────────────

  const handleLoadDemo = useCallback(async () => {
    setLoadingDemo(true);
    setShowDemoConfirm(false);
    try {
      const rows = generateDemoData();
      await importMeasurements(rows);
      setPeriod('30d');
    } finally {
      setLoadingDemo(false);
    }
  }, [importMeasurements]);

  const handleLoadDemoFresh = useCallback(async () => {
    setLoadingDemo(true);
    setShowDemoConfirm(false);
    try {
      await clearAll();
      const rows = generateDemoData();
      await importMeasurements(rows);
      setPeriod('30d');
    } finally {
      setLoadingDemo(false);
    }
  }, [clearAll, importMeasurements]);

  // ─── Filtered data ────────────────────────────────────────────────────

  const customFromMs = customFrom ? new Date(customFrom).getTime() : 0;
  const customToMs   = customTo   ? new Date(customTo).getTime() + 86399999 : Date.now(); // end of day
  const cutoff = getPeriodCutoff(period, customFromMs);

  const filteredSessions = useMemo(
    () => sessions.filter((s) => {
      if (s.sessionId === undoDelete?.session.sessionId) return false;
      if (s.timestamp < cutoff) return false;
      if (period === 'custom' && customTo && s.timestamp > customToMs) return false;
      return true;
    }),
    [sessions, cutoff, undoDelete, period, customTo, customToMs],
  );

  const filteredChartData = useMemo(
    () => chartData.filter((p) => {
      if (p.timestamp < cutoff) return false;
      if (period === 'custom' && customTo && p.timestamp > customToMs) return false;
      return true;
    }),
    [chartData, cutoff, period, customTo, customToMs],
  );

  // Tags present in the current period (for the filter chips)
  const availableTags = useMemo(
    () => {
      const set = new Set<MeasurementTag>();
      filteredSessions.forEach((s) => s.tags.forEach((t) => set.add(t)));
      return Array.from(set);
    },
    [filteredSessions],
  );

  const tagFilteredSessions = useMemo(
    () => tagFilter ? filteredSessions.filter((s) => s.tags.includes(tagFilter)) : filteredSessions,
    [filteredSessions, tagFilter],
  );

  const grouped = useMemo(() => groupByDay(tagFilteredSessions), [tagFilteredSessions]);

  // Crisis alert: show only for recent sessions (< 4 hours old) to avoid
  // generating false emergency panic for old, already-managed readings.
  const CRISIS_WINDOW_MS = 4 * 60 * 60 * 1000;
  const showCrisis = !crisisDismissed &&
    latest != null &&
    isHypertensiveCrisis(latest.systolic, latest.diastolic) &&
    Date.now() - latest.timestamp < CRISIS_WINDOW_MS;

  // Control status — always computed from ALL sessions in the last 7 days,
  // independent of the current period filter
  const controlStatus = useMemo(() => computeControlStatus(sessions), [sessions]);

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

  const UNDO_MS = 5000;

  const handleDelete = useCallback(
    (sessionId: string) => {
      const session = sessions.find((s) => s.sessionId === sessionId);
      if (!session) return;

      // If there's already a pending delete, commit it immediately
      if (undoDelete) {
        clearTimeout(undoDelete.timeoutId);
        deleteSession(undoDelete.session.sessionId);
      }

      const timeoutId = setTimeout(() => {
        deleteSession(sessionId);
        setUndoDelete(null);
      }, UNDO_MS);

      setUndoDelete({ session, timeoutId, remaining: UNDO_MS });
    },
    [sessions, undoDelete, deleteSession],
  );

  const handleUndoDelete = useCallback(() => {
    if (!undoDelete) return;
    clearTimeout(undoDelete.timeoutId);
    setUndoDelete(null);
  }, [undoDelete]);

  const handleEdit = useCallback(
    async (sessionId: string, meta: { tags: MeasurementTag[]; note?: string; device?: MeasurementDevice }) => {
      await updateSessionMeta(sessionId, meta);
    },
    [updateSessionMeta],
  );

  const handleImport = useCallback(
    (rows: ImportRow[]) => importMeasurements(rows),
    [importMeasurements],
  );

  const restoreInputRef  = useRef<HTMLInputElement>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const handleRestoreJSON = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (restoreInputRef.current) restoreInputRef.current.value = '';
    if (!file) return;
    setRestoreError(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const content = ev.target?.result;
      if (typeof content !== 'string') return;

      const { rows, errors } = parseBackupJSON(content);
      if (rows.length === 0) {
        setRestoreError(errors[0] ?? 'Nessuna sessione trovata nel backup.');
        return;
      }
      if (errors.length > 0) {
        setRestoreError(`Avvisi durante il ripristino: ${errors.slice(0, 2).join('; ')}`);
      }

      try {
        await importMeasurements(rows);
      } catch (err) {
        setRestoreError(err instanceof Error ? err.message : 'Errore durante il ripristino.');
      }
    };
    reader.readAsText(file, 'utf-8');
  }, [importMeasurements]);

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* App Bar */}
      <header className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur-sm border-b border-slate-800 px-4 py-3">
        <div className="max-w-lg sm:max-w-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <span className="text-2xl" aria-hidden="true">❤️</span>
            <span className="font-black text-lg tracking-tight">Flow</span>
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
              <div className="flex flex-col items-end gap-1">
                <p className="text-xs text-amber-300 font-medium">Hai già dei dati. Come vuoi procedere?</p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleLoadDemo}
                    className="text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-600 px-2 py-1 rounded-lg transition-colors focus:outline-none"
                  >
                    Aggiungi
                  </button>
                  <button
                    type="button"
                    onClick={handleLoadDemoFresh}
                    className="text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 px-2 py-1 rounded-lg transition-colors focus:outline-none"
                  >
                    Svuota e carica
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDemoConfirm(false)}
                    className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg transition-colors focus:outline-none"
                  >
                    Annulla
                  </button>
                </div>
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
                <span className="hidden sm:inline">Demo</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setCalendarOpen(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300 hover:text-indigo-100 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/40 px-3 py-1.5 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Imposta promemoria misurazioni"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span className="hidden sm:inline">Promemoria</span>
            </button>
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
              <span className="hidden sm:inline">PDF</span>
            </button>
            <button
              type="button"
              onClick={() => exportSessionsCSV(sessions)}
              disabled={sessions.length === 0}
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-100 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Esporta dati in CSV"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span className="hidden sm:inline">CSV</span>
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
              <span className="hidden sm:inline">Importa</span>
            </button>
            {/* Backup JSON */}
            <button
              type="button"
              onClick={() => exportBackupJSON(sessions)}
              disabled={sessions.length === 0}
              title="Scarica backup completo in JSON"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Backup dati JSON"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7" />
                <path d="M4 13h16" /><path d="M12 13v8" />
                <path d="M8 17l4 4 4-4" />
              </svg>
              <span className="hidden sm:inline">Backup</span>
            </button>
            {/* Restore JSON */}
            <label
              title="Ripristina backup JSON"
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-xl transition-colors cursor-pointer focus-within:ring-2 focus-within:ring-slate-500"
              aria-label="Ripristina backup JSON"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                <path d="M3 12v1a8 8 0 0 0 8 8h1" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L3 8" />
                <polyline points="3 3 3 8 8 8" />
              </svg>
              <span className="hidden sm:inline">Ripristina</span>
              <input
                ref={restoreInputRef}
                type="file"
                accept=".json"
                className="sr-only"
                onChange={handleRestoreJSON}
                aria-label="Seleziona file di backup JSON"
              />
            </label>
          </div>
        </div>
      </header>

      <main className="max-w-lg sm:max-w-2xl mx-auto px-4 py-5 flex flex-col gap-5">

        <AnimatePresence>
          {error && <ErrorBanner message={error} onDismiss={clearError} />}
        </AnimatePresence>

        <AnimatePresence>
          {restoreError && <ErrorBanner message={restoreError} onDismiss={() => setRestoreError(null)} />}
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

        {/* Undo delete toast */}
        <AnimatePresence>
          {undoDelete && (
            <motion.div
              key="undo-toast"
              role="status"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
            >
              <p className="text-sm text-slate-300">
                Sessione eliminata
                <span className="text-xs text-slate-500 ml-2">
                  ({new Date(undoDelete.session.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })})
                </span>
              </p>
              <button
                type="button"
                onClick={handleUndoDelete}
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 rounded-lg transition-colors focus:outline-none flex-shrink-0"
              >
                Annulla
              </button>
            </motion.div>
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

        {/* Control status badge — always uses last 7 days, independent of period filter */}
        {sessions.length > 0 && <ControlBadge status={controlStatus} />}

        {/* Period filter */}
        <div className="flex flex-col gap-2">
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

          {/* Custom date range pickers */}
          <AnimatePresence>
            {period === 'custom' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="flex gap-2 pt-1">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 block mb-1">Da</label>
                    <input
                      type="date"
                      value={customFrom}
                      max={customTo || new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-colors [color-scheme:dark]"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 block mb-1">A</label>
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-colors [color-scheme:dark]"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
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

        {/* Stats + Chart: side by side on sm+ screens, stacked on mobile */}
        {filteredSessions.length >= 2 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <StatsCard measurements={statsInput as never} periodLabel={PERIOD_LABELS[period]} />
            <InsightChart data={filteredChartData} period={period} />
          </div>
        ) : (
          <InsightChart data={filteredChartData} period={period} />
        )}

        {/* History grouped by day — collapsible */}
        {(grouped.length > 0 || tagFilter) && (
          <section className="bg-slate-800/50 rounded-2xl border border-slate-700" aria-labelledby="history-heading">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 id="history-heading" className="text-base font-bold text-white">Storico sessioni</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  {tagFilter ? `${tagFilteredSessions.length}/${filteredSessions.length}` : filteredSessions.length} sessioni
                </span>
                <button
                  type="button"
                  onClick={() => setHistoryOpen((v) => !v)}
                  aria-expanded={historyOpen}
                  aria-controls="history-list"
                  aria-label={historyOpen ? 'Comprimi storico' : 'Espandi storico'}
                  className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  <motion.svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth={2} strokeLinecap="round"
                    animate={{ rotate: historyOpen ? 0 : 180 }}
                    transition={{ duration: 0.2 }}
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </motion.svg>
                </button>
              </div>
            </div>
            {/* Tag filter chips */}
            {availableTags.length > 0 && (
              <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                {availableTags.map((tag) => {
                  const meta = ALL_TAGS.find((t) => t.value === tag);
                  const active = tagFilter === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTagFilter(active ? null : tag)}
                      className={[
                        'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all',
                        active
                          ? meta?.symptom
                            ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                            : 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                          : 'bg-slate-700/60 border-slate-600 text-slate-400 hover:border-slate-400',
                      ].join(' ')}
                    >
                      {meta && <span aria-hidden="true">{meta.emoji}</span>}
                      {meta?.label ?? tag}
                    </button>
                  );
                })}
              </div>
            )}

            <AnimatePresence initial={false}>
              {historyOpen && (
                <motion.div
                  id="history-list"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-4 flex flex-col gap-4">
                    {tagFilter && tagFilteredSessions.length === 0 && (
                      <p className="text-xs text-slate-500 text-center py-3">
                        Nessuna sessione con il tag selezionato nel periodo corrente.
                      </p>
                    )}
                    {grouped.map(({ dayLabel, items }) => (
                      <div key={dayLabel}>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 capitalize">
                          {dayLabel}
                        </p>
                        <ul role="list">
                          <AnimatePresence initial={false}>
                            {items.map((s) => (
                              <SessionItem key={s.sessionId} session={s} onDelete={handleDelete} onEdit={handleEdit} />
                            ))}
                          </AnimatePresence>
                        </ul>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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

      <CalendarReminderModal
        isOpen={isCalendarOpen}
        onClose={() => setCalendarOpen(false)}
      />

      <Suspense fallback={null}>
        <ReportModal
          isOpen={isReportOpen}
          onClose={() => setReportOpen(false)}
          sessions={filteredSessions}
          periodLabel={PERIOD_LABELS[period]}
        />
      </Suspense>
    </div>
  );
};

export default Dashboard;
