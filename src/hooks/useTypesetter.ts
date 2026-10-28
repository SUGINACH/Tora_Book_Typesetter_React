import { useCallback } from 'react';
import { useSettingsStore } from '../store/settings-store';
import { useDocumentStore } from '../store/document-store';
import { useWorkerStore } from '../store/worker-store';
import { parseDocument } from '../parser';
import { typesetDocument } from '../worker/engine/typeset-document';
import { SimulatedMeasurer } from '../worker/measurement/text-metrics';
import { auditGeometry } from '../audit/geometry-audit';
import { fnv1a32 } from '../worker/inputs/fnv-hash';
import { renderToHtml } from '../worker/engine/renderer';
import { defaultSettings } from '../lib/default-settings';

/**
 * Hook ראשי: מבצע עימוד מלא.
 *
 * כרגע מריץ סינכרונית ב-main thread (ללא Worker).
 * זהו מצב MVP — בעתיד יוחלף ב-Worker אמיתי.
 */
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

      // 2. Typesetting
      workerStore.updateProgress('measuring', 20, 'מודד טקסט...');
      await delay(10);
      const measurer = new SimulatedMeasurer();
      const result = typesetDocument(doc, settings, measurer, (stage, percent, msg) =>
        workerStore.updateProgress(stage as any, percent, msg)
      );

      // 3. Audit
      workerStore.updateProgress('finalizing', 95, 'בודק גיאוממטריה...');
      await delay(10);
      const findings = auditGeometry(result.pages, settings);

      // 4. Hash
      const outputHash = fnv1a32(result.pages.map((p) => p.html).join(''));

      // 5. Save
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
