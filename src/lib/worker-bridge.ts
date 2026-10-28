import type { Settings, ParsedDocument, RenderedPage, AuditFinding, TraceEvent } from '../types';
import type { TextMeasurer } from '../measurement/text-metrics';
import { SimulatedMeasurer } from '../measurement/text-metrics';
import { parseDocument } from '../parser';
import { typesetDocument } from '../worker/engine/typeset-document';
import { auditGeometry } from '../audit/geometry-audit';
import { fnv1a32 } from '../worker/inputs/fnv-hash';
import type { ShaarDesignData, OrnamentData } from '../worker/engine/renderer';

/**
 * Worker Bridge — גשר תקשורת עם המנוע.
 *
 * כרגע רץ סינכרונית ב-main thread.
 * בעתיד יוחלף ב-Web Worker אמיתי.
 */
export interface TypesetResult {
  pages: RenderedPage[];
  findings: AuditFinding[];
  durationMs: number;
  outputHash: string;
  traceLog?: TraceEvent[];
}

export async function runTypeset(
  text: string,
  settings: Settings,
  shaarDesigns?: ShaarDesignData,
  ornaments?: OrnamentData,
  onProgress?: (stage: string, percent: number, msg?: string) => void
): Promise<TypesetResult> {
  // 1. Parsing
  onProgress?.('parsing', 5, 'מנתח טקסט...');
  await delay(10);
  const doc = parseDocument(text, settings);

  // 2. Typesetting
  onProgress?.('measuring', 20, 'מודד טקסט...');
  await delay(10);
  const measurer: TextMeasurer = new SimulatedMeasurer();
  const result = typesetDocument(doc, settings, measurer, onProgress, shaarDesigns, ornaments);

  // 3. Audit
  onProgress?.('finalizing', 95, 'בודק גיאוממטריה...');
  await delay(10);
  const findings = auditGeometry(result.pages, settings);

  // 4. Hash
  const outputHash = fnv1a32(result.pages.map((p) => p.html).join(''));

  return {
    pages: result.pages,
    findings,
    durationMs: result.durationMs,
    outputHash,
    traceLog: result.traceLog,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
