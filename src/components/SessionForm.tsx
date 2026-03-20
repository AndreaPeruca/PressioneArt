/**
 * @component SessionForm
 * @description
 * Multi-step measurement session following the ESC/ESH 2023 HBPM protocol:
 *
 *   1. BREATHING  – 120-second guided breathing (skippable)
 *   2. INFO       – Select time-of-day slot, contextual tags, optional note
 *   3. READING 0  – "Misurazione di riscaldamento" (warmup, will be discarded)
 *   4. WAIT 1     – 60-second countdown
 *   5. READING 1  – Official reading #1
 *   6. WAIT 2     – 60-second countdown
 *   7. READING 2  – Official reading #2
 *   8. SUMMARY    – Shows all 3 readings, highlights discarded warmup,
 *                   displays computed session average, confirm save
 *
 * Scientific rationale:
 *   - First reading is discarded: "orienting response" causes a transient
 *     spike regardless of true hypertensive status (ESC/ESH 2023, §4.3).
 *   - 1-minute gap: allows cardiovascular recovery between compressions.
 *   - Average of 2 official readings: reduces measurement variability.
 *   - ESH recommends ≥7-day monitoring for diagnosis confirmation.
 */

import React, { useCallback, useId, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BreathingTimer from './BreathingTimer';
import CountdownTimer from './CountdownTimer';
import type {
  FormFieldError,
  MeasurementArm,
  MeasurementTag,
  RawReading,
  SessionFormProps,
  SessionPayload,
} from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const BREATHING_SECONDS  = 120;
const WAIT_SECONDS       = 60;
const READING_COUNT      = 3; // 1 warmup + 2 official

const CONTEXT_TAGS: { value: MeasurementTag; label: string; emoji: string }[] = [
  { value: 'stress',     label: 'Stress',     emoji: '😤' },
  { value: 'caffeine',   label: 'Caffè',      emoji: '☕' },
  { value: 'work',       label: 'Lavoro',     emoji: '💼' },
  { value: 'post-sport', label: 'Post-Sport', emoji: '🏃' },
  { value: 'rest',       label: 'Riposo',     emoji: '🛋️' },
  { value: 'medication', label: 'Farmaco',    emoji: '💊' },
];

const SYMPTOM_TAGS: { value: MeasurementTag; label: string; emoji: string }[] = [
  { value: 'headache',           label: 'Mal di testa',      emoji: '🤕' },
  { value: 'dizziness',          label: 'Vertigini',         emoji: '😵' },
  { value: 'chest-pain',         label: 'Dolore al petto',   emoji: '💔' },
  { value: 'visual-disturbance', label: 'Visione offuscata', emoji: '👁️' },
  { value: 'palpitations',       label: 'Palpitazioni',      emoji: '💓' },
];

const ARM_OPTIONS: { value: MeasurementArm; label: string }[] = [
  { value: 'left',    label: 'Sinistra' },
  { value: 'right',   label: 'Destra' },
  { value: 'unknown', label: 'Non spec.' },
];

const EMPTY_READING: RawReading = { systolic: '', diastolic: '', heartRate: '' };

// ─── Step type ────────────────────────────────────────────────────────────────

type Step =
  | 'breathing'
  | 'info'
  | 'reading-0'   // warmup
  | 'wait-1'
  | 'reading-1'   // official #1
  | 'wait-2'
  | 'reading-2'   // official #2
  | 'summary';

const STEP_ORDER: Step[] = [
  'breathing', 'info',
  'reading-0', 'wait-1',
  'reading-1', 'wait-2',
  'reading-2', 'summary',
];

function nextStep(current: Step): Step {
  const idx = STEP_ORDER.indexOf(current);
  return STEP_ORDER[Math.min(idx + 1, STEP_ORDER.length - 1)];
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateReading(r: RawReading): FormFieldError {
  const errors: FormFieldError = {};
  const sys = Number(r.systolic);
  const dia = Number(r.diastolic);
  const hr  = Number(r.heartRate);

  if (!r.systolic || isNaN(sys) || sys < 60 || sys > 300)
    errors.systolic = 'Valore sistolica non valido (60–300)';
  if (!r.diastolic || isNaN(dia) || dia < 40 || dia > 200)
    errors.diastolic = 'Valore diastolica non valido (40–200)';
  if (!r.heartRate || isNaN(hr) || hr < 30 || hr > 250)
    errors.heartRate = 'Frequenza cardiaca non valida (30–250)';
  if (!errors.systolic && !errors.diastolic && dia >= sys)
    errors.diastolic = 'Diastolica deve essere < sistolica';
  if (!errors.systolic && !errors.diastolic && (sys - dia) < 10)
    errors.diastolic = `Pressione differenziale (${sys - dia} mmHg) troppo bassa per essere fisiologica (minimo 10 mmHg)`;

  return errors;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface NumericFieldProps {
  id: string;
  label: string;
  unit: string;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}

const NumericField: React.FC<NumericFieldProps> = ({
  id, label, unit, value, error, onChange,
}) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={id} className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
      {label}
    </label>
    <div className="relative">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        className={[
          'w-full bg-slate-800 rounded-xl px-4 py-3 pr-14 text-2xl font-bold text-white',
          'placeholder:text-slate-600 border-2 transition-colors',
          'focus:outline-none',
          error
            ? 'border-rose-500 focus:border-rose-400'
            : 'border-slate-700 focus:border-emerald-500',
        ].join(' ')}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">{unit}</span>
    </div>
    <AnimatePresence mode="wait">
      {error && (
        <motion.p
          id={`${id}-err`}
          role="alert"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="text-xs text-rose-400"
        >
          {error}
        </motion.p>
      )}
    </AnimatePresence>
  </div>
);

// ─── Reading Input Panel ──────────────────────────────────────────────────────

interface ReadingPanelProps {
  index: 0 | 1 | 2;
  reading: RawReading;
  errors: FormFieldError;
  onChange: (field: keyof RawReading, value: string) => void;
  onConfirm: () => void;
}

const READING_META = [
  {
    title:    'Misurazione di riscaldamento',
    subtitle: 'Questa lettura verrà scartata — è normale che sia leggermente più alta.',
    badge:    'Riscaldamento',
    badgeColor: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
    icon:     '🌡️',
  },
  {
    title:    'Prima misurazione ufficiale',
    subtitle: 'Questo valore verrà incluso nella media della sessione.',
    badge:    'Ufficiale 1/2',
    badgeColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    icon:     '✅',
  },
  {
    title:    'Seconda misurazione ufficiale',
    subtitle: 'Ultima lettura. Poi vedremo la media.',
    badge:    'Ufficiale 2/2',
    badgeColor: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30',
    icon:     '✅',
  },
] as const;

const ReadingPanel: React.FC<ReadingPanelProps> = ({
  index, reading, errors, onChange, onConfirm,
}) => {
  const meta    = READING_META[index];
  const uid     = useId();

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5" aria-hidden="true">{meta.icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-white">{meta.title}</h3>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.badgeColor}`}>
              {meta.badge}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{meta.subtitle}</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex gap-1.5" aria-label={`Lettura ${index + 1} di ${READING_COUNT}`}>
        {Array.from({ length: READING_COUNT }).map((_, i) => (
          <div
            key={i}
            className={[
              'h-1 flex-1 rounded-full transition-all duration-300',
              i < index  ? 'bg-emerald-500' :
              i === index ? 'bg-emerald-400' :
              'bg-slate-700',
            ].join(' ')}
          />
        ))}
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-3 gap-3">
        <NumericField
          id={`${uid}-sys`}
          label="Sistolica"
          unit="mmHg"
          value={reading.systolic}
          error={errors.systolic}
          onChange={(v) => onChange('systolic', v)}
        />
        <NumericField
          id={`${uid}-dia`}
          label="Diastolica"
          unit="mmHg"
          value={reading.diastolic}
          error={errors.diastolic}
          onChange={(v) => onChange('diastolic', v)}
        />
        <NumericField
          id={`${uid}-hr`}
          label="Frequenza"
          unit="bpm"
          value={reading.heartRate}
          error={errors.heartRate}
          onChange={(v) => onChange('heartRate', v)}
        />
      </div>

      <motion.button
        type="button"
        onClick={onConfirm}
        whileTap={{ scale: 0.97 }}
        className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-base transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
      >
        {index < 2 ? 'Conferma e continua →' : 'Conferma ultima lettura →'}
      </motion.button>
    </div>
  );
};

// ─── Summary ──────────────────────────────────────────────────────────────────

interface SummaryProps {
  readings: RawReading[];
  tags: MeasurementTag[];
  arm: import('../types').MeasurementArm;
  hasIrregularHeartbeat: boolean;
  onToggleTag: (tag: MeasurementTag) => void;
  isSaving: boolean;
  onSave: () => void;
  onRedo: () => void;
}

function avg(values: number[]): number {
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

const ARM_LABELS: Record<import('../types').MeasurementArm, string> = {
  left:    'Braccio sinistro',
  right:   'Braccio destro',
  unknown: 'Braccio non specificato',
};

const Summary: React.FC<SummaryProps> = ({
  readings, tags, arm, hasIrregularHeartbeat, onToggleTag, isSaving, onSave, onRedo,
}) => {
  const official = readings.slice(1);
  const meanSys  = avg(official.map((r) => Number(r.systolic)));
  const meanDia  = avg(official.map((r) => Number(r.diastolic)));
  const meanHR   = avg(official.map((r) => Number(r.heartRate)));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-base font-bold text-white">Riepilogo sessione</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          Prima lettura scartata · Media delle ultime 2
        </p>
      </div>

      {/* Readings table */}
      <div className="rounded-2xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-800 text-slate-400 text-xs">
              <th className="px-4 py-2.5 text-left font-medium">Lettura</th>
              <th className="px-3 py-2.5 text-right font-medium">Sys</th>
              <th className="px-3 py-2.5 text-right font-medium">Dia</th>
              <th className="px-3 py-2.5 text-right font-medium">FC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {readings.map((r, i) => (
              <tr
                key={i}
                className={i === 0 ? 'opacity-40' : ''}
              >
                <td className="px-4 py-2.5">
                  <span className={[
                    'text-xs font-semibold px-2 py-0.5 rounded-full',
                    i === 0
                      ? 'text-amber-400 bg-amber-400/10'
                      : 'text-emerald-400 bg-emerald-400/10',
                  ].join(' ')}>
                    {i === 0 ? 'Riscaldamento' : `Ufficiale ${i}`}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-white">{r.systolic}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-white">{r.diastolic}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-white">{r.heartRate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mean result */}
      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-center gap-4">
        <div className="flex-1">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1">
            Media sessione
          </p>
          <p className="text-3xl font-black text-emerald-400 tabular-nums">
            {meanSys}
            <span className="text-slate-400 font-bold text-xl">/</span>
            {meanDia}
            <span className="text-slate-400 text-sm font-normal ml-1">mmHg</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-slate-400 text-xs">FC media</p>
          <p className="text-xl font-bold text-white tabular-nums">{meanHR}</p>
          <p className="text-slate-500 text-xs">bpm</p>
        </div>
      </div>

      {/* Session metadata */}
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400">{ARM_LABELS[arm]}</span>
          {hasIrregularHeartbeat && (
            <span className="text-amber-400 font-semibold">⚠ Battito irregolare</span>
          )}
        </div>
        {tags.filter(t => ['stress','caffeine','work','post-sport','rest','medication'].includes(t)).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.filter(t => ['stress','caffeine','work','post-sport','rest','medication'].includes(t)).map((t) => (
              <span key={t} className="text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Symptom tags — editable post-measurement */}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Sintomi durante/dopo la misurazione
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Conferma sintomi">
          {SYMPTOM_TAGS.map(({ value, label, emoji }) => {
            const isActive = tags.includes(value);
            return (
              <motion.button
                key={value}
                type="button"
                onClick={() => onToggleTag(value)}
                whileTap={{ scale: 0.93 }}
                aria-pressed={isActive}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-rose-500/20 border border-rose-500 text-rose-300'
                    : 'bg-slate-700/60 border border-slate-600 text-slate-400 hover:border-slate-400',
                ].join(' ')}
              >
                <span aria-hidden="true">{emoji}</span>
                {label}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRedo}
          disabled={isSaving}
          className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 text-sm font-medium hover:border-slate-400 transition-colors focus:outline-none"
        >
          Rifai sessione
        </button>
        <motion.button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          whileTap={{ scale: 0.97 }}
          className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        >
          {isSaving ? 'Salvataggio…' : 'Salva sessione'}
        </motion.button>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

function generateSessionId(): string {
  // crypto.randomUUID() is available in all modern browsers (Chromium 92+, Firefox 95+, Safari 15.4+).
  // Falls back to a timestamp+random suffix only if unavailable (e.g. old WebView).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  const hex = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${Date.now()}-${hex}`;
}

const SessionForm: React.FC<SessionFormProps> = ({ onSave }) => {
  const [step, setStep]             = useState<Step>('breathing');
  const [tags, setTags]             = useState<MeasurementTag[]>([]);
  const [note, setNote]             = useState('');
  const [arm, setArm]               = useState<MeasurementArm>('unknown');
  const [hasIrregularHeartbeat, setHasIrregularHeartbeat] = useState(false);
  const [readings, setReadings] = useState<RawReading[]>([
    { ...EMPTY_READING },
    { ...EMPTY_READING },
    { ...EMPTY_READING },
  ]);
  const [errors, setErrors]   = useState<FormFieldError>({});
  const [timestamps, setTimestamps] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // ─── Tag toggle ───────────────────────────────────────────────────────

  const toggleTag = useCallback((tag: MeasurementTag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  // ─── Reading field change ─────────────────────────────────────────────

  const handleReadingChange = useCallback(
    (idx: number) => (field: keyof RawReading, value: string) => {
      setReadings((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], [field]: value };
        return next;
      });
      setErrors({});
    },
    [],
  );

  // ─── Confirm a reading ────────────────────────────────────────────────

  const confirmReading = useCallback(
    (readingIdx: 0 | 1 | 2) => () => {
      const r = readings[readingIdx];
      const errs = validateReading(r);
      if (Object.keys(errs).length > 0) {
        setErrors(errs);
        return;
      }
      setTimestamps((prev) => {
        const next = [...prev];
        next[readingIdx] = Date.now();
        return next;
      });
      setStep(nextStep(`reading-${readingIdx}` as Step));
    },
    [readings],
  );

  // ─── Save session ─────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const sessionId = generateSessionId();
      const payload: SessionPayload = {
        sessionId,
        tags,
        note: note.trim() || undefined,
        arm,
        hasIrregularHeartbeat: hasIrregularHeartbeat || undefined,
        readings: readings.map((r, i) => ({
          timestamp:    timestamps[i] ?? Date.now(),
          systolic:     Number(r.systolic),
          diastolic:    Number(r.diastolic),
          heartRate:    Number(r.heartRate),
          readingIndex: i,
          isWarmup:     i === 0,
        })),
      };
      await onSave(payload);
      // Reset form for next session
      setStep('breathing');
      setTags([]);
      setNote('');
      setArm('unknown');
      setHasIrregularHeartbeat(false);
      setReadings([EMPTY_READING, EMPTY_READING, EMPTY_READING].map((r) => ({ ...r })));
      setTimestamps([]);
    } finally {
      setIsSaving(false);
    }
  }, [readings, tags, note, arm, hasIrregularHeartbeat, timestamps, onSave]);

  const handleRedo = useCallback(() => {
    setStep('breathing');
    setArm('unknown');
    setHasIrregularHeartbeat(false);
    setReadings([EMPTY_READING, EMPTY_READING, EMPTY_READING].map((r) => ({ ...r })));
    setTimestamps([]);
    setErrors({});
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700"
      aria-label="Sessione di misurazione pressione"
    >
      {/* Section title */}
      <div className="flex items-center gap-2 mb-5">
        <h2 className="text-lg font-bold text-white">Nuova sessione</h2>
        <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">
          ESC/ESH 2023
        </span>
      </div>

      <AnimatePresence mode="wait">

        {/* ── Step 1: Breathing ── */}
        {step === 'breathing' && (
          <motion.div key="breathing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <BreathingTimer
              durationSeconds={BREATHING_SECONDS}
              onComplete={() => setStep('info')}
            />
          </motion.div>
        )}

        {/* ── Step 2: Info ── */}
        {step === 'info' && (
          <motion.div
            key="info"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            className="flex flex-col gap-4"
          >
            <p className="text-sm text-slate-400 leading-relaxed">
              Stai per eseguire <strong className="text-slate-200">3 misurazioni</strong>.
              La prima (riscaldamento) verrà scartata automaticamente. Seleziona il contesto prima di iniziare.
            </p>

            {/* Arm selector */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Braccio utilizzato</p>
              <div className="flex gap-2" role="group" aria-label="Braccio misurazione">
                {ARM_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setArm(value)}
                    aria-pressed={arm === value}
                    className={[
                      'flex-1 py-2 rounded-xl text-sm font-medium border transition-all duration-200 focus:outline-none',
                      arm === value
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-700/60 border-slate-600 text-slate-400 hover:border-slate-400',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Context tags */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Contesto</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Tag contestuali">
                {CONTEXT_TAGS.map(({ value, label, emoji }) => {
                  const isActive = tags.includes(value);
                  return (
                    <motion.button
                      key={value}
                      type="button"
                      onClick={() => toggleTag(value)}
                      whileTap={{ scale: 0.93 }}
                      aria-pressed={isActive}
                      className={[
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
                        isActive
                          ? 'bg-emerald-500/20 border border-emerald-500 text-emerald-300'
                          : 'bg-slate-700/60 border border-slate-600 text-slate-400 hover:border-slate-400',
                      ].join(' ')}
                    >
                      <span aria-hidden="true">{emoji}</span>
                      {label}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Symptom tags */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Sintomi presenti</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Tag sintomi">
                {SYMPTOM_TAGS.map(({ value, label, emoji }) => {
                  const isActive = tags.includes(value);
                  return (
                    <motion.button
                      key={value}
                      type="button"
                      onClick={() => toggleTag(value)}
                      whileTap={{ scale: 0.93 }}
                      aria-pressed={isActive}
                      className={[
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200',
                        isActive
                          ? 'bg-rose-500/20 border border-rose-500 text-rose-300'
                          : 'bg-slate-700/60 border border-slate-600 text-slate-400 hover:border-slate-400',
                      ].join(' ')}
                    >
                      <span aria-hidden="true">{emoji}</span>
                      {label}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Arrhythmia flag */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div className="relative flex-shrink-0">
                <input
                  type="checkbox"
                  checked={hasIrregularHeartbeat}
                  onChange={(e) => setHasIrregularHeartbeat(e.target.checked)}
                  className="sr-only"
                />
                <div className={[
                  'w-5 h-5 rounded border-2 transition-colors flex items-center justify-center',
                  hasIrregularHeartbeat
                    ? 'bg-amber-500 border-amber-500'
                    : 'bg-slate-800 border-slate-600',
                ].join(' ')}>
                  {hasIrregularHeartbeat && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
                      <polyline points="2 6 5 9 10 3" />
                    </svg>
                  )}
                </div>
              </div>
              <div>
                <span className="text-sm font-medium text-slate-200">Battito irregolare rilevato</span>
                <p className="text-xs text-slate-500 mt-0.5">Se il misuratore ha segnalato aritmia, spuntare qui</p>
              </div>
            </label>

            {/* Note */}
            <div>
              <label htmlFor="session-note" className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Nota (opzionale)
              </label>
              <textarea
                id="session-note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Come ti senti oggi?"
                maxLength={500}
                className="w-full bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-600 resize-none focus:outline-none transition-colors"
              />
            </div>

            <motion.button
              type="button"
              onClick={() => setStep('reading-0')}
              whileTap={{ scale: 0.97 }}
              className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-base transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              Inizia le misurazioni →
            </motion.button>
          </motion.div>
        )}

        {/* ── Steps 3/5/7: Readings ── */}
        {(['reading-0', 'reading-1', 'reading-2'] as const).map((s, idx) =>
          step === s ? (
            <motion.div
              key={s}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
            >
              <ReadingPanel
                index={idx as 0 | 1 | 2}
                reading={readings[idx]}
                errors={errors}
                onChange={handleReadingChange(idx)}
                onConfirm={confirmReading(idx as 0 | 1 | 2)}
              />
            </motion.div>
          ) : null,
        )}

        {/* ── Steps 4/6: Wait ── */}
        {step === 'wait-1' && (
          <motion.div key="wait-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CountdownTimer
              durationSeconds={WAIT_SECONDS}
              onComplete={() => setStep('reading-1')}
              label="Attendi 1 minuto prima della seconda misurazione"
            />
          </motion.div>
        )}
        {step === 'wait-2' && (
          <motion.div key="wait-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CountdownTimer
              durationSeconds={WAIT_SECONDS}
              onComplete={() => setStep('reading-2')}
              label="Attendi 1 minuto prima della terza misurazione"
            />
          </motion.div>
        )}

        {/* ── Step 8: Summary ── */}
        {step === 'summary' && (
          <motion.div
            key="summary"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
          >
            <Summary
              readings={readings}
              tags={tags}
              arm={arm}
              hasIrregularHeartbeat={hasIrregularHeartbeat}
              onToggleTag={toggleTag}
              isSaving={isSaving}
              onSave={handleSave}
              onRedo={handleRedo}
            />
          </motion.div>
        )}

      </AnimatePresence>
    </motion.section>
  );
};

export default SessionForm;
