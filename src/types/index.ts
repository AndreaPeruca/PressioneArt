// ─── Domain Types ────────────────────────────────────────────────────────────

/** Contextual + symptom tags that correlate with pressure readings */
export type MeasurementTag =
  // Context
  | 'stress' | 'caffeine' | 'work' | 'post-sport' | 'rest' | 'medication'
  // Symptoms — clinically relevant for the doctor
  | 'headache' | 'dizziness' | 'chest-pain' | 'visual-disturbance' | 'palpitations';

/** Which arm was used for the measurement */
export type MeasurementArm = 'left' | 'right' | 'unknown';

/** ESC/ESH 2023 blood-pressure classification */
export type BPCategory =
  | 'optimal'       // < 120/80
  | 'normal'        // 120-129 / 80-84
  | 'high-normal'   // 130-139 / 85-89
  | 'grade1'        // 140-159 / 90-99
  | 'grade2'        // 160-179 / 100-109
  | 'grade3';       // ≥ 180 / ≥ 110

/**
 * A single raw blood-pressure reading.
 *
 * Session fields (optional for backward compatibility with solo readings
 * and CSV-imported data):
 *  - sessionId    – UUID grouping 2–3 readings taken in the same sitting
 *  - readingIndex – 0 = warmup (first, discarded), 1 = second, 2 = third
 *  - isWarmup     – true when readingIndex === 0
 *
 * Follows the ESC/ESH 2023 HBPM protocol:
 *   3 readings per session, 1-minute gap, discard first,
 *   average the remaining 2 as the "official" session value.
 */
export interface BPMeasurement {
  id?: number;
  timestamp: number;
  systolic: number;
  diastolic: number;
  heartRate: number;
  tags: MeasurementTag[];
  note?: string;
  category: BPCategory;
  arm?: MeasurementArm;
  hasIrregularHeartbeat?: boolean;
  // ── Session fields (optional) ─────────────────────────────────────────
  sessionId?: string;
  readingIndex?: number;  // 0 | 1 | 2
  isWarmup?: boolean;
}

/**
 * A clinical session — 2 or 3 readings grouped together.
 * `systolic`, `diastolic`, `heartRate` are the mean of non-warmup readings.
 * This is what the chart and statistics consume.
 */
export interface BPSession {
  sessionId: string;
  timestamp: number;       // timestamp of the first reading
  systolic: number;        // mean of official readings
  diastolic: number;
  heartRate: number;
  category: BPCategory;
  tags: MeasurementTag[];
  note?: string;
  readingCount: number;    // number of official (non-warmup) readings
  warmupReading?: BPMeasurement;
  officialReadings: BPMeasurement[];
}

/** Shape of data points fed to Recharts (derived from BPSession) */
export interface ChartDataPoint {
  label: string;
  timestamp: number;
  systolic: number;
  diastolic: number;
  heartRate: number;
  category: BPCategory;
}

// ─── Period Filter ────────────────────────────────────────────────────────────

export type PeriodFilter = 'today' | '7d' | '30d' | 'all';

// ─── CSV Import ───────────────────────────────────────────────────────────────

export interface ImportRow {
  timestamp: number;
  systolic: number;
  diastolic: number;
  heartRate: number;
  tags: MeasurementTag[];
  note?: string;
}

export interface ParseResult {
  valid: ImportRow[];
  errors: { line: number; raw: string; message: string }[];
}

// ─── Session Form ─────────────────────────────────────────────────────────────

/** One raw reading captured during a session */
export interface RawReading {
  systolic: string;
  diastolic: string;
  heartRate: string;
}

export interface FormFieldError {
  systolic?: string;
  diastolic?: string;
  heartRate?: string;
}

export interface SessionFormProps {
  onSave: (readings: SessionPayload) => Promise<void>;
}

/** Payload passed from SessionForm to the store */
export interface SessionPayload {
  sessionId: string;
  tags: MeasurementTag[];
  note?: string;
  arm?: MeasurementArm;
  hasIrregularHeartbeat?: boolean;
  /** All readings in order: index 0 = warmup, 1–2 = official */
  readings: Array<{
    timestamp: number;
    systolic: number;
    diastolic: number;
    heartRate: number;
    readingIndex: number;
    isWarmup: boolean;
  }>;
}

// ─── UI / Component Props ─────────────────────────────────────────────────────

export interface BreathingTimerProps {
  durationSeconds: number;
  onComplete: () => void;
}

export interface CountdownTimerProps {
  durationSeconds: number;
  onComplete: () => void;
  label?: string;
}

export interface InsightChartProps {
  data: ChartDataPoint[];
  period: PeriodFilter;
}

// ─── Database Schema ──────────────────────────────────────────────────────────

export interface EncryptedRecord {
  id?: number;
  dateBucket: string;
  ciphertext: string;
  iv: string;
  schemaVersion: number;
}
