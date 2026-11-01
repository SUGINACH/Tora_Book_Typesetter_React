/**
 * uax14.ts — אלגוריתם שבירת השורות UAX #14 (שלב 27; rev 53, Unicode 16.0.0).
 *
 * אסמכתא: UAX #14 revision 53 (Unicode 16.0.0) · אפיון §6.4 ("סדר שבירות
 * ב־UAX #14, עם גרסאות נעולות ומבחני conformance"), §8.1 ("מייצרים break
 * opportunities חוקיים") · תכנית שלב 27.
 *
 * מבנה: (א) טבלאות מיוצרות (uax14-tables.ts — LB1 נאפה: AI/SG/XX→AL,
 * SA→CM ל־Mn/Mc); (ב) עיבוד מקדים LB9/LB10 (מיזוג CM/ZWJ לבסיס; שאריות
 * ← AL); (ג) הכללים LB2–LB31 לפי סדר העדיפות על הרצף המצומצם; (ד) מיפוי
 * חזרה לאינדקסים המקוריים.
 *
 * פלט ה־API ברמת האטום: הזדמנויות לפני כל אטום, כולל מספר הכלל
 * והאם השבירה חובה — וכל נקודה מקושרת למזהה האטום (שער השלב). אין כאן
 * בחירת שורה (זה המנוע, M5) — מועמדים בלבד. Hooks מדיניות: איסור/התרה
 * מקומיים אחרי UAX, עם סיבה מתועדת לכל שינוי — לא בשקט.
 */

import {
  EA_WIDE_RANGES,
  LB_RANGES,
  PF_CODEPOINTS,
  PI_CODEPOINTS,
  PICTO_CN_RANGES,
  UAX14_REVISION,
  UAX14_SOURCE_SHA256,
  UAX14_UNICODE_VERSION,
} from './uax14-tables.js';
import type { ShapingAtom } from './provider.js';

export { UAX14_UNICODE_VERSION, UAX14_REVISION, UAX14_SOURCE_SHA256 };

// ─────────────────────────── חיפוש בטבלאות ───────────────────────────

type Range3 = readonly [number, number, string];
type Range2 = readonly [number, number];

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

function binarySearch2(ranges: readonly Range2[], cp: number): Range2 | null {
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

const PI_RANGES: readonly Range2[] = PI_CODEPOINTS.map((c) => [c, c] as const);
const PF_RANGES: readonly Range2[] = PF_CODEPOINTS.map((c) => [c, c] as const);

/** מחלקת שבירה של נקודת קוד (LB1 נאפה בטבלה). */
export function lineBreakClass(cp: number): string {
  const r = binarySearch3(LB_RANGES, cp);
  // פערי כיסוי (תווים לא רשומים) — XX→AL לפי LB1
  return r !== null ? r[2] : 'AL';
}

/** $EastAsian — EAW ∈ {F, W, H} (הגדרת סעיף הסימון ב־UAX #14). */
export function isEastAsian(cp: number): boolean {
  return binarySearch2(EA_WIDE_RANGES, cp) !== null;
}

const isPi = (cp: number): boolean => binarySearch2(PI_RANGES, cp) !== null;
const isPf = (cp: number): boolean => binarySearch2(PF_RANGES, cp) !== null;
const isPictoCn = (cp: number): boolean => binarySearch2(PICTO_CN_RANGES, cp) !== null;

// ─────────────────────────── סוגי פלט ───────────────────────────

export type BreakDecisionKind = 'none' | 'opportunity' | 'mandatory';

export interface Uax14BoundaryDecision {
  /** מיקום הגבול במחרורת (אינדקס UTF-16 — שבירה לפני התו במיקום הזה). */
  readonly position: number;
  readonly kind: BreakDecisionKind;
  /** מספר הכלל שקבע (LB4…LB31) — לניפוי, ל־Ledger ולבדיקות. */
  readonly rule: string;
}

// ─────────────────────────── עיבוד מקדים: LB9/LB10 ───────────────────────────

const LB9_EXCLUDED_BASES = new Set(['BK', 'CR', 'LF', 'NL', 'SP', 'ZW']);

interface ReducedEntry {
  cls: string;
  cp: number;
  firstIndex: number;
  lastIndex: number;
  /** התו המקורי הוא ZWJ ששרד כרשומה (לא מוזג ב־LB9) — LB8a חל עליו גם לאחר LB10. */
  wasZwj: boolean;
}

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

/** הרצף המצומצם: LB9 (מיזוג CM/ZWJ לבסיס) + LB10 (שאריות ← AL). */
function buildReduced(cps: readonly number[]): ReducedEntry[] {
  const entries: ReducedEntry[] = [];
  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i]!;
    let cls = lineBreakClass(cp);
    if (cls === 'CM' || cls === 'ZWJ') {
      const prev = entries[entries.length - 1];
      if (prev !== undefined && !LB9_EXCLUDED_BASES.has(prev.cls)) {
        prev.lastIndex = i; // LB9: מיזוג — אין שבירה בתוך הרצף
        // התו האחרון ברצף כבר אינו ה־ZWJ — LB8a אינו חל עוד על רשומה זו
        prev.wasZwj = false;
        continue;
      }
      entries.push({ cls: 'AL', cp, firstIndex: i, lastIndex: i, wasZwj: cp === 0x200d }); // LB10
      continue;
    }
    entries.push({ cls, cp, firstIndex: i, lastIndex: i, wasZwj: false });
  }
  return entries;
}

