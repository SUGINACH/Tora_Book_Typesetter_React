import { useCallback } from 'react';
import { useSettingsStore } from '../store/settings-store';
import { useDocumentStore } from '../store/document-store';
import { useWorkerStore } from '../store/worker-store';
import { parseDocument } from '../parser';
import { typesetDocument } from '../worker/engine/typeset-document';
import { SimulatedMeasurer } from '../worker/measurement/text-metrics';
import { auditGeometry } from '../audit/geometry-audit';
import { fnv1a32 } from '../worker/inputs/fnv-hash';
import { loadShaarDesigns, getShaarDesign } from '../lib/shaar-loader';
import type { ShaarDesignData } from '../worker/engine/renderer';

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
      // 1. Parsing
      workerStore.updateProgress('parsing', 5, 'מנתח טקסט...');
      await delay(10);
      const doc = parseDocument(rawText, settings);

      // 2. טעינת עיצובי שערים מ-JSON
      workerStore.updateProgress('font-loading', 10, 'טועם עיצובי שערים...');
      let shaarDesigns: ShaarDesignData | undefined;
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

      // 3. Typesetting
      workerStore.updateProgress('measuring', 20, 'מודד טקסט...');
      await delay(10);
      const measurer = new SimulatedMeasurer();
      const result = typesetDocument(doc, settings, measurer, (stage, percent, msg) =>
        workerStore.updateProgress(stage as any, percent, msg), shaarDesigns
      );

      // 4. Audit
      workerStore.updateProgress('finalizing', 95, 'בודק גיאוממטריה...');
      await delay(10);
      const findings = auditGeometry(result.pages, settings);

      // 5. Hash
      const outputHash = fnv1a32(result.pages.map((p) => p.html).join(''));

      // 6. Save
      setRendered(result.pages, outputHash, findings);
      workerStore.finish(result.durationMs);
      clearPending();
    } catch (err) {
      console.error('Typesetting failed:', err);
      workerStore.fail();
    }
  }, [rawText, settings, workerStore, setRendered, clearPending]);
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
