/**
 * search.ts — חיפוש חסום ודטרמיניסטי לעמודים (שלב 51; פרק ז/M6; ADR-010).
 *
 * אסמכתא: אפיון §9.2 (חיפוש חסום: DP/beam לפי אזור עימוד; תקציב במצבים
 * לא בזמן; גזימה לפי comparator ואז stateHash; טבלת המרה; מיצוי —
 * fallback מפורש SEARCH_BUDGET_EXHAUSTED; אין מועמד חוקי — כשל מפורש),
 * §6.7 (SearchBudget; אין budget במילישניות), §6.6 (QualityVector; ADR-004).
 *
 * עקרונות (שער השלב: "בחירת עמוד מוסברת ומוגבלת"):
 *   1. הליבה אינה מייצרת מועמדים — מקור מוזרק (PageCandidateSource;
 *      המחולל האמיתי בשלב 52). החיפוש: אלומה על צמתי PaginationState
 *      (שלב 49), הרחבה, גזימה מתועדת, טבלת המרה לפי stateHash.
 *   2. מבנה האלומה: כל צומת מורחב **פעם אחת** ויוצא מהחזית; צומת
 *      שהגיע לקצה המסמך (אין לו הרחבות) עובר לקבוצת הסופיים ונשאר
 *      מועמד לבחירה הסופית. החזית מכילה רק צמתים שטרם הורחבו.
 *   3. דטרמיניזם מלא: סדר הצמתים נקבע לפי (ווקטור איכות לקסיקוגרפי,
 *      stateHash, מספר יצירה) — לעולם לא זמן, לא cache, לא אקראיות
 *      (§9.2: "אין שימוש ב-random beam").
 *   4. הפנקס מתעד הכל (§9.2: "ledger לכל expansion/rejection/pruning"):
 *      לכל הרחבה שהתקבלה — רשומת קבלה; לכל דחיית טבלת-המרה — רשומת
 *      dominated עם המודח והמודח; לכל גזימת חסד-מועמדים וגזימת אלומה —
 *      רשומות עם קודי הסיבה; מיצוי — רשומת fallback מפורשת.
 *   5. מיצוי תקציב: נבחר החוקי הטוב ביותר רק אם המדיניות מאפשרת, והרשומה
 *      נושאת fallbackCode SEARCH_BUDGET_EXHAUSTED — לא הצלחה שקטה. אין
 *      מועמד חוקי — חריגה מקוטלגת מפורשת.
 */
import { type DecisionLedgerBuilder, type SearchBudget, sha256Hex } from '@tora/layout-api';
import { LayoutEngineError } from '../errors.js';
import type { PaginationState, PaginationTransition } from './state.js';

// ─────────────────────────── וקטור איכות עמודים ───────────────────────────

/**
 * וקטור איכות מסלול עמודים — הטלה של ADR-004 להיקף העמוד (הרכיבים
 * מתעוררים בהדרגה: M6 מפעיל את 3 (noteDisplacement), 8 (columnImbalance),
 * 9 (pageCountDebt); השאר נשמרים כמסגרת קבועה כדי שסדר ההשוואה לא ישתנה
 * בשקט). השוואה לקסיקוגרפית; חיבור מרכיב-מרכיב חוקי (ADR-004 §2).
 */
export type PageQualityVector = readonly number[];

/** דרישת אורך קבועה — וקטורים באורך שונה אינם ניתנים להשוואה. */
export const PAGE_QUALITY_LENGTH = 9;

