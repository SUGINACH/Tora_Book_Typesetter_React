import { create } from 'zustand';
import type { TypesetStage } from '../types';

interface WorkerStore {
  status: 'idle' | 'running' | 'done' | 'error';
  stage: TypesetStage | null;
  percent: number;
  message: string | null;
  durationMs: number | null;
  start: () => void;
  updateProgress: (stage: TypesetStage, percent: number, msg?: string) => void;
  finish: (durationMs: number) => void;
  fail: () => void;
  reset: () => void;
}

export const useWorkerStore = create<WorkerStore>((set) => ({
  status: 'idle',
  stage: null,
  percent: 0,
  message: null,
  durationMs: null,

  start: () =>
    set({
      status: 'running',
      stage: null,
      percent: 0,
      message: null,
      durationMs: null,
    }),

  updateProgress: (stage, percent, msg) =>
    set({ stage, percent, message: msg ?? null }),

  finish: (durationMs) => set({ status: 'done', durationMs }),
  fail: () => set({ status: 'error' }),
  reset: () =>
    set({
      status: 'idle',
      stage: null,
      percent: 0,
      message: null,
      durationMs: null,
    }),
}));
