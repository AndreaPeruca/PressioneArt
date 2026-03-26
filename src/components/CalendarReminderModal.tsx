/**
 * @component CalendarReminderModal
 * @description
 * Bottom-sheet modal to configure and export blood pressure measurement reminders
 * as an .ics calendar file (compatible with Google Calendar, Apple Calendar, Outlook)
 * or via a direct Google Calendar link — zero OAuth, zero backend.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  downloadICS,
  buildGoogleCalendarURL,
  FREQUENCY_META,
  DURATION_META,
} from '../utils/calendarReminder';
import type { MeasurementFrequency, ReminderConfig, ReminderDuration } from '../utils/calendarReminder';

interface CalendarReminderModalProps {
  isOpen:  boolean;
  onClose: () => void;
}

const FREQUENCIES: MeasurementFrequency[] = ['2x-daily', '1x-morning', '1x-evening', 'every-2d'];
const DURATIONS:   ReminderDuration[]     = [7, 14, 30, 90];

const CalendarReminderModal: React.FC<CalendarReminderModalProps> = ({ isOpen, onClose }) => {
  const [frequency,   setFrequency]   = useState<MeasurementFrequency>('2x-daily');
  const [duration,    setDuration]    = useState<ReminderDuration>(14);
  const [morningTime, setMorningTime] = useState('08:00');
  const [eveningTime, setEveningTime] = useState('20:00');
  const [done,        setDone]        = useState(false);

  const config: ReminderConfig = { frequency, duration, morningTime, eveningTime };
  const freqMeta = FREQUENCY_META[frequency];
  const durMeta  = DURATION_META[duration];

  const handleICS = () => {
    downloadICS(config);
    setDone(true);
  };

  const handleGoogle = () => {
    window.open(buildGoogleCalendarURL(config), '_blank', 'noopener');
    setDone(true);
  };

  const handleClose = () => {
    setDone(false);
    onClose();
  };

  const showTimes = frequency !== 'every-2d';
  const showEvening = frequency === '2x-daily' || frequency === '1x-evening';
  const showMorning = frequency === '2x-daily' || frequency === '1x-morning';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-modal-title"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="fixed inset-x-4 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md z-50 bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 id="calendar-modal-title" className="text-lg font-bold text-white">
                  Promemoria misurazioni
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aggiungi eventi ricorrenti al tuo calendario
                </p>
              </div>
              <button
                type="button" onClick={handleClose} aria-label="Chiudi"
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {!done ? (
              <>
                {/* Frequency */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Frequenza
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {FREQUENCIES.map((f) => {
                      const m = FREQUENCY_META[f];
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFrequency(f)}
                          className={[
                            'flex flex-col items-start px-3 py-2.5 rounded-xl border text-left transition-all',
                            frequency === f
                              ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                              : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-500',
                          ].join(' ')}
                        >
                          <span className="text-xs font-bold">{m.label}</span>
                          <span className="text-xs opacity-70 mt-0.5">{m.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ESH recommendation for selected frequency */}
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-emerald-400 mb-1">Raccomandazione ESH 2023</p>
                  <p className="text-xs text-slate-400 leading-relaxed">{freqMeta.recommendation}</p>
                </div>

                {/* Duration */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Per quanto tempo
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {DURATIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDuration(d)}
                        className={[
                          'py-2.5 rounded-xl border text-xs font-bold transition-all',
                          duration === d
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300'
                            : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-slate-500',
                        ].join(' ')}
                      >
                        {DURATION_META[d].label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-2 leading-relaxed">{durMeta.note}</p>
                </div>

                {/* Time pickers */}
                {showTimes && (
                  <div className="flex flex-col gap-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Orario
                    </p>
                    <div className="flex gap-3">
                      {showMorning && (
                        <div className="flex-1">
                          <label className="text-xs text-slate-500 block mb-1">Mattina</label>
                          <input
                            type="time"
                            value={morningTime}
                            onChange={(e) => setMorningTime(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-colors [color-scheme:dark]"
                          />
                        </div>
                      )}
                      {showEvening && (
                        <div className="flex-1">
                          <label className="text-xs text-slate-500 block mb-1">Sera</label>
                          <input
                            type="time"
                            value={eveningTime}
                            onChange={(e) => setEveningTime(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2 text-sm text-white focus:outline-none transition-colors [color-scheme:dark]"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* CTA buttons */}
                <div className="flex flex-col gap-2">
                  <motion.button
                    type="button"
                    onClick={handleICS}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    Scarica file calendario (.ics)
                  </motion.button>

                  <button
                    type="button"
                    onClick={handleGoogle}
                    className="w-full py-3 rounded-xl border border-slate-600 text-slate-300 text-sm font-semibold flex items-center justify-center gap-2 hover:border-slate-400 hover:text-white transition-colors focus:outline-none"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    Apri in Google Calendar
                  </button>
                </div>

                <p className="text-xs text-slate-600 text-center -mt-2">
                  Il file .ics funziona con Google Calendar, Apple Calendar e Outlook.
                </p>
              </>
            ) : (
              /* Done state */
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <polyline points="9 15 11 17 15 13" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-bold text-lg">Promemoria creato</p>
                  <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                    {freqMeta.description} per {DURATION_META[duration].label}.<br />
                    Inizia domani, alle {frequency === '1x-evening' ? eveningTime : morningTime}
                    {frequency === '2x-daily' ? ` e ${eveningTime}` : ''}.
                  </p>
                </div>
                <div className="flex gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => setDone(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:border-slate-400 transition-colors focus:outline-none"
                  >
                    Modifica
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition-colors focus:outline-none"
                  >
                    Chiudi
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CalendarReminderModal;
