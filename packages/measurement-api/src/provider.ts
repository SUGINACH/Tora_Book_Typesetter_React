/**
 * provider.ts — חוזי מדידה ו־shaping (שלב 22; אפיון §6.4).
 *
 * מטרה: להפריד מדידה ו־shaping מהמנוע בחוזה יציב — כך שהמנוע ייכתב
 * מול interface בלבד (שער השלב), וה־provider האמיתי (HarfBuzz/WASM,
 * שלב 24) יחליף את המימוש בלי שהמנוע ירגיש.
 *
 * כללי יסוד (אפיון §6.4, §5):
 *   1. אין Canvas ואין DOM בחתימות — החוזה רץ זהה ב־Node, Worker ו־Tauri.
 *   2. ה־provider נטען ומאותחל אסינכרונית ב־host (load); לאחר מכן כל
 *      shape() סינכרוני ודטרמיניסטי — אין סמנטיקת זמן, אין סדר רשת.
 *   3. HarfBuzz מבצע shaping בלבד — לא BiDi ולא line breaking; UAX #9
 *      ו־UAX #14 ממומשים כמודולים נפרדים (שלבים 27–28) עם גרסאות נעולות.
 *   4. ל־measurement-api אין תלויות (גרף §5): האטומים כאן הם חוזה
 *      מבני (ShapingAtom) ש־TextAtom של content-model מקיים אותו
 *      מבנית — המזהים הממותגים זהים (brand 'AtomId') ולכן חד־חד־ערכיים.
 *   5. TestMeasurementProvider הוא סוג נפרד ובעל שם (providerId:
 *      'test-simulated') — הוא מוזרק במפורש בבדיקות יחידה בלבד ואינו
 *      יכול להחליף provider ייצור בטיפוס (אפיון §6.4: אין SimulatedMeasurer
 *      במסלול production; אכיפת ייבוא — subpath './test' + depcruise).
 */

import { EngineError } from './errors.js';
import { canonicalJson } from './canonical.js';
import { sha256Hex } from './hash.js';
import type { LayoutUnit } from './units.js';

// ─────────────────────────── אטומים למדידה ───────────────────────────

/**
 * מזהה אטום — מחרורת ממותגת זהה ל־AtomId של content-model (אותו brand).
 * הזהות המבנית מבטיחה השמה דו־כיוונית בלי תלות בין החבילות (גרף §5).
 */
export type AtomIdRef = string & { readonly __brand: 'AtomId' };

/** כתב — תואם AtomScript של content-model (אותם ערכים, אותו סדר). */
export type ShapingScript = 'hebrew' | 'latin' | 'number' | 'punctuation' | 'other';

/** הזדמנות שבירה לפני אטום — תואם BreakBefore של content-model. */
export type ShapingBreakBefore = 'forbidden' | 'allowed' | 'required';

/**
 * חוזה מבני לאטום הנמדד: אותם שדות ש־shaping צריך (§6.4) וש־TextAtom
 * של content-model מקיים מבנית (id/text/script/bidiLevel/breakBefore).
 * המקור (SourceSpan) נשאר אצל בעליו — המדידה מדווחת לפי מזהי אטומים.
 */
export interface ShapingAtom {
  /** מזהה יציב — AtomId בפועל; משמש לדיווח גליף חסר ולמיפוי clusters. */
  readonly id: AtomIdRef;
  /** grapheme cluster או token אטומי; אין lone surrogates ואין תווי בקרה. */
  readonly text: string;
  readonly script: ShapingScript;
  /** רמת BiDi 0–125 (UAX #9, שלב 28) — שלם בטוח. */
  readonly bidiLevel: number;
  readonly breakBefore: ShapingBreakBefore;
}

const SHAPING_SCRIPTS: readonly ShapingScript[] = Object.freeze([
  'hebrew', 'latin', 'number', 'punctuation', 'other',
] as const);
const SHAPING_BREAKS: readonly ShapingBreakBefore[] = Object.freeze([
  'forbidden', 'allowed', 'required',
] as const);

/** רמת BiDi מרבית לפי UAX #9 (הטמעות מפורשות עד 125). */
export const MAX_SHAPING_BIDI_LEVEL = 125;

