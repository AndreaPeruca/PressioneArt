/**
 * @module csvImport
 * @description
 * Client-side CSV parser for bulk-importing blood-pressure measurements.
 * Zero external dependencies — processes everything in the browser.
 *
 * Supported column order (case-insensitive header row):
 *   Data, Sistolica, Diastolica, Frequenza, Tag, Nota
 *
 * Date formats accepted:
 *   - DD/MM/YYYY HH:MM  (Italian locale, e.g. "15/01/2024 08:30")
 *   - DD/MM/YYYY        (date only → time set to 00:00)
 *   - YYYY-MM-DD HH:MM  (ISO-like)
 *   - YYYY-MM-DD        (ISO date only)
 *
 * Tags: semicolon-separated (e.g. "stress;caffeine").
 * Fields: comma-separated; quoted fields with commas are supported.
 *
 * Export the CSV template constant for the "Download template" button.
 */

import { validateMeasurement } from '../db/database';
import type { ImportRow, MeasurementDevice, MeasurementTag, ParseResult } from '../types';

// ─── Template ─────────────────────────────────────────────────────────────────

export const CSV_TEMPLATE = [
  'Data,Sistolica,Diastolica,Frequenza,Tag,Nota,Dispositivo,Irregolare',
  '15/01/2024 08:30,130,85,72,stress;caffeine,Prima colazione,arm,',
  '15/01/2024 20:00,125,82,70,,Sera,arm,',
  '16/01/2024 08:15,128,84,68,rest,Dopo riposo,wrist,si',
].join('\r\n');

export const VALID_TAGS = new Set<MeasurementTag>([
  // Context tags
  'stress', 'caffeine', 'work', 'post-sport', 'rest', 'medication',
  // Symptom tags
  'headache', 'dizziness', 'chest-pain', 'visual-disturbance', 'palpitations',
]);

/** Maximum CSV file size accepted (5 MB). Larger files are rejected before reading. */
export const MAX_CSV_BYTES = 5 * 1024 * 1024;

/** Maximum number of data rows accepted per import. */
export const MAX_CSV_ROWS = 5_000;

// ─── Date Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a date string in Italian (DD/MM/YYYY) or ISO (YYYY-MM-DD) format,
 * with optional HH:MM time component.
 * Returns a Unix timestamp in milliseconds, or null on failure.
 */
function parseDate(raw: string): number | null {
  const s = raw.trim();

  // DD/MM/YYYY HH:MM  or  DD/MM/YYYY
  const itMatch = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/,
  );
  if (itMatch) {
    const [, d, mo, y, hh = '0', mm = '0'] = itMatch;
    const date = new Date(
      Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm),
    );
    return isNaN(date.getTime()) ? null : date.getTime();
  }

  // YYYY-MM-DD HH:MM[:SS]  or  YYYY-MM-DD
  const isoMatch = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2})?)?$/,
  );
  if (isoMatch) {
    const [, y, mo, d, hh = '0', mm = '0'] = isoMatch;
    const date = new Date(
      Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm),
    );
    return isNaN(date.getTime()) ? null : date.getTime();
  }

  return null;
}

// ─── CSV Tokeniser ────────────────────────────────────────────────────────────

/**
 * Split a single CSV line into fields, respecting double-quoted values
 * that may contain commas.
 */
