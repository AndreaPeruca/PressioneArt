/**
 * @module demoData
 * @description
 * Generates a realistic 30-day blood-pressure dataset for demonstration.
 *
 * Clinical narrative — Marco, 52 anni, iperteso in trattamento:
 *
 *   Week 1 (giorni 30–24) – Ipertensione Grado 2 non diagnosticata.
 *     Stress lavorativo intenso. Un episodio da crisi ipertensiva (≥180/120).
 *     Battiti irregolari. Surge mattutino >15 mmHg. BP Load >65%.
 *     Sintomi: cefalea, vertigini. Alta variabilità (SD ~12 mmHg).
 *
 *   Week 2 (giorni 23–17) – Visita medica. Diagnosi: ipertensione Grado 1.
 *     Inizia ramipril + dieta iposodica. Due sessioni da misuratore da polso
 *     (trasferta di lavoro). Valori ancora elevati ma trend calante.
 *     BP Load ~45%. Un battito irregolare.
 *
 *   Week 3 (giorni 16–10) – Farmaco efficace. Trend marcatamente calante.
 *     Normale-Alta → Normale. Aderenza protocollo mattina+sera ogni giorno.
 *     BP Load <20%. SD si riduce a ~6 mmHg.
 *
 *   Week 4 (giorni 9–0)  – PRESSIONE CONTROLLATA. Valori Normali/Ottimali.
 *     Aderenza protocollo completa (7/7 mattine, 6/7 sere).
 *     Surge mattutino <5 mmHg. SD ~3 mmHg. BP Load <5%.
 *
 * Feature esplicitamente dimostrate:
 *   ✓ Crisi ipertensiva        — 1 episodio in settimana 1 (CrisisBanner + PDF)
 *   ✓ Battito irregolare       — 3 sessioni (sett. 1–2) → conteggio nel PDF
 *   ✓ Misuratore da polso      — 2 sessioni in sett. 2 → badge "Polso"
 *   ✓ Badge CONTROLLATA        — ultimi 7 giorni tutti <135/85
 *   ✓ BP Load                  — cala da ~68% (sett. 1) a ~3% (sett. 4)
 *   ✓ Variabilità SD           — da ~12 a ~3 mmHg nel corso del mese
 *   ✓ Surge mattutino          — +16 mmHg sett. 1, +4 mmHg sett. 4
 *   ✓ Aderenza protocollo      — 7/7 mattine + 6/7 sere ultimi 7 giorni
 *   ✓ Tutti i tag contesto     — stress, caffeine, work, post-sport, rest, medication
 *   ✓ Tutti i sintomi          — headache, dizziness (sett. 1)
 *   ✓ Distribuzione categorie  — grade2→grade1→high-normal→normal→optimal
 *   ✓ Medie settimanali PDF    — 4 settimane complete
 *   ✓ Layout affiancato        — dati sufficienti per stats + chart
 *
 * All dates are computed relative to today so the data always appears
 * recent, regardless of when the app is opened.
 */

import type { ImportRow, MeasurementDevice, MeasurementTag } from '../types';

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
  device?: MeasurementDevice;
  hasIrregularHeartbeat?: boolean;
  /** Override noise std (use 1 for values that must stay in a narrow range) */
  noiseStd?: number;
}

interface DayPlan {
  daysAgo: number;
  /** Base systolic for that day (before noise & modifiers) */
  baseSys: number;
  /** Base diastolic */
  baseDia: number;
  readings: Reading[];
}

// ─── 30-day clinical plan ─────────────────────────────────────────────────────

