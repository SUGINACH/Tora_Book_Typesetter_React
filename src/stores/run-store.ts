/**
 * run-store.ts — מכונת מצבי ה־job של העימוד (שלב 76; אפיון §13.1).
 *
 * "runStore — idle/preparing/running/auditing/done/error/cancelled,
 *  job id ו־input hash."
 *
 * הגנת stale-job דו־שכבתית (אפיון §12.1; הערוץ עלול להחזיר מאוחר):
 *   שכבה א — זהות ה־job: כל מעבר נושא את ה־jobId שלו; הודעה מ־job
 *   שאינו הנוכחי מתעלמת ממנה (אין דריסת תוצאה חדשה בישנה).
 *   שכבה ב — אין job חי ⇐ אין קבלה: בהיעדר job פעיל (idle או מצבי
 *   קצה) כל הודעת ערוץ (progress/done/error/cancel) נחשבת שארית —
 *   נזרקת בשקט. רק begin() פותח job, ורק כשאין job פעיל.
 *
 * ביטול: cancel() מעביר ל־cancelled **תוך שמירת ה־jobId** — כך הודעה
 * מאוחרת של אותו job עדיין מזוהה כ־stale (ולא נתפסת כטרייה). reset()
 * בלבד מנקה מזהה.
 */
import { create } from 'zustand';

export const RUN_STATES = Object.freeze(
  ['idle', 'preparing', 'running', 'auditing', 'done', 'error', 'cancelled'] as const,
);
export type RunPhase = (typeof RUN_STATES)[number];

/** מצבים שבהם job חי — רק מהם מותרים מעברי המשך. */
const ACTIVE_PHASES: ReadonlySet<RunPhase> = new Set<RunPhase>(['preparing', 'running', 'auditing']);

export interface RunProgress {
  readonly stage: string;
  readonly completedUnits: number;
  readonly totalUnits: number | null;
}

interface RunStoreState {
  readonly phase: RunPhase;
  readonly jobId: string | null;
  readonly inputHash: string | null;
  readonly progress: Readonly<RunProgress> | null;
  readonly errorCode: string | null;
  /** פתיחת job חדש — המעבר היחיד מ־idle. */
  begin(jobId: string, inputHash: string): void;
  markRunning(jobId: string): void;
  markAuditing(jobId: string): void;
  setProgress(jobId: string, stage: string, completedUnits: number, totalUnits?: number): void;
  complete(jobId: string): void;
  fail(jobId: string, errorCode: string): void;
  cancel(jobId: string): void;
  /** ניקוי מלא — גם המזהה (בין מסמכים). */
  reset(): void;
}

const isStaleJob = (state: RunStoreState, jobId: string): boolean =>
  state.jobId !== null && state.jobId !== jobId;

export const useRunStore = create<RunStoreState>()((set) => ({
  phase: 'idle',
  jobId: null,
  inputHash: null,
  progress: null,
  errorCode: null,

  begin: (jobId, inputHash) =>
    set((state) => {
      // job חדש נפתח רק כשאין job חי (preparing/running/auditing) — פתיחה
      // מעל job פעיל היא באג מהלך ונדחית (ה־host אחראי לבטל קודם;
      // supersede ב־WorkerClient). ממצבי קצה (idle/done/error/cancelled)
      // אין job פעיל — פתיחה חופשית בלי reset מפורש.
      if (ACTIVE_PHASES.has(state.phase)) return state;
      return { ...state, phase: 'preparing', jobId, inputHash, progress: null, errorCode: null };
    }),

  markRunning: (jobId) =>
    set((state) => {
      if (isStaleJob(state, jobId) || state.phase !== 'preparing') return state;
      return { ...state, phase: 'running' };
    }),

  markAuditing: (jobId) =>
    set((state) => {
      if (isStaleJob(state, jobId) || state.phase !== 'running') return state;
      return { ...state, phase: 'auditing' };
    }),

  setProgress: (jobId, stage, completedUnits, totalUnits) =>
    set((state) => {
      // שכבה א + שכבה ב: job זר, או אין job חי כלל — שארית.
      if (state.phase === 'idle' || !ACTIVE_PHASES.has(state.phase)) return state;
      if (isStaleJob(state, jobId)) return state;
      return {
        ...state,
        progress: Object.freeze({ stage, completedUnits, totalUnits: totalUnits ?? null }),
      };
    }),

  complete: (jobId) =>
    set((state) => {
      if (isStaleJob(state, jobId) || state.phase !== 'auditing') return state;
      // המזהה נשמר במכוון: done מאוחר/כפול של אותו job ייזרק כ־stale-ish.
      return { ...state, phase: 'done', progress: null };
    }),

  fail: (jobId, errorCode) =>
    set((state) => {
      if (state.phase === 'idle' || !ACTIVE_PHASES.has(state.phase)) return state;
      if (isStaleJob(state, jobId)) return state;
      return { ...state, phase: 'error', errorCode, progress: null };
    }),

  cancel: (jobId) =>
    set((state) => {
      if (state.phase === 'idle' || !ACTIVE_PHASES.has(state.phase)) return state;
      if (isStaleJob(state, jobId)) return state;
      // jobId נשמר — ראה כותרת הקובץ.
      return { ...state, phase: 'cancelled', progress: null };
    }),

  reset: () =>
    set({
      phase: 'idle',
      jobId: null,
      inputHash: null,
      progress: null,
      errorCode: null,
    }),
}));