// ─────────────────────────── האלגוריתם (LB2–LB31) ───────────────────────────

interface RawDecision { kind: BreakDecisionKind; rule: string }

const isCls = (e: ReducedEntry | undefined, ...classes: readonly string[]): boolean =>
  e !== undefined && classes.includes(e.cls);

const skipSpacesLeft = (entries: readonly ReducedEntry[], from: number): number => {
  let j = from;
  while (entries[j] !== undefined && entries[j]!.cls === 'SP') j -= 1;
  return j;
};

const LB15B_FOLLOWERS = new Set(['SP', 'GL', 'WJ', 'CL', 'QU', 'CP', 'EX', 'IS', 'SY', 'BK', 'CR', 'LF', 'NL', 'ZW']);
const LB15A_CONTEXT = new Set(['BK', 'CR', 'LF', 'NL', 'OP', 'QU', 'GL', 'SP', 'ZW']);
const LB20A_CONTEXT = new Set(['BK', 'CR', 'LF', 'NL', 'SP', 'ZW', 'CB', 'GL']);
const HANGUL = ['JL', 'JV', 'JT', 'H2', 'H3'];

/** החלטה בגבול בין entries[k-1] ל־entries[k] — הכללים לפי סדר העדיפות. */
function decide(entries: readonly ReducedEntry[], k: number): RawDecision {
  const L = entries[k - 1]!;
  const R = entries[k]!;
  const li = k - 1;
  const ri = k;
  const before = (i: number): ReducedEntry | undefined => entries[i - 1];
  const after = (i: number): ReducedEntry | undefined => entries[i + 1];

  const NO = (rule: string): RawDecision => ({ kind: 'none', rule });
  const OPP = (rule: string): RawDecision => ({ kind: 'opportunity', rule });
  const MAN = (rule: string): RawDecision => ({ kind: 'mandatory', rule });

  // ── כללים בלתי-ניתנים להתאמה (§6.1) ──
  if (L.cls === 'BK') return MAN('LB4'); // LB4
  if (L.cls === 'CR' && R.cls === 'LF') return NO('LB5'); // LB5
  if (L.cls === 'CR' || L.cls === 'LF' || L.cls === 'NL') return MAN('LB5');
  if (R.cls === 'BK' || R.cls === 'CR' || R.cls === 'LF' || R.cls === 'NL') return NO('LB6'); // LB6
  if (R.cls === 'SP' || R.cls === 'ZW') return NO('LB7'); // LB7
  { // LB8: ZW SP* ÷
    const eff = entries[skipSpacesLeft(entries, li)];
    if (eff !== undefined && eff.cls === 'ZW') return OPP('LB8');
  }
  if (L.cls === 'ZWJ' || L.wasZwj) return NO('LB8a'); // LB8a: אין שבירה אחרי ZWJ (גם ZWJ שלא מוזג)
  if (R.cls === 'WJ' || L.cls === 'WJ') return NO('LB11'); // LB11
  if (L.cls === 'GL') return NO('LB12'); // LB12

  // ── כללים ניתנים להתאמה (§6.2) ──
  if (R.cls === 'GL' && L.cls !== 'SP' && L.cls !== 'BA' && L.cls !== 'HY') return NO('LB12a');
  if (R.cls === 'CL' || R.cls === 'CP' || R.cls === 'EX' || R.cls === 'SY') return NO('LB13');
  { // LB14: OP SP* ×
    const eff = entries[skipSpacesLeft(entries, li)];
    if (eff !== undefined && eff.cls === 'OP') return NO('LB14');
  }
  { // LB15a: (sot|BK|CR|LF|NL|OP|QU|GL|SP|ZW) [Pi&QU] SP* ×
    const j = skipSpacesLeft(entries, li);
    const pi = entries[j];
    if (pi !== undefined && pi.cls === 'QU' && isPi(pi.cp)) {
      const ctx = entries[j - 1];
      if (ctx === undefined || LB15A_CONTEXT.has(ctx.cls)) return NO('LB15a');
    }
  }
  { // LB15b: × [Pf&QU] (SP|GL|WJ|CL|QU|CP|EX|IS|SY|BK|CR|LF|NL|ZW|eot)
    if (R.cls === 'QU' && isPf(R.cp)) {
      const next = after(ri);
      if (next === undefined || LB15B_FOLLOWERS.has(next.cls)) return NO('LB15b');
    }
  }
  if (L.cls === 'SP' && R.cls === 'IS' && isCls(after(ri), 'NU')) return OPP('LB15c'); // LB15c
  if (R.cls === 'IS') return NO('LB15d'); // LB15d
  { // LB16: (CL | CP) SP* × NS
    const eff = entries[skipSpacesLeft(entries, li)];
    if (R.cls === 'NS' && eff !== undefined && (eff.cls === 'CL' || eff.cls === 'CP')) return NO('LB16');
  }
  { // LB17: B2 SP* × B2
    if (R.cls === 'B2') {
      const eff = entries[skipSpacesLeft(entries, li)];
      if (eff !== undefined && eff.cls === 'B2') return NO('LB17');
    }
  }
  if (L.cls === 'SP') return OPP('LB18'); // LB18
  // LB19: × [QU-Pi]; [QU-Pf] ×
  if (R.cls === 'QU' && !isPi(R.cp)) return NO('LB19');
  if (L.cls === 'QU' && !isPf(L.cp)) return NO('LB19');
  // LB19a: [^$EastAsian] × QU; × QU ([^$EastAsian]|eot); QU × [^$EastAsian]; (sot|[^$EastAsian]) QU ×
  if (R.cls === 'QU') {
    const prev = before(li);
    const next = after(ri);
    if ((prev === undefined || !isEastAsian(prev.cp)) || (next === undefined || !isEastAsian(next.cp))) {
      return NO('LB19a');
    }
  }
  if (L.cls === 'QU') {
    const prev = before(li);
    const next = after(ri);
    if ((next === undefined || !isEastAsian(next.cp)) || (prev === undefined || !isEastAsian(prev.cp))) {
      return NO('LB19a');
    }
  }
  if (R.cls === 'CB' || L.cls === 'CB') return OPP('LB20'); // LB20
  if (R.cls === 'AL' && (L.cls === 'HY' || L.cp === 0x2010)) { // LB20a: (sot|…) (HY|[U+2010]) × AL
    const ctx = before(li);
    if (ctx === undefined || LB20A_CONTEXT.has(ctx.cls)) return NO('LB20a');
  }
  if (R.cls === 'BA' || R.cls === 'HY' || R.cls === 'NS') return NO('LB21'); // LB21
  if (L.cls === 'BB') return NO('LB21');
  { // LB21a: HL (HY | [BA-$EastAsian]) × [^HL]
    const base = before(li);
    if (base !== undefined && base.cls === 'HL') {
      const midOk = L.cls === 'HY' || (L.cls === 'BA' && !isEastAsian(L.cp));
      if (midOk && R.cls !== 'HL') return NO('LB21a');
    }
  }
  if (L.cls === 'SY' && R.cls === 'HL') return NO('LB21b'); // LB21b
  if (R.cls === 'IN') return NO('LB22'); // LB22
  if ((L.cls === 'AL' || L.cls === 'HL') && R.cls === 'NU') return NO('LB23'); // LB23
  if (L.cls === 'NU' && (R.cls === 'AL' || R.cls === 'HL')) return NO('LB23');
  if (L.cls === 'PR' && (R.cls === 'ID' || R.cls === 'EB' || R.cls === 'EM')) return NO('LB23a');
  if ((L.cls === 'ID' || L.cls === 'EB' || L.cls === 'EM') && R.cls === 'PO') return NO('LB23a');
  if ((L.cls === 'PR' || L.cls === 'PO') && (R.cls === 'AL' || R.cls === 'HL')) return NO('LB24');
  if ((L.cls === 'AL' || L.cls === 'HL') && (R.cls === 'PR' || R.cls === 'PO')) return NO('LB24');
  // LB25 — מספרים (הצורות הרגולריות של rev 53)
  if (R.cls === 'PO' || R.cls === 'PR') {
    let j = li;
    if (isCls(entries[j], 'CL', 'CP')) j -= 1; // NU (SY|IS)* (CL|CP)? ×
    while (isCls(entries[j], 'SY', 'IS')) j -= 1;
    if (isCls(entries[j], 'NU')) return NO('LB25');
  }
  if (R.cls === 'NU') {
    if (isCls(L, 'PO', 'PR', 'HY', 'IS')) return NO('LB25');
    let j = li;
    while (isCls(entries[j], 'SY', 'IS')) j -= 1;
    if (isCls(entries[j], 'NU')) return NO('LB25');
  }
  if (R.cls === 'OP' && isCls(L, 'PO', 'PR')) { // PO/PR × OP (IS)? NU
    const n1 = after(ri);
    if (isCls(n1, 'NU')) return NO('LB25');
    if (isCls(n1, 'IS') && isCls(after(ri + 1), 'NU')) return NO('LB25');
  }
  if (L.cls === 'JL' && ['JL', 'JV', 'H2', 'H3'].includes(R.cls)) return NO('LB26'); // LB26
  if ((L.cls === 'JV' || L.cls === 'H2') && (R.cls === 'JV' || R.cls === 'JT')) return NO('LB26');
  if ((L.cls === 'JT' || L.cls === 'H3') && R.cls === 'JT') return NO('LB26');
  if (HANGUL.includes(L.cls) && R.cls === 'PO') return NO('LB27'); // LB27
  if (L.cls === 'PR' && HANGUL.includes(R.cls)) return NO('LB27');
  if ((L.cls === 'AL' || L.cls === 'HL') && (R.cls === 'AL' || R.cls === 'HL')) return NO('LB28'); // LB28
  { // LB28a: תבניות ברהמיות ([◌] = U+25CC)
    const DOT = 0x25cc;
    const isAks = (e: ReducedEntry | undefined): boolean =>
      e !== undefined && (e.cls === 'AK' || e.cls === 'AS' || e.cp === DOT);
    const isAkDot = (e: ReducedEntry | undefined): boolean =>
      e !== undefined && (e.cls === 'AK' || e.cp === DOT);
    if (L.cls === 'AP' && isAks(R)) return NO('LB28a');
    if (isAks(L) && (R.cls === 'VF' || R.cls === 'VI')) return NO('LB28a');
    if (isAks(before(li)) && L.cls === 'VI' && isAkDot(R)) return NO('LB28a');
    if (isAks(L) && isAks(R) && isCls(after(ri), 'VF')) return NO('LB28a');
  }
  if (L.cls === 'IS' && (R.cls === 'AL' || R.cls === 'HL')) return NO('LB29'); // LB29
  // LB30: (AL|HL|NU) × [OP-$EastAsian]; [CP-$EastAsian] × (AL|HL|NU)
  if ((L.cls === 'AL' || L.cls === 'HL' || L.cls === 'NU') && R.cls === 'OP' && !isEastAsian(R.cp)) {
    return NO('LB30');
  }
  if (L.cls === 'CP' && !isEastAsian(L.cp) && (R.cls === 'AL' || R.cls === 'HL' || R.cls === 'NU')) {
    return NO('LB30');
  }
  if (L.cls === 'RI' && R.cls === 'RI') { // LB30a: זוגות RI
    let count = 1;
    let j = li - 1;
    while (isCls(entries[j], 'RI')) { count += 1; j -= 1; }
    if (count % 2 === 1) return NO('LB30a');
  }
  if (R.cls === 'EM' && (L.cls === 'EB' || isPictoCn(L.cp))) return NO('LB30b'); // LB30b
  return OPP('LB31'); // LB31
}

