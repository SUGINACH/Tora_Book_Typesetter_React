/**
 * job-lifecycle.test.ts — בדיקות שלב 83: ניהול job מלא (§12.1, §17.2#10,
 * §17.3; תכנית שלב 83 — "ביטול job וניקוי listeners; אין זליגת jobs").
 *
 * מה מוכח כאן — על המנוע האמיתי דרך הפרוטוקול (ערוץ מזויף; ספק בדיקה):
 *   1. progress נאמן: ה-observer מעביר את יחידות המנוע כמות שהן
 *      (‎stage, completedUnits, totalUnits?‎) — אין מונה מקומי; האחוזים
 *      נקבעים בתצוגה בלבד.
 *   2. המנצח מסדר את ‎totalUnits‏ ב־runStore.progress — עד הסטור.
 *   3. ביטול ⇐ ניקוי המאזינים והמפה; שארית מאוחרת אינה מפעילה מנוי;
 *      ההבטחה נדחית כבוטלת.
 *   4. done עם inputHash שונה ⇐ הרישום מוסר (ההבטחה נשארת תלויה,
 *      מתועד) — אין זליגה.
 *   5. עובד: רישום ביטול מתנקה בפגישה — cancel לפני prepare לא משאיר
 *      את ה-job מבוטל לנצח.
 *   6. ביטול אינו משנה את תוצאת job הבא (§17.2#10) — hash זהה לריצה
 *      נקייה של אותו מקור.
 *   7. מחזור חיים מלא — המפה מתרוקנת בסוף כל סבב (retainedJobs=0).
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import { parseSourceText } from '@tora/content-model';
import { typeset as engineTypeset } from '@tora/layout-engine';
import {
  DEFAULT_SEARCH_BUDGET,
  type AnyProvider,
  type EffectiveSettings,
  type ResolvedAssetManifest,
  type TypesetRequest,
} from '@tora/layout-api';
import { createEngineHandler, type WorkerPort } from '../../src/worker-host/engine-worker.js';
import { WorkerClient, WorkerJobCancelled, type WorkerLike } from '../../src/worker-host/worker-client.js';
import { WORKER_PROTOCOL_VERSION, isWorkerResponse, type WorkerRequest, type WorkerResponse } from '../../src/worker-host/protocol.js';
import { TypesetController } from '../../src/worker-host/typeset-run.js';
import { useRunStore } from '../../src/stores/run-store.js';
import { useResultStore } from '../../src/stores/result-store.js';
import { useEditorStore } from '../../src/stores/editor-store.js';

const SOURCE = `שם הספר - ספר בדיקת מחזור חיים
כותרת 1 מספר 1 - פרק ראשון
פסקה עם ניקוד ומספרים 123 והערה [הערת שוליים] והמשך הפסקה עוד ועוד טקסט מילוי.
`;

const FONT = Object.freeze({
  file: 'test.woff2', fontId: 'font:v1|test', sha256: 'a'.repeat(64),
  family: 'טסט', group: 'bundled' as const, binaryFormat: 'woff2' as const,
  unitsPerEm: 1000, weight: 400, style: 'normal' as const,
  distributionBlocked: { blocked: false, reason: 'test', decision: null, policy: 'test' },
});

const SETTINGS: Readonly<EffectiveSettings> = Object.freeze({
  schemaVersion: 1,
  enginePolicyId: 'torah-v1',
  values: Object.freeze({
    'size-body': 12, 'line-height-body': 1.34, 'prop-margin': 7.5,
    'note-marker-size': 8, 'note-marker-type': 'super', 'fn-reset-mode': 'siman',
    'page-num-format': 'gematria', 'page-num-initial-value': 1,
  }),
  configHash: 'c'.repeat(64),
});

const ASSETS: Readonly<ResolvedAssetManifest> = Object.freeze({
  schemaVersion: 1,
  fonts: Object.freeze([
    Object.freeze({ usage: 'body', font: Object.freeze({ fontId: 'font:v1|test', contentSha256: 'a'.repeat(64), family: 'טסט', weight: 400, style: 'normal' as const }) }),
    Object.freeze({ usage: 'note-body', font: Object.freeze({ fontId: 'font:v1|test', contentSha256: 'a'.repeat(64), family: 'טסט', weight: 400, style: 'normal' as const }) }),
    Object.freeze({ usage: 'heading', font: Object.freeze({ fontId: 'font:v1|test', contentSha256: 'a'.repeat(64), family: 'טסט', weight: 400, style: 'normal' as const }) }),
    Object.freeze({ usage: 'note-marker', font: Object.freeze({ fontId: 'font:v1|test', contentSha256: 'a'.repeat(64), family: 'טסט', weight: 400, style: 'normal' as const }) }),
  ]),
  fontsManifestSha256: 'f'.repeat(64),
  assetsManifestSha256: '0'.repeat(64),
});

const REQUEST: TypesetRequest = (() => {
  const r = parseSourceText(SOURCE, { documentId: 'job-lifecycle-test' });
  return {
    document: { ...r.doc, transforms: r.transforms },
    settings: SETTINGS,
    assets: ASSETS,
    trace: 'off',
    budget: DEFAULT_SEARCH_BUDGET,
    sourceSha256: '5'.repeat(64),
    parserVersion: 'test-1',
  } as unknown as TypesetRequest;
})();

function makePayload(): { request: TypesetRequest; fonts: { record: typeof FONT; bytes: Uint8Array }[]; wasmBytes: Uint8Array; woff2DecoderBytes: Uint8Array } {
  return {
    request: REQUEST,
    fonts: [{ record: FONT, bytes: new Uint8Array([1, 2, 3]) }],
    wasmBytes: new Uint8Array([4]),
    woff2DecoderBytes: new Uint8Array([5, 6]),
  };
}

/** מנוע עם דיווח progress עשיר — יחידות וסך מהמנוע, לא מונה מקומי. */
function typesetWithRichProgress(): typeof engineTypeset {
  return ((request: TypesetRequest, provider: AnyProvider, policy: { policyId: string }, observer?: { onProgress: (stage: string, completedUnits: number, totalUnits?: number) => void }) => {
    observer?.onProgress('parse', 0);
    observer?.onProgress('breaking', 3, 7);
    observer?.onProgress('finalizing', 7);
    return engineTypeset(request, provider, policy);
  }) as unknown as typeof engineTypeset;
}

