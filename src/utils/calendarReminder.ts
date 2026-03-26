/**
 * @module calendarReminder
 * @description
 * Generates iCalendar (.ics) files for blood pressure measurement reminders.
 * Zero-backend: everything runs in the browser, no OAuth required.
 * The .ics format is supported by Google Calendar, Apple Calendar, Outlook, etc.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type MeasurementFrequency = '2x-daily' | '1x-morning' | '1x-evening' | 'every-2d';
export type ReminderDuration = 7 | 14 | 30 | 90;

export interface ReminderConfig {
  frequency:  MeasurementFrequency;
  duration:   ReminderDuration;
  morningTime: string; // "HH:MM"
  eveningTime: string; // "HH:MM"
}

// ─── ESH Recommendations ──────────────────────────────────────────────────────

export const FREQUENCY_META: Record<MeasurementFrequency, {
  label:          string;
  description:    string;
  recommendation: string;
  eventsPerDay:   number;
}> = {
  '2x-daily': {
    label:          'Mattina e sera',
    description:    '2 sessioni al giorno',
    recommendation: 'Raccomandato da ESH 2023 per la diagnosi iniziale e per il monitoraggio attivo. Misura ogni mattina (prima dei farmaci) e ogni sera.',
    eventsPerDay:   2,
  },
  '1x-morning': {
    label:          'Solo mattina',
    description:    '1 sessione al giorno (mattina)',
    recommendation: 'Adatto per il monitoraggio di mantenimento a lungo termine. Misura sempre alla stessa ora, prima di colazione e dei farmaci, dopo 5 minuti di riposo.',
    eventsPerDay:   1,
  },
  '1x-evening': {
    label:          'Solo sera',
    description:    '1 sessione al giorno (sera)',
    recommendation: 'Utile per monitorare la pressione serale. Misura dopo almeno 1 ora dall\'ultimo pasto, lontano da attività fisica intensa.',
    eventsPerDay:   1,
  },
  'every-2d': {
    label:          'A giorni alterni',
    description:    '1 sessione ogni 2 giorni',
    recommendation: 'Adatto per la fase di stabilità, quando la pressione è già ben controllata. Mantieni comunque la misurazione regolare per cogliere eventuali variazioni stagionali o legate ai farmaci.',
    eventsPerDay:   0.5,
  },
};

export const DURATION_META: Record<ReminderDuration, { label: string; note: string }> = {
  7:  { label: '7 giorni',  note: 'Protocollo diagnostico ESH 2023 — durata minima raccomandata per la prima valutazione.' },
  14: { label: '14 giorni', note: 'Due settimane — utile per valutare la risposta a una nuova terapia.' },
  30: { label: '30 giorni', note: 'Un mese di dati fornisce un quadro solido per il medico curante.' },
  90: { label: '90 giorni', note: 'Tre mesi — ideale per il monitoraggio di lungo periodo tra una visita e l\'altra.' },
};

// ─── ICS Helpers ──────────────────────────────────────────────────────────────

function toICSDate(date: Date, timeStr: string): string {
  const [hh, mm] = timeStr.split(':').map(Number);
  const d = new Date(date);
  d.setHours(hh, mm, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  );
}

function uid(): string {
  return `flow-bp-${Date.now()}-${Math.random().toString(36).slice(2)}@flow-bp`;
}

function escapeICS(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function buildEvent(
  dtstart: string,
  rrule: string,
  summary: string,
  description: string,
): string {
  return [
    'BEGIN:VEVENT',
    `UID:${uid()}`,
    `DTSTART:${dtstart}`,
    'DURATION:PT10M',
    `RRULE:${rrule}`,
    `SUMMARY:${escapeICS(summary)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeICS(summary)}`,
    'END:VALARM',
    'END:VEVENT',
  ].join('\r\n');
}

// ─── Public API ───────────────────────────────────────────────────────────────

const DESCRIPTION_BODY = [
  'Promemoria: sessione di misurazione pressione arteriosa con Flow.',
  '',
  'Prima di misurare:',
  '• Riposa seduto per 5 minuti',
  '• Evita caffè\\, fumo\\, attività fisica nell\'ora precedente',
  '• Svuota la vescica se necessario',
  '',
  'Protocollo ESH 2023:',
  '• 3 letture consecutive con 1 minuto di pausa',
  '• La prima lettura viene scartata automaticamente da Flow',
  '• Registra i valori su https://flow-bp.vercel.app',
].join('\\n');

export function generateICS(config: ReminderConfig): string {
  const { frequency, duration, morningTime, eveningTime } = config;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const meta     = FREQUENCY_META[frequency];
  const summary  = `💊 Misurazione pressione (Flow)`;
  const desc     = `${escapeICS(meta.recommendation)}\\n\\n${DESCRIPTION_BODY}`;

  let rrule: string;
  if (frequency === 'every-2d') {
    rrule = `FREQ=DAILY;INTERVAL=2;COUNT=${duration}`;
  } else {
    rrule = `FREQ=DAILY;COUNT=${duration}`;
  }

  const events: string[] = [];

  if (frequency === '2x-daily') {
    events.push(buildEvent(toICSDate(tomorrow, morningTime), rrule, `${summary} — Mattina`, desc));
    events.push(buildEvent(toICSDate(tomorrow, eveningTime), rrule, `${summary} — Sera`,   desc));
  } else {
    const time = frequency === '1x-evening' ? eveningTime : morningTime;
    events.push(buildEvent(toICSDate(tomorrow, time), rrule, summary, desc));
  }

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flow Blood Pressure Monitor//IT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:Flow — Promemoria pressione`,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

export function downloadICS(config: ReminderConfig): void {
  const ics  = generateICS(config);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'flow_promemoria_pressione.ics';
  a.click();
  URL.revokeObjectURL(url);
}

/** Google Calendar "Add Event" URL (opens in browser, no OAuth needed) */
export function buildGoogleCalendarURL(config: ReminderConfig): string {
  const { frequency, duration, morningTime, eveningTime } = config;
  const meta    = FREQUENCY_META[frequency];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const time   = frequency === '1x-evening' ? eveningTime : morningTime;
  const [hh, mm] = time.split(':').map(Number);
  const start  = new Date(tomorrow);
  start.setHours(hh, mm, 0, 0);
  const end    = new Date(start.getTime() + 10 * 60 * 1000);

  const pad    = (n: number) => String(n).padStart(2, '0');
  const fmt    = (d: Date) =>
    `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

  const rrule  = frequency === 'every-2d'
    ? `RRULE:FREQ=DAILY;INTERVAL=2;COUNT=${duration}`
    : `RRULE:FREQ=DAILY;COUNT=${duration}`;

  const details = `${meta.recommendation}\n\nProtocollo ESH 2023: 3 letture con 1 min di pausa, prima lettura scartata.\nRegistra su https://flow-bp.vercel.app`;

  const params = new URLSearchParams({
    action:  'TEMPLATE',
    text:    '💊 Misurazione pressione (Flow)',
    dates:   `${fmt(start)}/${fmt(end)}`,
    recur:   rrule,
    details: details,
    sf:      'true',
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
