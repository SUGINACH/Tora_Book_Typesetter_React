/**
 * bidi.ts — האלגוריתם הדו-כיווני UAX #9 (שלב 28; revision 50, Unicode 16.0.0).
 *
 * אסמכתא: UAX #9 revision 50 (Unicode 16.0.0) · אפיון §6.4 ("BiDi מיושם
 * ב־UAX #9 ... עם גרסאות נעולות ומבחני conformance"), §6.2 (bidiLevel) ·
 * §14.2 · תכנית שלב 28.
 *
 * מבנה: (א) טבלאות מיוצרות (bidi-tables.ts); (ב) זיהוי מקורי-אסמכתא
 * P2/P3; (ג) מעבר מפורש X1–X8 (מחסנית מצב כיווני, מוני גלישה, זיהוי
 * isolates); (ד) X9 — הסרה לוגית (RLE/LRE/RLO/LRO/PDF/BN; הסרה אינה
 * שינוי תוכן: הרמות מדווחות כ-null לצורך conformance בלבד); (ה) X10+BD13 —
 * isolating run sequences עם sos/eos; (ו) W1–W7, N0 (BD16 סוגריים מקוונים),
 * N1–N2, I1–I2; (ז) L1 (איפוס רווחי סוף) ו־L2 (סדר חזותי); L3 מובטח
 * מבנית ברמת האטום (האטום אינו נחתך); L4 — דגל mirror בלבד, ללא שינוי תוכן.
 *
 * שער השלב: reordering אינו משנה תוכן ולא זהות — הפלט הוא מיפוי בלבד
 * (visualOrder הוא תמורה של 0..n-1); האטומים עצמם לא נוגעים. max_depth=125;
 * רמה מפורשת ≤125; I1/I2 עשויות להגיע ל־126 בקיצון תיאורטי — אין חיתוך שקט:
 * הקורא אחראי לחוזה הצריכה שלו (ראה MAX_SHAPING_BIDI_LEVEL ב-provider).
 */

import {
  BIDI_BRACKETS,
  BIDI_MAX_DEPTH,
  BIDI_MIRRORED_CODEPOINTS,
  BIDI_RANGES,
  BIDI_REVISION,
  BIDI_SOURCE_SHA256,
  BIDI_UNICODE_VERSION,
} from './bidi-tables.js';
import type { ShapingAtom } from './provider.js';

export { BIDI_UNICODE_VERSION, BIDI_REVISION, BIDI_MAX_DEPTH, BIDI_SOURCE_SHA256 };

// ─────────────────────────── חיפוש בטבלאות ───────────────────────────

type Range3 = readonly [number, number, string];
type BracketRow = readonly [number, number, string];

function binarySearch3(ranges: readonly Range3[], cp: number): Range3 | null {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const r = ranges[mid]!;
    if (cp < r[0]) hi = mid - 1;
    else if (cp > r[1]) lo = mid + 1;
    else return r;
  }
  return null;
}

/** מחלקת BiDi של נקודת קוד; תווים שמחוץ לטבלה ← L (ברירת המחדל של DerivedBidiClass). */
export function bidiClassOf(cp: number): string {
  const r = binarySearch3(BIDI_RANGES, cp);
  return r !== null ? r[2] : 'L';
}

const BRACKET_BY_CP = new Map<number, BracketRow>();
for (const row of BIDI_BRACKETS) BRACKET_BY_CP.set(row[0], row);

/** סוגריים מקוונים (BidiBrackets.txt): [cp, pairedCp, o|c|u] או null. */
export function pairedBracketOf(cp: number): BracketRow | null {
  return BRACKET_BY_CP.get(cp) ?? null;
}

function binarySearchCps(cps: readonly number[], cp: number): boolean {
  let lo = 0;
  let hi = cps.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (cp < cps[mid]!) hi = mid - 1;
    else if (cp > cps[mid]!) lo = mid + 1;
    else return true;
  }
  return false;
}

/** Bidi_Mirrored=Y (L4) — דגל בלבד; התוכן לעולם אינו משתנה. */
export function isMirroredCp(cp: number): boolean {
  return binarySearchCps(BIDI_MIRRORED_CODEPOINTS, cp);
}

/** השקילות הקנונית היחידה לפי BD16 (U+3008/3009 ↔ U+2329/232A). */
const CANON_EQUIV: ReadonlyMap<number, number> = new Map([[0x3008, 0x2329], [0x3009, 0x232a]]);
const canonOf = (cp: number): number => CANON_EQUIV.get(cp) ?? cp;

// ─────────────────────────── סוגי פלט ───────────────────────────

/** תוצאה ברמת נקודות הקוד — השכבה שעליה נמדד ה-conformance. */
export interface BidiCodePointResult {
  readonly paragraphLevel: 0 | 1;
  /** רמה לכל תו; null = הוסר ב-X9 (conformance: 'x'). */
  readonly levels: readonly (number | null)[];
  /** סדר חזותי משמאל לימין — אינדקסים לתו המקורי; תווים שהוסרו מדולגים. */
  readonly visualOrder: readonly number[];
  /** דגל L4 לכל תו: רמה אי-זוגית + Bidi_Mirrored=Y. */
  readonly mirrored: readonly boolean[];
}

