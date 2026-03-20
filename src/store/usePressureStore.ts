/**
 * @module usePressureStore
 * @description
 * Zustand global store for the Pressione PWA.
 *
 * Data flow:
 *   IndexedDB (raw BPMeasurement rows)
 *     → deriveSessions() in DB layer
 *     → BPSession[] (store cache)
 *     → ChartDataPoint[] (derived for Recharts)
 *     → Components
 *
 * The chart shows session averages, not raw readings, following the
 * ESC/ESH 2023 HBPM protocol (discard warmup, average official reads).
 */

import { create } from 'zustand';
import { db } from '../db/database';
import type {
  BPSession,
  ChartDataPoint,
  ImportRow,
  MeasurementTag,
  SessionPayload,
} from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sessionToChartPoint(s: BPSession): ChartDataPoint {
  const d     = new Date(s.timestamp);
  const label = d.toLocaleString('it-IT', {
    day:    '2-digit',
    month:  '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
  });
  return {
    label,
    timestamp: s.timestamp,
    systolic:  s.systolic,
    diastolic: s.diastolic,
    heartRate: s.heartRate,
    category:  s.category,
  };
}

// ─── Store Shape ──────────────────────────────────────────────────────────────

interface PressureState {
  sessions:   BPSession[];
  chartData:  ChartDataPoint[];
  isLoading:  boolean;
  error:      string | null;

  fetchSessions:      () => Promise<void>;
  addSession:         (payload: SessionPayload) => Promise<void>;
  deleteSession:      (sessionId: string) => Promise<void>;
  clearAll:           () => Promise<void>;
  importMeasurements: (rows: ImportRow[]) => Promise<{ count: number }>;
  clearError:         () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePressureStore = create<PressureState>((set, get) => ({
  sessions:  [],
  chartData: [],
  isLoading: false,
  error:     null,

  fetchSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const sessions  = await db.getAllSessions();
      // Chart: oldest → newest (left → right)
      const chartData = [...sessions].reverse().map(sessionToChartPoint);
      set({ sessions, chartData, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Errore nel caricamento.',
        isLoading: false,
      });
    }
  },

  addSession: async (payload) => {
    set({ isLoading: true, error: null });
    try {
      await db.addSession(payload);
      await get().fetchSessions();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Errore nel salvataggio.',
        isLoading: false,
      });
      throw err;
    }
  },

  deleteSession: async (sessionId) => {
    set({ isLoading: true, error: null });
    try {
      await db.deleteSession(sessionId);
      await get().fetchSessions();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Errore nella cancellazione.',
        isLoading: false,
      });
    }
  },

  clearAll: async () => {
    set({ isLoading: true, error: null });
    try {
      await db.clearAllMeasurements();
      set({ sessions: [], chartData: [], isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Errore.',
        isLoading: false,
      });
    }
  },

  importMeasurements: async (rows) => {
    set({ isLoading: true, error: null });
    try {
      const { inserted, skipped } = await db.addManyMeasurements(rows);
      await get().fetchSessions();
      if (skipped > 0) {
        set({
          error: `${skipped} ${skipped === 1 ? 'riga ignorata perché già presente' : 'righe ignorate perché già presenti'} nel database (±1 minuto).`,
        });
      }
      return { count: inserted };
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Errore durante l\'importazione.',
        isLoading: false,
      });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectLatestSession = (state: PressureState): BPSession | undefined =>
  state.sessions[0];

export const selectByTag =
  (tag: MeasurementTag) =>
  (state: PressureState): BPSession[] =>
    state.sessions.filter((s) => s.tags.includes(tag));
