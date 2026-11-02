/**
 * candidates.ts — מועמדי שורה וחישוב רוחב מגליפים (שלב 41; אפיון §7, §8.1).
 *
 * קלט מדויק לאלגוריתם השבירה הגלובלי (פרק ו):
 *   - נקודות שבירה: הזדמנויות UAX #14 (שלב 26) הממופות לגבולות אטומים,
 *     בחיתוך עם breakBefore של הפרסר (מדיניות מסמך); שבירות כפויות
 *     (explicit-break) וסוף פסקה. מועמד ש־UAX התיר אך הפרסר אסר מסומן
 *     ברשימת החסומים — "candidates חסרים/לא חוקיים מסומנים".
 *   - מדידת מקטע [from,to): רוחב מ־glyph advances של האטומים בלבד
 *     (§8.1#5 — לא מ־CSS ולא מסכום מילים שהומדדו בנפרד); stretch/shrink
 *     מרווחי המילים שנספרו (קוונטיזציה פר־רווח לפי ADR-001/004); רווחים
 *     עוקבים בסוף הקו אינם נמדדים ברוחב אך האטומים נשמרים — אין מחיקה.
 *
 * חוזה שחזור (שער השלב): כל candidate ניתן לשחזור מהמקור ומהמדידה —
 * ה־id שלו נגזר מזוג אינדקסי השבירה, והמדידה הישירה (סריקת האטומים)
 * זהה למדידה מטבלאות הקידומות (נבדק במבחנים ובמאמת).
 *
 * כל החישוב בשלמים בטוחים (ADR-001): אין מפעילי סיביות, אין float;
 * חלוקות דרך roundDiv בלבד.
 */
import {
  roundDiv,
  computeBreakOpportunities,
} from '@tora/layout-api';
import { atomTokenIndexMap, type BlockTokens, type Token } from './tokens.js';
import { toShapingAtoms, type ShapedParagraph } from './shaping.js';

// ─────────────────────────── נקודות שבירה ───────────────────────────

export type BreakKind = 'opportunity' | 'mandatory' | 'forced' | 'end';

export interface LineBreakPoint {
  /** הקו נגמר לפני אינדקס טוקן זה (סוף בלעדי). */
  readonly tokenIndex: number;
  /** האטום שלפניו שוברים (־1 לשבירה כפויה; atoms.length לסוף פסקה). */
  readonly atomIndex: number;
  readonly kind: BreakKind;
  /** כלל UAX #14 (למשל 'LB18'), 'explicit-break' או 'paragraph-end'. */
  readonly rule: string;
}

/** מועמד שבירה שנפסל בשל מדיניות — מסומן, לא נמחק בשקט (§8.1, שלב 41). */
export interface BlockedBreak {
  readonly atomIndex: number;
  readonly reason: 'parser-forbidden';
  readonly rule: string;
}

export interface LineBreakPlan {
  readonly points: readonly LineBreakPoint[];
  readonly blocked: readonly BlockedBreak[];
}

/**
 * בניית נקודות השבירה של פסקה: UAX #14 ∩ מדיניות הפרסר + שבירות כפויות
 * + סוף פסקה. hooks מדיניות נוספים (חיבור policy-torah) ייכנסו ב־M7;
 * כאן החיתוך המסמך של הפרסר בלבד (breakBefore !== 'forbidden').
 */
export function buildLineBreakPoints(bt: BlockTokens): LineBreakPlan {
  const tokOfAtom = atomTokenIndexMap(bt);
  const points: LineBreakPoint[] = [];
  const blocked: BlockedBreak[] = [];
  // UAX #14 על הטקסט המאוחד, ממופה לגבולות אטומים (שלב 26) — ללא hooks ב־M5
  if (bt.atoms.length > 0) {
    const opportunities = computeBreakOpportunities(toShapingAtoms(bt.atoms));
    for (const opp of opportunities) {
      if (opp.kind === 'none') continue; // רישומי hook:forbid — אין hooks בשלב זה
      const atom = bt.atoms[opp.atomIndex];
      if (atom === undefined) continue;
      if (atom.breakBefore === 'forbidden') {
        blocked.push({ atomIndex: opp.atomIndex, reason: 'parser-forbidden', rule: opp.rule });
        continue;
      }
      points.push({
        tokenIndex: tokOfAtom[opp.atomIndex] ?? bt.tokens.length,
        atomIndex: opp.atomIndex,
        kind: opp.kind === 'mandatory' ? 'mandatory' : 'opportunity',
        rule: opp.rule,
      });
    }
  }
  for (let t = 0; t < bt.tokens.length; t++) {
    if (bt.tokens[t]!.kind === 'forced') {
      points.push({ tokenIndex: t, atomIndex: -1, kind: 'forced', rule: 'explicit-break' });
    }
  }
  points.push({ tokenIndex: bt.tokens.length, atomIndex: bt.atoms.length, kind: 'end', rule: 'paragraph-end' });
  points.sort((a, b) => a.tokenIndex - b.tokenIndex || a.atomIndex - b.atomIndex);
  return { points: Object.freeze(points), blocked: Object.freeze(blocked) };
}