export interface BidiRun {
  /** תחילת/סוף הרץ (אינדקסים בסדר הלוגי, סוף כולל). */
  readonly startAtom: number;
  readonly endAtom: number;
  readonly level: number;
  readonly direction: 'ltr' | 'rtl';
}

export interface BidiResult {
  readonly paragraphLevel: 0 | 1;
  /** רמה לכל אטום (רמת האשכול כולו — NSM ב-W1 נגזר מהבסיס). */
  readonly levels: readonly number[];
  readonly maxLevel: number;
  readonly runs: readonly BidiRun[];
  /** סדר חזותי משמאל לימין — אינדקסי אטומים (תמורה של 0..n-1). */
  readonly visualOrder: readonly number[];
  /** ההפך של visualOrder: אינדקס אטום ← מקומו החזותי. */
  readonly logicalToVisual: readonly number[];
  /** דגל L4 לכל אטום (הקרנה בלבד — התוכן לא משתנה). */
  readonly mirrored: readonly boolean[];
}

export interface ComputeBidiOptions {
  /** ברירת מחדל: 'auto' — P2/P3 (התו החזק הראשון, בדילוג על תוכן isolates). */
  readonly paragraphLevel?: 0 | 1 | 'auto';
}

// ─────────────────────────── P2/P3 — רמת פסקה ───────────────────────────

/**
 * P2/P3 על רצף נקודות קוד: התו החזק הראשון (L/R/AL) בדילוג על תוכן
 * isolate initiator עד ה-PDI התואם (זיהוי מבני לפי קינון); מפעילי
 * הטמעה (LRE/RLE/LLO/RLO) נדלגים אף הם. אין תו חזק ← defaultLevel.
 */
export function paragraphLevelFor(cps: readonly number[], defaultLevel: 0 | 1 = 0): 0 | 1 {
  let depth = 0;
  for (const cp of cps) {
    const cls = bidiClassOf(cp);
    if (cls === 'LRI' || cls === 'RLI' || cls === 'FSI') { depth += 1; continue; }
    if (cls === 'PDI') { if (depth > 0) depth -= 1; continue; }
    if (depth > 0) continue;
    if (cls === 'LRE' || cls === 'RLE' || cls === 'LRO' || cls === 'RLO') continue;
    if (cls === 'L') return 0;
    if (cls === 'R' || cls === 'AL') return 1;
  }
  return defaultLevel;
}

// ─────────────────────────── זיהוי isolates מבני (לפני X1) ───────────────────────────

/**
 * זיהוי מבני לפי קינון (ללא תלות במגבלת העומק): מחזיר מפה
 * אינדקס-isolate-initiator ← אינדקס ה-PDI התואם (אם קיים). משמש את
 * P2 (דילוג תוכן), X5c (FSI) ו־BD13.
 */
function structuralIsolateMatches(cps: readonly number[]): Map<number, number> {
  const out = new Map<number, number>();
  const stack: number[] = [];
  for (let i = 0; i < cps.length; i++) {
    const cls = bidiClassOf(cps[i]!);
    if (cls === 'LRI' || cls === 'RLI' || cls === 'FSI') { stack.push(i); continue; }
    if (cls === 'PDI') {
      const open = stack.pop();
      if (open !== undefined) out.set(open, i);
    }
  }
  return out;
}

// ─────────────────────────── המעבר המפורש: X1–X8 ───────────────────────────

type Override = 'neutral' | 'ltr' | 'rtl';

interface StackEntry { level: number; override: Override; isolate: boolean }

interface XEntry {
  cp: number;
  originalType: string;
  type: string;
  /** null = הוסר ב-X9 (conformance 'x'); אחרת רמה שלמה. */
  level: number | null;
  /** רמת ה-X-שלב (לפני I1/I2) — לחישוב sos/eos בלבד (X10: "before any changes"). */
  xLevel: number | null;
}

const nextOdd = (level: number): number => (level % 2 === 0 ? level + 1 : level + 2);
const nextEven = (level: number): number => (level % 2 === 0 ? level + 2 : level + 1);

