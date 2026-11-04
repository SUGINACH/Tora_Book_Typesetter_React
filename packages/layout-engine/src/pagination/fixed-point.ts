/**
 * fixed-point.ts — נקודת השבת החוץ (outer fixed-point) — שלב 71; ADR-011; אפיון §11.1, §11.4; M8.
 *
 * "typeset → עדכון anchors → typeset חוזר עד hashes יציבים; סדר עדכון קבוע
 * ותלות מתועדת" (תכנית 71): הרץ הזה מניע את הלולאה החיצונית סביב העימוד
 * עצמו. המנוע עצמו נשאר טהור — הרץ מקבל **פונקציית צעד** (פועלת עימוד
 * מלא: גוף עם offset ה-front-matter ← זרם endnotes ← AnchorTable ← ערכי
 * TOC מהמדיניות ← זרימת TOC) ומחזיר את וקטור המשוב שלה. אין כאן
 * pageEstimate — הערכים מגיעים מהתוצאה בפועל (§11.1; שלב 70).
 *
 * סדר העדכון הקבוע (ADR-011 §3 — תלות מתועדת; שינוי סדר = שינוי חתימות):
 *   1. `endnote-mapping` — layoutEndnoteFlow(bodyPageCount = front-matter + גוף)
 *   2. `anchor-mapping`  — anchorMappingHash(AnchorTable) — כותרות מהמסלול
 *      (מוזזים ב-front-matter) + הערות מ-anchorReport של הזרם
 *   3. `toc-mapping`     — layoutTocFlow(...).mappingHash — הצבות שורות ה-TOC
 * הווקטור נבנה תמיד בסדר הזה (FIXED_POINT_SIGNALS) — דטרמיניזם מלא.
 *
 * מדיניות oscillation (ADR-011; "זיהוי מחזור, budget, TOC_FIXED_POINT_NOT_REACHED,
 * דוח מצב וכשל מפורש"): הרץ אינו לולאה בלתי־חסומה לעולם —
 *   • **התייצבות** — וקטור המשוב זהה לקודמו ⇒ נקודת שבת; המצב מוחזר.
 *   • **מחזור** — וקטור שנראה כבר באיטרציה קודמת (אך שונה מהקודם) ⇒
 *     oscillation מזוהה: אורך המחזור ואיטרציית ההתחלה נרשמים בדוח.
 *   • **תקציב** — maxIterations (ברירת מחדל 8; חייב ≥ 2) נוגע בלי התייצבות
 *     ובלי מחזור (סחיפה מונוטונית) ⇒ ניצול תקציב.
 * שלושתם נכנסים לדוח המצב (FixedPointStatusReport) עם hash קנוני; הקריאה
 * במסלוך release חייבת להיכשל מפורשות כשלא התייצב — requireFixedPoint
 * זורק TOC_FIXED_POINT_NOT_REACHED (לא ריצה אילמת ולא ערך עמוד סטייל).
 */
import { canonicalJson, sha256Hex } from '@tora/layout-api';
import { LayoutEngineError } from '../errors.js';

// ─────────────────────────── משוב ───────────────────────────

/**
 * אותות המשוב של נקודת השבת — בסדר העדכון הקבוע (ADR-011 §3).
 * כל אות הוא hash קנוני של מיפוי מהתוצאה בפועל; שינוי בעמוד אחד
 * (כותרת/הערה/שורת TOC) משנה את הווקטור כולו.
 */
export const FIXED_POINT_SIGNALS = Object.freeze(['endnote-mapping', 'anchor-mapping', 'toc-mapping'] as const);

/** שם אות משוב חוקי (מהרשימה הקבועה). */
export type FixedPointSignalName = (typeof FIXED_POINT_SIGNALS)[number];

/** תוצאת צעד אחד של הלולאה — מצב הבא + וקטור המשוב שנצפה. */
export interface FixedPointStepResult<S> {
  readonly state: S;
  /** אות ⇒ hash קנוני; חייב לכסות בדיוק את האותות הצפויים (ר' options.signals). */
  readonly feedback: Readonly<Record<string, string>>;
}

/**
 * פונקציית הצעד — הלולאה החיצונית של העימוד. טהורה ודטרמיניסטית:
 * אותו מצב ⇒ אותה תוצאה; אין אקראיות, שעון או זיכרון בין קריאות.
 * iteration הוא מספר האיטרציה (1-based) — לדיווח בלבד.
 */
export type FixedPointStep<S> = (state: S, iteration: number) => FixedPointStepResult<S>;

// ─────────────────────────── אפשרויות ודוח ───────────────────────────