// ─────────────────────────── מפתח גופן ───────────────────────────

/** משקל CSS תקני — 1–1000 (ערכי CSS Fonts Level 4). */
export function isValidFontWeight(weight: unknown): weight is number {
  return typeof weight === 'number' && Number.isSafeInteger(weight) && weight >= 1 && weight <= 1000;
}

/** סגנון גופן (CSS font-style המצומצם שהמלאי מכיר). */
export type FontStyle = 'normal' | 'italic';

/**
 * מפתח פנים של גופן (§6.4) — טעינת bytes מה־manifest בלבד (שלב 23);
 * contentSha256 הוא הנעילה על ה־bytes עצמם.
 */
export interface FontFaceKey {
  /** מזהה יציב מה־manifest (שלב 23) — בלי נתיבי מערכת ובלי fallback. */
  readonly fontId: string;
  /** SHA-256 של תוכן הקובץ — 64 hex קטנים; נעילת "אותם bytes". */
  readonly contentSha256: string;
  readonly family: string;
  readonly weight: number;
  readonly style: FontStyle;
}

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

/** בדיקת תקינות מפתח גופן — מחזיר רשימת בעיות (ריקה = תקין). */
export function fontFaceKeyIssues(font: unknown): readonly string[] {
  const issues: string[] = [];
  if (typeof font !== 'object' || font === null) return ['not-an-object'];
  const f = font as Record<string, unknown>;
  if (typeof f.fontId !== 'string' || f.fontId.length === 0 || f.fontId.length > 256) {
    issues.push('fontId');
  }
  if (typeof f.contentSha256 !== 'string' || !SHA256_HEX_RE.test(f.contentSha256)) {
    issues.push('contentSha256');
  }
  if (typeof f.family !== 'string' || f.family.length === 0 || f.family.length > 256) {
    issues.push('family');
  }
  if (!isValidFontWeight(f.weight)) issues.push('weight');
  if (f.style !== 'normal' && f.style !== 'italic') issues.push('style');
  return issues;
}

/** טלאומורפיזם: האם הערך FontFaceKey תקין. */
export function isFontFaceKey(font: unknown): font is FontFaceKey {
  return fontFaceKeyIssues(font).length === 0;
}

/**
 * טביעת אצבע של מפתח גופן — SHA-256 של הייצוג הקנוני. כל שינוי באחד
 * השדות (לרבות החלפת bytes ⇒ contentSha256) משנה את הטביעה; משמשת
 * את מפתח המטמון (שלב 26) ואת זהות המדידה בין hosts (שלב 29).
 */
export function fontFingerprint(font: FontFaceKey): string {
  return sha256Hex(canonicalJson({
    fontId: font.fontId,
    contentSha256: font.contentSha256,
    family: font.family,
    weight: font.weight,
    style: font.style,
  }));
}

// ─────────────────────────── בקשת shaping ───────────────────────────

/** כיוון מפורש לבקשה — אין ניחוש לפי התוכן (ה־BiDi כבר חושב, שלב 28). */
export type ShapingDirection = 'rtl' | 'ltr';

const DIRECTIONS: readonly ShapingDirection[] = Object.freeze(['rtl', 'ltr'] as const);

/**
 * בקשת shaping (§6.4): אטומים + פנים + גודל + כיוון + שפה + features
 * + ריווח אותיות. הכל מפורש — שתי בקשות זהות מניבות אותה תוצאה,
 * תמיד, על כל host (ברירת מחדל אסורה: מה שלא צוין לא נוסף בשקט).
 */
export interface ShapeRequest {
  readonly atoms: readonly ShapingAtom[];
  readonly font: FontFaceKey;
  /** גודל הגופן ביחידות LU (ADR-001) — שלם בטוח חיובי. */
  readonly fontSizeLu: LayoutUnit;
  readonly direction: ShapingDirection;
  /** תג שפה (BCP-47) — למשל 'he', 'en-US'; משפיע על shaping. */
  readonly language: string;
  /** OpenType features — מפתח תג 4 תווים לערך בוליאני. */
  readonly features: Readonly<Record<string, boolean>>;
  /** ריווח אותיות ביחידות LU — שלם בטוח, יכול להיות שלילי (tracking). */
  readonly letterSpacingLu: LayoutUnit;
}

