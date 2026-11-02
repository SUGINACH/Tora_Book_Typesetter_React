/**
 * dp.ts — אלגוריתם DP גלובלי לפסקה בסגנון Knuth–Plass (שלב 42; אפיון §8.2).
 *
 * כל שורות הפסקה נבחרות יחד: מסלול מיטבי על נקודות השבירה, לא מילוי
 * חמדני. מבנה ה־DP:
 *
 *   best[end] = מינימום מבין (best[start] + שורה(start,end)) לכל start פעיל
 *
 * עקרונות מחייבים (§8.2):
 *   - סדר עיבוד קבוע: נקודות קצה בסדר עולה, צמתים פעילים בסדר קנוני
 *     (startTok ואז מזהה יצירה); אין תלות ב־Array.sort לא יציב.
 *   - חישוב שלם בלבד (ADR-001); המודל מוזרק (CostModel) — שלב 42 מספק
 *     עלות סקלרית (badness + demerits), שלב 43 יחליף ב־QualityVector
 *     לקסיקוגרפי בלי לגעת בליבת ה־DP.
 *   - מועמד לא חוקי נפסל לפני תמחור (FeasibilityPolicy) — אילוץ קשה
 *     אינו הופך לקנס רך.
 *   - tie של המודל נשבר תמיד לפי רצף אינדקסי השבירה של המסלול
 *     (לקסיקוגרפי, ואז מזהה יצירה) — אין tie לפי זמן או סדר cache.
 *   - budget ביחידות מועמדים/צמתים (§9.2): maxCandidatesPerState,
 *     maxBeamWidth; מיצוי נרשם (exhausted) ומדווח — לא שקט.
 *   - שורה החוצה שבירה כפויה/חובה (forced/mandatory) אינה חוקית:
 *     הפרדת מקטעים בכפייה נשמרת.
 *
 * השחזור: מצמתי הסיום (startTok === סוף הטוקנים) אחורה דרך prev —
 * המסלול כולו מוסבר ב־dominated/rejections לרישום בפנקס (שלב 47).
 */
import { buildLineCandidate, type JustificationMode, type LineBreakPoint, type LineCandidate, type LineCandidateIndex } from './candidates.js';

// ─────────────────────────── מודל עלות מוזרק ───────────────────────────

/** הקשר השורה לחישוב העלות — כל מה שהמודל רשאי לדעת (§8.2). */
export interface LineContext {
  readonly candidate: LineCandidate;
  readonly lineIndex: number; // 0-based בתוך הפסקה
  readonly isFirst: boolean;
  readonly isLast: boolean; // מסתיים בסוף הפסקה
  readonly justification: JustificationMode;
}

/**
 * מודל עלות מוזרק: סדר כולל על מסלולות. compare חייב להיות total order
 * טרנזיטיבי; ה־DP מוסיף מעליו את שוברי התיקו הקנוניים.
 */
export interface CostModel<Q> {
  start(): Q;
  append(path: Q, ctx: LineContext): Q;
  compare(a: Q, b: Q): number;
}

/** מדיניות חוקיות: מועמד לא חוקי נפסל לפני תמחור, עם קוד סיבה. */
export interface FeasibilityPolicy {
  /** null = חוקי; אחרת — קוד הפסילה (לרישום בפנקס). */
  check(candidate: LineCandidate, justification: JustificationMode, columnWidthLu: number): string | null;
  /** תוספת הרשאה לגלישה (LU) לצורך ניטרול צומת שאינו יכול עוד לשמש. */
  readonly overflowAllowanceLu: number;
}

// ─────────────────────────── תוצאה ───────────────────────────

export interface DpLineChoice {
  readonly startTok: number;
  readonly endTok: number;
  readonly breakPoint: LineBreakPoint;
  readonly justification: JustificationMode;
  readonly candidate: LineCandidate;
}

export interface DpRejection {
  readonly endTokenIndex: number;
  readonly candidateId: string;
  readonly reason: string;
}

export interface DpDomination {
  readonly endTokenIndex: number;
  readonly rejectedId: string;
  readonly winnerId: string;
}

export interface DpBudgetInfo {
  readonly generated: number;
  readonly pruned: number;
  readonly exhausted: boolean;
}

