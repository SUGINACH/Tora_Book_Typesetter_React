/**
 * worker-host.test.ts — בדיקות שלב 35: פרוטוקול Worker ו־WorkerClient (§12.1).
 *
 * מה מוכח כאן:
 *   1. אימות הודעות: prepare/cancel/progress/done/error — קבלה ודחייה.
 *   2. ה-handler: progress זורם; done עם ה-IR בסריאליזציה קנונית; שגיאת
 *      מנוע ⇒ error עם מפתח קטלוגי + params (לא message גולמי); jobId
 *      כפול נדחה; cancel לפני הרצה — ה-job לא רץ כלל.
 *   3. ה-WorkerClient: submit→done; progress; ביטול ⇒ ההבטחה נדחית
 *      כבוטלת ותוצאה מאוחרת נזרקת; שגיאה ⇒ WorkerTypesetError; done
 *      עם inputHash שגוי (stale) נזרק; ביטול אינו משנה job הבא (§17.2#10).
 *   4. hash זהה ל־Node: אותה בקשה דרך ה-handler (הערוץ) ובקריאה ישירה
 *      למנוע ⇐ אותו layoutHash — הפרוטוקול אינו משנה תוצאות.
 *
 * הערוץ: FakeChannel — זוג בזמן-ריצה בין WorkerClient ל-handler האמיתי
 * עם המנוע האמיתי וספק הבדיקה (בדיוק כמו בדיקות המנוע של שלב 33).
 */
import { describe, expect, test } from 'vitest';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import { parseSourceText } from '@tora/content-model';
import { typeset as engineTypeset } from '@tora/layout-engine';
import {
  DEFAULT_SEARCH_BUDGET,
  type EffectiveSettings,
  type TypesetRequest,
} from '@tora/layout-api';
import {
  isWorkerRequest,
  isWorkerResponse,
  WORKER_PROTOCOL_VERSION,
  workerRequestIssues,
  workerResponseIssues,
  type PreparePayload,
  type SerializedTypesetResult,
  type WorkerRequest,
  type WorkerResponse,
} from '../../src/worker-host/protocol.js';
import { createEngineHandler, type WorkerPort } from '../../src/worker-host/engine-worker.js';
import { toLeanLayout } from '../../src/worker-host/lean-layout.js';
import {
  WorkerClient,
  WorkerJobCancelled,
  WorkerTypesetError,
  type WorkerLike,
} from '../../src/worker-host/worker-client.js';

// ─────────────────────────── עזרי קלט ───────────────────────────

const SOURCE = `שם הספר - ספר בדיקת פרוטוקול
כותרת 1 מספר 1 - פרק ראשון
והנה פסקה ראשונה עם ניקוד וטעמים ומספרים 123 ועוד טקסט שימלא שורות אחדות בטור, ובתוכה הערה [הערת שוליים ראשונה] והמשך הפסקה אחרי ההערה.
ופסקה שניה בלי הערה כלל, עם מקף-עברי ומספרים 456 ועוד מלים רבות כדי למלא שורות נוספות בעמודה הראשונה ואולי גם בשניה.
`;

function makeSettings(): EffectiveSettings {
  return Object.freeze({
    schemaVersion: 1,
    enginePolicyId: 'torah-v1',
    values: Object.freeze({
      'size-body': 12,
      'line-height-body': 1.34,
      'prop-margin': 7.5,
      'note-marker-size': 8,
      'note-marker-type': 'super',
      'fn-reset-mode': 'siman',
      'page-num-format': 'gematria',
      'page-num-initial-value': 1,
    }),
    configHash: 'c'.repeat(64),
  });
}

function makeRequest(trace: 'off' | 'decisions' = 'off'): TypesetRequest {
  const r = parseSourceText(SOURCE, { documentId: 'worker-host-test' });
  return {
    document: { ...r.doc, transforms: r.transforms } as TypesetRequest['document'],
    settings: makeSettings(),
    assets: {
      schemaVersion: 1,
      fonts: [{ usage: 'body', font: { fontId: 'guttman-rashi-normal', contentSha256: 'a'.repeat(64), family: 'Guttman Rashi', weight: 400, style: 'normal' } }],
      fontsManifestSha256: 'f'.repeat(64),
      assetsManifestSha256: '0'.repeat(64),
    },
    trace,
    budget: DEFAULT_SEARCH_BUDGET,
    sourceSha256: '5'.repeat(64),
    parserVersion: 'test-1',
  } as TypesetRequest;
}

const FAKE_FONT_RECORD = Object.freeze({
  file: 'test.woff2',
  fontId: 'guttman-rashi-normal',
  sha256: 'a'.repeat(64),
  family: 'Guttman Rashi',
  group: 'bundled',
  binaryFormat: 'woff2',
  unitsPerEm: 1000,
  weight: 400,
  style: 'normal',
  distributionBlocked: { blocked: false, reason: 'test', decision: null, policy: 'test' },
});

