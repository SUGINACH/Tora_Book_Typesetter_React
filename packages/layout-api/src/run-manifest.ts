/**
 * run-manifest.ts — RunManifest (§6.7; שלב 32).
 *
 * כל ריצה מסתיימת במניפסט עם כל ההאשים הרלוונטיים (§12.1 של האפיון; §19:
 * "artifacts כוללים input/config/font/asset hashes, engine SHA, layout hash").
 * codeSha מוזן ב-build metadata; בפיתוח — 'dev' מפורש (§12).
 *
 * שלב 40 יוסיף את הדגל engine: legacy|next כשדה חובה; עד אז השדה
 * מסומן כתוספת של שלב 40 (אין לסמן שלב לפי תקווה — כלל 5 באפיון §23).
 */
import { LayoutApiError } from './errors.js';
import { configHash as configHashOf, inputHash as inputHashOf, type InputHashComponents } from './canonical-hash.js';
import { layoutHash as layoutHashOf } from './canonical-hash.js';

export interface RunManifest {
  readonly schemaVersion: 1;
  readonly engineVersion: string;
  /** SHA של קוד המנוע; 'dev' בפיתוח (§12). */
  readonly codeSha: string;
  readonly inputHash: string;
  readonly configHash: string;
  readonly fontsManifestSha256: string;
  readonly assetsManifestSha256: string;
  readonly environmentHash: string;
  readonly layoutHash: string;
}

const HEX64 = /^[0-9a-f]{64}$/;

export function runManifestIssues(m: unknown): string[] {
  const issues: string[] = [];
  if (typeof m !== 'object' || m === null) return ['not-an-object'];
  const v = m as Record<string, unknown>;
  if (v.schemaVersion !== 1) issues.push('schemaVersion');
  if (typeof v.engineVersion !== 'string' || v.engineVersion.length === 0 || v.engineVersion.length > 64) issues.push('engineVersion');
  if (typeof v.codeSha !== 'string' || v.codeSha.length === 0 || v.codeSha.length > 80) issues.push('codeSha');
  for (const k of ['inputHash', 'configHash', 'fontsManifestSha256', 'assetsManifestSha256', 'layoutHash'] as const) {
    if (typeof v[k] !== 'string' || !HEX64.test(v[k] as string)) issues.push(k);
  }
  // environmentHash — זהות סביבת הספק: HEX בספקי ייצור; מחרוזת נעולה בספק בדיקה
  if (typeof v.environmentHash !== 'string' || v.environmentHash.length === 0 || v.environmentHash.length > 128) {
    issues.push('environmentHash');
  }
  return issues;
}

export function isRunManifest(m: unknown): m is RunManifest {
  return runManifestIssues(m).length === 0;
}

export interface RunManifestInput {
  readonly engineVersion: string;
  readonly codeSha: string;
  readonly sourceSha256: string;
  readonly effectiveSettings: unknown;
  readonly fontsManifestSha256: string;
  readonly assetsManifestSha256: string;
  readonly parserVersion: string;
  readonly environmentHash: string;
  readonly layout: unknown;
}

/** בניית RunManifest — חוזה: אין פלט מנוע ללא manifest. */
export function makeRunManifest(input: RunManifestInput): RunManifest {
  const cfg = configHashOf(input.effectiveSettings);
  const ih = inputHashOf({
    sourceSha256: input.sourceSha256,
    effectiveSettings: input.effectiveSettings,
    fontsManifestSha256: input.fontsManifestSha256,
    assetsManifestSha256: input.assetsManifestSha256,
    parserVersion: input.parserVersion,
    engineVersion: input.engineVersion,
  });
  const lh = layoutHashOf(input.layout);
  const m: RunManifest = Object.freeze({
    schemaVersion: 1,
    engineVersion: input.engineVersion,
    codeSha: input.codeSha,
    inputHash: ih,
    configHash: cfg,
    fontsManifestSha256: input.fontsManifestSha256,
    assetsManifestSha256: input.assetsManifestSha256,
    environmentHash: input.environmentHash,
    layoutHash: lh,
  });
  const issues = runManifestIssues(m);
  if (issues.length > 0) {
    throw new LayoutApiError('errors.layoutir.INVALID_MANIFEST', { issues: issues.join('; ') }, `manifest שגוי: ${issues.join('; ')}`);
  }
  return m;
}

export type { InputHashComponents };
export { configHashOf, inputHashOf, layoutHashOf };