// ─────────────────────────── מדידת מקטע ───────────────────────────

/**
 * אטום רווחים שניתן לקצץ בסוף קו: כל תוויו U+0020 (רצף רווחים הוא אטום
 * אחד במודל המילים; NBSP אינו נחתך — ADR-004).
 */
export function isTrimmableSpaceText(text: string): boolean {
  if (text.length === 0) return false;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) !== 0x20) return false;
  }
  return true;
}

/** תווי מקף שקו הנגמר בהם סופר לחוב (ADR-004). האטום במודל המילים הוא
 *  מילה שלמה — הבדיקה על התו האחרון של האטום. */
const HYPHEN_CHARS = new Set(['-', '־', '\u00ad']);

export function endsWithHyphen(text: string): boolean {
  return text.length > 0 && HYPHEN_CHARS.has(text[text.length - 1]!);
}

export interface LineMetrics {
  /** רוחב טבעי ללא רווחים עוקבים בסוף הקו (מ־glyph advances + סמנים). */
  readonly widthLu: number;
  /** מתיחה זמינה: Σ roundDiv(רוחב רווח, 2) על הרווחים הנספרים (ADR-004). */
  readonly stretchLu: number;
  /** כיווץ זמין: Σ roundDiv(רוחב רווח, 3) על הרווחים הנספרים (ADR-004). */
  readonly shrinkLu: number;
  /** מספר הרווחים הנספרים (שאינם עוקבים בסוף). */
  readonly spaceCount: number;
  /** רוחב הרווחים העוקבים בסוף — מחוץ ל־widthLu; האטומים נשמרים. */
  readonly trailingSpaceLu: number;
  /** רוחח רווחים מובילים — נכלל ב־widthLu (האטומים תוכן הם). */
  readonly leadingSpaceLu: number;
  /** הקו נגמר במקף/מקף עברי (שבירה אחרי מקף — חוב מתועד). */
  readonly hyphenEnd: boolean;
  /** מספר מילים במקטע (ריצות מרביים של אטומים שאינם רווח). */
  readonly wordCount: number;
  /** כש־wordCount === 1: רוחב המילה עצמה (בלי רווחים מובילים). */
  readonly singleWordWidthLu: number;
}

/**
 * אינדקס מועמדים: טבלאות קידומות על זרם הטוקנים לחישוב O(1) של מדידת
 * כל מקטע. הקונסטרוקטור טהור — אותם קלטים ⇐ אותן טבלאות (דטרמיניזם).
 */
export class LineCandidateIndex {
  readonly breakPlan: LineBreakPlan;
  private readonly tokens: readonly Token[];
  private readonly atoms: BlockTokens['atoms'];
  private readonly widthPrefix: readonly number[];
  private readonly spaceWidthPrefix: readonly number[];
  private readonly stretchPrefix: readonly number[];
  private readonly shrinkPrefix: readonly number[];
  private readonly spaceCountPrefix: readonly number[];
  private readonly isSpace: readonly boolean[];
  private readonly lastNonSpaceBefore: readonly number[]; // האינדקס הגדול ביותר < t שאינו רווח (־1 אם אין)
  private readonly nextNonSpaceFrom: readonly number[];   // האינדקס הקטן ביותר ≥ t שאינו רווח (tokens.length אם אין)
  private readonly wordStartPrefix: readonly number[];    // מספר i < t עם !isSpace[i] ∧ isSpace[i−1] (i ≥ 1)
  private readonly atomIdByToken: readonly (string | null)[];

