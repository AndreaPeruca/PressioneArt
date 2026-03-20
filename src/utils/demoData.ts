/**
 * @module demoData
 * @description
 * Generates a realistic 30-day blood-pressure dataset for demonstration.
 *
 * Clinical narrative:
 *   Week 1   – Periodo di stress lavorativo. Valori elevati (Grado 1).
 *   Week 2   – Qualche miglioramento. Inizio attività fisica.
 *   Week 3   – Trend positivo. Valori Normale-Alta.
 *   Week 4   – Stabilizzazione. Valori Normali / Ottimali.
 *
 * Physiological realism:
 *   - Diurnal variation: mattina +5–8 mmHg rispetto a sera.
 *   - Caffè & stress aumentano i valori di 8–12 mmHg.
 *   - Post-sport abbassa i valori di 6–10 mmHg.
 *   - Medicazione (settimana 3–4) riduce i valori.
 *   - Gaussian noise ±4 mmHg per simulare la variabilità fisiologica.
 *
 * All dates are computed relative to today so the data always appears
 * recent, regardless of when the app is opened.
 */

import type { ImportRow, MeasurementTag } from '../types';

// ─── Seeded PRNG (LCG) ────────────────────────────────────────────────────────
// Deterministic so every "Load demo" call generates the same dataset.

function makePRNG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(1664525, s) + 1013904223;
    return (s >>> 0) / 0xffffffff;
  };
}

const rng = makePRNG(0xdeadbeef);