/** השוואה לקסיקוגרפית של וקטורי איכות — ‎-1|0|1‎; אורך שגוי ⇒ שגיאה מקוטלגת. */
export function comparePageQuality(a: PageQualityVector, b: PageQualityVector): -1 | 0 | 1 {
  if (a.length !== PAGE_QUALITY_LENGTH || b.length !== PAGE_QUALITY_LENGTH) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'quality-compare', reason: `length ${String(a.length)}/${String(b.length)} != ${String(PAGE_QUALITY_LENGTH)}` }, 'וקטור איכות עמודים באורך שגוי');
  }
  for (let i = 0; i < PAGE_QUALITY_LENGTH; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

/** סקלר תצוגה לפנקס בלבד (ADR-004: ההשוואה האמיתית היא הווקטור). */
export function pageQualityDisplayScalar(q: PageQualityVector): number {
  let s = 0;
  let scale = 1;
  for (let i = PAGE_QUALITY_LENGTH - 1; i >= 0; i--) {
    s += Math.max(0, Math.min(1024, q[i]!)) * scale;
    scale *= 1025;
  }
  return s;
}

/** חיבור וקטורים מרכיב-מרכיב (חוקי ללקסיקוגרפי; ADR-004). */
function addQuality(a: PageQualityVector, b: PageQualityVector): PageQualityVector {
  const out = new Array<number>(PAGE_QUALITY_LENGTH);
  for (let i = 0; i < PAGE_QUALITY_LENGTH; i++) out[i] = a[i]! + b[i]!;
  return Object.freeze(out);
}

export const ZERO_PAGE_QUALITY: PageQualityVector = Object.freeze(new Array<number>(PAGE_QUALITY_LENGTH).fill(0));

// ─────────────────────────── מקור מועמדים ───────────────────────────

/**
 * הרחבה ממצב עימוד — מועמד עמוד/טור/מילוי שהמקור (שלב 52) מציע.
 * ההרחבה נושאת את שרשרת המעברים של שלב 49 — "כל candidate מסביר את
 * המצב שממנו ואליו הגיע" (שער שלב 49), ואת האיכות האינקרמנטלית שלה.
 */
export interface PageExpansion {
  /** מזהה קנוני — קבוע לאותו מצב ואותה פעולה (קבוע לתיקו). */
  readonly candidateId: string;
  /** קבוצת המעברים שמביאה מהמצב הנוכחי אל המצב הבא (רשומות שלב 49). */
  readonly transitions: readonly PaginationTransition[];
  /** המצב שאליו מגיעים (קפוא, hash מחושב). */
  readonly toState: PaginationState;
  /** האיכות האינקרמנטלית של הרחבה זו (מצטברת בצומת הבן). */
  readonly quality: PageQualityVector;
  /**
   * אזור העימוד נסגר בהרחבה זו (H0/H1/H2 או barrier מוגדר; §9.2) —
   * המצב נישא לאזור הבא כמו שהוא; הסגירה נרשמת בפנקס.
   */
  readonly closesRegion: boolean;
}

/**
 * מקור מועמדי העמודים — מוזרק לחיפוש. חוזה: **טהור ודטרמיניסטי** —
 * אותו מצב ⇐ אותם מועמדים באותו סדר, תמיד; מועמד לא חוקי כלל אינו
 * מוחזר (הפסילה באחריות המקור, שלב 52 — "אין עמוד זול שאינו חוקי");
 * סוף מסמך = מערך ריק מכל צומת שהתוכן בו הסתיים.
 */
export interface PageCandidateSource {
  expansions(state: PaginationState): readonly PageExpansion[];
}

// ─────────────────────────── תוצאה ───────────────────────────

export type PageSearchStatus = 'complete' | 'budget-exhausted';

export interface PageSearchResult {
  readonly status: PageSearchStatus;
  /** המסלול שנבחר — הרחבות לפי הסדר. */
  readonly path: readonly PageExpansion[];
  /** המצב הסופי של המסלול. */
  readonly finalState: PaginationState;
  readonly quality: PageQualityVector;
  /** מלאי התקציב שנצרך (ADR-010 §7). */
  readonly budget: Readonly<{ generated: number; pruned: number; dominated: number; exhausted: boolean }>;
  /** אינדקסי ההרחבות שסגרו אזור עימוד (H0/H1/H2/barrier). */
  readonly regionClosures: readonly number[];
}

// ─────────────────────────── ברירת מחדל (ADR-010 §3) ───────────────────────────

/**
 * ברירת מחדל לחיפוש עמודים — נפרדת משבירת השורות (ADR-010 §3): צומת
 * עמוד מייצר מעט הרחבות אך כל הרחבה יקרה (הצבה מלאה של קווים).
 */
export const DEFAULT_PAGE_SEARCH_BUDGET: Readonly<SearchBudget> = Object.freeze({
  maxCandidatesPerState: 64,
  maxBeamWidth: 8,
  maxExpandedStates: 100_000,
  maxOuterIterations: 8,
});

// ─────────────────────────── צומת חזית וסדר קנוני ───────────────────────────

interface SearchNode {
  readonly state: PaginationState;
  readonly quality: PageQualityVector;
  readonly path: readonly PageExpansion[];
  readonly creationIndex: number;
}

/**
 * סדר קנוני בין צמתים: וקטור (לקסיקוגרפי) ⇒ stateHash ⇒ מספר יצירה
 * (§9.2: "pruning לפי comparator ולאחריו stateHash/candidate.id").
 */
function compareSearchNodes(a: SearchNode, b: SearchNode): -1 | 0 | 1 {
  const q = comparePageQuality(a.quality, b.quality);
  if (q !== 0) return q;
  if (a.state.stateHash < b.state.stateHash) return -1;
  if (a.state.stateHash > b.state.stateHash) return 1;
  if (a.creationIndex < b.creationIndex) return -1;
  if (a.creationIndex > b.creationIndex) return 1;
  return 0;
}

// ─────────────────────────── החיפוש ───────────────────────────

export interface PageSearchOptions {
  readonly budget?: SearchBudget;
  /**
   * האם המדיניות מאפשרת בחירת החוקי הטוב ביותר במיצוי תקציב (§9.2).
   * ברירת מחדל: true — אבל הרשומה נושאת SEARCH_BUDGET_EXHAUSTED והתוצאה
   * מסומנת budget-exhausted (לעולם לא הצלחה שקטה).
   */
  readonly allowBudgetExhaustedFallback?: boolean;
}

/**
 * חיפוש העמודים — אלומה דטרמיניסטית על צמתי PaginationState (ADR-010).
 *
 * המהלך: החזית מתחילה מהמצב ההתחלתי; בכל סבב מורחבים הצמתים לפי הסדר
 * הקנוני (הטובים תחילה) — כל צומת מורחב **פעם אחת** ויוצא מהחזית;
 * צומת שאין לו הרחבות (קצה המסמך) עובר לקבוצת הסופיים. כל הרחבה
 * נבדקת בטבלת ההמרה (stateHash שנראה באיכות טובה/שווה ⇒ dominated,
 * נרשם), הילדים מצטרפים לחזית והחזית נגזמת לרוחב האלומה לפי הסדר
 * הקנוני — הכל נרשם. החיפוש מסתיים כשהחזית מתרוקנת (complete —
 * הזוכה מבין הסופיים לפי הסדר הקנוני), או במיצוי התקציב (fallback
 * מפורש עם SEARCH_BUDGET_EXHAUSTED; אסור במדיניות או אין כלל מועמד —
 * כשל מפורש מקוטלג).
 */
export function searchPages(
  initial: PaginationState,
  source: PageCandidateSource,
  ledger: DecisionLedgerBuilder,
  options: PageSearchOptions = {},
): PageSearchResult {
  const budget = options.budget ?? DEFAULT_PAGE_SEARCH_BUDGET;
  const allowFallback = options.allowBudgetExhaustedFallback !== false;
  let generated = 0;
  let pruned = 0;
  let dominated = 0;
  let expanded = 0;
  let creationSeq = 0;

  // טבלת המרה: stateHash ⇒ (איכות מצטברת, מזהה המועמד שהכניס את המצב)
  const transposition = new Map<string, { quality: PageQualityVector; candidateId: string }>();
  let frontier: SearchNode[] = [
    { state: initial, quality: ZERO_PAGE_QUALITY, path: [], creationIndex: creationSeq++ },
  ];
  const finished: SearchNode[] = [];
  transposition.set(initial.stateHash, { quality: ZERO_PAGE_QUALITY, candidateId: '@initial' });

  const budgetOf = (exhaustedFlag: boolean) => ({ generated, pruned, dominated, exhausted: exhaustedFlag });

  while (frontier.length > 0) {
    if (expanded >= budget.maxExpandedStates) {
      // מיצוי תקציב — fallback מפורש (§9.2): החוקי הטוב ביותר מבין
      // הסופיים והחזית רק אם המדיניות מאפשרת; אחרת — כשל מפורש.
      const candidates = [...finished, ...frontier].sort(compareSearchNodes);
      const winner = candidates[0];
      const winnerId = winner !== undefined ? `node:${winner.creationIndex}` : '@none';
      ledger.append({
        stage: 'page-break',
        scopeId: 'search:budget-exhausted',
        sourceSpans: [],
        stateHash: winner !== undefined ? winner.state.stateHash : initial.stateHash,
        candidates: winner !== undefined ? [{ id: winnerId, cost: pageQualityDisplayScalar(winner.quality) }] : [],
        selectedCandidateId: allowFallback ? winnerId : 'none',
        rejected: candidates.slice(1).map((n) => ({ candidateId: `node:${n.creationIndex}`, reason: 'dominated-by-comparator' })),
        ...(allowFallback ? { fallbackCode: 'SEARCH_BUDGET_EXHAUSTED' as const } : {}),
        budget: budgetOf(true),
      });
      if (winner === undefined || !allowFallback) {
        // אין מועמד חוקי — כשל מפורש (§9.2); אין "תוצאה חלקית כאילו הייתה מלאה"
        throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'page-search', reason: allowFallback ? 'no-legal-candidate' : 'budget-fallback-forbidden' }, 'מיצוי תקציב החיפוש ללא מועמד חוקי מותר — כשל מפורש (§9.2)');
      }
      return {
        status: 'budget-exhausted',
        path: winner.path,
        finalState: winner.state,
        quality: winner.quality,
        budget: budgetOf(true),
        regionClosures: winner.path.map((e, i) => (e.closesRegion ? i : -1)).filter((i) => i >= 0),
      };
    }

    // סבב הרחבה: הטובים תחילה (סדר קנוני); כל צומת מורחב פעם אחת
    const round = [...frontier].sort(compareSearchNodes);
    const next: SearchNode[] = [];
    for (const node of round) {
      const exps = source.expansions(node.state);
      generated += exps.length;
      if (exps.length === 0) {
        // קצה המסמך — הצומת עובר לסופיים ונשאר מועמד לבחירה הסופית
        finished.push(node);
        continue;
      }
      if (expanded >= budget.maxExpandedStates) break;
      const capped = exps.length > budget.maxCandidatesPerState;
      const candidates = capped ? exps.slice(0, budget.maxCandidatesPerState) : exps;
      if (capped) {
        pruned += exps.length - candidates.length;
        ledger.append({
          stage: 'page-break',
          scopeId: `search:cap:${node.state.stateHash.slice(0, 12)}`,
          sourceSpans: [],
          stateHash: node.state.stateHash,
          candidates: candidates.map((c) => ({ id: c.candidateId, cost: pageQualityDisplayScalar(c.quality) })),
          selectedCandidateId: candidates[0]!.candidateId,
          rejected: exps.slice(budget.maxCandidatesPerState).map((c) => ({ candidateId: c.candidateId, reason: 'candidate-cap-pruned' })),
          budget: budgetOf(false),
        });
      }
      for (const exp of candidates) {
        expanded += 1;
        const childQuality = addQuality(node.quality, exp.quality);
        const seen = transposition.get(exp.toState.stateHash);
        if (seen !== undefined && comparePageQuality(childQuality, seen.quality) >= 0) {
          // טבלת ההמרה: המצב כבר נראה באיכות טובה או שווה — מודח, נרשם
          dominated += 1;
          ledger.append({
            stage: 'page-break',
            scopeId: `search:dom:${exp.toState.stateHash.slice(0, 12)}`,
            sourceSpans: [],
            stateHash: exp.toState.stateHash,
            candidates: [
              { id: seen.candidateId, cost: pageQualityDisplayScalar(seen.quality) },
              { id: exp.candidateId, cost: pageQualityDisplayScalar(childQuality) },
            ],
            selectedCandidateId: seen.candidateId,
            rejected: [{ candidateId: exp.candidateId, reason: 'transposition-dominated' }],
          });
          continue;
        }
        transposition.set(exp.toState.stateHash, { quality: childQuality, candidateId: exp.candidateId });
        next.push({
          state: exp.toState,
          quality: childQuality,
          path: [...node.path, exp],
          creationIndex: creationSeq++,
        });
        // רשומת קבלה — "ledger לכל expansion" (§9.2); סגירת אזור מסומנת
        ledger.append({
          stage: 'page-break',
          scopeId: exp.closesRegion ? `search:region:${exp.toState.stateHash.slice(0, 12)}` : `search:exp:${exp.toState.stateHash.slice(0, 12)}`,
          sourceSpans: [],
          stateHash: exp.toState.stateHash,
          candidates: [{ id: exp.candidateId, cost: pageQualityDisplayScalar(childQuality) }],
          selectedCandidateId: exp.candidateId,
          rejected: [],
        });
      }
    }

    // גזימת האלומה: שמירת maxBeamWidth הטובים; השאר נרשמים
    next.sort(compareSearchNodes);
    if (next.length > budget.maxBeamWidth) {
      const cut = next.slice(budget.maxBeamWidth);
      pruned += cut.length;
      ledger.append({
        stage: 'page-break',
        scopeId: `search:beam:${budget.maxBeamWidth}`,
        sourceSpans: [],
        stateHash: sha256Hex(next.slice(0, budget.maxBeamWidth).map((n) => n.state.stateHash).join(',')),
        candidates: next.slice(0, budget.maxBeamWidth).map((n) => ({ id: `node:${n.creationIndex}`, cost: pageQualityDisplayScalar(n.quality) })),
        selectedCandidateId: `node:${next[0]!.creationIndex}`,
        rejected: cut.map((n) => ({ candidateId: `node:${n.creationIndex}`, reason: 'beam-pruned' })),
        budget: budgetOf(false),
      });
      frontier = next.slice(0, budget.maxBeamWidth);
    } else {
      frontier = next;
    }
  }

  // החזית התרוקנה — כל המסלולים הגיעו לקצה; הזוכה לפי הסדר הקנוני
  const candidates = [...finished].sort(compareSearchNodes);
  const winner = candidates[0];
  if (winner === undefined) {
    // מקור שאינו מסתיים לעולם (מעגל) — כשל מפורש; לא תוצאה שקטה
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'page-search', reason: 'no-terminal-state' }, 'מקור המועמדים אינו מסתיים — אין מצב סופי חוקי (§9.2)');
  }
  return {
    status: 'complete',
    path: winner.path,
    finalState: winner.state,
    quality: winner.quality,
    budget: budgetOf(false),
    regionClosures: winner.path.map((e, i) => (e.closesRegion ? i : -1)).filter((i) => i >= 0),
  };
}