function runExplicitPass(cps: readonly number[], paragraphLevel: 0 | 1, isoMatches: ReadonlyMap<number, number>): XEntry[] {
  const entries: XEntry[] = cps.map((cp) => {
    const originalType = bidiClassOf(cp);
    return { cp, originalType, type: originalType, level: null as number | null, xLevel: null as number | null };
  });

  // X1
  const stack: StackEntry[] = [{ level: paragraphLevel, override: 'neutral', isolate: false }];
  let overflowIsolateCount = 0;
  let overflowEmbeddingCount = 0;
  let validIsolateCount = 0;

  const top = (): StackEntry => stack[stack.length - 1]!;

  const pushEmbedding = (entry: XEntry, newLevel: number, override: Override): 'valid' | 'overflow' => {
    if (newLevel <= BIDI_MAX_DEPTH && overflowIsolateCount === 0 && overflowEmbeddingCount === 0) {
      stack.push({ level: newLevel, override, isolate: false });
      return 'valid';
    }
    if (overflowIsolateCount === 0) overflowEmbeddingCount += 1;
    return 'overflow';
  };

  const pushIsolate = (entry: XEntry, newLevel: number): 'valid' | 'overflow' => {
    entry.level = top().level;
    if (top().override !== 'neutral') {
      entry.type = top().override === 'ltr' ? 'L' : 'R'; // X5a/X5b step 2 (override)
    }
    if (newLevel <= BIDI_MAX_DEPTH && overflowIsolateCount === 0 && overflowEmbeddingCount === 0) {
      validIsolateCount += 1;
      stack.push({ level: newLevel, override: 'neutral', isolate: true });
      return 'valid';
    }
    overflowIsolateCount += 1;
    return 'overflow';
  };

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    switch (e.originalType) {
      // X2: RLE
      case 'RLE': pushEmbedding(e, nextOdd(top().level), 'neutral'); e.level = null; break;
      // X3: LRE
      case 'LRE': pushEmbedding(e, nextEven(top().level), 'neutral'); e.level = null; break;
      // X4: RLO
      case 'RLO': pushEmbedding(e, nextOdd(top().level), 'rtl'); e.level = null; break;
      // X5: LRO
      case 'LRO': pushEmbedding(e, nextEven(top().level), 'ltr'); e.level = null; break;
      // X5a: RLI
      case 'RLI': pushIsolate(e, nextOdd(top().level)); break;
      // X5b: LRI
      case 'LRI': pushIsolate(e, nextEven(top().level)); break;
      // X5c: FSI — P2/P3 על התוכן עד ה-PDI התואם
      case 'FSI': {
        const match = isoMatches.get(i);
        const end = match ?? entries.length;
        const inner = cps.slice(i + 1, end);
        const innerLevel = paragraphLevelFor(inner, 0); // P2/P3; אין תו חזק ← 0 (כמו פסקה)
        if (innerLevel === 1) pushIsolate(e, nextOdd(top().level));
        else pushIsolate(e, nextEven(top().level));
        break;
      }
      // X6a: PDI
      case 'PDI': {
        if (overflowIsolateCount > 0) {
          overflowIsolateCount -= 1;
        } else if (validIsolateCount === 0) {
          // אין תואם — נדלג (רמה/override לפי המחסנית למטה, ב"בכל המקרים")
        } else {
          overflowEmbeddingCount = 0;
          while (!top().isolate) stack.pop();
          stack.pop();
          validIsolateCount -= 1;
        }
        // בכל המקרים:
        e.level = top().level;
        if (top().override !== 'neutral') {
          e.type = top().override === 'ltr' ? 'L' : 'R';
        }
        break;
      }
      // X7: PDF
      case 'PDF': {
        if (overflowIsolateCount > 0) {
          // בתוך overflow isolate — להתעלם
        } else if (overflowEmbeddingCount > 0) {
          overflowEmbeddingCount -= 1;
        } else if (!top().isolate && stack.length >= 2) {
          stack.pop();
        }
        e.level = null; // X9 יסיר
        break;
      }
      // X8: B — סוף פסקה (מחוץ לכל הטמעה); רמת הפסקה
      case 'B': {
        e.level = paragraphLevel;
        break;
      }
      // BN — מוסר ב-X9; רמתו לא נקבע (null)
      case 'BN': {
        e.level = null;
        break;
      }
      // X6: כל השאר
      default: {
        e.level = top().level;
        if (top().override !== 'neutral') {
          e.type = top().override === 'ltr' ? 'L' : 'R';
        }
        break;
      }
    }
  }
  return entries;
}

// ─────────────────────────── X9 — הסרה לוגית ───────────────────────────

const X9_TYPES = new Set(['RLE', 'LRE', 'RLO', 'LRO', 'PDF', 'BN']);

// ─────────────────────────── X10 + BD13 — isolating run sequences ───────────────────────────

/**
 * BD13: רצפי level runs. level run = מקסימלי רצף תווים ששרדו את X9 באותה רמה.
 * רצף isolating: הרצף שמסתיים ב-initiator תקין שה-PDI התואם לו פותח את
 * ה-level run הבא מצורף אליו (חוזר).
 */