/** Gaussian noise via Box-Muller transform */
function gaussian(mean: number, std: number): number {
  const u1 = Math.max(rng(), 1e-10);
  const u2  = rng();
  const z   = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.round(mean + z * std);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// ─── Day schedule definition ──────────────────────────────────────────────────

interface Reading {
  hour: number;
  minute: number;
  tags: MeasurementTag[];
  note?: string;
}

interface DayPlan {
  daysAgo: number;
  /** Base systolic for that day (before noise & modifiers) */
  baseSys: number;
  /** Base diastolic */
  baseDia: number;
  readings: Reading[];
}

// ─── 30-day plan ─────────────────────────────────────────────────────────────

const DAY_PLANS: DayPlan[] = [
  // ── Week 1: stress lavorativo ─────────────────────────────────────────
  {
    daysAgo: 29, baseSys: 152, baseDia: 96,
    readings: [
      { hour: 7,  minute: 15, tags: ['caffeine', 'work'],   note: 'Mattina prima della riunione' },
      { hour: 20, minute: 30, tags: ['stress', 'work'],     note: 'Giornata pesante' },
    ],
  },
  {
    daysAgo: 28, baseSys: 149, baseDia: 94,
    readings: [
      { hour: 7,  minute: 30, tags: ['caffeine'] },
      { hour: 13, minute: 0,  tags: ['stress', 'work'],     note: 'Dopo videochiamata' },
      { hour: 21, minute: 0,  tags: [] },
    ],
  },
  {
    daysAgo: 27, baseSys: 155, baseDia: 98,
    readings: [
      { hour: 7,  minute: 0,  tags: ['caffeine', 'work'],   note: 'Alta mattina' },
      { hour: 19, minute: 45, tags: ['stress'],              note: 'Picco dopo telefonata' },
    ],
  },
  {
    daysAgo: 26, baseSys: 148, baseDia: 93,
    readings: [
      { hour: 8,  minute: 0,  tags: ['caffeine'] },
      { hour: 20, minute: 15, tags: [] },
    ],
  },
  {
    daysAgo: 25, baseSys: 143, baseDia: 91,
    readings: [
      { hour: 7,  minute: 45, tags: ['caffeine', 'work'] },
      { hour: 12, minute: 30, tags: ['stress'] },
      { hour: 20, minute: 0,  tags: ['rest'] },
    ],
  },
  {
    daysAgo: 24, baseSys: 141, baseDia: 90,   // weekend – più tranquillo
    readings: [
      { hour: 9,  minute: 0,  tags: ['rest'],               note: 'Weekend, sveglia tardi' },
      { hour: 20, minute: 30, tags: [] },
    ],
  },
  {
    daysAgo: 23, baseSys: 138, baseDia: 89,
    readings: [
      { hour: 9,  minute: 30, tags: ['rest'] },
      { hour: 18, minute: 0,  tags: ['post-sport'],          note: 'Dopo camminata 45 min' },
    ],
  },

  // ── Week 2: inizio miglioramento ──────────────────────────────────────
  {
    daysAgo: 22, baseSys: 145, baseDia: 92,
    readings: [
      { hour: 7,  minute: 20, tags: ['caffeine', 'work'] },
      { hour: 20, minute: 0,  tags: [] },
    ],
  },
  {
    daysAgo: 21, baseSys: 142, baseDia: 90,
    readings: [
      { hour: 7,  minute: 30, tags: ['caffeine'] },
      { hour: 13, minute: 0,  tags: ['work'] },
      { hour: 20, minute: 30, tags: ['rest'] },
    ],
  },
  {
    daysAgo: 20, baseSys: 138, baseDia: 88,
    readings: [
      { hour: 8,  minute: 0,  tags: ['caffeine'] },
      { hour: 19, minute: 0,  tags: ['post-sport'],          note: 'Bici 30 min' },
    ],
  },
  {
    daysAgo: 19, baseSys: 140, baseDia: 89,
    readings: [
      { hour: 7,  minute: 15, tags: ['caffeine', 'work'],   note: 'Martedì' },
      { hour: 20, minute: 45, tags: [] },
    ],
  },
  {
    daysAgo: 18, baseSys: 136, baseDia: 87,
    readings: [
      { hour: 7,  minute: 30, tags: ['caffeine'] },
      { hour: 12, minute: 0,  tags: ['stress'],              note: 'Deadline progetto' },
      { hour: 20, minute: 0,  tags: ['rest'] },
    ],
  },
  {
    daysAgo: 17, baseSys: 132, baseDia: 85,   // weekend
    readings: [
      { hour: 9,  minute: 15, tags: ['rest'] },
      { hour: 17, minute: 30, tags: ['post-sport'],          note: 'Jogging 5 km' },
    ],
  },
  {
    daysAgo: 16, baseSys: 130, baseDia: 84,
    readings: [
      { hour: 9,  minute: 0,  tags: ['rest'],               note: 'Domenica rilassante' },
      { hour: 20, minute: 0,  tags: [] },
    ],
  },

  // ── Week 3: trend positivo, inizia farmaco ────────────────────────────
  {
    daysAgo: 15, baseSys: 135, baseDia: 86,
    readings: [
      { hour: 7,  minute: 0,  tags: ['caffeine', 'medication'], note: 'Inizia terapia (dose bassa)' },
      { hour: 20, minute: 0,  tags: ['medication'] },
    ],
  },
  {
    daysAgo: 14, baseSys: 133, baseDia: 85,
    readings: [
      { hour: 7,  minute: 30, tags: ['caffeine', 'medication'] },
      { hour: 12, minute: 30, tags: ['work'] },
      { hour: 20, minute: 15, tags: ['medication'] },
    ],
  },
  {
    daysAgo: 13, baseSys: 130, baseDia: 83,
    readings: [
      { hour: 8,  minute: 0,  tags: ['medication'] },
      { hour: 19, minute: 0,  tags: ['post-sport', 'medication'], note: 'Nuoto 40 min' },
    ],
  },
  {
    daysAgo: 12, baseSys: 128, baseDia: 82,
    readings: [
      { hour: 7,  minute: 15, tags: ['caffeine', 'medication'] },
      { hour: 20, minute: 30, tags: ['medication', 'rest'] },
    ],
  },
  {
    daysAgo: 11, baseSys: 127, baseDia: 82,
    readings: [
      { hour: 7,  minute: 30, tags: ['medication'] },
      { hour: 13, minute: 0,  tags: [] },
      { hour: 20, minute: 0,  tags: ['medication', 'rest'] },
    ],
  },
  {
    daysAgo: 10, baseSys: 124, baseDia: 80,   // weekend
    readings: [
      { hour: 9,  minute: 0,  tags: ['rest', 'medication'] },
      { hour: 17, minute: 0,  tags: ['post-sport', 'medication'], note: 'Passeggiata lunga' },
    ],
  },
  {
    daysAgo: 9, baseSys: 122, baseDia: 79,
    readings: [
      { hour: 9,  minute: 30, tags: ['rest', 'medication'] },
      { hour: 19, minute: 30, tags: ['medication'] },
    ],
  },

  // ── Week 4: stabilizzazione, valori normali ───────────────────────────
  {
    daysAgo: 8, baseSys: 126, baseDia: 81,
    readings: [
      { hour: 7,  minute: 0,  tags: ['caffeine', 'medication'] },
      { hour: 20, minute: 0,  tags: ['medication', 'rest'] },
    ],
  },
  {
    daysAgo: 7, baseSys: 123, baseDia: 79,
    readings: [
      { hour: 7,  minute: 30, tags: ['caffeine', 'medication'] },
      { hour: 12, minute: 0,  tags: [] },
      { hour: 20, minute: 15, tags: ['medication'] },
    ],
  },
  {
    daysAgo: 6, baseSys: 121, baseDia: 78,
    readings: [
      { hour: 8,  minute: 0,  tags: ['medication'] },
      { hour: 19, minute: 0,  tags: ['post-sport', 'medication'], note: 'Bici 45 min' },
    ],
  },
  {
    daysAgo: 5, baseSys: 119, baseDia: 77,
    readings: [
      { hour: 7,  minute: 15, tags: ['caffeine', 'medication'],  note: 'Primo valore ottimale!' },
      { hour: 20, minute: 30, tags: ['medication', 'rest'] },
    ],
  },
  {
    daysAgo: 4, baseSys: 118, baseDia: 76,
    readings: [
      { hour: 7,  minute: 30, tags: ['medication'] },
      { hour: 13, minute: 0,  tags: [] },
      { hour: 20, minute: 0,  tags: ['medication'] },
    ],
  },
  {
    daysAgo: 3, baseSys: 122, baseDia: 79,   // weekend lieve risalita
    readings: [
      { hour: 9,  minute: 0,  tags: ['caffeine', 'medication'],  note: 'Colazione fuori' },
      { hour: 17, minute: 30, tags: ['post-sport', 'medication'] },
    ],
  },
  {
    daysAgo: 2, baseSys: 120, baseDia: 78,
    readings: [
      { hour: 9,  minute: 30, tags: ['rest', 'medication'] },
      { hour: 19, minute: 0,  tags: ['medication'] },
    ],
  },
  {
    daysAgo: 1, baseSys: 117, baseDia: 75,
    readings: [
      { hour: 7,  minute: 0,  tags: ['caffeine', 'medication'] },
      { hour: 12, minute: 30, tags: [] },
      { hour: 20, minute: 15, tags: ['medication', 'rest'],      note: 'Buon controllo' },
    ],
  },
  {
    daysAgo: 0, baseSys: 115, baseDia: 74,   // oggi
    readings: [
      { hour: 7,  minute: 30, tags: ['caffeine', 'medication'],  note: 'Mattina di oggi' },
    ],
  },
];

// ─── Modifiers ────────────────────────────────────────────────────────────────

/** Adjustments applied per tag to simulate physiological effects */
const TAG_SYS_DELTA: Partial<Record<MeasurementTag, number>> = {
  stress:      +10,
  caffeine:    +6,
  work:        +4,
  'post-sport': -8,
  rest:        -3,
  medication:  -5,
};

const TAG_DIA_DELTA: Partial<Record<MeasurementTag, number>> = {
  stress:      +6,
  caffeine:    +4,
  work:        +2,
  'post-sport': -5,
  rest:        -2,
  medication:  -3,
};

/** Morning surge: readings before 10:00 are ~5 mmHg higher */
function morningBoost(hour: number): number {
  return hour < 10 ? 5 : 0;
}

// ─── Generator ────────────────────────────────────────────────────────────────

/**
 * Generate demo `ImportRow[]` relative to today's date.
 * Each call returns the same dataset (deterministic PRNG).
 */
export function generateDemoData(): ImportRow[] {
  const rows: ImportRow[] = [];
  const today = new Date();

  for (const plan of DAY_PLANS) {
    // Anchor date: midnight of the target day
    const dayDate = new Date(today);
    dayDate.setDate(today.getDate() - plan.daysAgo);
    dayDate.setHours(0, 0, 0, 0);

    for (const reading of plan.readings) {
      // Compute tag deltas
      const sysDelta = reading.tags.reduce(
        (acc, t) => acc + (TAG_SYS_DELTA[t] ?? 0), 0,
      );
      const diaDelta = reading.tags.reduce(
        (acc, t) => acc + (TAG_DIA_DELTA[t] ?? 0), 0,
      );

      const boom = morningBoost(reading.hour);

      const rawSys = plan.baseSys + sysDelta + boom;
      const rawDia = plan.baseDia + diaDelta;

      // Add Gaussian noise (std ±3 mmHg)
      const systolic  = clamp(gaussian(rawSys, 3), 90, 200);
      const diastolic = clamp(gaussian(rawDia, 2), 55, systolic - 20);
      const heartRate = clamp(gaussian(
        reading.tags.includes('post-sport') ? 62 : 72,
        6,
      ), 45, 110);

      // Build timestamp
      const ts = new Date(dayDate);
      ts.setHours(reading.hour, reading.minute, 0, 0);

      rows.push({
        timestamp: ts.getTime(),
        systolic,
        diastolic,
        heartRate,
        tags: reading.tags,
        note: reading.note,
      });
    }
  }

  // Sort oldest → newest (same order as real user input)
  rows.sort((a, b) => a.timestamp - b.timestamp);
  return rows;
}
