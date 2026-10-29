import { create } from 'zustand';
import type { TraceEvent } from '../types';

/**
 * Trace Store — Zustand store ל-Trace events.
 *
 * סעיף 7.6 באפיון הטכני.
 */
interface TraceStore {
  events: TraceEvent[];
  isEnabled: boolean;
  setEvents: (events: TraceEvent[]) => void;
  toggle: () => void;
  enable: () => void;
  disable: () => void;
  clear: () => void;
  add: (event: TraceEvent) => void;
}

export const useTraceStore = create<TraceStore>((set) => ({
  events: [],
  isEnabled: false,
  setEvents: (events) => set({ events }),
  toggle: () => set((s) => ({ isEnabled: !s.isEnabled })),
  enable: () => set({ isEnabled: true }),
  disable: () => set({ isEnabled: false }),
  clear: () => set({ events: [] }),
  add: (event) => set((s) => ({ events: [...s.events, event] })),
}));