export interface DpResult<Q> {
  readonly lines: readonly DpLineChoice[];
  readonly best: Q | null;
  readonly rejections: readonly DpRejection[];
  readonly dominated: readonly DpDomination[];
  readonly budget: DpBudgetInfo;
}

// ─────────────────────────── ליבת ה־DP ───────────────────────────

interface DpNode<Q> {
  readonly id: number;
  readonly breakIdx: number; // אינדקס ב-points של נקודת הקצה שהשורה נגמרה בה (־1 לצומת הפתיחה)
  readonly startTok: number; // טוקן הפתיחה של השורה הבאה
  readonly lineCount: number;
  readonly quality: Q;
  readonly prev: number; // מזהה צומת קודם (־1 לפתיחה)
}

export interface DpBudget {
  readonly maxCandidatesPerState: number;
  readonly maxBeamWidth: number;
}

export function justificationOf(bp: LineBreakPoint): JustificationMode {
  if (bp.kind === 'end') return 'last';
  if (bp.kind === 'opportunity') return 'justify';
  return 'natural'; // forced/mandatory — שורה שנגמרה בכפייה אינה ממתחת רווחים
}

/**
 * הרצת ה־DP על פסקה אחת. טהורה: אותם קלטים ⇒ אותה תוצאה בדיוק
 * (כולל סדר הרשומות). best === null ⇐ אין מסלול חוקי ברמת המדיניות
 * (סולם החירום של שלב 44 מטפל בזה).
 */
