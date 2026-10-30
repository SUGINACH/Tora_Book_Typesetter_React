/**
 * units.ts — מערכת היחידות של ליבת המנוע.
 *
 * ADR-001 (נעול בשלב 9): 1 LU = 1/65536 נקודה טיפוגרפית.
 * כל גאומטריית הליבה — integers בטוחים בלבד; אין CSS pixels, אין pxPerMm.
 * כל העיגול מרוכז כאן (roundDiv / mmToLu / fontUnitsToLu); אין bitwise על קואורדינטות.
 * אסמכתא: אפיון §6.1 · docs/adr/ADR-001-units.md
 */

/** יחידת פריסה: 1 LU = 1/65536 pt (טיפוס ממותג — רק דרך בוני היחידות). */
export type LayoutUnit = number & { readonly __brand: 'LayoutUnit' };
/** יחידת גופן (font units, לפי unitsPerEm של הגופן). */
export type FontUnit = number & { readonly __brand: 'FontUnit' };
/** עלות/קנס — integer בסקייל קבוע COST_SCALE (אין השוואות float). */
export type Cost = number & { readonly __brand: 'Cost' };

/** LU לנקודה טיפוגרפית אחת. */
export const LU_PER_PT = 65536;
/** 1mm = 360/127 pt בדיוק (72pt = 25.4mm לפי הגדרה) → LU למ"מ = 65536·360/127. */
export const MM_NUMERATOR = 65536 * 360; // 23,592,960
export const MM_DENOMINATOR = 127;
/** סקייל העלויות: עלות 1.0 = COST_SCALE יחידות שלמות. */
export const COST_SCALE = 1024;
/** הגבול העליון המותר לכל ערך גאומטרי. */
export const MAX_SAFE_LU = Number.MAX_SAFE_INTEGER;

import { EngineError, type ErrorParams } from './errors.js';

/** שגיאת יחידות — עוברת דרך הקטלוג: המפתח הקטלוגי הוא errors.units.<code> (שלב 12). */
export class UnitsError extends EngineError {
  constructor(
    readonly code: string,
    readonly details: ErrorParams,
  ) {
    super(`errors.units.${code}`, details);
    this.name = 'UnitsError';
  }
}

function assertSafeInt(value: number, what: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new UnitsError('UNSAFE_INTEGER', { what, value });
  }
}

/** בניית LayoutUnit מספר שלם בטוח (נקודת הכניסה היחידה למיתוג). */
export function asLu(value: number): LayoutUnit {
  assertSafeInt(value, 'LayoutUnit');
  return value as LayoutUnit;
}

/** בניית FontUnit מספר שלם. */
export function asFontUnit(value: number): FontUnit {
  assertSafeInt(value, 'FontUnit');
  return value as FontUnit;
}

/**
 * חלוקה שלמה עם עיגול חצי-כלפי-∞ (זהה ל־Math.round של JS, מוגדר גם לשליליים).
 * חישוב במנה ושארית שלמים בלבד — ללא צפים. d חייב להיות שלם חיובי.
 * דוגמאות מחייבות: roundDiv(5,2)=3 · roundDiv(-5,2)=-2 · roundDiv(-3,2)=-1 · roundDiv(-1,2)=0.
 */
export function roundDiv(n: number, d: number): number {
  assertSafeInt(n, 'roundDiv.numerator');
  assertSafeInt(d, 'roundDiv.denominator');
  if (d <= 0) throw new UnitsError('INVALID_DENOMINATOR', { d });
  const q = Math.floor(n / d);
  const r = n - q * d; // תמיד בטווח [0, d) — גם לשליליים
  return r * 2 >= d ? q + 1 : q;
}

/**
 * מ"מ → LU. קלט המשתמש מקוונטז לרזולוציית מיקרומטר (0.001mm) — מתועד ב־ADR-001 —
 * ואז מחושב ברציונל שלם מדויק: LU = um · 65536·360 / (1000·127).
 */
