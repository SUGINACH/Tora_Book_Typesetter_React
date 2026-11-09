/**
 * worker-client.ts — WorkerClient בצד ה-main thread (שלב 35; אפיון §12.1).
 *
 * חוקי היסוד (§12.1):
 *   1. אין שליחת raw error.message ל-UI — שגיאה מגיעה כמפתח i18n + params.
 *   2. job ישן שנגמר אחרי submit חדש נזרק לפי jobId/inputHash.
 *   3. אין fallback אוטומטי לריצה סינכרונית ב-main thread — אין כאן
 *      typeset בכלל; הלקוח רק מעביר הודעות.
 *   4. ביטול job אינו משנה את תוצאת job הבא (§17.2#10) — אין מצב משותף.
 *
 * ה-Worker האמיתי מופשט ב-WorkerLike (postMessage + onMessage) — בדיקות
 * מזריקות ערוץ מזויף; בדפדפן זה ה-Worker הסטנדרטי (worker-entry כורך).
 */
import { ENGINE_VERSION as ENGINE_VERSION_OF } from '@tora/layout-engine';
import { inputHashOf, type TypesetRequest } from '@tora/layout-api';
import {
  isWorkerResponse,
  WORKER_PROTOCOL_VERSION,
  type PreparePayload,
  type SerializedTypesetResult,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol.js';

/** הערוץ אל ה-Worker — הפשטה של Worker סטנדרטי. */
export interface WorkerLike {
  postMessage(msg: WorkerRequest): void;
  onMessage(handler: (msg: WorkerResponse) => void): void;
}

/** שגיאת job שבוטל — לא כישלון מנוע; ה-UI מציג את התוצאה הבאה בלבד. */
export class WorkerJobCancelled extends Error {
  constructor(readonly jobId: string) {
    super(`job cancelled: ${jobId}`);
    this.name = 'WorkerJobCancelled';
  }
}

/** שגיאת מנוע שעברה את הערוץ — מפתח קטלוגי + params, לא message גולמי (§12.1). */
export class WorkerTypesetError extends Error {
  constructor(readonly jobId: string, readonly errorCode: string, readonly params: Readonly<Record<string, string | number | boolean | null>>) {
    super(`${errorCode} ${JSON.stringify(params)}`);
    this.name = 'WorkerTypesetError';
  }
}

/** שגיאת ערוץ — הודעה שאינה עומדת בפרוטוקול. */
export class WorkerProtocolError extends Error {
  constructor(readonly raw: unknown) {
    super('worker protocol violation');
    this.name = 'WorkerProtocolError';
  }
}

export interface JobHandle {
  readonly jobId: string;
  readonly done: Promise<SerializedTypesetResult>;
  onProgress(cb: (stage: string, completedUnits: number, totalUnits?: number) => void): void;
  /** ביטול — מסמן את ה-job; תוצאה מאוחרת תיזרק (ההבטחה תידחה כבוטלת). */
  cancel(): void;
}

export interface SubmitOptions {
  onProgress?: (stage: string, completedUnits: number, totalUnits?: number) => void;
  /** job קודם שה-submit הזה מחליף — יבוטל אוטומטית (stale-job). */
  supersede?: JobHandle;
}

export interface WorkerClientOptions {
  /** יצירת מזהי job — דטרמיניסטית בברירת מחדל (מונה); מוזרקת בבדיקות/ייצור. */
  readonly jobIdFactory?: () => string;
}

interface JobState {
  readonly jobId: string;
  cancelled: boolean;
  resolve: (r: SerializedTypesetResult) => void;
  reject: (e: unknown) => void;
  progressCbs: Array<(stage: string, completedUnits: number, totalUnits?: number) => void>;
  readonly expectedInputHash: string;
}

/**
 * לקוח ה-Worker. שומר מפת עבודות; הודעות של job בלתי מוכר/מבוטל נזרקות
 * בשקט (בפרט done מאוחר של job מבוטל — §12.1). התוצאה נבדקת מול
 * inputHash הצפוי — אי-התאמה ⇐ תוצאה ישנה נזרקת (הגנה דו-שכבתית
 * לצד jobId).
 */
export class WorkerClient {
  private readonly worker: WorkerLike;
  private readonly jobs = new Map<string, JobState>();
  private nextJobNumber = 1;
  private readonly jobIdFactory: () => string;

  constructor(worker: WorkerLike, options: WorkerClientOptions = {}) {
    this.worker = worker;
    this.jobIdFactory = options.jobIdFactory ?? (() => `job-${this.nextJobNumber++}`);
    worker.onMessage((msg) => this.handleResponse(msg));
  }

  submit(payload: PreparePayload, options: SubmitOptions = {}): JobHandle {
    if (options.supersede !== undefined) options.supersede.cancel();
    const jobId = this.jobIdFactory();
    const expectedInputHash = expectedInputHashOf(payload.request);
    const state: JobState = {
      jobId,
      cancelled: false,
      resolve: () => {},
      reject: () => {},
      progressCbs: options.onProgress !== undefined ? [options.onProgress] : [],
      expectedInputHash,
    };
    const done = new Promise<SerializedTypesetResult>((resolve, reject) => {
      state.resolve = resolve;
      state.reject = reject;
    });
    this.jobs.set(jobId, state);
    const handle: JobHandle = {
      jobId,
      done,
      onProgress: (cb) => { state.progressCbs.push(cb); },
      cancel: () => this.cancel(jobId),
    };
    // v2 — הקבוע המשותף (protocol.ts); ערך קבוע כאן היה נדחה בשקט אחרי העלאת
    // הגרסה (אותר בבדיקות typeset-run: הפאזה נתקעה ב-preparing)
    this.worker.postMessage({ type: 'prepare', jobId, protocolVersion: WORKER_PROTOCOL_VERSION, payload });
    return handle;
  }

  cancel(jobId: string): void {
    const state = this.jobs.get(jobId);
    if (state === undefined || state.cancelled) return;
    state.cancelled = true;
    this.worker.postMessage({ type: 'cancel', jobId });
    // שלב 83 — ניקוי מלא בביטול: אין זליגת jobs ואין מאזינים תלויים.
    // ההבטחה נדחית; שאריות מאוחרות של אותו jobId ייזרקו כ־"job לא מוכר".
    state.progressCbs.length = 0;
    this.jobs.delete(jobId);
    state.reject(new WorkerJobCancelled(jobId));
  }

  /** ספירת העבודות הפעילות (לא בוטלו וטרם הסתיימו) — לבדיקות ולטלמטריה. */
  get activeJobs(): number {
    let n = 0;
    for (const s of this.jobs.values()) if (!s.cancelled) n += 1;
    return n;
  }

  /** סה"כ רשומות במפת העבודות — לבדיקות "אין זליגת jobs" (שלב 83).
   * במצב תקין שווה ל־activeJobs: כל job שהסתיים/בוטל/נזרק הוסר. */
  get retainedJobs(): number {
    return this.jobs.size;
  }

  private handleResponse(msg: WorkerResponse): void {
    if (!isWorkerResponse(msg)) {
      // הפרת פרוטוקול — לא מגיע ל-UI; נזרק ללוג פיתוח (§12.1)
      return;
    }
    const state = this.jobs.get(msg.jobId);
    if (state === undefined) return; // job לא מוכר (הסתיים כבר) — נזרק בשקט
    if (state.cancelled) return; // תוצאה מאוחרת של job מבוטל — נזרקת (§12.1)
    switch (msg.type) {
      case 'progress':
        for (const cb of state.progressCbs) cb(msg.stage, msg.completedUnits, msg.totalUnits);
        return;
      case 'done': {
        const actual = String((msg.result.manifest as { inputHash?: unknown }).inputHash ?? '');
        if (actual !== state.expectedInputHash) {
          // תוצאה של קלט אחר (stale לפי תוכן) — נזרקת; ההבטחה נשארת
          // תלויה (מתועד) ויוחלף ב-submit הבא. הרישום עצמו מוסר — אין
          // זליגת jobs (שלב 83); חוזרת מאוחרת תיזרק כ־"job לא מוכר".
          this.jobs.delete(msg.jobId);
          return;
        }
        this.jobs.delete(msg.jobId);
        state.resolve(msg.result);
        return;
      }
      case 'error':
        this.jobs.delete(msg.jobId);
        state.reject(new WorkerTypesetError(msg.jobId, msg.errorCode, msg.params));
        return;
    }
  }
}

/** inputHash צפוי מהבקשה — אותם רכיבים של makeRunManifest (§6.7).
 * מיוצא משלב 77: המנצח (typeset-run) רושם את אותו hash ב־runStore —
 * מקור אחד, בלי ייבוא מנוע נוסף בחוט הראשי. */
export function expectedInputHashOf(request: TypesetRequest): string {
  const assets = request.assets;
  return inputHashOf({
    sourceSha256: request.sourceSha256,
    effectiveSettings: request.settings,
    fontsManifestSha256: assets.fontsManifestSha256,
    assetsManifestSha256: assets.assetsManifestSha256,
    parserVersion: request.parserVersion,
    engineVersion: ENGINE_VERSION_OF,
  });
}