export function breakParagraphDP<Q>(
  index: LineCandidateIndex,
  model: CostModel<Q>,
  policy: FeasibilityPolicy,
  columnWidthLu: number,
  budget: DpBudget,
): DpResult<Q> {
  const points = index.breakPlan.points;
  const rejections: DpRejection[] = [];
  const dominated: DpDomination[] = [];
  let generated = 0;
  let pruned = 0;
  let exhausted = false;

  if (points.length === 0) {
    return { lines: [], best: null, rejections, dominated, budget: { generated: 0, pruned: 0, exhausted: false } };
  }

  // מיפוי: האם באינדקס טוקן זה יש שבירת כפייה/חובה (אסור לשורה לחצות אותה)
  const mandatoryAt = new Array<boolean>(index.tokenCount).fill(false);
  for (const p of points) {
    if (p.kind === 'forced' || p.kind === 'mandatory') mandatoryAt[p.tokenIndex] = true;
  }
  // nextMandatoryFrom[t] = האינדקס הקטן ביותר ≥ t עם חובת שבירה (או tokenCount)
  const nextMandatoryFrom = new Array<number>(index.tokenCount + 1).fill(index.tokenCount);
  for (let t = index.tokenCount - 1; t >= 0; t--) {
    nextMandatoryFrom[t] = mandatoryAt[t] ? t : nextMandatoryFrom[t + 1]!;
  }

  const nodes: DpNode<Q>[] = [];
  const active: DpNode<Q>[] = [];
  const seqOf = makeSequenceCache(nodes);
  const bestAt = new Map<number, number>(); // breakIdx → nodeId
  const startNode: DpNode<Q> = { id: 0, breakIdx: -1, startTok: 0, lineCount: 0, quality: model.start(), prev: -1 };
  nodes.push(startNode);
  active.push(startNode);

  let nextId = 1;

  for (let endIdx = 0; endIdx < points.length; endIdx++) {
    const end = points[endIdx]!;
    if (end.tokenIndex === 0) continue; // אין שורה שנגמרת לפני טוקן 0
    const justification = justificationOf(end);
    let considered = 0;
    let capped = false;

    for (const node of active) {
      if (end.tokenIndex <= node.startTok) continue; // מקטע ריק
      // שורה החוצה שבירת כפייה/חובה — בלתי חוקית (§8.2: הפרדת מקטעים כפויה)
      if (nextMandatoryFrom[node.startTok]! < end.tokenIndex) {
        rejections.push({ endTokenIndex: end.tokenIndex, candidateId: `c:${node.startTok}:${end.tokenIndex}`, reason: 'spans-mandatory-break' });
        continue;
      }
      const candidate = buildLineCandidate(index, node.startTok, end);
      const reason = policy.check(candidate, justification, columnWidthLu);
      if (reason !== null) {
        rejections.push({ endTokenIndex: end.tokenIndex, candidateId: candidate.id, reason });
        continue;
      }
      considered += 1;
      if (considered > budget.maxCandidatesPerState) {
        capped = true;
        exhausted = true;
        break; // תקציב המועמדים למצב זה מוצה — נרשם, לא שקט
      }
      generated += 1;
      const ctx: LineContext = {
        candidate,
        lineIndex: node.lineCount,
        isFirst: node.lineCount === 0,
        isLast: end.kind === 'end',
        justification,
      };
      const newQ = model.append(node.quality, ctx);
      const existingId = bestAt.get(endIdx);
      if (existingId === undefined) {
        const node2: DpNode<Q> = {
          id: nextId++,
          breakIdx: endIdx,
          startTok: end.kind === 'forced' ? end.tokenIndex + 1 : end.tokenIndex,
          lineCount: node.lineCount + 1,
          quality: newQ,
          prev: node.id,
        };
        nodes.push(node2);
        bestAt.set(endIdx, node2.id);
      } else {
        const existing = nodes[existingId]!;
        // החלפה רק בניצחון מוחלט של המודל; תיקו ⇐ המוקדם שבשניים נשמר
        // (מזהה יצירה — סדר קבוע; §8.2: אין tie לפי זמן או סדר cache)
        if (model.compare(newQ, existing.quality) < 0) {
          dominated.push({ endTokenIndex: end.tokenIndex, rejectedId: candidateIdOf(existing, nodes, points), winnerId: `c:${node.startTok}:${end.tokenIndex}` });
          const node2: DpNode<Q> = {
            id: nextId++,
            breakIdx: endIdx,
            startTok: end.kind === 'forced' ? end.tokenIndex + 1 : end.tokenIndex,
            lineCount: node.lineCount + 1,
            quality: newQ,
            prev: node.id,
          };
          nodes.push(node2);
          bestAt.set(endIdx, node2.id);
          // הצומת שהודח היה בפעילים — הוצאתו (מסלול נחות לעולם לא ינצח)
          const i = active.indexOf(existing);
          if (i >= 0) active.splice(i, 1);
        } else {
          dominated.push({ endTokenIndex: end.tokenIndex, rejectedId: `c:${node.startTok}:${end.tokenIndex}`, winnerId: candidateIdOf(existing, nodes, points) });
        }
      }
    }

    // ניטרול צמתים שאינם יכולים עוד לפתוח שורה חוקית: הרוחב גדל עם הקצה
    // (מונוטוני — רווחים עוקבים נחתכים בכל קצה), ולכן צומת שהקצה הנוכחי
    // כבר גולש מעבר להרשאה לא ייבחר עוד לעולם
    for (let i = active.length - 1; i >= 0; i--) {
      const node = active[i]!;
      if (end.tokenIndex <= node.startTok) continue;
      const m = index.measure(node.startTok, end.tokenIndex);
      if (m.widthLu - m.shrinkLu > columnWidthLu + policy.overflowAllowanceLu) {
        active.splice(i, 1);
      }
    }

    // קודקוד הקצה הנוכחי מצטרף לפעילים (אם נוצר)
    const bestId = bestAt.get(endIdx);
    if (bestId !== undefined && active.every((n) => n.id !== bestId)) {
      active.push(nodes[bestId]!);
    }

    // אלומה: הצמתים הפעילים מוגבלים לטובים ביותר לפי המודל (ואז מזהה) —
    // גזימה נרשמת כמיצוי תקציב (§9.2: הבחירה הוכרחה).
    //
    // הגנת חזית (סוללת שלב 46): צומת החזית — הפעיל עם startTok הגדול ביותר
    // (תיקו לפי מזהה יצירה) — אינו נגזז לעולם. בתרחישי חירום שבהם כל קו
    // חוקי הוא חד־מילולי, צומת החזית הוא היחיד שיכול לפתוח את השורה הבאה
    // (קו מכל צומת מוקדם יותר הוא רב־מילילי ואינו חוקי); סדר האיכות המצטברת
    // מקרב את החזית לגזירה ראשונה דווקא בגלל שהיא "הכי הרבה שורות עד כה" —
    // בלי ההגנה נתגלה (שלב 46) מסמך שלם שחוזר עם אפס קווים למרות שקיים
    // מסלול חוקי מלא. רוחב האלומה האפקטיבי ≤ maxBeamWidth (החזית תופסת
    // מקום אחד מתוכו).
    if (active.length > budget.maxBeamWidth) {
      const sorted = active.slice().sort((a, b) => compareNodes(model, a, b, seqOf));
      let frontier: DpNode<Q> = sorted[0]!;
      for (const n of sorted) {
        if (n.startTok > frontier.startTok || (n.startTok === frontier.startTok && n.id > frontier.id)) frontier = n;
      }
      const keep = sorted.slice(0, budget.maxBeamWidth);
      if (!keep.includes(frontier)) {
        keep.pop();
        keep.push(frontier);
      }
      const removed = sorted.filter((n) => !keep.includes(n));
      for (const r of removed) {
        const i = active.indexOf(r);
        if (i >= 0) active.splice(i, 1);
        pruned += 1;
      }
      exhausted = true;
    }
    if (capped) {
      // המשך עיבוד הקצה הופסק בתקציב — ממשיכים לקצה הבא (הצמתים נותרו)
    }
  }

  // צמתי סיום: startTok === tokenCount (סוף הפסקה או אחרי forced סופי)
  const terminals: DpNode<Q>[] = [];
  for (const node of nodes) {
    if (node.id !== 0 && node.startTok >= index.tokenCount) terminals.push(node);
  }
  if (terminals.length === 0) {
    return { lines: [], best: null, rejections, dominated, budget: { generated, pruned, exhausted } };
  }
  let bestNode: DpNode<Q> = terminals[0]!;
  for (const t of terminals) {
    if (compareNodes(model, t, bestNode, seqOf) < 0) bestNode = t;
  }

  // שחזור המסלול
  const lines: DpLineChoice[] = [];
  let cur: DpNode<Q> | undefined = bestNode;
  while (cur !== undefined && cur.prev >= 0) {
    const prev: DpNode<Q> = nodes[cur.prev]!;
    const bp = points[cur.breakIdx]!;
    lines.push({
      startTok: prev.startTok,
      endTok: bp.tokenIndex,
      breakPoint: bp,
      justification: justificationOf(bp),
      candidate: buildLineCandidate(index, prev.startTok, bp),
    });
    cur = prev;
  }
  lines.reverse();
  return { lines, best: bestNode.quality, rejections, dominated, budget: { generated, pruned, exhausted } };
}