export interface FixedPointOptions {
  /**
   * תקציב האיטרציות — חסם עליון קשיח (ADR-011 §5). שלם ≥ 2 ו-≤ 1000;
   * ברירת מחדל 8 (TOC מתכנס בפועל ב-2–3 איטרציות; 8 נותן שוליים).
   */
  readonly maxIterations?: number;
  /**
   * האותות הצפויים בווקטור המשוב — חייבים להיות מוכרים מ-FIXED_POINT_SIGNALS
   * (הסדר ברשימה הוא סדר הבניית הווקטור). ברירת מחדל: כולם.
   */
  readonly signals?: readonly FixedPointSignalName[];
}

/** תוצאת הלולאה: converged (התייצב) | oscillation (מחזור) | budget-exceeded (תקציב). */
export type FixedPointOutcome = 'converged' | 'oscillation' | 'budget-exceeded';

/** רשומת איטרציה אחת בדוח המצב. */
export interface FixedPointIterationInfo {
  /** מספר האיטרציה (1-based). */
  readonly iteration: number;
  /** וקטור המשוב שנצפה (בסדר האותות). */
  readonly feedback: Readonly<Record<string, string>>;
  /** האם זהה לקודמת (false באיטרציה הראשונה — אין קודמת). */
  readonly stable: boolean;
}

/** דוח המצב — מתועד, סריאליזבילי וקנוני (reportHash). */
export interface FixedPointStatusReport {
  readonly schemaVersion: 1;
  readonly kind: 'fixed-point-report';
  readonly outcome: FixedPointOutcome;
  /** מספר האיטרציות שרצו (כולל זו שהכריעה). */
  readonly iterations: number;
  readonly maxIterations: number;
  readonly signals: readonly string[];
  readonly history: readonly FixedPointIterationInfo[];
  /** במחזור: אורך המחזור והאיטרציה שבה נראה הווקטור בפעם הראשונה. */
  readonly cycle?: { readonly length: number; readonly firstIteration: number };
  /** הסבר קצר לכישלון (רק כשאין התייצבות). */
  readonly reason?: string;
}

export interface FixedPointResult<S> {
  /** האם הלולאה התייצבה (וקטור זהה לקודמו בתוך התקציב). */
  readonly converged: boolean;
  readonly iterations: number;
  /** המצב האחרון שהוחזר מהצעד (בהתייצבות — מצב נקודת השבת). */
  readonly state: S;
  /** וקטור המשוב האחרון (בהתייצבות — הווקטור היציב). */
  readonly feedback: Readonly<Record<string, string>>;
  readonly report: FixedPointStatusReport;
  /** hash קנוני של דוח המצב — לפנקס ול-audit. */
  readonly reportHash: string;
}

// ─────────────────────────── עזרי ולידציה ───────────────────────────

const DEFAULT_MAX_ITERATIONS = 8;
const HARD_MAX_ITERATIONS = 1000;
const HEX64 = /^[0-9a-f]{64}$/;

function isSignalName(v: unknown): v is FixedPointSignalName {
  return typeof v === 'string' && (FIXED_POINT_SIGNALS as readonly string[]).includes(v);
}

/** וקטור המשוב כמחרוזת קנונית לפי סדר האותות — מפתח זיהוי המחזור. */
function feedbackVector(feedback: Readonly<Record<string, string>>, signals: readonly string[]): string {
  return canonicalJson({ v: 1, kind: 'fixed-point-vector', signals: signals.map((s) => ({ s, h: feedback[s] ?? null })) });
}

/** ולידציה של וקטור משוב — כל אות צפוי קיים והוא hash הקס הקנוני; אין אותות זרים. */
function feedbackIssues(feedback: unknown, signals: readonly string[]): string[] {
  const issues: string[] = [];
  if (typeof feedback !== 'object' || feedback === null) return ['not-an-object'];
  const v = feedback as Record<string, unknown>;
  for (const s of signals) {
    const h = v[s];
    if (typeof h !== 'string' || !HEX64.test(h)) issues.push(`${s}:${typeof h === 'string' ? 'not-hash' : 'missing'}`);
  }
  for (const key of Object.keys(v)) {
    if (!signals.includes(key)) issues.push(`unexpected:${key}`);
  }
  return issues;
}

// ─────────────────────────── הרץ ───────────────────────────

/**
 * הלולאה החיצונית: מריץ את הצעד מהמצב ההתחלתי עד נקודת שבת — וקטור משוב
 * זהה לקודמיו — או עד כישלון מזוהה (מחזור/תקציב). לעולם לא רצה יותר
 * מ-maxIterations קריאות צעד; כל חריגת חוזה של הצעד נזרקת מיד.
 *
 * בכשל אין השלמה שקטה: התוצאה נושאת converged=false + דוח מצב מלא;
 * מסלוך release חייב להפוך זאת לכשל מפורש (requireFixedPoint).
 */
