/**
 * test-provider.ts — TestMeasurementProvider: וקטורים קבועים לבדיקות בלבד (שלב 22).
 *
 * אפיון §6.4: "SimulatedMeasurer מותר רק כ־TestMeasurementProvider
 * שמוזרק במפורש בבדיקות יחידה; אסור לייבא אותו ממסלול production."
 * אכיפה: הקובץ מיוצא דרך subpath './test' בלבד (index.ts אינו מייצא
 * אותו); dependency-cruiser והמאמת של השלב אוסרים ייבוא מקובצי src
 * שאינם בדיקות. providerId מילולי 'test-simulated' — אינו יכול להחליף
 * provider ייצור בטיפוס.
 *
 * הווקטורים קבועים ודטרמיניסטיים לחלוטין — טבלאות מפורשות לפי קטגוריית
 * נקודת קוד (ביחידות אלפיות em, כמקובל בגופנים): אין קריאת קבצי גופן,
 * אין אקראיות, אין זמן. אותה בקשה ⇐ אותן תוצאות, תמיד, בכל host.
 * טווח U+E000–U+E0FF (Private Use) מדמה גליף חסר (.notdef) כדי שבדיקות
 * השלבים הבאים (25, 26, 29) יוכלו לתרגל דיווח MISSING_GLYPH בקביעות.
 */
import { EngineError } from './errors.js';
import { roundDiv } from './units.js';
import {
  assertShapeRequest,
  shapeRequestHash,
  shapeBatchViaSingle,
} from './provider.js';
import type {
  ShapeRequest,
  ShapedGlyph,
  ShapedRun,
  ShapingAtom,
  TestMeasurementProvider,
} from './provider.js';
import type { LayoutUnit } from './units.js';

/** גרסת טבלת הווקטורים — נכנסת לזהות ה־provider ולמפתח המטמון. */
export const TEST_VECTORS_VERSION = 'test-vectors-v1' as const;

/** זהות קבועה — זהה בכל host ובכל ריצה (מוכח בשלב 29). */
export const TEST_PROVIDER_IDENTITY = Object.freeze({
  providerId: 'test-simulated' as const,
  providerVersion: TEST_VECTORS_VERSION,
  /** אין WASM בכלל — ערך נעול של ״אין bytes״ (SHA-256 של מחרורת ריקה). */
  wasmSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  environmentHash: 'test-simulated-env-v1',
});

/** יחידות אלפיות em (per-mille) — מוכפלות בגודל המבוקש ומעוגלות. */
const PM_LETTER = 556;
const PM_DIGIT = 500;
const PM_SPACE = 250;
const PM_PUNCT = 300;
const PM_OTHER = 600;
const PM_NOTDEF = 500;
const PM_MARK = 0;
const PM_CONTROL = 0;

/** מטריקות אנכיות קבועות (אלפיות em). */
const PM_ASCENT = 800;
const PM_DESCENT = 200;
const PM_LINE_GAP = 0;

/** קטגוריית וקטור לפי נקודת קוד — טבלה סגורה ודטרמיניסטית. */
type VectorClass =
  | 'hebrew-letter' | 'latin-letter' | 'digit' | 'space'
  | 'combining-mark' | 'format-control' | 'pua-missing' | 'punct' | 'other';

interface VectorRule {
  readonly cls: VectorClass;
  readonly glyphId: number;
  readonly pm: number;
}

function vectorOf(cp: number): VectorRule {
  // עברית — אותיות בסיס (U+05D0–U+05EA)
  if (cp >= 0x05d0 && cp <= 0x05ea) {
    return { cls: 'hebrew-letter', glyphId: 0x0100 + (cp - 0x05d0), pm: PM_LETTER };
  }
  // גרשיים ומקף עברי — פיסוק בתוך הכתב
  if (cp === 0x05be || cp === 0x05f3 || cp === 0x05f4) {
    return { cls: 'punct', glyphId: 0x0500 + (cp - 0x05be), pm: PM_PUNCT };
  }
  // ניקוד וטעמים (U+0591–U+05C7 למעט 05BE שכבר טופל) — מתלים, advance 0
  if (cp >= 0x0591 && cp <= 0x05c7) {
    return { cls: 'combining-mark', glyphId: 0x0400 + (cp - 0x0591), pm: PM_MARK };
  }
  // צורות הצגה עבריות (U+FB1D–U+FB4F) — אות בכתב אחד
  if (cp >= 0xfb1d && cp <= 0xfb4f) {
    return { cls: 'hebrew-letter', glyphId: 0x0600 + (cp - 0xfb1d), pm: PM_LETTER };
  }
  // לטינית
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) {
    return { cls: 'latin-letter', glyphId: 0x0200 + (cp - 0x41), pm: PM_LETTER };
  }
  // ספרות
  if (cp >= 0x30 && cp <= 0x39) {
    return { cls: 'digit', glyphId: 0x0300 + (cp - 0x30), pm: PM_DIGIT };
  }
  // רווח
  if (cp === 0x20) {
    return { cls: 'space', glyphId: 0x0003, pm: PM_SPACE };
  }
  // בקרות פורמט — LRM/RLM וקידודי כיוון; בלתי־נראות (advance 0)
  if (cp === 0x200e || cp === 0x200f || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069)) {
    return { cls: 'format-control', glyphId: 0x0002, pm: PM_CONTROL };
  }
  // Private Use U+E000–U+E0FF — הדמיית גליף חסר (.notdef)
  if (cp >= 0xe000 && cp <= 0xe0ff) {
    return { cls: 'pua-missing', glyphId: 0x0000, pm: PM_NOTDEF };
  }
  // פיסוק כללי נפוץ
  if (
    cp === 0x2e || cp === 0x2c || cp === 0x3a || cp === 0x3b || cp === 0x21 || cp === 0x3f
    || cp === 0x28 || cp === 0x29 || cp === 0x5b || cp === 0x5d || cp === 0x2d
  ) {
    return { cls: 'punct', glyphId: 0x0700 + (cp % 0x40), pm: PM_PUNCT };
  }
  return { cls: 'other', glyphId: 0x0001, pm: PM_OTHER };
}