/** מזהה המועמד של השורה שנגמרה בצומת — לרישום ההדחה בפנקס. */
function candidateIdOf<Q>(node: DpNode<Q>, nodes: readonly DpNode<Q>[], points: readonly LineBreakPoint[]): string {
  if (node.prev < 0) return 'start';
  const prev = nodes[node.prev]!;
  const bp = points[node.breakIdx]!;
  return `c:${prev.startTok}:${bp.tokenIndex}`;
}

function compareNodes<Q>(model: CostModel<Q>, a: DpNode<Q>, b: DpNode<Q>, seqOf: (n: DpNode<Q>) => readonly number[]): number {
  const cmp = model.compare(a.quality, b.quality);
  if (cmp !== 0) return cmp;
  // תיקו וקטורי מלא — שובר תיקו קנוני לפי רצף אינדקסי השבירה (ADR-004 #3;
  // §8.2: "כל tie נשבר לפי רשימת break indices"); לבסוף מזהה יצירה
  const cmpSeq = compareBreakSequences(seqOf(a), seqOf(b));
  if (cmpSeq !== 0) return cmpSeq;
  return a.id - b.id;
}

/** השוואת רצפי אינדקסי שבירה — שובר התיקו הקנוני (ADR-004 #3). ציבורי לבדיקה. */
export function compareBreakSequences(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]! ? -1 : 1;
  }
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return 0;
}

/** רצף אינדקסי השבירה של המסלול עד צומת — עצל (מחושב פעם אחת ונשמר). */
function makeSequenceCache<Q>(nodes: readonly DpNode<Q>[]): (n: DpNode<Q>) => readonly number[] {
  const cache = new Map<number, readonly number[]>();
  return (n: DpNode<Q>): readonly number[] => {
    const hit = cache.get(n.id);
    if (hit !== undefined) return hit;
    const seq: number[] = [];
    let cur: DpNode<Q> | undefined = n;
    while (cur !== undefined && cur.prev >= 0) {
      seq.push(cur.breakIdx);
      cur = nodes[cur.prev]!;
    }
    seq.reverse();
    cache.set(n.id, seq);
    return seq;
  };
}
