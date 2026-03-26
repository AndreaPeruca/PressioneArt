/**
 * @component PrivacyWidget
 * @description
 * Transparent privacy disclosure widget for health-conscious users.
 * Explains — in accessible, non-technical language — exactly where and how
 * their data is stored. An expandable "technical details" section satisfies
 * more curious or security-aware users.
 *
 * Design principles:
 * - Never use legal boilerplate; speak like a trusted friend.
 * - The shield icon creates immediate visual reassurance.
 * - Collapsible tech details avoid overwhelming casual users.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Icons (inline SVG, zero external deps) ────────────────────────────────────

const ShieldIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const ChevronIcon: React.FC<{ open: boolean; className?: string }> = ({
  open,
  className,
}) => (
  <motion.svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    animate={{ rotate: open ? 180 : 0 }}
    transition={{ duration: 0.2 }}
    aria-hidden="true"
  >
    <polyline points="6 9 12 15 18 9" />
  </motion.svg>
);

// ─── Data points ──────────────────────────────────────────────────────────────

const PRIVACY_POINTS = [
  {
    icon: '📱',
    title: 'Solo sul tuo dispositivo',
    body: 'I tuoi dati non lasciano mai questo dispositivo. Non esiste alcun server, nessun cloud.',
  },
  {
    icon: '🔒',
    title: 'Database locale isolato',
    body: 'Le misurazioni sono salvate in IndexedDB, accessibile esclusivamente da questa app. La cifratura è pianificata per una versione futura.',
  },
  {
    icon: '🚫',
    title: 'Zero tracciamento',
    body: 'Nessun cookie, nessuna analytics, nessun SDK di terze parti. Il codice sorgente è ispezionabile.',
  },
  {
    icon: '🗑️',
    title: 'Cancella quando vuoi',
    body: 'Un singolo gesto cancella tutto in modo permanente e irreversibile.',
  },
  {
    icon: '⚠️',
    title: 'Attenzione: dati nel browser',
    body: 'Svuotare la cache o i dati del browser cancella tutte le misurazioni. Esporta regolarmente i tuoi dati in CSV come copia di sicurezza.',
  },
] as const;

const TECH_DETAILS = [
  { label: 'Storage engine',  value: 'IndexedDB via Dexie.js' },
  { label: 'Persistence',     value: 'Browser locale — nessun cloud sync' },
  { label: 'Cifratura',       value: 'Pianificata — non ancora attiva' },
  { label: 'Network calls',   value: 'Nessuna — architettura Zero-Backend' },
  { label: 'Telemetry',       value: 'Assente' },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

const PrivacyWidget: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section
      className="bg-slate-800/40 border border-slate-700 rounded-2xl p-5"
      aria-labelledby="privacy-heading"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-emerald-500/10 rounded-xl">
          <ShieldIcon className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h2 id="privacy-heading" className="text-base font-bold text-white">
            I tuoi dati restano tuoi
          </h2>
          <p className="text-xs text-slate-400">Zero cloud · Zero server · Zero tracciamento</p>
        </div>
      </div>

      {/* Privacy points grid */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4" role="list">
        {PRIVACY_POINTS.map(({ icon, title, body }) => (
          <li
            key={title}
            className="flex gap-3 bg-slate-900/40 rounded-xl p-3"
          >
            <span className="text-xl flex-shrink-0 mt-0.5" aria-hidden="true">
              {icon}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-200">{title}</p>
              <p className="text-xs text-slate-400 leading-relaxed mt-0.5">{body}</p>
            </div>
          </li>
        ))}
      </ul>

      {/* Technical details toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors w-full focus:outline-none focus:ring-2 focus:ring-slate-500 rounded"
        aria-expanded={isExpanded}
        aria-controls="privacy-tech-details"
      >
        <ChevronIcon open={isExpanded} className="w-3.5 h-3.5" />
        Dettagli tecnici per i più curiosi
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            id="privacy-tech-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <table
              className="w-full mt-4 text-xs border-collapse"
              aria-label="Specifiche tecniche privacy"
            >
              <tbody>
                {TECH_DETAILS.map(({ label, value }) => (
                  <tr
                    key={label}
                    className="border-t border-slate-700/60"
                  >
                    <td className="py-2 pr-3 text-slate-500 font-medium w-2/5 align-top">
                      {label}
                    </td>
                    <td className="py-2 text-slate-300 align-top">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Medical disclaimer */}
      <div className="mt-4 pt-4 border-t border-slate-700/60">
        <p className="text-xs text-slate-500 leading-relaxed">
          <strong className="text-slate-400">Avviso medico:</strong>{' '}
          Questa app è uno strumento di monitoraggio personale e non è un dispositivo medico certificato.
          I valori visualizzati sono puramente informativi e non sostituiscono la valutazione clinica di un medico.
          Consulta sempre il tuo medico per la diagnosi e il trattamento dell'ipertensione.
        </p>
      </div>
    </section>
  );
};

export default PrivacyWidget;
