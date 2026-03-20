/**
 * @module database
 * @description
 * Dexie (IndexedDB) provider for the Pressione PWA.
 *
 * Schema v1 → v2 migration:
 *   v2 adds `sessionId` and `isWarmup` indexes to support the ESC/ESH
 *   3-reading session protocol. Existing records (solo readings, CSV imports)
 *   have these fields undefined — they are treated as single-reading sessions.
 */

import Dexie, { type Table } from 'dexie';
import type {
  BPCategory,
  BPMeasurement,
  BPSession,
  EncryptedRecord,
  SessionPayload,
} from '../types';

// ─── ESC/ESH 2023 Classification (HBPM thresholds) ───────────────────────────
//
// IMPORTANT: Home Blood Pressure Monitoring uses LOWER thresholds than office BP.
// Source: Mancia et al., ESC/ESH 2023 Guidelines, Table 4.
//
//   HBPM Category    Systolic (mmHg)   Diastolic (mmHg)
//   ──────────────── ───────────────── ──────────────────
//   Optimal          < 120             < 70
//   Normal           120–129           70–79
//   High-normal      130–134           80–84
//   Grade 1 HTN      135–149           85–94    ← 135/85 (not 140/90!)
//   Grade 2 HTN      150–179           95–109
//   Grade 3 HTN      ≥ 180             ≥ 110
//   Crisis           ≥ 180             ≥ 120    ← hypertensive emergency
//
// The critical difference from office BP: Grade 1 starts at 135/85 at home.
// Using 140/90 for home readings UNDERDIAGNOSES hypertension.

export function classifyBP(systolic: number, diastolic: number): BPCategory {
  if (systolic >= 180 || diastolic >= 110) return 'grade3';
  if (systolic >= 150 || diastolic >= 95)  return 'grade2';
  if (systolic >= 135 || diastolic >= 85)  return 'grade1';   // HBPM: 135/85
  if (systolic >= 130 || diastolic >= 80)  return 'high-normal';
  if (systolic >= 120 || diastolic >= 70)  return 'normal';
  return 'optimal';
}

/**
 * Returns true when values meet the criteria for hypertensive crisis.
 * ESC/ESH 2023: ≥180 systolic AND/OR ≥120 diastolic.
 * Requires immediate medical evaluation.
 */