function computeSequences(entries: readonly XEntry[], isoMatches: ReadonlyMap<number, number>): number[][] {
  // רמות X9-null לא נוטלות חלק (הוסרו) — החיתוך ברמות ה-X-שלב
  const alive: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i]!.xLevel !== null) alive.push(i);
  }
  // level runs
  const levelRuns: number[][] = [];
  let cur: number[] = [];
  let curLevel: number | null = null;
  for (const idx of alive) {
    const lvl = entries[idx]!.xLevel as number;
    if (curLevel === null || lvl === curLevel) {
      cur.push(idx);
      curLevel = lvl;
    } else {
      levelRuns.push(cur);
      cur = [idx];
      curLevel = lvl;
    }
  }
  if (cur.length > 0) levelRuns.push(cur);

  // BD13: שרשור. רץ שמסתיים ב-initiator שיש לו PDI תואם שפותח רץ הבא —
  // הפוך סופח אליו (חוזר). אינדיקטור valid/overflow אינו נדרש כאן:
  // initiator-עודף והתוכן שלו באותה רמה (לא נפתח רמה חדשה) ולכן הם
  // באותו level run, וה-PDI אינו פותח רץ חדש — התנאי נכשל ממילא.
  const sequences: number[][] = [];
  const consumed = new Set<number>(); // level runs שסופחו לרצף קודם
  for (let r = 0; r < levelRuns.length; r++) {
    if (consumed.has(r)) continue;
    const seq: number[] = [...levelRuns[r]!];
    // בעוד הרץ האחרון מסתיים ב-initiator שיש לו PDI תואם שפותח רץ הבא — ספח אותו
    let lastRun = r;
    for (;;) {
      const last = seq[seq.length - 1]!;
      const lastType = entries[last]!.originalType;
      if (lastType !== 'LRI' && lastType !== 'RLI' && lastType !== 'FSI') break;
      const match = isoMatches.get(last);
      if (match === undefined) break;
      // הרץ הבא שמתחיל ב-PDI הזה (PDI לא מוסר ב-X9 — מובטח שהוא חי)
      let found = -1;
      for (let s = lastRun + 1; s < levelRuns.length; s++) {
        if (levelRuns[s]![0] === match) { found = s; break; }
      }
      if (found < 0) break;
      seq.push(...levelRuns[found]!);
      consumed.add(found);
      lastRun = found;
    }
    sequences.push(seq);
  }
  return sequences;
}

// ─────────────────────────── sos/eos (X10) ───────────────────────────

interface SequenceBoundary { sos: 'L' | 'R'; eos: 'L' | 'R' }

function boundariesFor(entries: readonly XEntry[], seq: readonly number[], paragraphLevel: 0 | 1): SequenceBoundary {
  const first = seq[0]!;
  const last = seq[seq.length - 1]!;
  // sos: רמת התו שלפני הראשון (מדלג על X9-הוסרים); אין — רמת הפסקה.
  // החישוב ברמות ה-X-שלב (xLevel) — לא ברמות שאחרי I1/I2.
  let prevLevel: number | null = null;
  for (let i = first - 1; i >= 0; i--) {
    if (entries[i]!.xLevel !== null) { prevLevel = entries[i]!.xLevel; break; }
  }
  const sosLevel = Math.max(first === 0 || prevLevel === null ? paragraphLevel : prevLevel, entries[first]!.xLevel as number);
  // eos: רמת התו שאחרי האחרון; אין (או האחרון initiator חסר PDI) — רמת הפסקה
  let nextLevel: number | null = null;
  const lastIsOpenIsolate = (entries[last]!.originalType === 'LRI' || entries[last]!.originalType === 'RLI' || entries[last]!.originalType === 'FSI');
  for (let i = last + 1; i < entries.length; i++) {
    if (entries[i]!.xLevel !== null) { nextLevel = entries[i]!.xLevel; break; }
  }
  const eosBase = (nextLevel === null || lastIsOpenIsolate) ? paragraphLevel : nextLevel;
  const eosLevel = Math.max(eosBase, entries[last]!.xLevel as number);
  return { sos: sosLevel % 2 === 1 ? 'R' : 'L', eos: eosLevel % 2 === 1 ? 'R' : 'L' };
}

// ─────────────────────────── W1–W7 ───────────────────────────

const STRONG = new Set(['L', 'R', 'AL']);
const NI_TYPES = new Set(['B', 'S', 'WS', 'ON', 'LRI', 'RLI', 'FSI', 'PDI']); // ניטרלי + isolate formatting

