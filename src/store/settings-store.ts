import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Settings } from '../types';
import { defaultSettings } from '../lib/default-settings';

interface SettingsStore {
  settings: Settings;
  hasPendingChanges: boolean;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  updateNested: (path: string, value: unknown) => void;
  replaceAll: (settings: Settings) => void;
  reset: () => void;
  markPending: () => void;
  clearPending: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      hasPendingChanges: false,

      update: (key, value) =>
        set((state) => ({
          settings: { ...state.settings, [key]: value },
          hasPendingChanges: true,
        })),

      updateNested: (path, value) =>
        set((state) => {
          const newSettings = structuredClone(state.settings) as any;
          const keys = path.split('.');
          let obj = newSettings;
          for (let i = 0; i < keys.length - 1; i++) {
            obj = obj[keys[i]!]!;
          }
          obj[keys[keys.length - 1]!] = value;
          return { settings: newSettings, hasPendingChanges: true };
        }),

      replaceAll: (settings) => set({ settings, hasPendingChanges: false }),
      reset: () => set({ settings: defaultSettings, hasPendingChanges: false }),
      markPending: () => set({ hasPendingChanges: true }),
      clearPending: () => set({ hasPendingChanges: false }),
    }),
    {
      name: 'tora-typesetter-settings',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