/** ערוץ מזויף — המנוע האמיתי בתוך handler טהור; הודעות במיקרו־טאסקים. */
class Channel implements WorkerLike {
  private clientHandler: ((msg: WorkerResponse) => void) | undefined;
  readonly workerSaw: WorkerRequest[] = [];
  private handler: ((msg: unknown, port: WorkerPort) => Promise<void>) | undefined;
  private port: WorkerPort | undefined;

  constructor(typesetImpl: typeof engineTypeset = engineTypeset) {
    this.handler = createEngineHandler({
      createProvider: async () => createTestMeasurementProvider(),
      typeset: typesetImpl,
    });
    this.port = { post: (m) => queueMicrotask(() => this.clientHandler?.(m)) };
  }

  postMessage(msg: WorkerRequest): void {
    this.workerSaw.push(msg);
    void this.handler?.(msg, this.port as WorkerPort);
  }

  onMessage(handler: (msg: WorkerResponse) => void): void {
    this.clientHandler = handler;
  }

  /** הזרקת שארית מאוחרת ישר ללקוח — מדמה הודעה שהגיעה אחרי ביטול. */
  inject(msg: WorkerResponse): void {
    this.clientHandler?.(msg);
  }
}

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const resetStores = (): void => {
  useRunStore.getState().reset();
  useResultStore.getState().reset();
  useEditorStore.getState().reset();
};

const runInput = () => ({
  source: SOURCE,
  settings: SETTINGS,
  assets: ASSETS,
  fonts: [{ record: FONT, bytes: new Uint8Array([1]) }],
  wasmBytes: new Uint8Array([1]),
  woff2DecoderBytes: new Uint8Array([1]),
  documentId: 'ui',
  sourceRevision: useEditorStore.getState().revision,
});

beforeEach(resetStores);
afterEach(resetStores);

describe('שלב 83: progress נאמן — יחידות המנוע, לא מונה מקומי', () => {
  test('ה-handler מעביר (stage, completedUnits, totalUnits) כמות שהן; אין מונה אירועים', async () => {
    const posts: WorkerResponse[] = [];
    const port: WorkerPort = { post: (m) => posts.push(m) };
    const handler = createEngineHandler({
      createProvider: async () => createTestMeasurementProvider(),
      typeset: typesetWithRichProgress(),
    });
    await handler({ type: 'prepare', jobId: 'jp-1', protocolVersion: WORKER_PROTOCOL_VERSION, payload: makePayload() }, port);
    const progress = posts.filter((p): p is Extract<WorkerResponse, { type: 'progress' }> => p.type === 'progress');
    expect(progress.some((p) => p.stage === 'breaking' && p.completedUnits === 3 && p.totalUnits === 7)).toBe(true);
    // 'finalizing' מגיע עם completedUnits=7 מהמנוע — מונה מקומי היה מדווח 3 (מספר האירועים)
    expect(progress.some((p) => p.stage === 'finalizing' && p.completedUnits === 7 && p.totalUnits === undefined)).toBe(true);
    for (const p of posts) expect(isWorkerResponse(p)).toBe(true);
    expect(posts.some((p) => p.type === 'done')).toBe(true);
  });

  test('המנצח מסדר totalUnits ב-runStore.progress — עד הסטור; אחוזים בתצוגה בלבד', async () => {
    const seen: Array<{ stage: string; completedUnits: number; totalUnits: number | null }> = [];
    const unsub = useRunStore.subscribe((s) => {
      if (s.progress !== null && (seen.length === 0 || seen[seen.length - 1] !== s.progress)) {
        seen.push({ stage: s.progress.stage, completedUnits: s.progress.completedUnits, totalUnits: s.progress.totalUnits });
      }
    });
    const controller = new TypesetController({ client: new WorkerClient(new Channel(typesetWithRichProgress())) });
    controller.run(runInput());
    await settle();
    await settle();
    expect(useRunStore.getState().phase).toBe('done');
    expect(useRunStore.getState().progress).toBeNull();
    expect(seen.some((p) => p.stage === 'breaking' && p.completedUnits === 3 && p.totalUnits === 7)).toBe(true);
    unsub();
  });
});