function resolveWeak(entries: readonly XEntry[], seq: readonly number[], sos: 'L' | 'R', eos: 'L' | 'R'): void {
  const type = (i: number): string => entries[i]!.type;
  const setType = (i: number, t: string): void => { entries[i]!.type = t; };
  const n = seq.length;

  // W1: NSM ← הקודם (isolate-initiator/PDI ← ON; תחילת רצף ← sos — שהוא כבר הערך ההתחלתי)
  let prevType: string = sos;
  for (let k = 0; k < n; k++) {
    const i = seq[k]!;
    if (entries[i]!.originalType === 'NSM') {
      if (prevType === 'LRI' || prevType === 'RLI' || prevType === 'FSI' || prevType === 'PDI') {
        setType(i, 'ON');
      } else {
        setType(i, prevType);
      }
    }
    prevType = entries[i]!.type;
  }

  // W2: EN אחרי AL ← AN (חיפוש לאחור עד strong/sos)
  for (let k = 0; k < n; k++) {
    const i = seq[k]!;
    if (type(i) !== 'EN') continue;
    let strong: string = sos;
    for (let j = k - 1; j >= 0; j--) {
      const t = type(seq[j]!);
      if (t === 'R' || t === 'L' || t === 'AL') { strong = t; break; }
    }
    if (strong === 'AL') setType(i, 'AN');
  }

  // W3: AL ← R
  for (let k = 0; k < n; k++) {
    const i = seq[k]!;
    if (type(i) === 'AL') setType(i, 'R');
  }

  // W4: ES בין שני EN ← EN; CS בין שני EN ← EN; CS בין שני AN ← AN
  for (let k = 1; k < n - 1; k++) {
    const i = seq[k]!;
    const t = type(i);
    const before = type(seq[k - 1]!);
    const after = type(seq[k + 1]!);
    if (t === 'ES' && before === 'EN' && after === 'EN') setType(i, 'EN');
    if (t === 'CS' && before === 'EN' && after === 'EN') setType(i, 'EN');
    if (t === 'CS' && before === 'AN' && after === 'AN') setType(i, 'AN');
  }

  // W5: רצף ET צמוד ל-EN ← EN
  for (let k = 0; k < n; k++) {
    const i = seq[k]!;
    if (type(i) !== 'ET') continue;
    // כל ET רצוף: אם בקצה כלשהו (לוגי) יש EN — הכל EN
    let lo = k;
    while (lo > 0 && type(seq[lo - 1]!) === 'ET') lo -= 1;
    let hi = k;
    while (hi < n - 1 && type(seq[hi + 1]!) === 'ET') hi += 1;
    const before = lo > 0 ? type(seq[lo - 1]!) : null;
    const after = hi < n - 1 ? type(seq[hi + 1]!) : null;
    if (before === 'EN' || after === 'EN') {
      for (let z = lo; z <= hi; z++) setType(seq[z]!, 'EN');
    }
    k = hi;
  }

  // W6: ES/ET/CS שנותרו ← ON
  for (let k = 0; k < n; k++) {
    const i = seq[k]!;
    const t = type(i);
    if (t === 'ES' || t === 'ET' || t === 'CS') setType(i, 'ON');
  }

  // W7: EN אחרי L ← L (חיפוש לאחור עד strong/sos; AL כבר הפך R ב-W3)
  for (let k = 0; k < n; k++) {
    const i = seq[k]!;
    if (type(i) !== 'EN') continue;
    let strong: string = sos;
    for (let j = k - 1; j >= 0; j--) {
      const t = type(seq[j]!);
      if (t === 'R' || t === 'L') { strong = t; break; }
    }
    if (strong === 'L') setType(i, 'L');
  }
  void eos; // eos נדרש רק ב-N1
}

// ─────────────────────────── N0 — סוגריים מקוונים (BD16) ───────────────────────────

function resolveBrackets(entries: readonly XEntry[], seq: readonly number[], sos: 'L' | 'R'): void {
  const embeddingDir: 'L' | 'R' = (entries[seq[0]!]!.xLevel as number) % 2 === 1 ? 'R' : 'L';
  const type = (i: number): string => entries[i]!.type;

  // BD16: זיהוי הזוגות (עומק מקסימלי 63). רצף עשוי שלא להיות רציף —
  // חברות ברצף נבדקת מראש. סוגר סוגר מחפש במחסנית כלפי מטה (לא רק
  // הראש) — אם נמצאה התאמה, pop עד אליו כולל; אחרת — ללא פופ.
  const inSeq = new Set(seq);
  const stack: { cp: number; pos: number }[] = [];
  const pairs: { open: number; close: number }[] = [];
  let overflow = false;
  for (const i of seq) {
    const e = entries[i]!;
    const bracket = pairedBracketOf(e.cp);
    if (bracket === null) continue;
    if (e.type !== 'ON') continue; // BD14/BD15: paired bracket חייב סוג נוכחי ON
    const kind = bracket[2];
    if (kind === 'o') {
      if (stack.length >= 63) { overflow = true; break; }
      stack.push({ cp: e.cp, pos: i });
    } else { // 'c' או 'u'
      for (let k = stack.length - 1; k >= 0; k--) {
        const el = stack[k]!;
        const openBracket = pairedBracketOf(el.cp);
        if (openBracket !== null && canonOf(openBracket[1]) === canonOf(bracket[0])) {
          pairs.push({ open: el.pos, close: i });
          stack.length = k; // pop through k inclusive — כולל מה שמעליו
          break;
        }
      }
      // אין התאמה בכל המחסנית — ללא פופ; ממשיכים לתו הבא
    }
  }
  if (overflow) { /* חריגה מעומק 63 — לפי BD16 מפסיקים ומחזירים רשימה ריקה */ pairs.length = 0; }

  // N0 לכל זוג בסדר לוגי של הפותחים
  const sorted = [...pairs].sort((a, b) => a.open - b.open);
  for (const pair of sorted) {
    const o = pair.open;
    const c = pair.close;
    // חיפוש strong בתוך הזוג (EN/AN נחשבים R)
    let innerStrongOpposite: 'L' | 'R' | null = null;
    let innerStrongMatching: 'L' | 'R' | null = null;
    for (let i = o + 1; i < c; i++) {
      if (entries[i]!.level === null) continue; // הוסרו ב-X9
      if (!inSeq.has(i)) continue; // מחוץ לרצף (רצף עשוי שלא להיות רציף)
      const t = entries[i]!.type;
      const asStrong: 'L' | 'R' | null = t === 'L' ? 'L' : (t === 'R' || t === 'EN' || t === 'AN') ? 'R' : null;
      if (asStrong === null) continue;
      if (asStrong === embeddingDir) { innerStrongMatching = asStrong; break; }
      innerStrongOpposite = asStrong;
    }
    if (innerStrongMatching !== null) {
      entries[o]!.type = embeddingDir;
      entries[c]!.type = embeddingDir;
      continue;
    }
    if (innerStrongOpposite !== null) {
      // הקשר קודם: חיפוש לאחור מהפותח עד strong (או sos)
      let ctx: 'L' | 'R' = sos;
      for (let i = o - 1; i >= 0; i--) {
        if (entries[i]!.level === null) continue;
        if (!inSeq.has(i)) continue;
        const t = entries[i]!.type;
        const asStrong: 'L' | 'R' | null = t === 'L' ? 'L' : (t === 'R' || t === 'EN' || t === 'AN') ? 'R' : null;
        if (asStrong !== null) { ctx = asStrong; break; }
      }
      if (ctx === innerStrongOpposite) {
        entries[o]!.type = ctx;
        entries[c]!.type = ctx;
      } else {
        entries[o]!.type = embeddingDir;
        entries[c]!.type = embeddingDir;
      }
      continue;
    }
    // אין strong בתוך הזוג — לא נוגעים (N1/N2 יטפלו)
  }
  // N0 (סעיף אחרון): NSM שמקורו המקורי NSM והוא צמוד (מיד אחרי) paired
  // bracket ששונה תחת N0 — ייקח את טיפוס הסוגר שלפניו (רצף NSM רצוף).
  if (pairs.length > 0) {
    const changed = new Map<number, 'L' | 'R'>();
    for (const pair of pairs) {
      const tOpen = entries[pair.open]!.type;
      if (tOpen === 'L' || tOpen === 'R') {
        changed.set(pair.open, tOpen);
        changed.set(pair.close, entries[pair.close]!.type as 'L' | 'R');
      }
    }
    if (changed.size > 0) {
      const spreadFrom = (start: number, dir: 'L' | 'R'): void => {
        let i = start + 1;
        while (i < entries.length) {
          if (entries[i]!.level === null) { i += 1; continue; } // X9-הוסר — כאילו אינו
          if (!inSeq.has(i)) { i += 1; continue; } // מחוץ לרצף — אינו חוסם ("לא רציף")
          if (entries[i]!.originalType === 'NSM') {
            entries[i]!.type = dir;
            i += 1;
            continue;
          }
          break; // תו חי ברצף שאינו NSM — השרשרת נפסקת
        }
      };
      for (const [pos, dir] of changed) {
        spreadFrom(pos, dir);
      }
    }
  }
}