  constructor(bt: BlockTokens, shaped: ShapedParagraph, markerWidth: (label: string, bodyPrefix: boolean) => number) {
    this.tokens = bt.tokens;
    this.atoms = bt.atoms;
    this.breakPlan = buildLineBreakPoints(bt);
    const n = this.tokens.length;
    const widthPrefix = new Array<number>(n + 1).fill(0);
    const spaceWidthPrefix = new Array<number>(n + 1).fill(0);
    const stretchPrefix = new Array<number>(n + 1).fill(0);
    const shrinkPrefix = new Array<number>(n + 1).fill(0);
    const spaceCountPrefix = new Array<number>(n + 1).fill(0);
    const isSpace = new Array<boolean>(n).fill(false);
    const atomIdByToken = new Array<string | null>(n).fill(null);
    for (let t = 0; t < n; t++) {
      const tok = this.tokens[t]!;
      let w = 0;
      let sw = 0;
      let st = 0;
      let sh = 0;
      let sc = 0;
      if (tok.kind === 'atom') {
        w = shaped.advances[tok.pIdx] ?? 0;
        atomIdByToken[t] = this.atoms[tok.pIdx]!.id;
        if (isTrimmableSpaceText(this.atoms[tok.pIdx]!.text)) {
          // רצף רווחים = אטום אחד; קוונטיזציה פר־רווח (ADR-004): כל הרווחים
          // באותו גופן בעלי אותו advance — חלוקת האטום ל־k רווחים מדויקת
          const k = this.atoms[tok.pIdx]!.text.length;
          const perSpace = roundDiv(w, k);
          isSpace[t] = true;
          sw = w;
          st = k * roundDiv(perSpace, 2);
          sh = k * roundDiv(perSpace, 3);
          sc = k;
        }
      } else if (tok.kind === 'marker') {
        w = markerWidth(tok.label, tok.bodyPrefix);
      }
      widthPrefix[t + 1] = widthPrefix[t]! + w;
      spaceWidthPrefix[t + 1] = spaceWidthPrefix[t]! + sw;
      stretchPrefix[t + 1] = stretchPrefix[t]! + st;
      shrinkPrefix[t + 1] = shrinkPrefix[t]! + sh;
      spaceCountPrefix[t + 1] = spaceCountPrefix[t]! + sc;
    }
    this.widthPrefix = widthPrefix;
    this.spaceWidthPrefix = spaceWidthPrefix;
    this.stretchPrefix = stretchPrefix;
    this.shrinkPrefix = shrinkPrefix;
    this.spaceCountPrefix = spaceCountPrefix;
    this.isSpace = isSpace;
    this.atomIdByToken = atomIdByToken;

    const lastNonSpaceBefore = new Array<number>(n + 1).fill(-1);
    for (let t = 0; t < n; t++) lastNonSpaceBefore[t + 1] = !isSpace[t] ? t : lastNonSpaceBefore[t]!;
    this.lastNonSpaceBefore = lastNonSpaceBefore;

    const nextNonSpaceFrom = new Array<number>(n + 1).fill(n);
    for (let t = n - 1; t >= 0; t--) nextNonSpaceFrom[t] = !isSpace[t] ? t : nextNonSpaceFrom[t + 1]!;
    this.nextNonSpaceFrom = nextNonSpaceFrom;

    const wordStartPrefix = new Array<number>(n + 1).fill(0);
    for (let t = 1; t <= n; t++) {
      const i = t - 1;
      const startsAfterSpace = i >= 1 && this.isSpace[i - 1] === true;
      wordStartPrefix[t] = wordStartPrefix[t - 1]! + (!this.isSpace[i]! && startsAfterSpace ? 1 : 0);
    }
    this.wordStartPrefix = wordStartPrefix;
  }