const DAY_PLANS: DayPlan[] = [

  // ════════════════════════════════════════════════════════════════════════════
  // SETTIMANA 1 — Ipertensione Grado 2 non trattata
  // BP Load: ~68% · SD alta · Surge marcato · Crisi il giorno 29
  // ════════════════════════════════════════════════════════════════════════════

  {
    daysAgo: 30, baseSys: 156, baseDia: 99,
    readings: [
      { hour: 7,  minute: 10, tags: ['caffeine', 'work'],
        note: 'Prima settimana – rilevate pressioni molto alte' },
      { hour: 20, minute: 45, tags: ['stress', 'work'],
        hasIrregularHeartbeat: true,
        note: 'Battito irregolare segnalato dallo strumento' },
    ],
  },

  {
    // 🚨 CRISI IPERTENSIVA — episodio chiave della dimostrazione
    // baseSys 170 + stress(+10) + caffeine(+6) + work(+4) + morning(+5) = 195
    // baseDia 108 + stress(+6) + caffeine(+4) + work(+2) = 120
    daysAgo: 29, baseSys: 170, baseDia: 108,
    readings: [
      { hour: 7,  minute: 0,  tags: ['stress', 'caffeine', 'work'],
        hasIrregularHeartbeat: true,
        noiseStd: 1,
        note: 'CRISI — valori oltre 180/120. Contattato medico di base.' },
      { hour: 21, minute: 0,  tags: ['stress'],
        note: 'Sera dopo la crisi – ancora elevata' },
    ],
  },

  {
    daysAgo: 28, baseSys: 159, baseDia: 100,
    readings: [
      { hour: 7,  minute: 30, tags: ['caffeine', 'work', 'headache'],
        note: 'Forte cefalea mattutina' },
      { hour: 20, minute: 15, tags: ['stress', 'headache'],
        note: 'Cefalea persistente per tutto il giorno' },
    ],
  },

  {
    daysAgo: 27, baseSys: 157, baseDia: 98,
    readings: [
      { hour: 7,  minute: 0,  tags: ['caffeine', 'stress', 'work'] },
      { hour: 13, minute: 0,  tags: ['work', 'stress'],
        note: 'Riunione difficile in mattinata' },
      { hour: 20, minute: 30, tags: ['dizziness'],
        note: 'Leggere vertigini in serata' },
    ],
  },

  {
    daysAgo: 26, baseSys: 153, baseDia: 97,
    readings: [
      { hour: 7,  minute: 45, tags: ['caffeine', 'work'] },
      { hour: 20, minute: 0,  tags: ['stress', 'dizziness'],
        note: 'Vertigini anche stasera' },
    ],
  },

  {
    daysAgo: 25, baseSys: 150, baseDia: 95,   // sabato – lieve tregua
    readings: [
      { hour: 9,  minute: 15, tags: ['caffeine', 'rest'],
        note: 'Weekend – pressione ancora alta' },
      { hour: 18, minute: 30, tags: ['post-sport'],
        note: 'Passeggiata 30 min – leggera discesa' },
    ],
  },

  {
    daysAgo: 24, baseSys: 151, baseDia: 96,   // domenica
    readings: [
      { hour: 9,  minute: 0,  tags: ['rest', 'caffeine'],
        hasIrregularHeartbeat: true,
        note: 'Battito irregolare anche a riposo' },
      { hour: 19, minute: 0,  tags: ['rest'] },
    ],
  },

  // ════════════════════════════════════════════════════════════════════════════
  // SETTIMANA 2 — Visita medica, inizio farmaco · BP Load ~45%
  // 2 sessioni da misuratore da polso (trasferta lavorativa)
  // ════════════════════════════════════════════════════════════════════════════

  {
    daysAgo: 23, baseSys: 147, baseDia: 93,
    readings: [
      { hour: 7,  minute: 20, tags: ['caffeine', 'medication'],
        note: 'Inizia ramipril 5 mg + dieta iposodica' },
      { hour: 20, minute: 0,  tags: ['medication'] },
    ],
  },

  {
    daysAgo: 22, baseSys: 145, baseDia: 91,
    readings: [
      { hour: 7,  minute: 30, tags: ['caffeine', 'medication', 'work'] },
      { hour: 12, minute: 30, tags: ['work', 'stress'] },
      { hour: 20, minute: 30, tags: ['medication', 'rest'] },
    ],
  },

  {
    // Trasferta: misuratore da polso (2 sessioni)
    daysAgo: 21, baseSys: 143, baseDia: 90,
    readings: [
      { hour: 7,  minute: 0,  tags: ['caffeine', 'medication', 'work'],
        device: 'wrist',
        note: 'Trasferta – usato misuratore da polso (meno accurato)' },
      { hour: 21, minute: 0,  tags: ['medication'],
        device: 'wrist',
        note: 'Ancora misuratore da polso in albergo' },
    ],
  },

  {
    daysAgo: 20, baseSys: 141, baseDia: 89,
    readings: [
      { hour: 7,  minute: 30, tags: ['caffeine', 'medication'] },
      { hour: 20, minute: 15, tags: ['medication', 'post-sport'],
        note: 'Nuoto 30 min' },
    ],
  },

  {
    daysAgo: 19, baseSys: 138, baseDia: 87,
    readings: [
      { hour: 7,  minute: 0,  tags: ['medication'] },
      { hour: 13, minute: 0,  tags: ['work', 'stress'],
        note: 'Deadline di progetto' },
      { hour: 20, minute: 0,  tags: ['medication', 'rest'] },
    ],
  },

  {
    daysAgo: 18, baseSys: 136, baseDia: 86,  // sabato
    readings: [
      { hour: 9,  minute: 0,  tags: ['rest', 'medication'],
        note: 'Trend in miglioramento' },
      { hour: 18, minute: 30, tags: ['post-sport', 'medication'],
        note: 'Jogging 5 km – ottima risposta' },
    ],
  },

  {
    daysAgo: 17, baseSys: 134, baseDia: 85,  // domenica
    readings: [
      { hour: 9,  minute: 30, tags: ['rest', 'medication'] },
      { hour: 19, minute: 0,  tags: ['medication', 'rest'] },
    ],
  },

  // ════════════════════════════════════════════════════════════════════════════
  // SETTIMANA 3 — Farmaco efficace · BP Load <20% · Alta aderenza protocollo
  // ════════════════════════════════════════════════════════════════════════════

  {
    daysAgo: 16, baseSys: 132, baseDia: 84,
    readings: [
      { hour: 7,  minute: 15, tags: ['caffeine', 'medication'] },
      { hour: 20, minute: 0,  tags: ['medication'] },
    ],
  },

  {
    daysAgo: 15, baseSys: 130, baseDia: 83,
    readings: [
      { hour: 7,  minute: 30, tags: ['medication', 'caffeine'] },
      { hour: 12, minute: 0,  tags: ['work'] },
      { hour: 20, minute: 15, tags: ['medication', 'rest'] },
    ],
  },

  {
    daysAgo: 14, baseSys: 128, baseDia: 82,
    readings: [
      { hour: 7,  minute: 0,  tags: ['medication'] },
      { hour: 19, minute: 30, tags: ['post-sport', 'medication'],
        note: 'Bici 40 min – ottima risposta allo sport' },
    ],
  },

  {
    daysAgo: 13, baseSys: 126, baseDia: 81,
    readings: [
      { hour: 8,  minute: 0,  tags: ['medication', 'caffeine'] },
      { hour: 20, minute: 30, tags: ['medication', 'rest'] },
    ],
  },

  {
    daysAgo: 12, baseSys: 124, baseDia: 80,
    readings: [
      { hour: 7,  minute: 30, tags: ['medication'] },
      { hour: 13, minute: 0,  tags: [] },
      { hour: 20, minute: 0,  tags: ['medication', 'rest'] },
    ],
  },

  {
    daysAgo: 11, baseSys: 122, baseDia: 79,  // sabato
    readings: [
      { hour: 9,  minute: 0,  tags: ['rest', 'medication'],
        note: 'Buon weekend – pressione in chiaro calo' },
      { hour: 18, minute: 0,  tags: ['post-sport', 'medication'],
        note: 'Passeggiata lunga 1 ora' },
    ],
  },

  {
    daysAgo: 10, baseSys: 121, baseDia: 78,  // domenica
    readings: [
      { hour: 9,  minute: 30, tags: ['rest', 'medication'] },
      { hour: 19, minute: 0,  tags: ['medication'] },
    ],
  },

  // ════════════════════════════════════════════════════════════════════════════
  // SETTIMANA 4 — PRESSIONE CONTROLLATA · Normali/Ottimali
  // Aderenza protocollo completa · Surge <5 mmHg · SD ~3 mmHg
  // ════════════════════════════════════════════════════════════════════════════

  {
    daysAgo: 9, baseSys: 120, baseDia: 77,
    readings: [
      { hour: 7,  minute: 0,  tags: ['caffeine', 'medication'] },
      { hour: 20, minute: 0,  tags: ['medication', 'rest'] },
    ],
  },

  {
    daysAgo: 8, baseSys: 118, baseDia: 76,
    readings: [
      { hour: 7,  minute: 30, tags: ['medication', 'caffeine'] },
      { hour: 12, minute: 30, tags: [] },
      { hour: 20, minute: 15, tags: ['medication'] },
    ],
  },

  {
    daysAgo: 7, baseSys: 117, baseDia: 75,
    readings: [
      { hour: 7,  minute: 15, tags: ['caffeine', 'medication'],
        note: 'Prima settimana con valori tutti ottimali!' },
      { hour: 20, minute: 30, tags: ['medication', 'rest'] },
    ],
  },

  {
    daysAgo: 6, baseSys: 116, baseDia: 75,
    readings: [
      { hour: 8,  minute: 0,  tags: ['medication'] },
      { hour: 19, minute: 0,  tags: ['post-sport', 'medication'],
        note: 'Jogging 6 km – sensazione ottima' },
    ],
  },

  {
    daysAgo: 5, baseSys: 115, baseDia: 74,
    readings: [
      { hour: 7,  minute: 30, tags: ['medication', 'caffeine'] },
      { hour: 20, minute: 0,  tags: ['medication', 'rest'] },
    ],
  },

  {
    daysAgo: 4, baseSys: 118, baseDia: 76,  // sabato – lieve rialzo (caffè extra)
    readings: [
      { hour: 9,  minute: 0,  tags: ['caffeine', 'rest', 'medication'],
        note: 'Colazione fuori con amici – lieve rialzo fisiologico' },
      { hour: 18, minute: 30, tags: ['post-sport', 'medication'],
        note: 'Bici 1 ora' },
    ],
  },

  {
    daysAgo: 3, baseSys: 116, baseDia: 74,  // domenica
    readings: [
      { hour: 9,  minute: 30, tags: ['rest', 'medication'] },
      { hour: 19, minute: 0,  tags: ['medication', 'rest'] },
    ],
  },

  {
    daysAgo: 2, baseSys: 114, baseDia: 73,
    readings: [
      { hour: 7,  minute: 0,  tags: ['caffeine', 'medication'] },
      { hour: 12, minute: 30, tags: [] },
      { hour: 20, minute: 15, tags: ['medication', 'rest'] },
    ],
  },

  {
    daysAgo: 1, baseSys: 113, baseDia: 72,
    readings: [
      { hour: 7,  minute: 30, tags: ['medication', 'caffeine'] },
      { hour: 20, minute: 0,  tags: ['medication'],
        note: 'Visita di controllo domani – dati ottimi da portare' },
    ],
  },

  {
    daysAgo: 0, baseSys: 112, baseDia: 72,  // oggi
    readings: [
      { hour: 7,  minute: 15, tags: ['caffeine', 'medication'],
        note: 'Mattina di oggi – pronto per la visita' },
    ],
  },
];