// ─────────────────────────── N1–N2 ───────────────────────────

function resolveNeutrals(entries: readonly XEntry[], seq: readonly number[], sos: 'L' | 'R', eos: 'L' | 'R'): void {
  const type = (i: number): string => entries[i]!.type;
  const setType = (i: number, t: string): void => { entries[i]!.type = t; };
  const n = seq.length;
  // N1: NI בין שני צדדים באותו כיוון ← אותו כיוון (EN/AN נחשבים R)
  // ריצה על רצפי NI רצופים (בסדר הרצף) עם שכנים מחוץ לרצף = sos/eos
  let k = 0;
  while (k < n) {
    const i = seq[k]!;
    if (!NI_TYPES.has(type(i))) { k += 1; continue; }
    // רצף NI
    let hi = k;
    while (hi < n && NI_TYPES.has(type(seq[hi]!))) hi += 1;
    const before = k > 0 ? type(seq[k - 1]!) : sos;
    const after = hi < n ? type(seq[hi]!) : eos;
    const beforeDir: 'L' | 'R' | null = before === 'L' ? 'L' : (before === 'R' || before === 'EN' || before === 'AN') ? 'R' : null;
    const afterDir: 'L' | 'R' | null = after === 'L' ? 'L' : (after === 'R' || after === 'EN' || after === 'AN') ? 'R' : null;
    if (beforeDir !== null && beforeDir === afterDir) {
      for (let z = k; z < hi; z++) setType(seq[z]!, beforeDir);
    }
    k = hi;
  }
  // N2: שאר ה-NI ← כיוון ההטמעה (רמה אי-זוגית ← R; זוגית ← L)
  for (let z = 0; z < n; z++) {
    const i = seq[z]!;
    if (!NI_TYPES.has(type(i))) continue;
    const lvl = entries[i]!.level as number;
    setType(i, lvl % 2 === 1 ? 'R' : 'L');
  }
}

// ─────────────────────────── I1–I2 ───────────────────────────

function resolveImplicit(entries: readonly XEntry[], seq: readonly number[]): void {
  for (const i of seq) {
    const e = entries[i]!;
    const lvl = e.level as number;
    const t = e.type;
    if (lvl % 2 === 0) {
      // I1 (רמה זוגית): R ← +1; AN/EN ← +2
      if (t === 'R') e.level = lvl + 1;
      else if (t === 'AN' || t === 'EN') e.level = lvl + 2;
    } else {
      // I2 (רמה אי-זוגית): L/EN/AN ← +1
      if (t === 'L' || t === 'EN' || t === 'AN') e.level = lvl + 1;
    }
  }
}

