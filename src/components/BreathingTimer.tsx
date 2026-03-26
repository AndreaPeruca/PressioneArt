/**
 * @component BreathingTimer
 * @description
 * A 120-second biofeedback module that guides the user through a slow
 * breathing exercise before entering a blood-pressure measurement.
 * This reduces the "white-coat effect" and improves reading accuracy.
 *
 * Design:
 * - SVG concentric circle expands (inhale) and contracts (exhale) on a
 *   4-second cycle using Framer Motion `animate` prop.
 * - An animated arc tracks overall session progress (0 → 360°).
 * - The parent form stays locked (via `onComplete` callback) until the
 *   full duration elapses or the user explicitly skips.
 *
 * Accessibility:
 * - `aria-live="polite"` announces phase changes to screen readers.
 * - Reduced-motion users see a simple countdown without animation.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { BreathingTimerProps } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Duration of a single inhale phase in seconds */
const INHALE_SECONDS = 4;
/** Duration of a single exhale phase in seconds */
const EXHALE_SECONDS = 4;
/** Full breath cycle length */
const CYCLE_SECONDS = INHALE_SECONDS + EXHALE_SECONDS;

const SVG_SIZE = 200;
const CENTER = SVG_SIZE / 2;
const TRACK_RADIUS = 80;
const TRACK_CIRCUMFERENCE = 2 * Math.PI * TRACK_RADIUS;

const BREATH_MIN_RADIUS = 28;
const BREATH_MAX_RADIUS = 52;

// ─── Types ────────────────────────────────────────────────────────────────────

type BreathPhase = 'inhale' | 'exhale';

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Format seconds as MM:SS */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/** Compute the SVG arc dashoffset for the progress ring */
function progressOffset(elapsed: number, total: number): number {
  const fraction = Math.min(elapsed / total, 1);
  return TRACK_CIRCUMFERENCE * (1 - fraction);
}

// ─── Component ────────────────────────────────────────────────────────────────

const BreathingTimer: React.FC<BreathingTimerProps> = ({
  durationSeconds,
  onComplete,
}) => {
  const [elapsed, setElapsed]       = useState(0);
  const [phase, setPhase]           = useState<BreathPhase>('inhale');
  const [isStarted, setIsStarted]   = useState(false);
  const [isSkipped, setIsSkipped]   = useState(false);
  const intervalRef                  = useRef<ReturnType<typeof setInterval> | null>(null);
  const prefersReducedMotion         = useReducedMotion();

  const remaining = Math.max(durationSeconds - elapsed, 0);

  // ─── Timer loop ───────────────────────────────────────────────────────

  const tick = useCallback(() => {
    setElapsed((prev) => {
      const next = prev + 1;
      const cyclePosition = next % CYCLE_SECONDS;
      setPhase(cyclePosition < INHALE_SECONDS ? 'inhale' : 'exhale');
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isStarted || isSkipped) return;

    intervalRef.current = setInterval(tick, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tick, isStarted, isSkipped]);

  // ─── Completion ───────────────────────────────────────────────────────

  useEffect(() => {
    if (elapsed >= durationSeconds) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      onComplete();
    }
  }, [elapsed, durationSeconds, onComplete]);

  const handleSkip = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsSkipped(true);
    onComplete();
  }, [onComplete]);

  // ─── Derived animation values ─────────────────────────────────────────

  const breathRadius = phase === 'inhale' ? BREATH_MAX_RADIUS : BREATH_MIN_RADIUS;
  const dashOffset   = progressOffset(elapsed, durationSeconds);

  const phaseLabel = phase === 'inhale' ? 'Inspira' : 'Espira';
  const phaseColor = phase === 'inhale' ? '#10b981' : '#6366f1';

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center gap-6 py-6 select-none">
      <p className="sr-only" aria-live="polite">
        {isStarted ? `${phaseLabel} – Tempo rimanente: ${formatTime(remaining)}` : 'Premi play per iniziare la respirazione guidata'}
      </p>

      {/* SVG Biofeedback Canvas */}
      <svg
        width={SVG_SIZE}
        height={SVG_SIZE}
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        aria-hidden="true"
        role="img"
      >
        {/* Background track ring */}
        <circle cx={CENTER} cy={CENTER} r={TRACK_RADIUS} fill="none" stroke="#1e293b" strokeWidth={6} />

        {/* Progress ring — hidden until started */}
        {isStarted && (
          <circle
            cx={CENTER}
            cy={CENTER}
            r={TRACK_RADIUS}
            fill="none"
            stroke="#10b981"
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={TRACK_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        )}

        {/* Breathing orb */}
        {isStarted ? (
          prefersReducedMotion ? (
            <circle cx={CENTER} cy={CENTER} r={BREATH_MIN_RADIUS} fill={phaseColor} fillOpacity={0.15} stroke={phaseColor} strokeWidth={2} />
          ) : (
            <motion.circle
              cx={CENTER} cy={CENTER} r={breathRadius}
              fill={phaseColor} fillOpacity={0.12} stroke={phaseColor} strokeWidth={2}
              animate={{ r: breathRadius, fill: phaseColor, stroke: phaseColor }}
              transition={{ duration: phase === 'inhale' ? INHALE_SECONDS : EXHALE_SECONDS, ease: phase === 'inhale' ? 'easeIn' : 'easeOut' }}
            />
          )
        ) : (
          /* Static idle orb */
          <circle cx={CENTER} cy={CENTER} r={BREATH_MIN_RADIUS} fill="#10b981" fillOpacity={0.08} stroke="#10b981" strokeOpacity={0.3} strokeWidth={2} />
        )}

        {/* Center text */}
        {isStarted ? (
          <>
            <text x={CENTER} y={CENTER - 6} textAnchor="middle" dominantBaseline="middle" fill={phaseColor} fontSize={13} fontWeight={600} fontFamily="system-ui, sans-serif" style={{ transition: 'fill 0.5s ease' }}>
              {phaseLabel}
            </text>
            <text x={CENTER} y={CENTER + 14} textAnchor="middle" dominantBaseline="middle" fill="#94a3b8" fontSize={11} fontFamily="system-ui, sans-serif">
              {formatTime(remaining)}
            </text>
          </>
        ) : (
          <text x={CENTER} y={CENTER} textAnchor="middle" dominantBaseline="middle" fill="#475569" fontSize={11} fontFamily="system-ui, sans-serif">
            {formatTime(durationSeconds)}
          </text>
        )}
      </svg>

      {/* Instructional copy */}
      <p className="text-slate-400 text-sm text-center max-w-xs leading-relaxed">
        {isStarted
          ? 'Segui il ritmo del cerchio. Respira lentamente per ridurre l\'ansia da misurazione.'
          : 'Siediti comodamente e premi play quando sei pronto. La respirazione guidata migliora l\'accuratezza della misurazione.'}
      </p>

      {/* Controls */}
      {!isStarted ? (
        <button
          type="button"
          onClick={() => setIsStarted(true)}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
          aria-label="Avvia respirazione guidata"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Inizia
        </button>
      ) : (
        <button
          type="button"
          onClick={handleSkip}
          className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 rounded"
        >
          Salta e misura subito
        </button>
      )}
    </div>
  );
};

export default BreathingTimer;