/** החלטות שבירה לכל גבולות המחרורת (בין תווים; ללא sot/eot). */
export function uax14Decisions(text: string): readonly Uax14BoundaryDecision[] {
  const cps = toCodePoints(text);
  if (cps.length === 0) return [];
  const entries = buildReduced(cps);
  const out: Uax14BoundaryDecision[] = [];
  for (let k = 1; k < entries.length; k++) {
    const d = decide(entries, k);
    out.push(Object.freeze({
      position: entries[k]!.firstIndex,
      kind: d.kind,
      rule: d.rule,
    }));
  }
  return Object.freeze(out);
}

// ─────────────────────────── API ברמת האטום + hooks מדיניות ───────────────────────────

export interface BreakHookContext {
  readonly atoms: readonly ShapingAtom[];
  /** האינדקס שלפניו נשקלת השבירה (1..n-1). */
  readonly atomIndex: number;
  readonly uax: BreakDecisionKind;
  readonly rule: string;
}

export interface BreakPolicyHooks {
  /** החזר true כדי לאסור שבירה ש־UAX התיר (למשל: אל תשבור בין אות למקף). */
  readonly forbid?: (ctx: BreakHookContext) => boolean;
  /** החזר true כדי להתיר שבירה ש־UAX אסר (חירום מבוקר; נרשם בסיבה). */
  readonly allow?: (ctx: BreakHookContext) => boolean;
}

