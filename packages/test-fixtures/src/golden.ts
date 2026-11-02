/**
 * golden.ts — כלי golden: כתיבה, השוואה ודו"ח diff (שלב 13; אפיון §17.3).
 * כלל יסוד: עדכון golden אסור אוטומטית ב־CI — writeGolden נקרא רק במפורש
 * ומלווה בדו"ח diff קריא והסבר ב־WORKLOG.
 * פונקציית הגיבוב מוזרקת — החבילה נקייה מתלויות.
 */

/** פונקציית גיבוב מוזרקת (בפועל: layoutHash של @tora/layout-api). */
export type HashFunction = (ir: unknown) => string;

/** קובץ golden על הדיסק. */
export interface GoldenFile {
  readonly schemaVersion: 1;
  readonly kind: 'golden-layout';
  readonly goldenLayoutSha256: string;
  readonly canonicalIr: string;
}

/** תוצאת השוואה. */
export interface GoldenComparison {
  readonly equal: boolean;
  readonly expectedSha256: string;
  readonly actualSha256: string;
  /** דו"ח diff קריר — ריק כששווה. */
  readonly diffReport: string;
}

/** בניית אובייקט golden מ־IR (טהור — בלי כתיבה). */
export function buildGolden(ir: unknown, hashFn: HashFunction): GoldenFile {
  return {
    schemaVersion: 1,
    kind: 'golden-layout',
    goldenLayoutSha256: hashFn(ir),
    canonicalIr: JSON.stringify(ir),
  };
}

/** השוואת IR מול golden קיים — עם דו"ח diff. */
export function compareGolden(ir: unknown, golden: GoldenFile, hashFn: HashFunction): GoldenComparison {
  const actual = hashFn(ir);
  const expected = golden.goldenLayoutSha256;
  let diffReport = '';
  if (actual !== expected) {
    const lines: string[] = [
      `golden mismatch: expected ${expected}`,
      `                 actual   ${actual}`,
    ];
    // מציאת שורת ההבדל הראשונה ב־JSON הקנוני (דו"ח קריא, לא רק hash)
    const actualText = JSON.stringify(ir);
    const expectedText = golden.canonicalIr;
    if (expectedText !== actualText) {
      const eLines = expectedText.split(',');
      const aLines = actualText.split(',');
      for (let i = 0; i < Math.max(eLines.length, aLines.length); i++) {
        if (eLines[i] !== aLines[i]) {
          lines.push(`first diverging segment (index ${i}):`);
          lines.push(`  expected: ${(eLines[i] ?? '(חסר)').slice(0, 160)}`);
          lines.push(`  actual:   ${(aLines[i] ?? '(חסר)').slice(0, 160)}`);
          break;
        }
      }
    }
    diffReport = lines.join('\n');
  }
  return { equal: actual === expected, expectedSha256: expected, actualSha256: actual, diffReport };
}

/** פרסור קובץ golden מהדיסק (בבדיקות/CLI — שם מותר fs דרך הקורא). */
export function parseGolden(text: string): GoldenFile {
  const obj = JSON.parse(text) as GoldenFile;
  if (obj.schemaVersion !== 1 || obj.kind !== 'golden-layout') {
    throw new Error(`[test-fixtures] קובץ golden שגוי: schemaVersion=${String(obj.schemaVersion)} kind=${String(obj.kind)}`);
  }
  return obj;
}
