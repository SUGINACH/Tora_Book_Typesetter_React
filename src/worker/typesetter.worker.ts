/// <reference lib="webworker" />
/**
 * Web Worker — מנוע העימוד החיצוני.
 *
 * מקבל הודעות מה-UI דרך postMessage, מבצע עימוד, ושולח חזרה תוצאות.
 * אינו מייבא React — רק פונקציות טהורות.
 */

import { parseDocument } from '../parser';
import { typesetDocument } from './engine/typeset-document';
import { SimulatedMeasurer } from './measurement/text-metrics';
import { auditGeometry } from '../audit/geometry-audit';
import { fnv1a32 } from './inputs/fnv-hash';
import type { Settings } from '../types';

const ctx: Worker = self as any;

interface TypesetMessage {
  type: 'typeset';
  jobId: string;
  text: string;
  settings: Settings;
  shaarDesigns?: any;
  ornaments?: any;
  enableTrace?: boolean;
}

ctx.onmessage = async (e: MessageEvent<TypesetMessage>) => {
  const msg = e.data;
  if (msg.type !== 'typeset') return;

  const { jobId, text, settings } = msg;

  try {
    // 1. Parsing
    ctx.postMessage({ type: 'progress', jobId, stage: 'parsing', percent: 5, message: 'מנתח טקסט...' });

    // טעינת גופנים ועיצובים ב-Worker (לא ניתן כרגע — fetch לא זמין בכל הדפדפנים)
    // העיצובים מועברים מה-UI

    const measurer = new SimulatedMeasurer();

    // 2. Parse
    const doc = parseDocument(text, settings);

    // 3. Typeset
    ctx.postMessage({ type: 'progress', jobId, stage: 'measuring', percent: 20, message: 'מודד טקסט...' });
    const result = typesetDocument(doc, settings, measurer, (stage, percent, message) => {
      ctx.postMessage({ type: 'progress', jobId, stage, percent, message });
    }, msg.shaarDesigns, msg.ornaments);

    // 4. Audit
    ctx.postMessage({ type: 'progress', jobId, stage: 'finalizing', percent: 95, message: 'בודק גיאוממטריה...' });
    const findings = auditGeometry(result.pages, settings);

    // 5. Hash
    const outputHash = fnv1a32(result.pages.map((p) => p.html).join(''));

    // 6. Send result
    ctx.postMessage({
      type: 'done',
      jobId,
      pages: result.pages,
      pageCount: result.pages.length,
      outputHash,
      findings,
      durationMs: result.durationMs,
    });
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      jobId,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
};