describe('שלב 83: ביטול — ניקוי מאזינים ומפה; אין זליגת jobs', () => {
  test('cancel מרוקן את המפה ומנקה מנויים; שארית מאוחרת אינה מפעילה אותם', async () => {
    const channel = new Channel();
    const client = new WorkerClient(channel);
    let calls = 0;
    const onCalls = (): void => { calls += 1; };
    const handle = client.submit(makePayload(), { onProgress: onCalls });
    handle.onProgress(onCalls);
    expect(client.retainedJobs).toBe(1);
    expect(client.activeJobs).toBe(1);
    handle.cancel();
    await expect(handle.done).rejects.toBeInstanceOf(WorkerJobCancelled);
    expect(client.retainedJobs).toBe(0);
    expect(client.activeJobs).toBe(0);
    // שארית מאוחרת של אותו job — המנויים לא הופעלו שוב (נוקו)
    const before = calls;
    channel.inject({ type: 'progress', jobId: handle.jobId, stage: 'late', completedUnits: 99 });
    expect(calls).toBe(before);
  });

  test('done עם inputHash שונה ⇐ הרישום מוסר; ההבטחה נשארת תלויה (מתועד)', async () => {
    // מאזין משוכפל שמשבש את ה-inputHash בתשובת done — תוצאה של קלט אחר
    const channel = new Channel();
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
    expect(client.retainedJobs).toBe(0);
    expect(client.activeJobs).toBe(0);
  });

  test('עובד: cancel לפני prepare — הרישום מתנקה בפגישה; prepare חוזר רץ ומסיים', async () => {
    const posts: WorkerResponse[] = [];
    const port: WorkerPort = { post: (m) => posts.push(m) };
    const handler = createEngineHandler({
      createProvider: async () => createTestMeasurementProvider(),
      typeset: engineTypeset,
    });
    await handler({ type: 'cancel', jobId: 'cx' }, port);
    await handler({ type: 'prepare', jobId: 'cx', protocolVersion: WORKER_PROTOCOL_VERSION, payload: makePayload() }, port);
    expect(posts).toEqual([]); // נזרק — והרישום מתנקה
    await handler({ type: 'prepare', jobId: 'cx', protocolVersion: WORKER_PROTOCOL_VERSION, payload: makePayload() }, port);
    // בקוד הקודם הרישום היה נשאר — וה-prepare השני היה נזרק לנצח; כעת רץ עד סוף
    expect(posts.some((p) => p.type === 'done')).toBe(true);
  });

  test('ביטול אינו משנה את תוצאת job הבא (§17.2#10) — hash זהה לריצה נקייה', async () => {
    // ריצה נקייה — ערך ייחוס
    const clean = new TypesetController({ client: new WorkerClient(new Channel()) });
    clean.run(runInput());
    await settle();
    const cleanHash = useResultStore.getState().layoutHash;
    expect(cleanHash).toHaveLength(64);
    resetStores();
    // ביטול בדרך — ואז ריצה חדשה של אותו מקור
    const controller = new TypesetController({ client: new WorkerClient(new Channel()) });
    controller.run(runInput());
    controller.cancel();
    controller.run(runInput());
    await settle();
    expect(useRunStore.getState().phase).toBe('done');
    expect(useResultStore.getState().layoutHash).toBe(cleanHash);
    expect(useResultStore.getState().ir!.pages.length).toBeGreaterThan(0);
  });

  test('מחזור חיים מלא — job שהסתיים, job שבוטל ו-job עם hash שונה: המפה מתרוקנת', async () => {
    // job 1 — מסתיים כרגיל (ערוץ נקי)
    const c1 = new WorkerClient(new Channel());
    const h1 = c1.submit(makePayload());
    await h1.done;
    expect(c1.retainedJobs).toBe(0);
    // job 2 — מבוטל
    const c2 = new WorkerClient(new Channel());
    const h2 = c2.submit(makePayload());
    h2.cancel();
    await expect(h2.done).rejects.toBeInstanceOf(WorkerJobCancelled);
    expect(c2.retainedJobs).toBe(0);
    // job 3 — done עם inputHash שונה (המאזין משבש)
    const channel3 = new Channel();
    const c3 = new WorkerClient({
      postMessage: (msg) => { channel3.postMessage(msg); },
      onMessage: (h) => {
        channel3.onMessage((msg) => {
          if (msg.type === 'done') {
            h({ type: 'done', jobId: msg.jobId, result: { ...msg.result, manifest: { ...msg.result.manifest, inputHash: '0'.repeat(64) } } });
            return;
          }
          h(msg);
        });
      },
    });
    const h3 = c3.submit(makePayload());
    void h3;
    await new Promise<void>((r) => setTimeout(r, 20));
    expect(c3.retainedJobs).toBe(0);
    expect(c3.activeJobs).toBe(0);
  });
});