export function mmToLu(mm: number): LayoutUnit {
  if (!Number.isFinite(mm)) throw new UnitsError('NON_FINITE_MM', { mm });
  const um = Math.round(mm * 1000);
  assertSafeInt(um, 'mmToLu.micrometers');
  return asLu(roundDiv(um * MM_NUMERATOR, 1000 * MM_DENOMINATOR));
}

/** נקודות טיפוגרפיות → LU. קלט מקוונטז לרזולוציית 1/16 pt (ADR-001). */
export function ptToLu(pt: number): LayoutUnit {
  if (!Number.isFinite(pt)) throw new UnitsError('NON_FINITE_PT', { pt });
  const s = Math.round(pt * 16);
  assertSafeInt(s, 'ptToLu.sixteenths');
  return asLu(roundDiv(s * LU_PER_PT, 16));
}

/**
 * יחידות גופן → LU (לפי unitsPerEm של הגופן).
 * המרה מדויקת-ככל האפשרי: חלוקה שלמה אחת עם עיגול מוגדר (חצי-כלפי-∞).
 */
export function fontUnitsToLu(units: FontUnit | number, unitsPerEm: number): LayoutUnit {
  assertSafeInt(units, 'fontUnitsToLu.units');
  if (!Number.isSafeInteger(unitsPerEm) || unitsPerEm <= 0) {
    throw new UnitsError('INVALID_UNITS_PER_EM', { unitsPerEm });
  }
  return asLu(roundDiv(units * LU_PER_PT, unitsPerEm));
}

/** היטל בלבד (CSS/PDF) — אסור לשימוש בתוך אלגוריתמי העימוד (ADR-001 §8). */
export function luToPt(lu: LayoutUnit): number {
  return lu / LU_PER_PT;
}

/** חיבור גאומטרי בטוח — זורק UnitsError על חריגה מטווח השלמים הבטוחים. */
export function safeAdd(a: number, b: number, ctx: string): number {
  const r = a + b;
  if (!Number.isSafeInteger(r)) throw new UnitsError('UNSAFE_ADD', { a, b, ctx });
  return r;
}

/** חיסור גאומטרי בטוח. */
export function safeSub(a: number, b: number, ctx: string): number {
  const r = a - b;
  if (!Number.isSafeInteger(r)) throw new UnitsError('UNSAFE_SUB', { a, b, ctx });
  return r;
}

/** כפל גאומטרי בטוח. */
export function safeMul(a: number, b: number, ctx: string): number {
  const r = a * b;
  if (!Number.isSafeInteger(r)) throw new UnitsError('UNSAFE_MUL', { a, b, ctx });
  return r;
}

/** בניית עלות מערך רציף — סקייל קבוע 1/1024 (ADR-001 §7). */
export function makeCost(value: number, ctx: string): Cost {
  if (!Number.isFinite(value)) throw new UnitsError('NON_FINITE_COST', { value, ctx });
  const scaled = Math.round(value * COST_SCALE);
  assertSafeInt(scaled, `makeCost.scaled:${ctx}`);
  return scaled as Cost;
}

/** קריאת עלות כמספר רציף — לדיווח בלבד, לא להשוואות (השוואות על הערך השלם). */
export function costToNumber(cost: Cost): number {
  return cost / COST_SCALE;
}

/** מלבן גאומטרי — שדות x, y, width, height בלבד (אסמכתא: אפיון §6.1). */
export interface Rect {
  readonly x: LayoutUnit;
  readonly y: LayoutUnit;
  readonly width: LayoutUnit;
  readonly height: LayoutUnit;
}

/** הקצה הימני של מלבן (חיבור בטוח). */
export function rectRight(r: Rect): LayoutUnit {
  return asLu(safeAdd(r.x, r.width, 'rectRight'));
}

/** הקצה התחתון של מלבן (חיבור בטוח). */
export function rectBottom(r: Rect): LayoutUnit {
  return asLu(safeAdd(r.y, r.height, 'rectBottom'));
}

/** המרה חד-פעמית של מידות A4 (מ"מ → LU) — נעול בטעינת המודול, לא חוזרת (ADR-001 §2). */
export const A4 = {
  width: mmToLu(210),
  height: mmToLu(297),
} as const;