// ─────────────────────────── L1 ───────────────────────────

/**
 * L1 (הנחת שורה אחת — כמו בקובצי ה-conformance): S/B, וכן רצפי
 * WS/isolate formatting שלפניהם ובסוף הרצף, מאופסים לרמת הפסקה.
 * "הסוגים הם המקוריים" — לפי originalType. פועל על סדרת ה-aliVe
 * בלבד (X9-הוסרים אינם חוסמים את הסריקה לאחור).
 */
function applyL1(entries: readonly XEntry[], paragraphLevel: 0 | 1): void {
  const alive: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i]!.level !== null) alive.push(i);
  }
  const isL1Reset = (e: XEntry): boolean => {
    const t = e.originalType;
    return t === 'WS' || t === 'LRI' || t === 'RLI' || t === 'FSI' || t === 'PDI';
  };
  // סוף השורה: רצף WS/isolate חוזר
  let k = alive.length;
  while (k > 0 && isL1Reset(entries[alive[k - 1]!]!)) {
    entries[alive[k - 1]!]!.level = paragraphLevel;
    k -= 1;
  }
  // לפני כל S/B: רצף WS/isolate שלפניו מאופס (בסדרת ה-aliVe)
  for (let a = 0; a < alive.length; a++) {
    const i = alive[a]!;
    const t = entries[i]!.originalType;
    if (t === 'S' || t === 'B') {
      entries[i]!.level = paragraphLevel;
      let b = a - 1;
      while (b >= 0 && isL1Reset(entries[alive[b]!]!)) {
        entries[alive[b]!]!.level = paragraphLevel;
        b -= 1;
      }
    }
  }
}

// ─────────────────────────── L2 — סדר חזותי ───────────────────────────

/**
 * L2: מהרמה הגבוהה בטקסט ועד הרמה האי-זוגית הנמוכה שנמצאה בו, כולל
 * רמות ביניים שאינן קיימות בפועל — הפוך כל רצף רצוף ברמה זו או יותר.
 * הערה: המעבר כולל גם רמות זוגיות (דוגמה: רמות 1,2,3,2,1 — צעד
 * הרמה 2 חובה; בלעדיו התוצאה שונה).
 */
function l2Reorder(indices: readonly number[], levelOf: (i: number) => number): number[] {
  let order = [...indices];
  let maxLevel = 0;
  let lowestOdd = 0; // 0 = אין רמה אי-זוגית בטקסט
  for (const i of indices) {
    const lvl = levelOf(i);
    if (lvl > maxLevel) maxLevel = lvl;
    if (lvl % 2 === 1 && (lowestOdd === 0 || lvl < lowestOdd)) lowestOdd = lvl;
  }
  if (lowestOdd === 0) return order;
  for (let lvl = maxLevel; lvl >= lowestOdd; lvl -= 1) {
    const next: number[] = [];
    let i = 0;
    while (i < order.length) {
      if (levelOf(order[i]!) >= lvl) {
        let j = i;
        while (j < order.length && levelOf(order[j]!) >= lvl) j += 1;
        for (let z = j - 1; z >= i; z--) next.push(order[z]!);
        i = j;
      } else {
        next.push(order[i]!);
        i += 1;
      }
    }
    order = next;
  }
  return order;
}

// ─────────────────────────── הליבה ברמת נקודות הקוד ───────────────────────────

/**
 * UAX #9 מלא על רצף נקודות קוד (פסקה אחת). רמת הפסקה נתונה (P2/P3
 * מבוצעים על ידי הקורא או paragraphLevelFor). פלט: רמות (null=X9),
 * סדר חזותי, דגלי mirror.
 */
export function resolveBidiCodePoints(
  cps: readonly number[],
  paragraphLevel: 0 | 1,
): BidiCodePointResult {
  const isoMatches = structuralIsolateMatches(cps);
  const entries = runExplicitPass(cps, paragraphLevel, isoMatches);

  // X9: סימון הסרה (בלי למחוק — רמותיהם כ-null; הסדר החזותי מדלג אותם)
  for (const e of entries) {
    if (X9_TYPES.has(e.originalType)) e.level = null;
  }
  // תמונת רמות ה-X-שלב — ל-sos/eos (X10: החישוב חייב להיות לפני I1/I2;
  // אחרת סדר הטיפול ברצפים משנה את הגבולות של הבאים)
  for (const e of entries) {
    e.xLevel = e.level;
  }

  // X10 + BD13
  const sequences = computeSequences(entries, isoMatches);
  for (const seq of sequences) {
    const { sos, eos } = boundariesFor(entries, seq, paragraphLevel);
    resolveWeak(entries, seq, sos, eos);
    resolveBrackets(entries, seq, sos);
    resolveNeutrals(entries, seq, sos, eos);
    resolveImplicit(entries, seq);
  }

  // L1 (הנחת שורה אחת) ואז L2
  applyL1(entries, paragraphLevel);
  const aliveIdx: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    if (entries[i]!.level !== null) aliveIdx.push(i);
  }
  const visualOrder = l2Reorder(aliveIdx, (i) => entries[i]!.level as number);

  const mirrored = entries.map((e) => e.level !== null && e.level % 2 === 1 && isMirroredCp(e.cp));
  const levels = entries.map((e) => e.level);
  return Object.freeze({
    paragraphLevel,
    levels: Object.freeze(levels),
    visualOrder: Object.freeze(visualOrder),
    mirrored: Object.freeze(mirrored),
  });
}