  /** מדידת מקטע [fromTok, toTok) מטבלאות הקידומות — O(1). */
  measure(fromTok: number, toTok: number): LineMetrics {
    if (!(fromTok >= 0 && toTok <= this.tokens.length && fromTok < toTok)) {
      throw new RangeError(`measure: טווח לא חוקי [${fromTok},${toTok}) מתוך ${this.tokens.length}`);
    }
    const widthAll = this.widthPrefix[toTok]! - this.widthPrefix[fromTok]!;
    const trailingStart = Math.max(this.lastNonSpaceBefore[toTok]! + 1, fromTok);
    // הרווחים העוקבים בסוף [trailingStart, toTok) — מחוץ לרוחב; הנספרים
    // הם [fromTok, trailingStart)
    const trailingSpaceLu = this.spaceWidthPrefix[toTok]! - this.spaceWidthPrefix[trailingStart]!;
    const widthLu = widthAll - trailingSpaceLu;
    const stretchLu = this.stretchPrefix[trailingStart]! - this.stretchPrefix[fromTok]!;
    const shrinkLu = this.shrinkPrefix[trailingStart]! - this.shrinkPrefix[fromTok]!;
    const spaceCount = this.spaceCountPrefix[trailingStart]! - this.spaceCountPrefix[fromTok]!;
    const leadEnd = Math.min(this.nextNonSpaceFrom[fromTok]!, toTok);
    const leadingSpaceLu = this.spaceWidthPrefix[leadEnd]! - this.spaceWidthPrefix[fromTok]!;
    const lastNonSpace = this.lastNonSpaceBefore[toTok]!;
    let hyphenEnd = false;
    if (lastNonSpace >= fromTok) {
      const tok = this.tokens[lastNonSpace]!;
      if (tok.kind === 'atom') hyphenEnd = endsWithHyphen(this.atoms[tok.pIdx]!.text);
    }
    const startsAtWord = !this.isSpace[fromTok]!;
    // מילים = ריצות מרביות של לא־רווחים בתוך המקטע, בלי תלות בהקשר מחוץ לו
    const wordCount = (startsAtWord ? 1 : 0)
      + Math.max(0, this.wordStartPrefix[toTok]! - this.wordStartPrefix[Math.min(fromTok + 1, toTok)]!);
    const singleWordWidthLu = wordCount === 1 ? Math.max(0, widthLu - leadingSpaceLu) : 0;
    return Object.freeze({
      widthLu, stretchLu, shrinkLu, spaceCount, trailingSpaceLu, leadingSpaceLu,
      hyphenEnd, wordCount, singleWordWidthLu,
    });
  }

  atomIdAt(tokenIndex: number): string | null {
    if (tokenIndex < 0 || tokenIndex >= this.tokens.length) return null;
    return this.atomIdByToken[tokenIndex] ?? null;
  }

  /** מזהה האטום הראשון במקטע (או null אם אין אטומים). */
  firstAtomIdIn(fromTok: number, toTok: number): string | null {
    for (let t = fromTok; t < toTok; t++) {
      const id = this.atomIdAt(t);
      if (id !== null) return id;
    }
    return null;
  }

  /** מזהה האטום האחרון במקטע (או null אם אין אטומים). */
  lastAtomIdIn(fromTok: number, toTok: number): string | null {
    for (let t = toTok - 1; t >= fromTok; t--) {
      const id = this.atomIdAt(t);
      if (id !== null) return id;
    }
    return null;
  }
}

// ─────────────────────────── מועמד שורה ───────────────────────────

export type JustificationMode = 'justify' | 'natural' | 'last';

export interface LineCandidate {
  /** מזהה קנוני מזוג אינדקסי השבירה — בסיס לתיקו יציב (ADR-004). */
  readonly id: string;
  readonly startTok: number;
  readonly endTok: number;
  readonly breakPoint: LineBreakPoint;
  readonly metrics: LineMetrics;
  readonly firstAtomId: string | null;
  readonly lastAtomId: string | null;
}

export function lineCandidateId(startTok: number, endTok: number): string {
  return `c:${startTok}:${endTok}`;
}

/** בניית מועמד — המדידה מהאינדקס; השחזור נבדק בנפרד (שער השלב). */
export function buildLineCandidate(index: LineCandidateIndex, startTok: number, bp: LineBreakPoint): LineCandidate {
  return Object.freeze({
    id: lineCandidateId(startTok, bp.tokenIndex),
    startTok,
    endTok: bp.tokenIndex,
    breakPoint: bp,
    metrics: index.measure(startTok, bp.tokenIndex),
    firstAtomId: index.firstAtomIdIn(startTok, bp.tokenIndex),
    lastAtomId: index.lastAtomIdIn(startTok, bp.tokenIndex),
  });
}