function makePayload(trace: 'off' | 'decisions' = 'off'): PreparePayload {
  return {
    request: makeRequest(trace),
    fonts: [{ record: FAKE_FONT_RECORD, bytes: new Uint8Array([1, 2, 3]) }],
    wasmBytes: new Uint8Array([4, 5, 6]),
    woff2DecoderBytes: new Uint8Array([7, 8]),
  };
}

// ─────────────────────────── ערוץ מזויף ───────────────────────────

/** ערוץ בזמן-ריצה: WorkerClient ← → handler; מתעד כל מה שעובר. */
class FakeChannel implements WorkerLike {
  private clientHandler: ((msg: WorkerResponse) => void) | undefined;
  readonly workerSaw: WorkerRequest[] = [];
  private port: WorkerPort | undefined;
  private handler: ((msg: unknown, port: WorkerPort) => Promise<void>) | undefined;
  /** דחיית מסירה — מדמה סדר הודעות של Worker אמיתי (async). */
  delayPosts = false;
  private queue: WorkerResponse[] = [];
  private flushing = false;

  bind(handler: (msg: unknown, port: WorkerPort) => Promise<void>): void {
    this.handler = handler;
    this.port = { post: (msg) => this.enqueue(msg) };
  }

  postMessage(msg: WorkerRequest): void {
    this.workerSaw.push(msg);
    const h = this.handler;
    if (h === undefined || this.port === undefined) return;
    void h(msg, this.port);
  }

  onMessage(handler: (msg: WorkerResponse) => void): void {
    this.clientHandler = handler;
  }

  private enqueue(msg: WorkerResponse): void {
    this.queue.push(msg);
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.queue.length > 0) {
        const msg = this.queue.shift() as WorkerResponse;
        if (this.delayPosts) await new Promise<void>((r) => setTimeout(r, 0));
        this.clientHandler?.(msg);
      }
    } finally {
      this.flushing = false;
    }
  }
}

function makeBoundClient() {
  const channel = new FakeChannel();
  const handler = createEngineHandler({
    createProvider: async () => createTestMeasurementProvider(),
    typeset: engineTypeset,
  });
  channel.bind(handler);
  const client = new WorkerClient(channel);
  return { channel, client };
}

// ─────────────────────────── 1. אימות הודעות ───────────────────────────

describe('שלב 35: אימות הודעות הפרוטוקול', () => {
  test('prepare תקין עם גרסת פרוטוקול נוכחית', () => {
    expect(isWorkerRequest({ type: 'prepare', jobId: 'job-1', protocolVersion: WORKER_PROTOCOL_VERSION, payload: makePayload() })).toBe(true);
    expect(isWorkerRequest({ type: 'cancel', jobId: 'job-1' })).toBe(true);
  });

  test('prepare עם גרסת פרוטוקול שגויה נדחה עם מיקום', () => {
    // v2 היא הנוכחית (IR רזה; תיקון 2026-11-09/ג'); גרסה ישנה/עתידית נדחית
    const bad = { type: 'prepare', jobId: 'job-1', protocolVersion: 1, payload: makePayload() };
    expect(isWorkerRequest(bad)).toBe(false);
    expect(workerRequestIssues(bad)).toContain('protocolVersion:1');
  });

  test('סוג לא מוכר/jobId ריק/payload חסר נדחים', () => {
    expect(isWorkerRequest({ type: 'nope' })).toBe(false);
    expect(isWorkerRequest({ type: 'cancel', jobId: '' })).toBe(false);
    expect(isWorkerRequest({ type: 'prepare', jobId: 'j', protocolVersion: 1 })).toBe(false);
    expect(isWorkerRequest(null)).toBe(false);
  });

  test('תשובות: progress/done/error תקינות; errorCode חייב מפתח קטלוגי', () => {
    expect(isWorkerResponse({ type: 'progress', jobId: 'j', stage: 'breaking', completedUnits: 1 })).toBe(true);
    expect(isWorkerResponse({ type: 'error', jobId: 'j', errorCode: 'errors.engine.SETTING_INVALID', params: {} })).toBe(true);
    expect(isWorkerResponse({ type: 'error', jobId: 'j', errorCode: 'raw message!', params: {} })).toBe(false);
    // v2: התוצאה נושאת IR רזה (אובייקט עם pages) — מחרוזת layoutJson ישנה נדחית
    expect(isWorkerResponse({ type: 'done', jobId: 'j', result: { layoutJson: 'x', manifest: { layoutHash: 'h' }, layoutHash: 'h' } })).toBe(false);
    expect(isWorkerResponse({ type: 'done', jobId: 'j', result: { layout: { schemaVersion: 1, policyId: 'p', pages: [] }, manifest: { layoutHash: 'a'.repeat(64) }, layoutHash: 'a'.repeat(64) } })).toBe(true);
    expect(isWorkerResponse({ type: 'done', jobId: 'j', result: { layout: 'not-an-object', manifest: { layoutHash: 'h' }, layoutHash: 'h' } })).toBe(false);
    expect(workerResponseIssues({ type: 'progress', jobId: 'j', stage: 's', completedUnits: -1 })).toContain('completedUnits');
  });
});