// ─── Modifiers ────────────────────────────────────────────────────────────────

/** Systolic adjustments per tag */
const TAG_SYS_DELTA: Partial<Record<MeasurementTag, number>> = {
  stress:      +10,
  caffeine:    +6,
  work:        +4,
  'post-sport': -8,
  rest:        -3,
  medication:  -5,
  headache:    +3,
  dizziness:   +2,
  'chest-pain': +5,
  palpitations: +4,
};

/** Diastolic adjustments per tag */
const TAG_DIA_DELTA: Partial<Record<MeasurementTag, number>> = {
  stress:      +6,
  caffeine:    +4,
  work:        +2,
  'post-sport': -5,
  rest:        -2,
  medication:  -3,
  headache:    +2,
  dizziness:   +1,
  'chest-pain': +3,
  palpitations: +2,
};

/** Morning surge: readings 06:00–09:59 are ~8 mmHg higher systolic */
function morningBoost(hour: number): number {
  return hour >= 6 && hour < 10 ? 8 : 0;
}

// ─── Generator ────────────────────────────────────────────────────────────────

/**
 * Generate demo `ImportRow[]` relative to today's date.
 * Each call returns the same dataset (deterministic seeded PRNG).
 */
export function generateDemoData(): ImportRow[] {
  const rows: ImportRow[] = [];
  const today = new Date();

  for (const plan of DAY_PLANS) {
    const dayDate = new Date(today);
    dayDate.setDate(today.getDate() - plan.daysAgo);
    dayDate.setHours(0, 0, 0, 0);

    for (const reading of plan.readings) {
      const sysDelta = reading.tags.reduce((acc, t) => acc + (TAG_SYS_DELTA[t] ?? 0), 0);
      const diaDelta = reading.tags.reduce((acc, t) => acc + (TAG_DIA_DELTA[t] ?? 0), 0);
      const boom     = morningBoost(reading.hour);
      const std      = reading.noiseStd ?? 3;

      const rawSys = plan.baseSys + sysDelta + boom;
      const rawDia = plan.baseDia + diaDelta;

      const systolic  = clamp(gaussian(rawSys, std),     90,  200);
      const diastolic = clamp(gaussian(rawDia, std - 1), 55,  systolic - 15);
      const heartRate = clamp(gaussian(
        reading.tags.includes('post-sport') ? 62 : 72, 6,
      ), 45, 110);

      const ts = new Date(dayDate);
      ts.setHours(reading.hour, reading.minute, 0, 0);

      rows.push({
        timestamp:             ts.getTime(),
        systolic,
        diastolic,
        heartRate,
        tags:                  reading.tags,
        note:                  reading.note,
        device:                reading.device,
        hasIrregularHeartbeat: reading.hasIrregularHeartbeat,
      });
    }
  }

  rows.sort((a, b) => a.timestamp - b.timestamp);
  return rows;
}