function tokenise(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote inside quoted field
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// ─── Header Detection ─────────────────────────────────────────────────────────

/** Column index map after detecting the header row */
interface ColMap {
  data: number;
  sistolica: number;
  diastolica: number;
  frequenza: number;
  tag: number;
  nota: number;
  dispositivo: number;
  irregolare: number;
}

const HEADER_ALIASES: Record<keyof ColMap, string[]> = {
  data:        ['data', 'date', 'datetime', 'timestamp'],
  sistolica:   ['sistolica', 'sys', 'systolic', 'sist'],
  diastolica:  ['diastolica', 'dia', 'diastolic', 'diast'],
  frequenza:   ['frequenza', 'fc', 'hr', 'heartrate', 'bpm', 'pulse'],
  tag:         ['tag', 'tags', 'contesto'],
  nota:        ['nota', 'note', 'notes', 'commento'],
  dispositivo: ['dispositivo', 'device', 'strumento'],
  irregolare:  ['irregolare', 'irregular', 'arrhythmia', 'aritmia'],
};

function detectColumns(headerFields: string[]): ColMap | null {
  const normalized = headerFields.map((f) => f.toLowerCase().replace(/\s+/g, ''));
  const map: Partial<ColMap> = {};

  for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [keyof ColMap, string[]][]) {
    const idx = normalized.findIndex((f) => aliases.includes(f));
    map[key] = idx; // -1 means not found
  }

  // Mandatory columns
  if (
    (map.data ?? -1) < 0 ||
    (map.sistolica ?? -1) < 0 ||
    (map.diastolica ?? -1) < 0 ||
    (map.frequenza ?? -1) < 0
  ) {
    return null;
  }

  return map as ColMap;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse raw CSV text into `ImportRow[]` + a list of per-line errors.
 *
 * @param content - Raw file content (UTF-8 string)
 * @returns `ParseResult` with `valid` rows and `errors` array
 */
export function parseCSV(content: string): ParseResult {
  const lines = content
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return {
      valid: [],
      errors: [{ line: 0, raw: '', message: 'Il file è vuoto o privo di dati.' }],
    };
  }

  // Row-count guard (header doesn't count)
  if (lines.length - 1 > MAX_CSV_ROWS) {
    return {
      valid: [],
      errors: [{
        line: 0,
        raw: '',
        message: `Il file contiene troppi dati (max ${MAX_CSV_ROWS.toLocaleString('it-IT')} righe).`,
      }],
    };
  }

  // Detect header
  const headerFields = tokenise(lines[0]);
  const colMap = detectColumns(headerFields);

  if (!colMap) {
    return {
      valid: [],
      errors: [{
        line: 1,
        raw: lines[0],
        message:
          'Intestazione non riconosciuta. Colonne richieste: Data, Sistolica, Diastolica, Frequenza.',
      }],
    };
  }

  const valid: ImportRow[] = [];
  const errors: ParseResult['errors'] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = lines[i];
    const fields = tokenise(raw);

    const get = (idx: number) => (idx >= 0 ? (fields[idx] ?? '').trim() : '');

    // ── Date ──
    const timestamp = parseDate(get(colMap.data));
    if (!timestamp) {
      errors.push({ line: lineNum, raw, message: `Data non valida: "${get(colMap.data)}"` });
      continue;
    }
    // Reject dates before year 2000 — avoids negative/garbage timestamps from typos like "0000"
    if (timestamp < 946684800000) {
      errors.push({ line: lineNum, raw, message: `Data non valida (anteriore al 2000): "${get(colMap.data)}"` });
      continue;
    }
    if (timestamp > Date.now() + 60_000) {
      // Allow 1-minute clock skew but reject genuine future dates
      errors.push({ line: lineNum, raw, message: `Data futura non consentita: "${get(colMap.data)}"` });
      continue;
    }

    // ── Numerics ──
    const systolic  = Number(get(colMap.sistolica));
    const diastolic = Number(get(colMap.diastolica));
    const heartRate = Number(get(colMap.frequenza));

    if (isNaN(systolic) || isNaN(diastolic) || isNaN(heartRate)) {
      errors.push({ line: lineNum, raw, message: 'Valori numerici non validi.' });
      continue;
    }

    try {
      validateMeasurement(systolic, diastolic, heartRate);
    } catch (err) {
      errors.push({
        line: lineNum,
        raw,
        message: err instanceof Error ? err.message : 'Valori fuori range.',
      });
      continue;
    }

    // ── Tags ──
    const rawTags = get(colMap.tag);
    const tags: MeasurementTag[] = rawTags
      .split(';')
      .map((t) => t.trim().toLowerCase() as MeasurementTag)
      .filter((t) => VALID_TAGS.has(t));

    // ── Note ──
    const note = get(colMap.nota) || undefined;

    // ── Device ──
    const rawDevice = get(colMap.dispositivo).toLowerCase();
    const device: MeasurementDevice = rawDevice === 'wrist' || rawDevice === 'polso' ? 'wrist' : 'arm';

    // ── Irregular heartbeat ──
    const rawIrr = get(colMap.irregolare).toLowerCase();
    const hasIrregularHeartbeat = ['si', 'sì', 'yes', '1', 'true'].includes(rawIrr) ? true : undefined;

    valid.push({ timestamp, systolic, diastolic, heartRate, tags, note, device, hasIrregularHeartbeat });
  }

  return { valid, errors };
}

// ─── Template Download ────────────────────────────────────────────────────────

/** Trigger a browser download of the CSV template file. */
export function downloadTemplate(): void {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'flow_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}
