/**
 * enforcement.ts — איסור fallback שקט במדידה (שלב 25; אפיון §6.4, §14.3, §20).
 *
 * המדיניות הנעולה — גופן חסר, byte שהשתנה, גליף חסר או provider בלתי-זמין
 * הם **שגיאות גלויות**, לא תוצאה אחרת בשקט:
 *
 * | מצב | קוד | אופן | נעילה |
 * |---|---|---|---|
 * | גופן חסר מהסט | `errors.font.MISSING_FONT` | חריגה מיידית | אין גופן מערכת בכלל |
 * | מזהה בלתי-מוכר | `errors.font.UNKNOWN_FONT_ID` | חריגה מיידית | אין ניחוש/החלפה |
 * | bytes שהשתנו | `errors.font.FONT_HASH_MISMATCH` | חרימה לפני מדידה ראשונה | אין "המשך בזהירות" |
 * | חתימה שקרית | `errors.font.FONT_FORMAT_MISMATCH` | חריגה לפני מדידה | הסיומת אינה ראיה |
 * | פריקה סוטה | `errors.font.FONT_SFNT_MISMATCH` | חריגה ביצירת הספק | אימות כפול מול המניפסט |
 * | provider בלתי-זמין | `errors.measurement.MEASUREMENT_UNAVAILABLE` | חריגה ביצירה | אין גרסה חלופית |
 * | גליף חסר | `errors.font.MISSING_GLYPH` | דיווח מלא + שער קשיח | ראו להלן |
 *
 * **גליף חסר (tofu)**: ה־shaping אינו נכשל — הריצה מוחזרת עם ‎.notdef‎
 * (glyphId 0, "תיבת tofu") והאטומים רשומים ב־`missingGlyphAtomIds`.
 * `missingGlyphFindings` ממפה כל אטום לממצא אחיד (§14.1/§14.3 —
 * "fallback לא מוסבר" הוא HIGH); `assertNoMissingGlyphs` הוא השער הקשיח
 * לריצות קפדניות — שתי הדרכים גלויות, ושום תוצאה אינה "מסתדרת לבד".
 * הספק המדומה אסור בייצור מעצם הטיפוס (שלב 22) — כאן נבדק שוב שאף
 * נתיב לא נופל אליו בשקט.
 */
import { EngineError } from './errors.js';
import type { ValidationIssue } from './errors.js';
import { fontFingerprint } from './provider.js';
import type { ShapeRequest, ShapedRun } from './provider.js';

/** המדיניות עצמה — קפואה; מיוצאת לבדיקות, תיעוד ו־CI. */
export const MEASUREMENT_ERROR_POLICY = Object.freeze({
  missingFont: 'fatal: MISSING_FONT — אין גופן מערכת, אין החלפה, אין המשך בשקט',
  unknownFontId: 'fatal: UNKNOWN_FONT_ID — מזהה בלתי-מוכר הוא שגיאה, לא undefined',
  fontHashMismatch: 'fatal: FONT_HASH_MISMATCH — bytes שהשתנו עוצרים לפני המדידה הראשונה',
  fontFormatMismatch: 'fatal: FONT_FORMAT_MISMATCH — החתימה קובעת, לא הסיומת',
  fontSfntMismatch: 'fatal: FONT_SFNT_MISMATCH — אימות כפול מול המניפסט בכל יצירת ספק',
  measurementUnavailable: 'fatal: MEASUREMENT_UNAVAILABLE — provider שאינו תואם לנעילה אינו רץ',
  missingGlyph: 'report+gate: findings לכל אטום (HIGH, §14.3) + שער קשיח assertNoMissingGlyphs; tofu מתועד ואינו נבלע',
  simulatedMeasurer: 'forbidden-in-production: TestMeasurementProvider קיים רק בהזרקת בדיקות (subpath ./test)',
});

/**
 * ממצאי גליף חסר — ממצא אחיד (§14.1 בפורמט ValidationIssue) לכל אטום
 * שנרשם ב־missingGlyphAtomIds: מפתח קטלוגי, path = מזהה האטום,
 * פרמטרים = מזהה הגופן, טביעת הפנים ותוכן־העניין. חומרת HIGH לפי §14.3
 * ("fallback לא מוסבר").
 */
export function missingGlyphFindings(run: ShapedRun, request: ShapeRequest): readonly ValidationIssue[] {
  const findings: ValidationIssue[] = [];
  if (run.missingGlyphAtomIds.length === 0) return findings;
  const fp = fontFingerprint(request.font);
  const idToIndex = new Map<string, number>();
  request.atoms.forEach((a, i) => idToIndex.set(a.id, i));
  for (const atomId of run.missingGlyphAtomIds) {
    const index = idToIndex.get(atomId);
    findings.push(Object.freeze({
      key: 'errors.font.MISSING_GLYPH',
      severity: 'error' as const,
      params: {
        fontId: request.font.fontId,
        fontFingerprint: fp.slice(0, 16),
        atomId,
        atomIndex: index ?? -1,
      },
      path: atomId,
      devNote: index === undefined
        ? 'atom id not in request (provider bug — investigate)'
        : `atom[${index}] text=${JSON.stringify(request.atoms[index]!.text)}`,
    }));
  }
  return Object.freeze(findings);
}

/**
 * השער הקשיח — ריצה עם גליף חסר נכשלת מפורשות עם מזהה הגופן והמספר.
 * לריצות שמעדיפות tofu מתועד + ממצאים — להשתמש ב־missingGlyphFindings;
 * שתי הדרכים גלויות, ואף אחת מהן אינה "ממשיכה כרגיל" בשקט.
 */
export function assertNoMissingGlyphs(run: ShapedRun, request: ShapeRequest): void {
  if (run.missingGlyphAtomIds.length > 0) {
    throw new EngineError('errors.font.MISSING_GLYPH', {
      fontId: request.font.fontId,
      count: run.missingGlyphAtomIds.length,
    });
  }
}

/**
 * אינטגרציית הבדיקה השלילית: מריץ בקשה ומוודא שאין אף נתיב נסיגה —
 * הצלחה מלאה (אפס גליפים חסרים) או חריגה מקוטלגת. מחזיר את הריצה
 * בהצלחה; מעביר הלאה כל חריגה (אין catch שקט כאן ולא בשום מקום אחר).
 */
export function shapeStrict(
  shape: (request: ShapeRequest) => ShapedRun,
  request: ShapeRequest,
): ShapedRun {
  const run = shape(request);
  assertNoMissingGlyphs(run, request);
  return run;
}
