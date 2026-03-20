/**
 * @component ReportModal
 * @description
 * Bottom-sheet modal that collects optional patient/doctor info,
 * then generates and downloads a clinical PDF report.
 *
 * PDF generation is fully client-side via @react-pdf/renderer.
 * The module is dynamically imported so it doesn't bloat the main bundle.
 */

import React, { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { BPSession } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportModalProps {
  isOpen:      boolean;
  onClose:     () => void;
  sessions:    BPSession[];
  periodLabel: string;
}

type GenerateStep = 'form' | 'generating' | 'done' | 'error';

// ─── Component ────────────────────────────────────────────────────────────────

const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  sessions,
  periodLabel,
}) => {
  const [step, setStep]             = useState<GenerateStep>('form');
  const [patientName, setPatientName] = useState('');
  const [doctorName, setDoctorName]   = useState('');
  const [errorMsg, setErrorMsg]       = useState('');

  const handleClose = useCallback(() => {
    setStep('form');
    setErrorMsg('');
    onClose();
  }, [onClose]);

  const handleGenerate = useCallback(async () => {
    if (sessions.length === 0) return;
    setStep('generating');
    try {
      // Dynamic import — keeps the main bundle lean
      const { generatePDFBlob } = await import('../utils/reportPDF');

      const blob = await generatePDFBlob({
        sessions,
        periodLabel,
        patientName: patientName.trim() || undefined,
        doctorName:  doctorName.trim()  || undefined,
        generatedAt: new Date(),
      });

      // Trigger download
      const url      = URL.createObjectURL(blob);
      const anchor   = document.createElement('a');
      const datePart = new Date().toLocaleDateString('it-IT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      }).replace(/\//g, '-');
      // Strip filesystem-illegal characters and path separators from the name.
      // Also omit the patient name from the filename to avoid embedding PHI
      // in browser download history, Recent Files, and cloud sync logs.
      const namePart = patientName.trim()
        ? `_${patientName.trim().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, '_').slice(0, 40)}`
        : '';
      anchor.href     = url;
      anchor.download = `pressione_report${namePart}_${datePart}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);

      setStep('done');
    } catch (err) {
      console.error('PDF generation error:', err);
      setErrorMsg(err instanceof Error ? err.message : 'Errore durante la generazione del PDF.');
      setStep('error');
    }
  }, [sessions, periodLabel, patientName, doctorName]);

  const periodSessions = sessions.length;

  // Helvetica only supports Latin-1 (U+0000–U+00FF). Warn if any note
  // contains characters outside this range so the user knows before generating.
  const hasNonLatinNotes = sessions.some(
    (s) => s.note && /[^\u0000-\u00FF]/.test(s.note),
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-modal-title"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="fixed inset-x-4 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md z-50 bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-6 flex flex-col gap-5"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 id="report-modal-title" className="text-lg font-bold text-white">
                  Genera report PDF
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {periodLabel} · {periodSessions} sessioni
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Chiudi"
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* ── Step: form ── */}
            {step === 'form' && (
              <>
                {periodSessions === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-slate-400 text-sm">
                      Nessuna sessione nel periodo selezionato.<br />
                      Cambia il filtro periodo o aggiungi misurazioni.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Report preview */}
                    <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 flex flex-col gap-2">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        Contenuto del report
                      </p>
                      {[
                        '📊 Medie sistolica / diastolica / frequenza',
                        '📈 Grafico di trend (sessioni nel periodo)',
                        '🕐 Analisi mattina vs sera',
                        '📅 Medie settimanali',
                        '📋 Registro completo sessioni',
                        '🏷️ Distribuzione categorie ESC/ESH',
                      ].map((item) => (
                        <div key={item} className="flex items-center gap-2">
                          <span className="text-xs text-slate-300">{item}</span>
                        </div>
                      ))}
                    </div>

                    {/* Optional fields */}
                    <div className="flex flex-col gap-3">
                      <div>
                        <label
                          htmlFor="patient-name"
                          className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1"
                        >
                          Nome paziente (opzionale)
                        </label>
                        <input
                          id="patient-name"
                          type="text"
                          value={patientName}
                          onChange={(e) => setPatientName(e.target.value)}
                          placeholder="es. Mario Rossi"
                          className="w-full bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none transition-colors"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="doctor-name"
                          className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1"
                        >
                          Medico di riferimento (opzionale)
                        </label>
                        <input
                          id="doctor-name"
                          type="text"
                          value={doctorName}
                          onChange={(e) => setDoctorName(e.target.value)}
                          placeholder="es. Bianchi"
                          className="w-full bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none transition-colors"
                        />
                        <p className="text-xs text-slate-600 mt-1">
                          Comparirà come "Dr. Bianchi" nell'intestazione
                        </p>
                      </div>
                    </div>

                    {hasNonLatinNotes && (
                      <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                        <span className="text-amber-400 text-sm flex-shrink-0 mt-0.5" aria-hidden="true">⚠️</span>
                        <p className="text-xs text-amber-300 leading-relaxed">
                          Alcune note contengono caratteri non supportati dal font del PDF (emoji, caratteri non latini). Appariranno come <strong>□</strong> nel documento.
                        </p>
                      </div>
                    )}

                    <motion.button
                      type="button"
                      onClick={handleGenerate}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-3.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-base flex items-center justify-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-400"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                      Genera e scarica PDF
                    </motion.button>

                    <p className="text-xs text-slate-600 text-center -mt-2">
                      Il PDF viene generato localmente — nessun dato viene inviato a server.
                    </p>
                  </>
                )}
              </>
            )}

            {/* ── Step: generating ── */}
            {step === 'generating' && (
              <div className="flex flex-col items-center gap-5 py-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                  className="w-12 h-12 border-4 border-slate-700 border-t-rose-500 rounded-full"
                  aria-label="Generazione in corso"
                />
                <div className="text-center">
                  <p className="text-white font-semibold">Generazione in corso…</p>
                  <p className="text-slate-500 text-sm mt-1">
                    Elaborazione di {periodSessions} sessioni
                  </p>
                </div>
              </div>
            )}

            {/* ── Step: done ── */}
            {step === 'done' && (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="w-14 h-14 rounded-full bg-rose-500/15 flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" strokeWidth={2.5} strokeLinecap="round" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <polyline points="9 15 11 17 15 13" />
                  </svg>
                </div>
                <div>
                  <p className="text-white font-bold text-lg">Report scaricato</p>
                  <p className="text-slate-400 text-sm mt-1">
                    Il PDF è pronto per essere inviato al medico.<br />
                    Trovi il file nella cartella Download.
                  </p>
                </div>
                <div className="flex gap-3 w-full">
                  <button
                    type="button"
                    onClick={() => setStep('form')}
                    className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:border-slate-400 transition-colors focus:outline-none"
                  >
                    Nuovo report
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

            {/* ── Step: error ── */}
            {step === 'error' && (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <p className="text-rose-400 font-semibold">Errore nella generazione</p>
                <p className="text-slate-400 text-xs leading-relaxed">{errorMsg}</p>
                <button
                  type="button"
                  onClick={() => setStep('form')}
                  className="px-6 py-2.5 rounded-xl bg-slate-700 text-white text-sm font-semibold hover:bg-slate-600 transition-colors"
                >
                  Riprova
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ReportModal;
