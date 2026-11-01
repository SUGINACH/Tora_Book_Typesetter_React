/**
 * protocol.ts — פרוטוקול הודעות Worker (שלב 35; אפיון §12.1).
 *
 * WorkerRequest: prepare (jobId + protocolVersion + payload) | cancel.
 * WorkerResponse: progress | done | error — לעולם לא raw error.message
 * ל-UI; הפרטים נשמרים בלוג פיתוח והמשתמש מקבל מפתח i18n (§12.1).
 *
 * הפרוטוקול חי בצד המעטפת בלבד (src/worker-host) — המנוע אינו מכיר
 * Worker (תכנית שלב 35: "WorkerClient בצד shell בלבד").
 * ההודעות ניתנות ל-structured clone (העברת נכסים/גופנים מקומית בערוץ —
 * אין רשת; §19).
 */
import type { AnyProvider, FontManifestRecord, RunManifest, TypesetRequest } from '@tora/layout-api';

export const WORKER_PROTOCOL_VERSION = 1 as const;

/** גופן שעובר בערוץ — רשומת מניפסט (plain JSON) + ה-bytes שנמדדו (§6.4). */
export interface FontBytesEntry {
  readonly record: FontManifestRecord;
  readonly bytes: Uint8Array;
}

/**
 * מטען prepare: בקשת typeset מלאה + הנכסים לבניית הספק בתוך ה-Worker
 * (גופנים ו-WASM עוברים מקומית; אין CDN/רשת — §19, §6.4).
 */
export interface PreparePayload {
  readonly request: TypesetRequest;
  readonly fonts: readonly FontBytesEntry[];
  readonly wasmBytes: Uint8Array;
  readonly woff2DecoderBytes: Uint8Array;
}

/** התוצאה בחוט הגוף: ה-IR בסריאליזציה הקנונית (זהה ביט-ביט ל-CLI). */
export interface SerializedTypesetResult {
  readonly layoutJson: string;
  readonly manifest: RunManifest;
  readonly ledgerJson?: string;
  readonly layoutHash: string;
}

export type WorkerRequest =
  | { readonly type: 'prepare'; readonly jobId: string; readonly protocolVersion: number; readonly payload: PreparePayload }
  | { readonly type: 'cancel'; readonly jobId: string };

export type WorkerResponse =
  | { readonly type: 'progress'; readonly jobId: string; readonly stage: string; readonly completedUnits: number; readonly totalUnits?: number }
  | { readonly type: 'done'; readonly jobId: string; readonly result: SerializedTypesetResult }
  | { readonly type: 'error'; readonly jobId: string; readonly errorCode: string; readonly params: Readonly<Record<string, string | number | boolean | null>> };

// ─────────────────────────── אימות הודעות ───────────────────────────

const JOB_ID_RE = /^[\w:-]{1,128}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** אימות בקשה נכנסת — פרוטוקול שגוי נדחה בקול רם (אין פענוח שקט). */
export function workerRequestIssues(v: unknown): string[] {
  if (!isRecord(v)) return ['not-an-object'];
  const issues: string[] = [];
  if (v.type === 'prepare') {
    if (typeof v.jobId !== 'string' || !JOB_ID_RE.test(v.jobId)) issues.push('jobId');
    if (v.protocolVersion !== WORKER_PROTOCOL_VERSION) issues.push(`protocolVersion:${String(v.protocolVersion)}`);
    const p = v.payload;
    if (!isRecord(p)) issues.push('payload');
    else {
      if (!isRecord(p.request)) issues.push('payload.request');
      if (!Array.isArray(p.fonts) || p.fonts.length === 0) issues.push('payload.fonts');
      if (!(p.wasmBytes instanceof Uint8Array)) issues.push('payload.wasmBytes');
      if (!(p.woff2DecoderBytes instanceof Uint8Array)) issues.push('payload.woff2DecoderBytes');
    }
  } else if (v.type === 'cancel') {
    if (typeof v.jobId !== 'string' || !JOB_ID_RE.test(v.jobId)) issues.push('jobId');
  } else {
    issues.push('type');
  }
  return issues;
}

export function isWorkerRequest(v: unknown): v is WorkerRequest {
  return workerRequestIssues(v).length === 0;
}

/** אימות תשובה יוצאת — משמש גם את ה-WorkerClient לאמת את מה שמגיע מהערוץ. */
export function workerResponseIssues(v: unknown): string[] {
  if (!isRecord(v)) return ['not-an-object'];
  const issues: string[] = [];
  if (typeof v.jobId !== 'string' || !JOB_ID_RE.test(v.jobId)) issues.push('jobId');
  switch (v.type) {
    case 'progress':
      if (typeof v.stage !== 'string' || v.stage.length === 0) issues.push('stage');
      if (typeof v.completedUnits !== 'number' || !Number.isSafeInteger(v.completedUnits) || v.completedUnits < 0) issues.push('completedUnits');
      if (v.totalUnits !== undefined && (typeof v.totalUnits !== 'number' || !Number.isSafeInteger(v.totalUnits))) issues.push('totalUnits');
      break;
    case 'done': {
      const r = v.result;
      if (!isRecord(r)) issues.push('result');
      else {
        if (typeof r.layoutJson !== 'string' || r.layoutJson.length === 0) issues.push('result.layoutJson');
        if (!isRecord(r.manifest) || typeof (r.manifest as Record<string, unknown>).layoutHash !== 'string') issues.push('result.manifest');
        if (r.ledgerJson !== undefined && typeof r.ledgerJson !== 'string') issues.push('result.ledgerJson');
        if (typeof r.layoutHash !== 'string' || r.layoutHash.length !== 64) issues.push('result.layoutHash');
      }
      break;
    }
    case 'error':
      if (typeof v.errorCode !== 'string' || !/^errors\.[a-z]+\.[A-Z0-9_]+$/.test(v.errorCode)) issues.push('errorCode');
      if (!isRecord(v.params)) issues.push('params');
      break;
    default:
      issues.push('type');
  }
  return issues;
}

export function isWorkerResponse(v: unknown): v is WorkerResponse {
  return workerResponseIssues(v).length === 0;
}

/** בונה ספק מדידה מהמטען — מוזרק ל-handler; בייצור: HarfBuzz/WASM (ADR-003). */
export type ProviderFactory = (payload: PreparePayload) => Promise<AnyProvider>;