/**
 * שחזור ישיר של מדידת מועמד מהמקור ומהמדידה — סריקת אטומים בלבד, בלי
 * טבלאות קידומות. שער שלב 41: שחזור זהה למדידת האינדקס עבור כל
 * מועמד חוקי (משמש את המבחנים ואת המאמת).
 */
export function reconstructMetrics(
  bt: BlockTokens,
  shaped: ShapedParagraph,
  markerWidth: (label: string, bodyPrefix: boolean) => number,
  fromTok: number,
  toTok: number,
): LineMetrics {
  let widthAll = 0;
  let stretch = 0;
  let shrink = 0;
  let spaceCount = 0;
  let leading = 0;
  const cellWidths: number[] = [];
  for (let t = fromTok; t < toTok; t++) {
    const tok = bt.tokens[t]!;
    let w = 0;
    if (tok.kind === 'atom') {
      w = shaped.advances[tok.pIdx] ?? 0;
      if (isTrimmableSpaceText(bt.atoms[tok.pIdx]!.text)) {
        const k = bt.atoms[tok.pIdx]!.text.length;
        const perSpace = roundDiv(w, k);
        stretch += k * roundDiv(perSpace, 2);
        shrink += k * roundDiv(perSpace, 3);
        spaceCount += k;
      }
    } else if (tok.kind === 'marker') {
      w = markerWidth(tok.label, tok.bodyPrefix);
    }
    cellWidths.push(w);
    widthAll += w;
  }
  // רווחים עוקבים בסוף — מחוץ לרוחב
  let trailing = 0;
  let end = cellWidths.length;
  while (end > 0) {
    const tok = bt.tokens[fromTok + end - 1]!;
    if (tok.kind === 'atom' && isTrimmableSpaceText(bt.atoms[tok.pIdx]!.text)) {
      end -= 1;
      trailing += cellWidths[end]!;
    } else break;
  }
  // החזרת הרווחים העוקבים מהספירה (הם לא נספרים)
  for (let t = fromTok + end; t < toTok; t++) {
    const tok = bt.tokens[t]!;
    if (tok.kind === 'atom' && isTrimmableSpaceText(bt.atoms[tok.pIdx]!.text)) {
      const k = bt.atoms[tok.pIdx]!.text.length;
      const w = cellWidths[t - fromTok]!;
      const perSpace = roundDiv(w, k);
      stretch -= k * roundDiv(perSpace, 2);
      shrink -= k * roundDiv(perSpace, 3);
      spaceCount -= k;
    }
  }
  // רווחים מובילים — נכללים ברוחב
  let leadIdx = 0;
  while (leadIdx < cellWidths.length) {
    const tok = bt.tokens[fromTok + leadIdx]!;
    if (tok.kind === 'atom' && isTrimmableSpaceText(bt.atoms[tok.pIdx]!.text)) {
      leading += cellWidths[leadIdx]!;
      leadIdx += 1;
    } else break;
  }
  // ספירת מילים ומקף בסוף
  let wordCount = 0;
  let inWord = false;
  for (let t = fromTok; t < toTok; t++) {
    const tok = bt.tokens[t]!;
    const isSp = tok.kind === 'atom' && isTrimmableSpaceText(bt.atoms[tok.pIdx]!.text);
    if (!isSp && !inWord) { wordCount += 1; inWord = true; }
    if (isSp) inWord = false;
  }
  let hyphenEnd = false;
  for (let t = toTok - 1; t >= fromTok; t--) {
    const tok = bt.tokens[t]!;
    if (tok.kind === 'atom' && isTrimmableSpaceText(bt.atoms[tok.pIdx]!.text)) continue;
    if (tok.kind === 'atom') hyphenEnd = endsWithHyphen(bt.atoms[tok.pIdx]!.text);
    break;
  }
  const widthLu = widthAll - trailing;
  return Object.freeze({
    widthLu, stretchLu: stretch, shrinkLu: shrink, spaceCount,
    trailingSpaceLu: trailing, leadingSpaceLu: leading, hyphenEnd,
    wordCount, singleWordWidthLu: wordCount === 1 ? Math.max(0, widthLu - leading) : 0,
  });
}