const FEATURE_TAG_RE = /^[!A-Za-z0-9]{4}$/;

/**
 * אימות בקשת shaping — דוחה לפני כל מדידה עם קוד מקוטלג ומיקום.
 * מחזיר רשימת בעיות; ריקה = תקינה.
 */
export function shapeRequestIssues(request: unknown): readonly string[] {
  const issues: string[] = [];
  if (typeof request !== 'object' || request === null) return ['not-an-object'];
  const r = request as Record<string, unknown>;
  if (!Array.isArray(r.atoms) || r.atoms.length === 0) {
    issues.push('atoms:empty');
  } else {
    for (let i = 0; i < r.atoms.length; i++) {
      const a = r.atoms[i] as Record<string, unknown> | null;
      if (typeof a !== 'object' || a === null) {
        issues.push(`atoms[${i}]:not-an-object`);
        continue;
      }
      if (typeof a.id !== 'string' || a.id.length === 0 || a.id.length > 512) {
        issues.push(`atoms[${i}]:id`);
      }
      if (typeof a.text !== 'string' || a.text.length === 0) {
        issues.push(`atoms[${i}]:text`);
      } else {
        for (let c = 0; c < a.text.length; c++) {
          const cp = a.text.charCodeAt(c);
          if (cp >= 0xd800 && cp <= 0xdbff) {
            const next = a.text.charCodeAt(c + 1);
            if (!(next >= 0xdc00 && next <= 0xdfff)) {
              issues.push(`atoms[${i}]:lone-surrogate`);
              break;
            }
            c++;
          } else if (cp >= 0xdc00 && cp <= 0xdfff) {
            issues.push(`atoms[${i}]:lone-surrogate`);
            break;
          } else if ((cp <= 0x1f && cp !== 0x09) || cp === 0x7f) {
            issues.push(`atoms[${i}]:control-char`);
            break;
          }
        }
      }
      if (typeof a.script !== 'string' || !SHAPING_SCRIPTS.includes(a.script as ShapingScript)) {
        issues.push(`atoms[${i}]:script`);
      }
      if (
        typeof a.bidiLevel !== 'number' || !Number.isSafeInteger(a.bidiLevel)
        || a.bidiLevel < 0 || a.bidiLevel > MAX_SHAPING_BIDI_LEVEL
      ) {
        issues.push(`atoms[${i}]:bidiLevel`);
      }
      if (
        typeof a.breakBefore !== 'string'
        || !SHAPING_BREAKS.includes(a.breakBefore as ShapingBreakBefore)
      ) {
        issues.push(`atoms[${i}]:breakBefore`);
      }
    }
  }
  for (const field of fontFaceKeyIssues(r.font)) issues.push(`font:${field}`);
  if (
    typeof r.fontSizeLu !== 'number' || !Number.isSafeInteger(r.fontSizeLu)
    || r.fontSizeLu <= 0
  ) {
    issues.push('fontSizeLu');
  }
  if (typeof r.direction !== 'string' || !DIRECTIONS.includes(r.direction as ShapingDirection)) {
    issues.push('direction');
  }
  if (typeof r.language !== 'string' || r.language.length === 0 || r.language.length > 35) {
    issues.push('language');
  } else if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(r.language)) {
    issues.push('language:format');
  }
  if (typeof r.features !== 'object' || r.features === null || Array.isArray(r.features)) {
    issues.push('features');
  } else {
    for (const [tag, val] of Object.entries(r.features)) {
      if (!FEATURE_TAG_RE.test(tag)) {
        issues.push(`features:tag:${tag}`);
      }
      if (typeof val !== 'boolean') {
        issues.push(`features:value:${tag}`);
      }
    }
  }
  if (
    typeof r.letterSpacingLu !== 'number' || !Number.isSafeInteger(r.letterSpacingLu)
  ) {
    issues.push('letterSpacingLu');
  }
  return issues;
}

/** טלאומורפיזם: האם הערך ShapeRequest תקין. */
export function isShapeRequest(request: unknown): request is ShapeRequest {
  return shapeRequestIssues(request).length === 0;
}

