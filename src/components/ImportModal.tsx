/**
 * @component ImportModal
 * @description
 * Full-screen modal for bulk-importing blood-pressure measurements from a CSV
 * file. Supports drag-and-drop and click-to-browse. Processes everything
 * client-side (Zero-Backend).
 *
 * UX flow:
 *  1. User opens modal → sees instructions + template download
 *  2. User drops / selects a .csv file
 *  3. Parser runs instantly client-side
 *  4. Preview table shows first 5 valid rows + error count
 *  5. User confirms → bulk DB insert → success toast → modal closes
 */

import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseCSV, downloadTemplate, MAX_CSV_BYTES } from '../utils/csvImport';
import type { ImportRow, ParseResult } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (rows: ImportRow[]) => Promise<{ count: number }>;
}

type Step = 'idle' | 'parsed' | 'importing' | 'done';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImport }) => {
  const [step, setStep]               = useState<Step>('idle');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [isDragging, setIsDragging]   = useState(false);
  const fileInputRef                  = useRef<HTMLInputElement>(null);

  // ─── Reset on close ───────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    setStep('idle');
    setParseResult(null);
    setIsDragging(false);
    onClose();
  }, [onClose]);

  // ─── File processing ──────────────────────────────────────────────────

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setParseResult({
        valid: [],
        errors: [{ line: 0, raw: '', message: 'Seleziona un file .csv valido.' }],
      });
      setStep('parsed');
      return;
    }

    if (file.size > MAX_CSV_BYTES) {
      const maxMB = (MAX_CSV_BYTES / (1024 * 1024)).toFixed(0);
      setParseResult({
        valid: [],
        errors: [{ line: 0, raw: '', message: `Il file è troppo grande (max ${maxMB} MB).` }],
      });
      setStep('parsed');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const result  = parseCSV(content);
      setParseResult(result);
      setStep('parsed');
    };
    reader.readAsText(file, 'UTF-8');
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  // ─── Drag & Drop ──────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  // ─── Import confirm ───────────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    if (!parseResult?.valid.length) return;
    setStep('importing');
    try {
      const { count } = await onImport(parseResult.valid);
      setImportedCount(count);
      setStep('done');
    } catch {
      // Error is handled by the store / parent
      setStep('parsed');
    }
  }, [parseResult, onImport]);

  // ─── Render ───────────────────────────────────────────────────────────

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
            aria-labelledby="import-modal-title"
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="fixed inset-x-4 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-lg z-50 bg-slate-900 border border-slate-700 rounded-t-3xl sm:rounded-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 id="import-modal-title" className="text-lg font-bold text-white">
                Importa misurazioni
              </h2>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Chiudi"
                className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* ── Step: idle ── */}
            {step === 'idle' && (
              <>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Carica un file <strong className="text-slate-200">.csv</strong> con le tue misurazioni precedenti.
                  Compatibile con Excel: usa <em>File → Salva come → CSV</em>.
                </p>

                {/* Template download */}
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Scarica template CSV di esempio
                </button>

                {/* Drop zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                  aria-label="Trascina o clicca per selezionare un file CSV"
                  className={[
                    'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200',
                    isDragging
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-slate-600 hover:border-slate-400 bg-slate-800/40',
                  ].join(' ')}
                >
                  <div className="text-3xl mb-2" aria-hidden="true">📂</div>
                  <p className="text-sm text-slate-300 font-medium">
                    {isDragging ? 'Rilascia qui' : 'Trascina il file qui'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">oppure clicca per sfogliare</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileChange}
                    className="sr-only"
                    aria-hidden="true"
                  />
                </div>

                {/* Format reference */}
                <details className="text-xs text-slate-500">
                  <summary className="cursor-pointer hover:text-slate-300 transition-colors">
                    Formato CSV supportato
                  </summary>
                  <pre className="mt-2 bg-slate-800 rounded-xl p-3 text-slate-400 overflow-x-auto leading-relaxed">
{`Data,Sistolica,Diastolica,Frequenza,Tag,Nota
15/01/2024 08:30,130,85,72,stress;caffeine,Mattina
2024-01-16,125,82,70,,Sera`}
                  </pre>
                  <p className="mt-2">
                    <strong className="text-slate-300">Contesto:</strong>{' '}
                    stress · caffeine · work · post-sport · rest · medication
                  </p>
                  <p className="mt-1">
                    <strong className="text-slate-300">Sintomi:</strong>{' '}
                    headache · dizziness · chest-pain · visual-disturbance · palpitations
                  </p>
                </details>
              </>
            )}

            {/* ── Step: parsed ── */}
            {step === 'parsed' && parseResult && (
              <>
                {/* Summary */}
                <div className="flex gap-3">
                  <div className="flex-1 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-center">
                    <p className="text-2xl font-black text-emerald-400">{parseResult.valid.length}</p>
                    <p className="text-xs text-slate-400 mt-0.5">righe valide</p>
                  </div>
                  <div className="flex-1 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-3 text-center">
                    <p className="text-2xl font-black text-rose-400">{parseResult.errors.length}</p>
                    <p className="text-xs text-slate-400 mt-0.5">righe con errori</p>
                  </div>
                </div>

                {/* Errors list */}
                {parseResult.errors.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-rose-400 hover:text-rose-300 transition-colors font-medium">
                      Mostra errori ({parseResult.errors.length})
                    </summary>
                    <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                      {parseResult.errors.map((err, i) => (
                        <li key={i} className="text-slate-400 bg-slate-800 rounded-lg px-3 py-1.5">
                          <span className="text-slate-500">Riga {err.line}:</span> {err.message}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {/* Preview table */}
                {parseResult.valid.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 font-medium mb-2">
                      Anteprima (prime {Math.min(5, parseResult.valid.length)} righe)
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-slate-700">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-800 text-slate-400">
                            <th className="px-3 py-2 text-left font-medium">Data</th>
                            <th className="px-3 py-2 text-right font-medium">Sys</th>
                            <th className="px-3 py-2 text-right font-medium">Dia</th>
                            <th className="px-3 py-2 text-right font-medium">FC</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                          {parseResult.valid.slice(0, 5).map((row, i) => (
                            <tr key={i} className="text-slate-300">
                              <td className="px-3 py-2">{formatDate(row.timestamp)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{row.systolic}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{row.diastolic}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{row.heartRate}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => { setStep('idle'); setParseResult(null); }}
                    className="flex-1 py-3 rounded-xl border border-slate-600 text-slate-300 text-sm font-medium hover:border-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500"
                  >
                    Cambia file
                  </button>
                  <motion.button
                    type="button"
                    onClick={handleConfirm}
                    disabled={parseResult.valid.length === 0}
                    whileTap={{ scale: 0.97 }}
                    className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  >
                    Importa {parseResult.valid.length} misurazioni
                  </motion.button>
                </div>
              </>
            )}

            {/* ── Step: importing ── */}
            {step === 'importing' && (
              <div className="flex flex-col items-center gap-4 py-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-10 h-10 border-4 border-slate-700 border-t-emerald-500 rounded-full"
                  aria-label="Importazione in corso"
                />
                <p className="text-slate-400 text-sm">Salvataggio in corso…</p>
              </div>
            )}

            {/* ── Step: done ── */}
            {step === 'done' && (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="text-5xl" aria-hidden="true">✅</div>
                <div>
                  <p className="text-white font-bold text-lg">Importazione completata</p>
                  <p className="text-slate-400 text-sm mt-1">
                    {importedCount} misurazioni aggiunte al tuo storico locale.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="mt-2 px-8 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  Perfetto
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ImportModal;
