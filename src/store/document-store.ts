import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { RenderedPage, AuditFinding } from '../types';

interface DocumentStore {
  rawText: string;
  lastRenderedPages: RenderedPage[] | null;
  lastOutputHash: string | null;
  lastFindings: AuditFinding[];
  setText: (text: string) => void;
  setRendered: (pages: RenderedPage[], hash: string, findings: AuditFinding[]) => void;
  clear: () => void;
}

export const useDocumentStore = create<DocumentStore>()(
  persist(
    (set) => ({
      rawText: '',
      lastRenderedPages: null,
      lastOutputHash: null,
      lastFindings: [],

      setText: (text) => set({ rawText: text }),
      setRendered: (pages, hash, findings) =>
        set({ lastRenderedPages: pages, lastOutputHash: hash, lastFindings: findings }),
      clear: () =>
        set({
          rawText: '',
          lastRenderedPages: null,
          lastOutputHash: null,
          lastFindings: [],
        }),
    }),
    {
      name: 'tora-typesetter-document',
      partialize: (state) => ({ rawText: state.rawText } as Partial<DocumentStore>),
    }
  )
);