/** אימות המרה לשימוש ה־provider — זורק עם קוד מקוטלג ומיקום מלא. */
export function assertShapeRequest(request: ShapeRequest): void {
  const issues = shapeRequestIssues(request);
  if (issues.length > 0) {
    throw new EngineError('errors.shape.INVALID_REQUEST', {
      reason: issues.join(';'),
    });
  }
}

// ─────────────────────────── תוצאת shaping ───────────────────────────

/** גליף אחד מעוצב (§6.4) — מיקום יחסי לקו הבסיס של הריצה. */
export interface ShapedGlyph {
  /** מזהה גליף בגופן — 0 = ‎.notdef (tofu); דיווח נפרד ב־missingGlyphAtomIds. */
  readonly glyphId: number;
  /** אינדקס האטום בבקשה שהגליף שייך לאשכול שלו (cluster). */
  readonly clusterAtomIndex: number;
  /** התקדמות אופקית ביחידות LU — כולל תרומת ריווח האותיות (חוזה להלן). */
  readonly advanceLu: LayoutUnit;
  readonly xOffsetLu: LayoutUnit;
  readonly yOffsetLu: LayoutUnit;
}

/**
 * ריצה מעוצבת (§6.4).
 *
 * חוזה חשבונאות (נאכף בבדיקות שלב 22 וב־provider האמיתי בשלב 24):
 *   widthLu === Σ(g.advanceLu) — הריווח בין גליפים כבר נכנס ל־advance
 *   של כל גליף (דפוס CSS: letter-spacing אחרי כל תו, כולל האחרון),
 *   כך שאפשר למדוד מחדש את רוחב כל קו מהגליפים לבדם (§6.5).
 */
export interface ShapedRun {
  /** SHA-256 של הייצוג הקנוני של הבקשה + זהות ה־provider (להלן). */
  readonly requestHash: string;
  readonly glyphs: readonly ShapedGlyph[];
  readonly widthLu: LayoutUnit;
  /** מטריקות אנכיות בגודל המבוקש — סקיילינג יחיד לכל הריצה. */
  readonly ascentLu: LayoutUnit;
  readonly descentLu: LayoutUnit;
  readonly lineGapLu: LayoutUnit;
  /** אטומים שלא נמצא להם גליף — דיווח גלוי, לא החלפה שקטה (שלב 25). */
  readonly missingGlyphAtomIds: readonly AtomIdRef[];
}

/** טלאומורפיזם: האם הערך ShapedRun תקין מבנית (ולידציה חשבונאית — shapedRunAccountingIssues). */
export function isShapedRun(value: unknown): value is ShapedRun {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.requestHash === 'string' && r.requestHash.length > 0
    && Array.isArray(r.glyphs)
    && typeof r.widthLu === 'number' && Number.isSafeInteger(r.widthLu)
    && typeof r.ascentLu === 'number' && Number.isSafeInteger(r.ascentLu)
    && typeof r.descentLu === 'number' && Number.isSafeInteger(r.descentLu)
    && typeof r.lineGapLu === 'number' && Number.isSafeInteger(r.lineGapLu)
    && Array.isArray(r.missingGlyphAtomIds)
  );
}

/**
 * חשבונאות ריצה: האם widthLu === Σ advances ואינדקסי האשכול בטווח.
 * בדיקה זו היא שער החשבונאות של כל provider (המבחנים של שלבים 22/24/29).
 */
export function shapedRunAccountingIssues(run: ShapedRun): readonly string[] {
  const issues: string[] = [];
  let sum = 0;
  for (let i = 0; i < run.glyphs.length; i++) {
    const g = run.glyphs[i]!;
    if (!Number.isSafeInteger(g.glyphId) || g.glyphId < 0) issues.push(`glyphs[${i}]:glyphId`);
    if (
      !Number.isSafeInteger(g.clusterAtomIndex) || g.clusterAtomIndex < 0
    ) {
      issues.push(`glyphs[${i}]:clusterAtomIndex`);
    }
    if (!Number.isSafeInteger(g.advanceLu)) issues.push(`glyphs[${i}]:advanceLu`);
    if (!Number.isSafeInteger(g.xOffsetLu)) issues.push(`glyphs[${i}]:xOffsetLu`);
    if (!Number.isSafeInteger(g.yOffsetLu)) issues.push(`glyphs[${i}]:yOffsetLu`);
    sum += Number.isSafeInteger(g.advanceLu) ? g.advanceLu : 0;
  }
  if (sum !== run.widthLu) issues.push('widthLu:mismatch');
  for (const id of run.missingGlyphAtomIds) {
    if (typeof id !== 'string' || id.length === 0) issues.push('missingGlyphAtomIds');
  }
  return issues;
}