export function runOuterFixedPoint<S>(
  initial: S,
  step: FixedPointStep<S>,
  options: FixedPointOptions = {},
): FixedPointResult<S> {
  if (typeof step !== 'function') {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'fixed-point', reason: 'step is not a function' }, 'פונקציית הצעד של נקודת השבת חסרה');
  }
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 2 || maxIterations > HARD_MAX_ITERATIONS) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'fixed-point', reason: `maxIterations=${String(maxIterations)}` }, 'תקציב איטרציות של נקודת השבת חייב שלם בין 2 ל-1000');
  }
  let signals: readonly string[] = FIXED_POINT_SIGNALS;
  if (options.signals !== undefined) {
    if (!Array.isArray(options.signals) || options.signals.length === 0 || new Set(options.signals).size !== options.signals.length || !options.signals.every(isSignalName)) {
      throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'fixed-point', reason: 'signals' }, 'רשימת אותות משוב שגויה — חייבת רשימה לא-ריקה של שמות מוכרים ללא כפילויות');
    }
    signals = Object.freeze([...options.signals]);
  }

  const history: FixedPointIterationInfo[] = [];
  const seen = new Map<string, number>();
  let state = initial;
  let prevVector: string | null = null;
  let lastFeedback: Readonly<Record<string, string>> = {};

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    const r = step(state, iteration);
    const issues = feedbackIssues(r?.feedback, signals);
    if (issues.length > 0) {
      throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'fixed-point', reason: `iteration ${iteration}: ${issues.join(';')}` }, `וקטור משוב שגוי באיטרציה ${iteration}: ${issues.join(';')}`);
    }
    state = r.state;
    lastFeedback = r.feedback;
    const vector = feedbackVector(r.feedback, signals);
    const stable = prevVector !== null && vector === prevVector;
    history.push(Object.freeze({ iteration, feedback: Object.freeze({ ...r.feedback }), stable }));
    if (stable) {
      return finalize('converged', state, lastFeedback, {
        schemaVersion: 1, kind: 'fixed-point-report', outcome: 'converged', iterations: iteration,
        maxIterations, signals, history: Object.freeze(history),
      });
    }
    const firstSeen = seen.get(vector);
    if (firstSeen !== undefined) {
      // מחזור: הווקטור נראה בעבר (ושונה מהקודם — אחרת היה stable) — oscillation
      return finalize('oscillation', state, lastFeedback, {
        schemaVersion: 1, kind: 'fixed-point-report', outcome: 'oscillation', iterations: iteration,
        maxIterations, signals, history: Object.freeze(history),
        cycle: Object.freeze({ length: iteration - firstSeen, firstIteration: firstSeen }),
        reason: `oscillation: cycle of length ${iteration - firstSeen} detected (vector first seen at iteration ${firstSeen})`,
      });
    }
    seen.set(vector, iteration);
    prevVector = vector;
  }
  // תקציב נוגע בלי התייצבות ובלי מחזור — סחיפה מונוטונית או התכנסות איטית מדי
  return finalize('budget-exceeded', state, lastFeedback, {
    schemaVersion: 1, kind: 'fixed-point-report', outcome: 'budget-exceeded', iterations: maxIterations,
    maxIterations, signals, history: Object.freeze(history),
    reason: `budget: ${maxIterations} iterations exhausted without stabilization`,
  });
}

function finalize<S>(
  outcome: FixedPointOutcome,
  state: S,
  feedback: Readonly<Record<string, string>>,
  report: FixedPointStatusReport,
): FixedPointResult<S> {
  const frozen: FixedPointStatusReport = Object.freeze({ ...report, history: Object.freeze([...report.history]) });
  return Object.freeze({
    converged: outcome === 'converged',
    iterations: frozen.iterations,
    state,
    feedback: Object.freeze({ ...feedback }),
    report: frozen,
    reportHash: sha256Hex(canonicalJson(frozen as unknown as Record<string, unknown>)),
  });
}

/**
 * כשל מפורש כשנקודת השבת לא הושגה — מסלך release (ADR-011 §6): אין החזרת
 * תוצאה "כמעט-יציבה" ואין ערך עמוד סטייל; הדוח המלא נכנס להודעה.
 */
export function requireFixedPoint<S>(result: FixedPointResult<S>): FixedPointResult<S> {
  if (result.converged) return result;
  const r = result.report;
  const cycle = r.cycle === undefined ? '' : ` (cycle length ${r.cycle.length} from iteration ${r.cycle.firstIteration})`;
  throw new LayoutEngineError(
    'errors.engine.TOC_FIXED_POINT_NOT_REACHED',
    { iterations: r.iterations, reason: r.reason ?? r.outcome },
    `נקודת השבת לא הושגה לאחר ${r.iterations} איטרציות${cycle} — ${r.reason ?? r.outcome}; דוח: ${result.reportHash}`,
  );
}

/** hash קנוני של דוח מצב (לבדיקת דטרמיניזם ולנעילת artifacts). */
export function fixedPointReportHash(report: FixedPointStatusReport): string {
  return sha256Hex(canonicalJson(report as unknown as Record<string, unknown>));
}
