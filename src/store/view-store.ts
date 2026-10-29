import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ViewStore {
  zoom: number;
  setZoom: (zoom: number) => void;
}

export const useViewStore = create<ViewStore>()(
  persist(
    (set) => ({
      zoom: 1,
      setZoom: (zoom) => set({ zoom: Math.max(0.25, Math.min(4, zoom)) }),
    }),
    { name: 'tora-typesetter-view' }
  )
);