// ─────────────────────────── זהות provider ───────────────────────────

/** זהות provider — כל מה שנכנס ל־requestHash ולמפתח המטמון. */
export interface ProviderIdentity {
  readonly providerId: string;
  readonly providerVersion: string;
  /** SHA-256 של חבילת ה־WASM — נעילת "אותם bytes" גם לשפר. */
  readonly wasmSha256: string;
  /** זהה בכל host לאותה בנייה — מוכח בשלב 29; לא תלוי זמן/מונה/רשת. */
  readonly environmentHash: string;
}

/** בדיקת תקינות זהות provider. */
export function providerIdentityIssues(identity: unknown): readonly string[] {
  const issues: string[] = [];
  if (typeof identity !== 'object' || identity === null) return ['not-an-object'];
  const p = identity as Record<string, unknown>;
  if (typeof p.providerId !== 'string' || p.providerId.length === 0 || p.providerId.length > 64) {
    issues.push('providerId');
  }
  if (
    typeof p.providerVersion !== 'string' || p.providerVersion.length === 0
    || p.providerVersion.length > 64
  ) {
    issues.push('providerVersion');
  }
  if (typeof p.wasmSha256 !== 'string' || !SHA256_HEX_RE.test(p.wasmSha256)) {
    issues.push('wasmSha256');
  }
  if (
    typeof p.environmentHash !== 'string' || p.environmentHash.length === 0
    || p.environmentHash.length > 128
  ) {
    issues.push('environmentHash');
  }
  return issues;
}

// ─────────────────────────── החוזה הציבורי ───────────────────────────

/**
 * ליבת provider מוכן — סינכרוני ודטרמיניסטי אחרי הטעינה.
 * אין Canvas, אין DOM, אין מצב זמן; batch שקוף לתוצאה (להלן).
 */
export interface PreparedProviderCore {
  readonly providerVersion: string;
  readonly environmentHash: string;
  /**
   * shaping של בקשה אחת — טהור: אותה בקשה ⇐ אותה תוצאה, תמיד.
   * דוחה בקשה לא חוקית עם errors.shape.INVALID_REQUEST.
   */
  shape(request: ShapeRequest): ShapedRun;
  /**
   * הזדמנויות שבירה: אינדקסים עולים i (0 < i < atoms.length) שלפניהם
   * ניתן לסיים שורה — allowed וגם required. הצרכן מבחין חובה לפי
   * atoms[i].breakBefore === 'required'. המימוש האמיתי — UAX #14
   * נעול (שלב 27); ה־provider חושף אותו כדי שהמנוע יצרוך מקור אחד.
   * טהור ודטרמיניסטי — אין בחירת שורה בשלב זה (רק מועמדים).
   */
  lineOpportunities(atoms: readonly ShapingAtom[]): readonly number[];
  /**
   * batching אופציונלי — חוזה: תוצאה[i] זהה ביט-ביט ל־shape(requests[i])
   * בפני עצמו, לא משנה ההרכב, הסדר או גודל ה־batch. אין סמנטיקת
   * זמן ואין סדר רשת — batching הוא אופטימיזציה בלבד (§6.4).
   */
  shapeBatch?(requests: readonly ShapeRequest[]): readonly ShapedRun[];
}

/**
 * provider הייצור (§6.4): HarfBuzz/WASM נעול בלבד — providerId מילה
 * מילולית, כך ש־TestMeasurementProvider אינו יכול להיכנס במקומו בטיפוס.
 */
export interface MeasurementProvider extends PreparedProviderCore {
  readonly providerId: 'harfbuzz-wasm';
  readonly wasmSha256: string;
}

