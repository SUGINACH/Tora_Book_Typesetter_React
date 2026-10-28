import { useCallback } from 'react';
import { useSettingsStore } from '../store/settings-store';
import { useDocumentStore } from '../store/document-store';
import { useWorkerStore } from '../store/worker-store';
import { runTypeset } from '../lib/worker-bridge';
import { loadShaarDesigns, getShaarDesign } from '../lib/shaar-loader';
import { loadHeaderOrnaments, getOrnament } from '../lib/ornament-loader';
import type { ShaarDesignData, OrnamentData } from '../worker/engine/renderer';

export function useTypesetter() {
  const settings = useSettingsStore((s) => s.settings);
  const rawText = useDocumentStore((s) => s.rawText);
  const setRendered = useDocumentStore((s) => s.setRendered);
  const workerStore = useWorkerStore();
  const clearPending = useSettingsStore((s) => s.clearPending);

  return useCallback(async () => {
    if (!rawText) return;

    workerStore.start();
    try {
      // טעינת עיצובים
      workerStore.updateProgress('font-loading', 10, 'טוען עיצובים...');
      let shaarDesigns: ShaarDesignData | undefined;
      let ornaments: OrnamentData | undefined;
      try {
        const designs = await loadShaarDesigns();
        shaarDesigns = {
          main: getShaarDesign(designs.main, 0),
          back: getShaarDesign(designs.back, 0),
          sub: getShaarDesign(designs.sub, 0),
        };
      } catch (err) {
        console.warn('Failed to load shaar designs:', err);
      }
      try {
        const orn = await loadHeaderOrnaments();
        ornaments = {
          h2Top: getOrnament(orn, 0),
          h2Bottom: getOrnament(orn, 0),
          h3Right: getOrnament(orn, 0),
          h3Left: getOrnament(orn, 0),
        };
      } catch (err) {
        console.warn('Failed to load ornaments:', err);
      }

      // עימוד דרך worker bridge
      const result = await runTypeset(
        rawText,
        settings,
        shaarDesigns,
        ornaments,
        (stage, percent, msg) =>
          workerStore.updateProgress(stage as any, percent, msg)
      );

      setRendered(result.pages, result.outputHash, result.findings);
      workerStore.finish(result.durationMs);
      clearPending();
    } catch (err) {
      console.error('Typesetting failed:', err);
      workerStore.fail();
    }
  }, [rawText, settings, workerStore, setRendered, clearPending]);
}

export function useSettings() {
  return useSettingsStore((s) => s.settings);
}

export function useHasPendingChanges() {
  return useSettingsStore((s) => s.hasPendingChanges);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useSettings() {
  return useSettingsStore((s) => s.settings);
}

export function useHasPendingChanges() {
  return useSettingsStore((s) => s.hasPendingChanges);
}
