/**
 * @component CountdownTimer
 * @description
 * Simple 60-second countdown between session readings.
 * Simpler than BreathingTimer — no SVG animation, just a circular progress
 * ring with a large countdown number. Designed for the 1-minute inter-reading
 * rest mandated by the ESC/ESH HBPM protocol.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { CountdownTimerProps } from '../types';

const SIZE = 140;
const CENTER = SIZE / 2;
const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function formatTime(s: number): string {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({
  durationSeconds,
  onComplete,
  label = 'Riposa un minuto',
}) => {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const remaining = Math.max(durationSeconds - elapsed, 0);
  const progress  = Math.min(elapsed / durationSeconds, 1);
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    if (elapsed >= durationSeconds) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      onComplete();
    }
  }, [elapsed, durationSeconds, onComplete]);

  const handleSkip = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    onComplete();
  }, [onComplete]);

  return (
    <div className="flex flex-col items-center gap-4 py-4 select-none">
      <p className="text-slate-300 font-semibold text-center">{label}</p>

      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx={CENTER} cy={CENTER} r={RADIUS}
          fill="none" stroke="#1e293b" strokeWidth={7}
        />
        {/* Progress */}
        <circle
          cx={CENTER} cy={CENTER} r={RADIUS}
          fill="none"
          stroke="#10b981"
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
        {/* Countdown number */}
        <text
          x={CENTER} y={CENTER - 6}
          textAnchor="middle" dominantBaseline="middle"
          fill="#f1f5f9" fontSize={28} fontWeight={800}
          fontFamily="system-ui, sans-serif"
        >
          {formatTime(remaining)}
        </text>
        <text
          x={CENTER} y={CENTER + 18}
          textAnchor="middle" dominantBaseline="middle"
          fill="#64748b" fontSize={10}
          fontFamily="system-ui, sans-serif"
        >
          secondi
        </text>
      </svg>

      <p className="text-xs text-slate-500 text-center max-w-[220px] leading-relaxed">
        Il protocollo ESC/ESH richiede 1 minuto di riposo tra una lettura e l'altra per un risultato accurato.
      </p>

      <motion.button
        type="button"
        onClick={handleSkip}
        whileTap={{ scale: 0.95 }}
        className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-300 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 rounded"
      >
        Salta attesa
      </motion.button>
    </div>
  );
};

export default CountdownTimer;