// ─────────────────────────── 2. ה-handler ───────────────────────────

describe('שלב 35: handler המנוע בעובד — progress/done/error/ביטול', () => {
  test('prepare ← progress ≥1 ← done עם IR קנוני; כל ההודעות עומדות בפרוטוקול', async () => {
    const posts: WorkerResponse[] = [];
    const port: WorkerPort = { post: (m) => posts.push(m) };
    const handler = createEngineHandler({
      createProvider: async () => createTestMeasurementProvider(),
      typeset: engineTypeset,
    });
    await handler({ type: 'prepare', jobId: 'job-a', protocolVersion: WORKER_PROTOCOL_VERSION, payload: makePayload('decisions') }, port);
    const stages = posts.filter((p) => p.type === 'progress');
    expect(stages.length).toBeGreaterThan(0);
    const done = posts.find((p) => p.type === 'done');
    expect(done).toBeDefined();
    for (const p of posts) expect(isWorkerResponse(p)).toBe(true);
    const result = (done as { result: SerializedTypesetResult }).result;
    // v2: IR רזה — אובייקט ב-structured clone, בלי מחרוזת קנונית (תיקון
    // 2026-11-09/ג': שילוש הזיכרון בספרים גדולים הפיל לשוניות באתר החי)
    expect(result.layout.schemaVersion).toBe(1);
    expect(Array.isArray(result.layout.pages)).toBe(true);
    expect(result.layout.pages.length).toBeGreaterThan(0);
    // הגליפים הושמטו מההעברה — הביקורת וההיטל אינם קוראים אותם
    for (const page of result.layout.pages) {
      for (const item of page.items) {
        if (item.kind === 'line') for (const run of item.runs) expect(run.glyphs.length).toBe(0);
      }
    }
    expect(result.manifest.layoutHash).toBe(result.layoutHash);
    expect(result.ledgerJson).toBeDefined();
  });

  test('שגיאת מנוע ⇒ error עם מפתח קטלוגי + params — לא message גולמי', async () => {
    const posts: WorkerResponse[] = [];
    const port: WorkerPort = { post: (m) => posts.push(m) };
    const handler = createEngineHandler({
      createProvider: async () => createTestMeasurementProvider(),
      typeset: () => {
        throw Object.assign(new Error('הודעה פנימית עם סודות'), {
          catalogKey: 'errors.engine.SETTING_INVALID',
          params: { key: 'size-body', reason: 'bad' },
        });
      },
    });
    await handler({ type: 'prepare', jobId: 'job-b', protocolVersion: WORKER_PROTOCOL_VERSION, payload: makePayload() }, port);
    const err = posts.find((p) => p.type === 'error') as { errorCode: string; params: Record<string, string> } | undefined;
    expect(err).toBeDefined();
    expect(err?.errorCode).toBe('errors.engine.SETTING_INVALID');
    expect(err?.params).toEqual({ key: 'size-body', reason: 'bad' });
    expect(JSON.stringify(posts)).not.toContain('סודות');
  });

  test('jobId כפול נדחה בקול רם; cancel לפני prepare — ה-job לא רץ כלל', async () => {
    const posts: WorkerResponse[] = [];
    let runs = 0;
    const port: WorkerPort = { post: (m) => posts.push(m) };
    const handler = createEngineHandler({
      createProvider: async () => createTestMeasurementProvider(),
      typeset: (...a: Parameters<typeof engineTypeset>) => { runs += 1; return engineTypeset(...a); },
    });
    const prepare = { type: 'prepare', jobId: 'dup', protocolVersion: WORKER_PROTOCOL_VERSION, payload: makePayload() } as const;
    await handler(prepare, port);
    await handler(prepare, port);
    expect(runs).toBe(1);
    expect(posts.some((p) => p.type === 'error' && (p as { errorCode: string }).errorCode === 'errors.worker.DUPLICATE_JOB')).toBe(true);

    const posts2: WorkerResponse[] = [];
    const port2: WorkerPort = { post: (m) => posts2.push(m) };
    await handler({ type: 'cancel', jobId: 'late' }, port2);
    await handler({ type: 'prepare', jobId: 'late', protocolVersion: WORKER_PROTOCOL_VERSION, payload: makePayload() }, port2);
    expect(posts2).toEqual([]);
    expect(runs).toBe(1);
  });

  test('הודעה שאינה הפרוטוקול — אין קריסה ואין תשובה', async () => {
    const posts: WorkerResponse[] = [];
    const port: WorkerPort = { post: (m) => posts.push(m) };
    const handler = createEngineHandler({
      createProvider: async () => createTestMeasurementProvider(),
      typeset: engineTypeset,
    });
    await handler('garbage', port);
    await handler({ type: 'unknown' }, port);
    expect(posts).toEqual([]);
  });
});