// ─────────────────────────── API ברמת האטום ───────────────────────────

function toCodePoints(text: string): number[] {
  const cps: number[] = [];
  for (let i = 0; i < text.length; ) {
    const c1 = text.charCodeAt(i);
    if (c1 >= 0xd800 && c1 <= 0xdbff && i + 1 < text.length) {
      const c2 = text.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        cps.push((c1 - 0xd800) * 0x400 + (c2 - 0xdc00) + 0x10000);
        i += 2;
        continue;
      }
    }
    cps.push(c1);
    i += 1;
  }
  return cps;
}

/**
 * BiDi מלא על רצף אטומים: הטקסט המאוחד נפתר ברמת נקודות הקוד, והרמות
 * ממופות חזרה לאטומים — האטום (האשכול) כולו נושא רמה אחת (NSM ב-W1
 * נגזר מהבסיס; לכן אשכול הומוגני). הסדר החזותי נקבע ברמת האטום (L3
 * מובטח מבנית: האטום אינו נחתך). האטומים עצמם לא משתנים — הפלט הוא
 * מיפוי בלבד (שער השלב: reordering אינו משנה תוכן או זהות).
 */
export function computeBidi(
  atoms: readonly ShapingAtom[],
  opts?: ComputeBidiOptions,
): BidiResult {
  const n = atoms.length;
  const emptyLevel: 0 | 1 = 0;
  if (n === 0) {
    return Object.freeze({
      paragraphLevel: emptyLevel,
      levels: Object.freeze([]),
      maxLevel: 0,
      runs: Object.freeze([]),
      visualOrder: Object.freeze([]),
      logicalToVisual: Object.freeze([]),
      mirrored: Object.freeze([]),
    });
  }
  // הטקסט המאוחד + מיפוי אטום ← אינדקס התחלה במחרוזת (UTF-16 לצורך מיפוי בינארי)
  const atomStarts: number[] = [];
  const cps: number[] = [];
  let off = 0;
  for (const a of atoms) {
    atomStarts.push(cps.length);
    for (const cp of toCodePoints(a.text)) cps.push(cp);
    off += a.text.length;
  }
  void off;
  const atomEnds: number[] = atoms.map((a, i) => atomStarts[i]! + toCodePoints(a.text).length);

  const wantAuto = opts?.paragraphLevel === undefined || opts.paragraphLevel === 'auto';
  const paragraphLevel: 0 | 1 = wantAuto ? paragraphLevelFor(cps, 0) : (opts!.paragraphLevel as 0 | 1);
  const resolved = resolveBidiCodePoints(cps, paragraphLevel);

  // רמת אטום = רמת נקודת הקוד הראשונה שלו (האשכול הומוגני; ראה תיעוד למעלה).
  const atomLevels: number[] = atoms.map((_a, i) => {
    const lvl = resolved.levels[atomStarts[i]!] ?? 0;
    return lvl === null ? paragraphLevel : lvl;
  });

  // L2 ברמת האטום: תמורה של 0..n-1
  const allIdx = Array.from({ length: n }, (_v, i) => i);
  const visualOrder = l2Reorder(allIdx, (i) => atomLevels[i]!);
  const logicalToVisual: number[] = new Array(n);
  for (let v = 0; v < visualOrder.length; v++) logicalToVisual[visualOrder[v]!] = v;

  // runs: רצפים רצופים באותה רמה (בסדר הלוגי)
  const runs: BidiRun[] = [];
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && atomLevels[j + 1]! === atomLevels[i]!) j += 1;
    runs.push(Object.freeze({
      startAtom: i,
      endAtom: j,
      level: atomLevels[i]!,
      direction: atomLevels[i]! % 2 === 1 ? 'rtl' : 'ltr',
    }));
    i = j + 1;
  }

  let maxLevel = 0;
  for (const lvl of atomLevels) maxLevel = Math.max(maxLevel, lvl);

  // L4 ברמת האטום: רמה אי-זוגית + אחד התווים באטום הוא Mirrored
  const mirrored: boolean[] = atoms.map((_a, idx) => {
    if (atomLevels[idx]! % 2 === 0) return false;
    for (let k = atomStarts[idx]!; k < atomEnds[idx]!; k++) {
      if (resolved.mirrored[k]) return true;
    }
    return false;
  });

  return Object.freeze({
    paragraphLevel,
    levels: Object.freeze(atomLevels),
    maxLevel,
    runs: Object.freeze(runs),
    visualOrder: Object.freeze(visualOrder),
    logicalToVisual: Object.freeze(logicalToVisual),
    mirrored: Object.freeze(mirrored),
  });
}