export interface AtomBreakOpportunity {
  /** אינדקס האטום שלפניו מותר/חובה לשבור (1..n-1). */
  readonly atomIndex: number;
  /** מזהה האטום — הקישור למקור (שער השלב). */
  readonly atomId: string;
  readonly kind: BreakDecisionKind;
  /** 'LB18' וכדומה, או 'hook:forbid(LB18)' / 'hook:allow' כשהמדיניות שינתה. */
  readonly rule: string;
}

/**
 * הזדמנויות שבירה ברמת האטום: UAX #14 על הטקסט המאוחד, ממופה לגבולות
 * אטומים, עם hooks מדיניות. רק החלטות שנופלות בדיוק על גבול בין אטומים
 * נכללות — אין שבירה בתוך cluster (עקבי עם מיזוג LB9). פלט ממוין
 * לפי atomIndex; כל נקודה מקושרת למזהה האטום שלה.
 *
 * מוחזרות רק הזדמנויות ושבירות חובה (kind ≠ none) — גבולות "אין שבירה"
 * אינם חלק מהפלט (הם ברירת המחדל); רשימת ההחלטות המלאה — uax14Decisions.
 */
export function computeBreakOpportunities(
  atoms: readonly ShapingAtom[],
  hooks?: BreakPolicyHooks,
): readonly AtomBreakOpportunity[] {
  if (atoms.length <= 1) return [];
  const combined = atoms.map((a) => a.text).join('');
  const decisions = uax14Decisions(combined);

  // מיפוי אינדקס UTF-16 (בטקסט המאוחד) ← אינדקס אטום
  const atomStarts: number[] = [];
  let off = 0;
  for (const a of atoms) {
    atomStarts.push(off);
    off += a.text.length;
  }
  const atomOfPosition = (pos: number): number => {
    let lo = 0;
    let hi = atomStarts.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (pos < atomStarts[mid]!) hi = mid - 1;
      else if (mid + 1 < atomStarts.length && pos >= atomStarts[mid + 1]!) lo = mid + 1;
      else return mid;
    }
    return -1;
  };

  // ההחלטה לכל גבול אטום — רק אם קיים גבול תו בדיוק בתחילת האטום
  const byAtom = new Map<number, Uax14BoundaryDecision>();
  for (const d of decisions) {
    const ai = atomOfPosition(d.position);
    if (ai <= 0) continue;
    if (d.position !== atomStarts[ai]) continue; // גבול פנימי בתוך אטום — מדולג
    if (!byAtom.has(ai)) byAtom.set(ai, d);
  }

  const out: AtomBreakOpportunity[] = [];
  for (let i = 1; i < atoms.length; i++) {
    const d = byAtom.get(i);
    if (d === undefined) continue; // אין גבול תו בין האטומים — אין הזדמנות
    let kind = d.kind;
    let rule = d.rule;
    if (hooks !== undefined) {
      const ctx = Object.freeze({ atoms, atomIndex: i, uax: d.kind, rule: d.rule });
      if (kind !== 'mandatory' && hooks.forbid !== undefined && hooks.forbid(ctx)) {
        kind = 'none';
        rule = `hook:forbid(${d.rule})`;
      } else if (kind === 'none' && hooks.allow !== undefined && hooks.allow(ctx)) {
        kind = 'opportunity';
        rule = 'hook:allow';
      }
    }
    // רק הזדמנויות ושבירות חובה — וגם רישומי hook:forbid (kind=none) לביקורת
    if (kind === 'none' && !rule.startsWith('hook:forbid')) continue;
    out.push(Object.freeze({
      atomIndex: i,
      atomId: atoms[i]!.id,
      kind,
      rule,
    }));
  }
  return Object.freeze(out);
}