function isCombiningClass(cls: VectorClass): boolean {
  return cls === 'combining-mark';
}

/** האם אטום מכיל נקודת קוד מטווח ההדמיה של גליף חסר. */
function atomSimulatesMissingGlyph(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const cp = text.charCodeAt(i);
    if (cp >= 0xe000 && cp <= 0xe0ff) return true;
  }
  return false;
}

/** advanceLu של וקטור בגודל נתון + ריווח אותיות (חוזה הריצה). העיגול — roundDiv של ADR-001. */
function advanceLuOf(pm: number, fontSizeLu: number, letterSpacingLu: number): LayoutUnit {
  const scaled = roundDiv(pm * fontSizeLu, 1000);
  return (scaled + letterSpacingLu) as LayoutUnit;
}

/**
 * בונה TestMeasurementProvider טהור וחסר מצב. כל הקריאות מחזירות
 * ערכים חדשים וקפואים — אין מצב פנימי כלל (גם לא מונים).
 */
export function createTestMeasurementProvider(): TestMeasurementProvider {
  const shape = (request: ShapeRequest): ShapedRun => {
    assertShapeRequest(request);
    const { atoms, fontSizeLu, letterSpacingLu } = request;
    const glyphs: ShapedGlyph[] = [];
    const missing: ShapedRun['missingGlyphAtomIds'][number][] = [];

    // אשכול הבסיס האחרון שראינו — סימוכים למתלים (combining marks)
    let lastBaseCluster = 0;
    let sawAnyBase = false;

    for (let i = 0; i < atoms.length; i++) {
      const atom = atoms[i]!;
      if (atomSimulatesMissingGlyph(atom.text)) missing.push(atom.id);

      let atomHasBase = false;
      for (let c = 0; c < atom.text.length; c++) {
        const cp = atom.text.charCodeAt(c);
        // דילוג על חציו השני של surrogate pair (הווקטור של הזוג נקבע לפי ה-high)
        if (cp >= 0xdc00 && cp <= 0xdfff) continue;
        const rule = vectorOf(cp);
        const combining = isCombiningClass(rule.cls);
        const cluster = combining && sawAnyBase && !atomHasBase
          ? lastBaseCluster
          : i;
        glyphs.push(Object.freeze({
          glyphId: rule.glyphId,
          clusterAtomIndex: cluster,
          advanceLu: advanceLuOf(rule.pm, fontSizeLu, letterSpacingLu),
          xOffsetLu: 0 as LayoutUnit,
          yOffsetLu: 0 as LayoutUnit,
        }));
        if (!combining) {
          atomHasBase = true;
          lastBaseCluster = i;
          sawAnyBase = true;
        }
      }
    }

    // חשבונאות הריצה — שער החוזה (widthLu === Σ advances)
    let width = 0;
    for (const g of glyphs) width += g.advanceLu;
    const run: ShapedRun = Object.freeze({
      requestHash: shapeRequestHash(TEST_PROVIDER_IDENTITY, request),
      glyphs: Object.freeze(glyphs),
      widthLu: width as LayoutUnit,
      ascentLu: roundDiv(PM_ASCENT * fontSizeLu, 1000) as LayoutUnit,
      descentLu: roundDiv(PM_DESCENT * fontSizeLu, 1000) as LayoutUnit,
      lineGapLu: roundDiv(PM_LINE_GAP * fontSizeLu, 1000) as LayoutUnit,
      missingGlyphAtomIds: Object.freeze(missing),
    });
    return run;
  };

  const lineOpportunities = (atoms: readonly ShapingAtom[]): readonly number[] => {
    const out: number[] = [];
    for (let i = 1; i < atoms.length; i++) {
      // כלל קבוע וטריוויאלי לבדיקות: מועמד לפי שדה האטום בלבד.
      // המימוש האמיתי (UAX #14 נעול, מהטקסט) — שלב 27.
      if (atoms[i]!.breakBefore !== 'forbidden') out.push(i);
    }
    return Object.freeze(out);
  };

  return Object.freeze({
    providerId: 'test-simulated' as const,
    providerVersion: TEST_VECTORS_VERSION,
    wasmSha256: TEST_PROVIDER_IDENTITY.wasmSha256,
    environmentHash: TEST_PROVIDER_IDENTITY.environmentHash,
    vectorsVersion: TEST_VECTORS_VERSION,
    shape,
    lineOpportunities,
    shapeBatch: (requests: readonly ShapeRequest[]): readonly ShapedRun[] =>
      shapeBatchViaSingle(
        { providerVersion: TEST_VECTORS_VERSION, environmentHash: TEST_PROVIDER_IDENTITY.environmentHash, shape, lineOpportunities },
        requests,
      ),
  });
}

/** טלאומורפיזם: האם ערך הוא TestMeasurementProvider תקין. */
export function isTestMeasurementProvider(value: unknown): value is TestMeasurementProvider {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    p.providerId === 'test-simulated'
    && typeof p.providerVersion === 'string'
    && typeof p.environmentHash === 'string'
    && typeof p.shape === 'function'
    && typeof p.lineOpportunities === 'function'
  );
}

/** שגיאת עזר לבדיקות — יצירת בקשה לא חוקית עם קוד מקוטלג. */
export function invalidRequestForTests(reason: string): never {
  throw new EngineError('errors.shape.INVALID_REQUEST', { reason });
}
