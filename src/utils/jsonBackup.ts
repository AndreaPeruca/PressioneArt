/**
 * @module jsonBackup
 * @description
 * Export all session data as a JSON backup file, and parse a backup JSON file
 * back into ImportRow[] for re-import via the existing importMeasurements pathway.
 *
 * Backup format: { version: 1, exportedAt: ISO string, sessions: BPSession[] }
 * Each session's warmupReading + officialReadings are preserved so no data is lost.
 */

import type { BPSession, ImportRow, MeasurementTag, MeasurementDevice } from '../types';

const BACKUP_VERSION = 1;

interface BackupFile {
  version: number;
  exportedAt: string;
  sessions: BPSession[];
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function exportBackupJSON(sessions: BPSession[]): void {
  const sorted = [...sessions].sort((a, b) => a.timestamp - b.timestamp);
  const backup: BackupFile = {
    version:    BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    sessions:   sorted,
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const date = new Date().toLocaleDateString('it-IT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).replace(/\//g, '-');

  a.href     = url;
  a.download = `flow_backup_${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Import / Restore ─────────────────────────────────────────────────────────

export interface BackupParseResult {
  rows:   ImportRow[];
  errors: string[];
  count:  number;
}

const BP_RANGES = {
  systolic:  { min: 60,  max: 300 },
  diastolic: { min: 40,  max: 200 },
  heartRate: { min: 30,  max: 250 },
} as const;

const MAX_NOTE_LENGTH = 500;

function validateReadingValues(sys: number, dia: number, hr: number): string | null {
  if (sys < BP_RANGES.systolic.min || sys > BP_RANGES.systolic.max)
    return `sistolica ${sys} fuori range [${BP_RANGES.systolic.min}–${BP_RANGES.systolic.max}]`;
  if (dia < BP_RANGES.diastolic.min || dia > BP_RANGES.diastolic.max)
    return `diastolica ${dia} fuori range [${BP_RANGES.diastolic.min}–${BP_RANGES.diastolic.max}]`;
  if (hr < BP_RANGES.heartRate.min || hr > BP_RANGES.heartRate.max)
    return `frequenza ${hr} fuori range [${BP_RANGES.heartRate.min}–${BP_RANGES.heartRate.max}]`;
  if (dia >= sys)
    return `diastolica (${dia}) deve essere inferiore alla sistolica (${sys})`;
  return null;
}

const VALID_TAGS = new Set<MeasurementTag>([
  'stress', 'caffeine', 'work', 'post-sport', 'rest', 'medication',
  'headache', 'dizziness', 'chest-pain', 'visual-disturbance', 'palpitations',
]);

function isMeasurementTag(t: unknown): t is MeasurementTag {
  return typeof t === 'string' && VALID_TAGS.has(t as MeasurementTag);
}

/**
 * Parse a raw JSON backup file content string into ImportRow[].
 * Also accepts a plain BPSession[] array directly (for forward-compat).
 */
export function parseBackupJSON(content: string): BackupParseResult {
  const errors: string[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return { rows: [], errors: ['File JSON non valido o corrotto.'], count: 0 };
  }

  // Accept both the wrapped format { version, sessions } and a bare array
  let rawSessions: unknown[];
  if (Array.isArray(parsed)) {
    rawSessions = parsed;
  } else if (
    parsed !== null &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as BackupFile).sessions)
  ) {
    const backup = parsed as BackupFile;
    if (backup.version !== BACKUP_VERSION) {
      errors.push(`Versione backup non riconosciuta (${backup.version}). Importazione tentata comunque.`);
    }
    rawSessions = backup.sessions;
  } else {
    return { rows: [], errors: ['Struttura del file JSON non riconosciuta.'], count: 0 };
  }

  const rows: ImportRow[] = [];

  for (let i = 0; i < rawSessions.length; i++) {
    const s = rawSessions[i] as Record<string, unknown>;
    if (typeof s !== 'object' || s === null) {
      errors.push(`Sessione ${i + 1}: non è un oggetto valido.`);
      continue;
    }

    const timestamp = typeof s.timestamp === 'number' ? s.timestamp : null;
    if (!timestamp || timestamp < 946684800000 || timestamp > Date.now() + 60_000) {
      errors.push(`Sessione ${i + 1}: timestamp non valido.`);
      continue;
    }

    // Use the individual official readings if present (preserves all readings as separate rows)
    const officialReadings = Array.isArray(s.officialReadings) ? s.officialReadings : [];
    const warmupReading    = s.warmupReading && typeof s.warmupReading === 'object' ? s.warmupReading as Record<string, unknown> : null;

    const device: MeasurementDevice = s.device === 'wrist' ? 'wrist' : 'arm';
    const tags: MeasurementTag[] = Array.isArray(s.tags)
      ? (s.tags as unknown[]).filter(isMeasurementTag)
      : [];
    const note = typeof s.note === 'string' ? s.note.slice(0, MAX_NOTE_LENGTH) : undefined;

    if (officialReadings.length > 0) {
      // Restore each official reading as a separate ImportRow (they'll be re-grouped by session)
      // For simplicity, use the session timestamp for the first and space them 60 seconds apart
      officialReadings.forEach((r, ri) => {
        const reading = r as Record<string, unknown>;
        const sys = Number(reading.systolic);
        const dia = Number(reading.diastolic);
        const hr  = Number(reading.heartRate);
        if (isNaN(sys) || isNaN(dia) || isNaN(hr)) {
          errors.push(`Sessione ${i + 1}, lettura ${ri + 1}: valori numerici non validi.`);
          return;
        }
        const rangeErr = validateReadingValues(sys, dia, hr);
        if (rangeErr) {
          errors.push(`Sessione ${i + 1}, lettura ${ri + 1}: ${rangeErr}.`);
          return;
        }
        const hasIrr = reading.hasIrregularHeartbeat === true ? true : undefined;
        rows.push({
          timestamp: timestamp + (ri + 1) * 60_000, // space readings 60s apart
          systolic:  sys,
          diastolic: dia,
          heartRate: hr,
          tags,
          note,
          device,
          hasIrregularHeartbeat: hasIrr,
        });
      });

      // Also restore warmup reading if present
      if (warmupReading) {
        const sys = Number(warmupReading.systolic);
        const dia = Number(warmupReading.diastolic);
        const hr  = Number(warmupReading.heartRate);
        if (!isNaN(sys) && !isNaN(dia) && !isNaN(hr)) {
          rows.push({
            timestamp,
            systolic:  sys,
            diastolic: dia,
            heartRate: hr,
            tags,
            note,
            device,
            hasIrregularHeartbeat: warmupReading.hasIrregularHeartbeat === true ? true : undefined,
          });
        }
      }
    } else {
      // Fallback: use session averages (e.g. single-reading sessions or older format)
      const sys = typeof s.systolic  === 'number' ? s.systolic  : NaN;
      const dia = typeof s.diastolic === 'number' ? s.diastolic : NaN;
      const hr  = typeof s.heartRate === 'number' ? s.heartRate : NaN;
      if (isNaN(sys) || isNaN(dia) || isNaN(hr)) {
        errors.push(`Sessione ${i + 1}: valori numerici non validi.`);
        continue;
      }
      const rangeErr = validateReadingValues(sys, dia, hr);
      if (rangeErr) {
        errors.push(`Sessione ${i + 1}: ${rangeErr}.`);
        continue;
      }
      rows.push({ timestamp, systolic: sys, diastolic: dia, heartRate: hr, tags, note, device });
    }
  }

  return { rows, errors, count: rawSessions.length };
}