// ─────────────────────────── 3. ה-WorkerClient ───────────────────────────

describe('שלב 35: WorkerClient — ערוץ מלא עם המנוע האמיתי', () => {
  test('submit ← progress ← done; אותו hash כמו קריאה ישירה למנוע (hash זהה ל-Node)', async () => {
    const { channel, client } = makeBoundClient();
    const stages: string[] = [];
    const handle = client.submit(makePayload(), { onProgress: (s) => stages.push(s) });
    const result = await handle.done;
    expect(stages.length).toBeGreaterThan(0);
    expect(result.layoutHash).toHaveLength(64);

    // קריאה ישירה ב-Node — אותה בקשה, אותו מנוע, אותו ספק
    const direct = engineTypeset(makeRequest(), createTestMeasurementProvider(), { policyId: 'torah-v1' });
    expect(result.layoutHash).toBe(direct.manifest.layoutHash);
    // v2: אותו IR רזה כמו היטל ישיר של אותה ריצה — דטרמיניזם מלא
    expect(result.layout).toEqual(toLeanLayout(direct.layout));
    expect(channel.workerSaw[0]?.type).toBe('prepare');
  });

  test('ביטול ⇒ ההבטחה נדחית כבוטלת; done מאוחר של job מבוטל נזרק; אין השפעה על הבא (§17.2#10)', async () => {
    const { channel, client } = makeBoundClient();
    channel.delayPosts = true; // done יגיע אחרי הביטול
    const handle = client.submit(makePayload());
    handle.cancel();
    await expect(handle.done).rejects.toBeInstanceOf(WorkerJobCancelled);
    await new Promise<void>((r) => setTimeout(r, 10));
    const second = client.submit(makePayload());
    const result = await second.done;
    expect(result.layoutHash).toHaveLength(64);
    expect(client.activeJobs).toBe(0);
  });

  test('שגיאת מדידה ⇒ WorkerTypesetError עם מפתח קטלוגי ולא message גולמי', async () => {
    const channel = new FakeChannel();
    channel.bind(createEngineHandler({
      createProvider: async () => {
        throw Object.assign(new Error('secret internal'), { catalogKey: 'errors.measurement.MISSING_FONT', params: { family: 'X' } });
      },
      typeset: engineTypeset,
    }));
    const client = new WorkerClient(channel);
    const handle = client.submit(makePayload());
    await expect(handle.done).rejects.toMatchObject({
      name: 'WorkerTypesetError',
      errorCode: 'errors.measurement.MISSING_FONT',
      params: { family: 'X' },
    });
    expect(WorkerTypesetError.name).toBe('WorkerTypesetError');
  });

  test('done עם inputHash שגוי (stale לפי תוכן) נזרק — לא מוצג ישן כחדש', async () => {
    const channel = new FakeChannel();
    channel.bind(createEngineHandler({
      createProvider: async () => createTestMeasurementProvider(),
      typeset: engineTypeset,
    }));
    // מאזין משוכפל שמשבש את ה-inputHash בתשובת done — מדמה תוצאה של קלט אחר
    const client = new WorkerClient({
      postMessage: (msg) => { channel.postMessage(msg); },
      onMessage: (h) => {
        channel.onMessage((msg) => {
          if (msg.type === 'done') {
            h({
              type: 'done', jobId: msg.jobId,
              result: { ...msg.result, manifest: { ...msg.result.manifest, inputHash: '0'.repeat(64) } },
            });
            return;
          }
          h(msg);
        });
      },
    });
    const handle = client.submit(makePayload());
    let settled = false;
    void handle.done.then(() => { settled = true; }, () => { settled = true; });
    await new Promise<void>((r) => setTimeout(r, 20));
    expect(settled).toBe(false);
  });

  test('supersede: submit חדש מבטל אוטומטית את הקודם', async () => {
    const { client } = makeBoundClient();
    const first = client.submit(makePayload());
    const second = client.submit(makePayload(), { supersede: first });
    await expect(first.done).rejects.toBeInstanceOf(WorkerJobCancelled);
    const result = await second.done;
    expect(result.layoutHash).toHaveLength(64);
  });
});