export function isHypertensiveCrisis(systolic: number, diastolic: number): boolean {
  return systolic >= 180 || diastolic >= 120;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_RANGES = {
  systolic:  { min: 60,  max: 300 },
  diastolic: { min: 40,  max: 200 },
  heartRate: { min: 30,  max: 250 },
} as const;

export function validateMeasurement(
  systolic: number,
  diastolic: number,
  heartRate: number,
): void {
  const assertInRange = (value: number, field: keyof typeof VALID_RANGES): void => {
    const { min, max } = VALID_RANGES[field];
    if (value < min || value > max) {
      throw new RangeError(
        `${field} ${value} è fuori dal range valido [${min}, ${max}].`,
      );
    }
  };
  assertInRange(systolic,  'systolic');
  assertInRange(diastolic, 'diastolic');
  assertInRange(heartRate, 'heartRate');
  if (diastolic >= systolic) {
    throw new RangeError('La pressione diastolica deve essere inferiore alla sistolica.');
  }
  if (systolic - diastolic < 10) {
    throw new RangeError(
      `Pressione differenziale (${systolic - diastolic} mmHg) troppo bassa per essere fisiologica (minimo 10 mmHg).`,
    );
  }
}

// ─── Session derivation ───────────────────────────────────────────────────────

/**
 * Given a flat list of BPMeasurement (sorted oldest → newest),
 * group them into BPSession objects.
 * Records without sessionId each become their own solo session.
 */
function deriveSessions(measurements: BPMeasurement[]): BPSession[] {
  const map = new Map<string, BPMeasurement[]>();

  for (const m of measurements) {
    // Solo readings (CSV import, demo data) get a unique per-record key
    const key = m.sessionId ?? `solo-${m.id ?? m.timestamp}`;
    const bucket = map.get(key) ?? [];
    bucket.push(m);
    map.set(key, bucket);
  }

  const sessions: BPSession[] = [];

  for (const [sessionId, readings] of map.entries()) {
    readings.sort((a, b) => a.timestamp - b.timestamp);

    const warmup   = readings.find((r) => r.isWarmup === true);
    const official = readings.filter((r) => !r.isWarmup);

    // Fallback: if no isWarmup flag (solo/CSV), treat all as official
    const officialReadings = official.length > 0 ? official : readings;

    const n   = officialReadings.length;
    const sys = Math.round(officialReadings.reduce((s, r) => s + r.systolic,  0) / n);
    const dia = Math.round(officialReadings.reduce((s, r) => s + r.diastolic, 0) / n);
    const hr  = Math.round(officialReadings.reduce((s, r) => s + r.heartRate, 0) / n);

    sessions.push({
      sessionId,
      timestamp:       readings[0].timestamp,
      systolic:        sys,
      diastolic:       dia,
      heartRate:       hr,
      category:        classifyBP(sys, dia),
      tags:            readings[0].tags,
      note:            readings[0].note,
      readingCount:    officialReadings.length,
      warmupReading:   warmup,
      officialReadings,
    });
  }

  // Newest first
  return sessions.sort((a, b) => b.timestamp - a.timestamp);
}

// ─── Database Interface ───────────────────────────────────────────────────────

export interface IPressureDB {
  /** Save a multi-reading session atomically. */
  addSession(payload: SessionPayload): Promise<void>;

  /** Retrieve all sessions (newest first), derived from raw measurements. */
  getAllSessions(): Promise<BPSession[]>;

  /** Delete all measurements belonging to a session. */
  deleteSession(sessionId: string): Promise<void>;

  /** Wipe everything. */
  clearAllMeasurements(): Promise<void>;

  /** Bulk import (CSV / demo data) — each row becomes a solo session.
   *  Skips rows whose timestamp is within ±1 minute of an existing record. */
  addManyMeasurements(rows: Omit<BPMeasurement, 'id' | 'category'>[]): Promise<{ inserted: number; skipped: number }>;
}

// ─── Concrete Dexie Class ─────────────────────────────────────────────────────

class PressureDatabase extends Dexie implements IPressureDB {
  public measurements!: Table<BPMeasurement, number>;
  public encryptedRecords!: Table<EncryptedRecord, number>;

  constructor() {
    super('PressioneDB');

    /** v1 – initial schema */
    this.version(1).stores({
      measurements:
        '++id, timestamp, category, [systolic+diastolic]',
      encryptedRecords:
        '++id, dateBucket, schemaVersion',
    });

    /**
     * v2 – adds sessionId + isWarmup indexes.
     * No data migration needed: existing records keep undefined values,
     * which are handled gracefully in deriveSessions().
     */
    this.version(2).stores({
      measurements:
        '++id, timestamp, category, sessionId, isWarmup, [systolic+diastolic]',
      encryptedRecords:
        '++id, dateBucket, schemaVersion',
    });
  }

  async addSession(payload: SessionPayload): Promise<void> {
    // Validate all readings before opening the transaction
    for (const r of payload.readings) {
      validateMeasurement(r.systolic, r.diastolic, r.heartRate);
    }
    await this.transaction('rw', this.measurements, async () => {
      for (const r of payload.readings) {
        const record: Omit<BPMeasurement, 'id'> = {
          timestamp:              r.timestamp,
          systolic:               r.systolic,
          diastolic:              r.diastolic,
          heartRate:              r.heartRate,
          tags:                   payload.tags,
          note:                   payload.note,
          category:               classifyBP(r.systolic, r.diastolic),
          arm:                    payload.arm,
          hasIrregularHeartbeat:  payload.hasIrregularHeartbeat,
          sessionId:              payload.sessionId,
          readingIndex:           r.readingIndex,
          isWarmup:               r.isWarmup,
        };
        await this.measurements.add(record as BPMeasurement);
      }
    });
  }

  async getAllSessions(): Promise<BPSession[]> {
    const all = await this.measurements.orderBy('timestamp').toArray();
    return deriveSessions(all);
  }

  async deleteSession(sessionId: string): Promise<void> {
    // For solo readings the key is "solo-{id}", but actual sessionId is undefined.
    // We detect solo sessions by the prefix.
    if (sessionId.startsWith('solo-')) {
      const rawId = sessionId.replace('solo-', '');
      // Could be numeric id or timestamp — try both
      const numeric = Number(rawId);
      if (!isNaN(numeric)) {
        await this.measurements.delete(numeric);
      }
    } else {
      await this.measurements.where('sessionId').equals(sessionId).delete();
    }
  }

  async clearAllMeasurements(): Promise<void> {
    await this.measurements.clear();
  }

  async addManyMeasurements(
    rows: Omit<BPMeasurement, 'id' | 'category'>[],
  ): Promise<{ inserted: number; skipped: number }> {
    // Build a set of minute-bucketed timestamps from existing records
    // to detect duplicates within ±1 minute (same minute bucket = duplicate)
    const existing = await this.measurements.orderBy('timestamp').toArray();
    const existingBuckets = new Set(existing.map((m) => Math.round(m.timestamp / 60_000)));

    let inserted = 0;
    let skipped  = 0;

    await this.transaction('rw', this.measurements, async () => {
      for (const row of rows) {
        const bucket = Math.round(row.timestamp / 60_000);
        if (existingBuckets.has(bucket)) {
          skipped++;
          continue;
        }
        const record: Omit<BPMeasurement, 'id'> = {
          ...row,
          category: classifyBP(row.systolic, row.diastolic),
          // No sessionId / isWarmup → treated as solo session
        };
        await this.measurements.add(record as BPMeasurement);
        existingBuckets.add(bucket); // prevent intra-batch duplicates too
        inserted++;
      }
    });

    return { inserted, skipped };
  }
}

export const db: IPressureDB = new PressureDatabase();