/**
 * provider מדומה לבדיקות יחידה בלבד (§6.4: TestMeasurementProvider) —
 * וקטורים קבועים ודטרמיניסטיים; מוזרק במפורש. אסור לייבאו ממסלול
 * production (subpath './test'; אכיפה ב־depcruise ובמאמת השלב).
 */
export interface TestMeasurementProvider extends PreparedProviderCore {
  readonly providerId: 'test-simulated';
  /** גרסת טבלת הווקטורים הקבועים — מופיעה בזהות ובמפתח המטמון. */
  readonly vectorsVersion: string;
}

/** כל provider שהמנוע מוכן לקבל בהזרקה — ייצור או בדיקה מפורשת. */
export type AnyMeasurementProvider = MeasurementProvider | TestMeasurementProvider;

/**
 * טוען provider: האתחול האסינכרוני קורה כאן (ה־host קורא load() פעם
 * אחת); הערך המוחזר קפוא ומוכן — כל shape() שלאחר מכן סינכרוני
 * (§6.4). אין רשת בזמן ריצה: ה־WASM נארז מקומית (ADR-003, שלב 24).
 */
export interface ProviderLoader {
  load(): Promise<AnyMeasurementProvider>;
}

// ─────────────────────────── requestHash ───────────────────────────

/**
 * requestHash — SHA-256 של הייצוג הקנוני של (זהות provider, בקשה).
 * שדה האטום שנכנס: (id, text, bidiLevel) — script ו־breakBefore אינם
 * משפיעים על shaping (הם נצרכים ב־UAX #9/#14) ואינם נכנסים לגיבוב;
 * אטום עם אותו מזהה ואותו תוכן הוא אותה בקשה, תמיד.
 */
export function shapeRequestHash(
  identity: ProviderIdentity,
  request: ShapeRequest,
): string {
  const identityIssues = providerIdentityIssues(identity);
  if (identityIssues.length > 0) {
    throw new EngineError('errors.shape.INVALID_PROVIDER', {
      reason: identityIssues.join(';'),
    });
  }
  assertShapeRequest(request);
  return sha256Hex(canonicalJson({
    v: 1,
    kind: 'shape-request',
    provider: {
      providerId: identity.providerId,
      providerVersion: identity.providerVersion,
      wasmSha256: identity.wasmSha256,
      environmentHash: identity.environmentHash,
    },
    request: {
      atoms: request.atoms.map((a) => ({ id: a.id, text: a.text, bidiLevel: a.bidiLevel })),
      font: {
        fontId: request.font.fontId,
        contentSha256: request.font.contentSha256,
        family: request.font.family,
        weight: request.font.weight,
        style: request.font.style,
      },
      fontSizeLu: request.fontSizeLu,
      direction: request.direction,
      language: request.language,
      features: request.features,
      letterSpacingLu: request.letterSpacingLu,
    },
  }));
}

// ─────────────────────────── batching ───────────────────────────

/**
 * מימוש ייחוס ל־shapeBatch: פשוט מריץ shape() לכל בקשה בסדר נתון.
 * החוזה שנבדק: התוצאה זהה לחלוטין לביצוע פרטני — לא משנה ההרכב.
 * Providers אמיתיים רשאים לממש batch אמיתי, ובדיקות ההשוואה
 * (שלב 22 ושלב 29) מוכיחות שקילות ביט-ביט.
 */
export function shapeBatchViaSingle(
  provider: PreparedProviderCore,
  requests: readonly ShapeRequest[],
): readonly ShapedRun[] {
  return requests.map((r) => provider.shape(r));
}

// ─────────────────────────── מדדי מטמון (חוזה בלבד) ───────────────────────────

/**
 * מדדי מטמון — מחוץ לקביעת התוצאה (§6.4: "מדדי hit/miss וזיכרון אינם
 * משנים תוצאה"). המטמון האמיתי (פינוי, תקרת זיכרון) — שלב 26.
 */
export interface CacheMetrics {
  readonly hits: number;
  readonly misses: number;
  readonly entries: number;
}

/** מדדים ריקים — ערך סנטינל קבוע לפני כל שימוש. */
export const EMPTY_CACHE_METRICS: Readonly<CacheMetrics> = Object.freeze({
  hits: 0, misses: 0, entries: 0,
});
