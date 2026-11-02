/**
 * engine-worker.ts — הצד של המנוע בתוך ה-Worker (שלב 35; אפיון §12.1).
 *
 * ליבה טהורה: ה-handler מקבל הודעה + פורט (postMessage מופשט) — אין
 * גישה ל-self/onmessage כאן; הקשירה לדפדפן היא קובץ עטיפה דק
 * (worker-entry.ts). כך אותן בדיקות הודעות רצות ב-Node (§17.1).
 *
 * מהלך חיי job: prepare מאומת (גרסת פרוטוקול; jobId לא כפול) ← בניית
 * ספק מהנכסים שהועברו מקומית ← typeset עם observer שמדווח progress ←
 * done עם ה-IR בסריאליזציה קנונית (זהה ביט-ביט ל-CLI). שגיאה ⇒ error
 * עם מפתח קטלוגי + params — לעולם לא message גולמי (§12.1).
 *
 * ביטול (v0): המנוע סינכרוני — cancel מכובד בגבולות job: job שבתור
 * וטרם התחיל נזרק; job שרץ יסתיים וה-WorkerClient יזרוק את תוצאתו
 * (stale-job לפי jobId; §12.1 "job ישן שנגמר אחרי edit חדש נזרק").
 */
import {
  canonicalJson,
  serializeLayoutDocument,
  type AnyProvider,
  type TypesetRequest,
  type TypesetSuccess,
} from '@tora/layout-api';
import {
  isWorkerRequest,
  type PreparePayload,
  type ProviderFactory,
  type WorkerResponse,
  workerRequestIssues,
  WORKER_PROTOCOL_VERSION,
} from './protocol.js';

/** פורט יוצא — הפשטה של postMessage (בדיקות מזריקות פורט מזויף). */
export interface WorkerPort {
  readonly post: (msg: WorkerResponse) => void;
}

export interface EngineWorkerDeps {
  /** הספק מדידה — נבנה מהנכסים שבמטען (HarfBuzz/WASM בייצור). */
  readonly createProvider: ProviderFactory;
  /** המנוע — מוזרק (typeset של layout-engine; stub בבדיקות). */
  readonly typeset: (request: TypesetRequest, provider: AnyProvider, policy: { policyId: string }, observer?: { onProgress: (stage: string) => void }) => TypesetSuccess;
}

/**
 * יוצר מטפל הודעות. המטפל אסינכרוני (בניית ספק); כל הודעה מטופלת
 * בנפרד — התור של ה-Worker טבעי (אין מצב משותף בין הודעות מלבד
 * רישום jobId שכבר רץ/ר� כדי לדחות כפילויות בקול רם).
 */
export function createEngineHandler(deps: EngineWorkerDeps): (msg: unknown, port: WorkerPort) => Promise<void> {
  const cancelled = new Set<string>();
  const started = new Set<string>();

  return async function handleMessage(msg: unknown, port: WorkerPort): Promise<void> {
    const issues = workerRequestIssues(msg);
    if (issues.length > 0) {
      // הודעה שאינה הפרוטוקול — שגיאת פרוטוקול ללא jobId אמין: דיווח לפיתוח
      // בלבד; אין מה להחזיר ל-UI (§12.1 — אין ערוץ שגיאה גלובלי ב-v1).
      return;
    }
    const req = msg as import('./protocol.js').WorkerRequest;

    if (req.type === 'cancel') {
      cancelled.add(req.jobId);
      return;
    }

    // prepare
    const { jobId, payload } = req;
    if (cancelled.has(jobId)) {
      return; // בוטל בטרם התחיל — לא מריצים כלל
    }
    if (started.has(jobId)) {
      port.post({
        type: 'error', jobId, errorCode: 'errors.worker.DUPLICATE_JOB', params: { jobId },
      });
      return;
    }
    started.add(jobId);
    let progressUnits = 0;
    try {
      const provider = await deps.createProvider(payload);
      const result = deps.typeset(payload.request, provider, { policyId: 'torah-v1' }, {
        onProgress: (stage: string) => {
          progressUnits += 1;
          port.post({ type: 'progress', jobId, stage, completedUnits: progressUnits });
        },
      });
      if (cancelled.has(jobId)) {
        return; // הסתיים אחרי ביטול — התוצאה נזרקת בצד העובד עצמו
      }
      const serialized = serializeTypesetSuccess(result);
      port.post({ type: 'done', jobId, result: serialized });
    } catch (e) {
      if (cancelled.has(jobId)) {
        return; // השגיאה של job מבוטל אינה מדווחת
      }
      const errorCode = e instanceof Error && 'catalogKey' in e
        ? String((e as { catalogKey: unknown }).catalogKey)
        : 'errors.worker.ENGINE_UNCLASSIFIED';
      const params = e instanceof Error && 'params' in e
        ? (e as { params: unknown }).params as Readonly<Record<string, string | number | boolean | null>>
        : { reason: e instanceof Error ? e.name : 'unknown' };
      port.post({ type: 'error', jobId, errorCode, params });
    }
  };
}

/** סריאליזציה של התוצאה — ה-IR והפנקס ב-JSON קנוני (זהה ל-CLI). */
export function serializeTypesetSuccess(result: TypesetSuccess): import('./protocol.js').SerializedTypesetResult {
  const layoutJson = serializeLayoutDocument(result.layout);
  return {
    layoutJson,
    manifest: result.manifest,
    ...(result.ledger !== undefined
      ? { ledgerJson: canonicalJson(result.ledger as unknown as Record<string, unknown>) }
      : {}),
    layoutHash: result.manifest.layoutHash,
  };
}

export { WORKER_PROTOCOL_VERSION, isWorkerRequest };
export type { PreparePayload, ProviderFactory };
