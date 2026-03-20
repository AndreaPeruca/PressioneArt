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
  const [isSkipped, setIsSkipped]   = useState(false);
  const intervalRef                  = useRef<ReturnType<typeof setInterval> | null>(null);
  const prefersReducedMotion         = useReducedMotion();

  const remaining = Math.max(durationSeconds - elapsed, 0);

  // ─── Timer loop ───────────────────────────────────────────────────────

  const tick = useCallback(() => {
    setElapsed((prev) => {
      const next = prev + 1;
      // Update breath phase based on position in cycle
      const cyclePosition = next % CYCLE_SECONDS;
      setPhase(cyclePosition < INHALE_SECONDS ? 'inhale' : 'exhale');
      return next;
    });
  }, []);

  useEffect(() => {
    if (isSkipped) return;

    intervalRef.current = setInterval(tick, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [tick, isSkipped]);

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

  const phaseLabel   = phase === 'inhale' ? 'Inspira' : 'Espira';
  const phaseColor   = phase === 'inhale' ? '#10b981' : '#6366f1'; // emerald / indigo

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center gap-6 py-6 select-none">
      {/* Accessible live region for screen readers */}
      <p className="sr-only" aria-live="polite">
        {phaseLabel} – Tempo rimanente: {formatTime(remaining)}
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
        <circle
          cx={CENTER}
          cy={CENTER}
          r={TRACK_RADIUS}
          fill="none"
          stroke="#1e293b"
          strokeWidth={6}
        />

        {/* Animated progress ring */}
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

        {/* Breathing orb – SVG foreignObject wraps the Framer Motion div */}
        {prefersReducedMotion ? (
          // Static circle for reduced-motion users
          <circle
            cx={CENTER}
            cy={CENTER}
            r={BREATH_MIN_RADIUS}
            fill={phaseColor}
            fillOpacity={0.15}
            stroke={phaseColor}
            strokeWidth={2}
          />
        ) : (
          <motion.circle
            cx={CENTER}
            cy={CENTER}
            r={breathRadius}
            fill={phaseColor}
            fillOpacity={0.12}
            stroke={phaseColor}
            strokeWidth={2}
            animate={{ r: breathRadius, fill: phaseColor, stroke: phaseColor }}
            transition={{
              duration: phase === 'inhale' ? INHALE_SECONDS : EXHALE_SECONDS,
              ease: phase === 'inhale' ? 'easeIn' : 'easeOut',
            }}
          />
        )}

        {/* Phase label inside the ring */}
        <text
          x={CENTER}
          y={CENTER - 6}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={phaseColor}
          fontSize={13}
          fontWeight={600}
          fontFamily="system-ui, sans-serif"
          style={{ transition: 'fill 0.5s ease' }}
        >
          {phaseLabel}
        </text>

        {/* Countdown timer */}
        <text
          x={CENTER}
          y={CENTER + 14}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#94a3b8"
          fontSize={11}
          fontFamily="system-ui, sans-serif"
        >
          {formatTime(remaining)}
        </text>
      </svg>

      {/* Instructional copy */}
      <p className="text-slate-400 text-sm text-center max-w-xs leading-relaxed">
        Siediti comodamente. Segui il ritmo del cerchio per 2 minuti prima di
        misurare la pressione. Questo riduce l'ansia da misurazione.
      </p>

      {/* Skip control */}
      <button
        type="button"
        onClick={handleSkip}
        className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 rounded"
      >
        Salta e misura subito
      </button>
    </div>
  );
};

export default BreathingTimer;
