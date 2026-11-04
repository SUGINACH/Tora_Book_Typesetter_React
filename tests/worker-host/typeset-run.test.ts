/**
 * typeset-run.test.ts — בדיקות מנצח הריצה מעל ה־Worker (שלב 77; §12–13).
 *
 * מה מוכח כאן — על המנוע האמיתי דרך הפרוטוקול (ערוץ מזויף; ספק בדיקה):
 *   1. מסלא מלא: begin(preparing) ← progress(running) ← done(auditing→done)
 *      עם IR קפוא + manifest + ממצאי ביקורת ב־resultStore.
 *   2. ביטול בזמן ריצה — אין תוצאה חלקית; done מאוחר נזרק.
 *   3. החלפת מסמך (supersede) — רק תוצאת האחרון מוצגת.
 *   4. שגיאת מנוע ⇐ מפתח קטלוגי ב־runStore, לא message גולמי.
 *   5. anchors=null מתועד (AnchorTable אינה בפרוטוקול v1) — לא המצאה.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { typeset as engineTypeset } from '@tora/layout-engine';
import { buildEffectiveSettings, buildSettingRegistry } from '@tora/settings-schema';
import type { EffectiveSettings, ResolvedAssetManifest, TypesetRequest } from '@tora/layout-api';
import type { FontFaceKey } from '@tora/measurement-api';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import registryJson from '@tora/settings-schema/registry.json';
import { createEngineHandler, type WorkerPort } from '../../src/worker-host/engine-worker.js';
import { WorkerClient, type WorkerLike } from '../../src/worker-host/worker-client.js';
import type { WorkerRequest, WorkerResponse } from '../../src/worker-host/protocol.js';
import { TypesetController, type UiTypesetRunInput } from '../../src/worker-host/typeset-run.js';
import { useRunStore, type RunPhase } from '../../src/stores/run-store.js';
import { useResultStore } from '../../src/stores/result-store.js';

const registry = buildSettingRegistry(registryJson as unknown as Parameters<typeof buildSettingRegistry>[0]);
const settings: Readonly<EffectiveSettings> = buildEffectiveSettings(registry, []);

const FONT_KEY: FontFaceKey = Object.freeze({
  fontId: 'font:v1|test',
  contentSha256: 'a'.repeat(64),
  family: 'Test',
  weight: 400,
  style: 'normal',
});

const ASSETS: ResolvedAssetManifest = {
  schemaVersion: 1,
  fonts: [
    { usage: 'body', font: FONT_KEY },
    { usage: 'note-body', font: FONT_KEY },
    { usage: 'heading', font: FONT_KEY },
    { usage: 'note-marker', font: FONT_KEY },
  ],
  fontsManifestSha256: 'a'.repeat(64),
  assetsManifestSha256: '0'.repeat(64),
};

const SOURCE_A = `שם הספר - ספר בדיקה א
כותרת 1 מספר 1 - פרק ראשון
פסקה ראשונה עם ניקוד ומספרים 123 והערה [הערת שוליים] והמשך הפסקה עוד ועוד טקסט.
ופסקה שניה עם מלים נוספות כדי למלא שורות בטור הראשון וגם בשני ועוד ועוד.
`;

const SOURCE_B = `שם הספר - ספר בדיקה ב
כותרת 1 מספר 1 - פרק אחר לגמרי
פסקה שונה בתכלית עם תוכן אחר כדי שהפריסה תהיה שונה משמעותית ממסמך א.
`;

const runInputOf = (source: string): UiTypesetRunInput => ({
  source,
  settings,
  assets: ASSETS,
  fonts: [{
    record: {
      file: 'test.woff2', fontId: 'font:v1|test', sha256: 'a'.repeat(64),
      family: 'טסט', group: 'bundled',
      binaryFormat: 'woff2',
      unitsPerEm: 1000, weight: 400, style: 'normal',
      distributionBlocked: { blocked: false, reason: 'test', decision: null, policy: 'test' },
    },
    bytes: new Uint8Array([1, 2, 3, 4]),
  }],
  wasmBytes: new Uint8Array([1]),
  woff2DecoderBytes: new Uint8Array([1]),
});

/** ערוץ מזויף — המנוע האמיתי בתוך handler טהור; ההודעות במיקרו־טאסקים. */
class Channel implements WorkerLike {
  private clientHandler: ((msg: WorkerResponse) => void) | undefined;
  private readonly deliver: (msg: unknown) => Promise<void>;

  constructor(typesetImpl: typeof engineTypeset = engineTypeset) {
    const handler = createEngineHandler({
      createProvider: async () => createTestMeasurementProvider(),
      typeset: typesetImpl,
    });
    const port: WorkerPort = { post: (m) => queueMicrotask(() => this.clientHandler?.(m)) };
    this.deliver = (msg) => handler(msg, port);
  }

  postMessage(msg: WorkerRequest): void {
    void this.deliver(msg);
  }

  onMessage(handler: (msg: WorkerResponse) => void): void {
    this.clientHandler = handler;
  }
}

const resetStores = (): void => {
  useRunStore.getState().reset();
  useResultStore.getState().reset();
};

const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

/** הקלטת רצף המצבים — הוכחת מסלול מלא ללא תזמון שביר. */
const recordPhases = (): RunPhase[] => {
  const phases: RunPhase[] = [];
  const unsub = useRunStore.subscribe((s) => {
    if (phases[phases.length - 1] !== s.phase) phases.push(s.phase);
  });
  return Object.defineProperty(phases, 'unsubscribe', { value: unsub }) as RunPhase[];
};

beforeEach(resetStores);
afterEach(() => {
  resetStores();
});

describe('typeset-run — מסלול מלא דרך ה־Worker', () => {
  test('begin←progress←done: preparing→running→auditing→done; IR קפוא + manifest + ממצאים', async () => {
    const phases = recordPhases();
    const controller = new TypesetController({ client: new WorkerClient(new Channel()) });
    controller.run(runInputOf(SOURCE_A));
    expect(useRunStore.getState().phase).toBe('preparing');
    expect(useRunStore.getState().jobId).toBe(controller.currentJobId);
    await settle();
    const run = useRunStore.getState();
    expect(run.phase).toBe('done');
    expect(run.progress).toBeNull();
    // סדר המצבים — ללא דילוגים
    expect(phases).toEqual(['preparing', 'running', 'auditing', 'done']);
    (phases as unknown as { unsubscribe: () => void }).unsubscribe();
    // התוצאה
    const result = useResultStore.getState();
    expect(result.ir).not.toBeNull();
    expect(result.ir!.pages.length).toBeGreaterThan(0);
    expect(Object.isFrozen(result.ir)).toBe(true);
    expect(Object.isFrozen(result.ir!.pages)).toBe(true);
    expect(result.manifest).not.toBeNull();
    expect(result.manifest!.engine).toBe('next');
    expect(result.layoutHash).toBe(result.manifest!.layoutHash);
    expect(Array.isArray(result.findings)).toBe(true);
    // AnchorTable אינה בפרוטוקול v1 — null מתועד, לא המצאה
    expect(result.anchors).toBeNull();
  });

  test('תוצאה זהה להרצה ישירה של אותו מנוע — hash יציב לאותו קלט', async () => {
    const controller = new TypesetController({ client: new WorkerClient(new Channel()) });
    controller.run(runInputOf(SOURCE_A));
    await settle();
    const hash1 = useResultStore.getState().layoutHash;
    resetStores();
    controller.run(runInputOf(SOURCE_A));
    await settle();
    expect(useResultStore.getState().layoutHash).toBe(hash1);
    // מקור שונה ⇐ hash שונה
    controller.run(runInputOf(SOURCE_B));
    await settle();
    expect(useResultStore.getState().layoutHash).not.toBe(hash1);
  });
});

describe('typeset-run — ביטול והחלפת מסמך (stale)', () => {
  test('ביטול בזמן ריצה: cancelled; אין תוצאה חלקית; done מאוחר לא נכנס', async () => {
    const controller = new TypesetController({ client: new WorkerClient(new Channel()) });
    controller.run(runInputOf(SOURCE_A));
    const jobId = controller.currentJobId;
    controller.cancel();
    const run = useRunStore.getState();
    expect(run.phase).toBe('cancelled');
    expect(run.jobId).toBe(jobId); // נשמר — הודעה מאוחרת מזוהה
    await settle();
    await settle();
    // הערוץ זרק את התוצאה (בוטל); לא נכנס כלום ל־resultStore
    expect(useResultStore.getState().ir).toBeNull();
    expect(useRunStore.getState().phase).toBe('cancelled');
  });

  test('החלפת מסמך: supersede — רק תוצאת האחרון נרשמת', async () => {
    const controller = new TypesetController({ client: new WorkerClient(new Channel()) });
    // ערכי ייחוס מהרצות בודדות
    controller.run(runInputOf(SOURCE_A));
    await settle();
    const hashA = useResultStore.getState().layoutHash;
    resetStores();
    controller.run(runInputOf(SOURCE_B));
    await settle();
    const hashB = useResultStore.getState().layoutHash;
    expect(hashB).not.toBe(hashA);
    // ועכשיו ההחלפה: A ומיד B — הסופי הוא B בלבד
    resetStores();
    const phases = recordPhases();
    controller.run(runInputOf(SOURCE_A));
    controller.run(runInputOf(SOURCE_B));
    await settle();
    await settle();
    expect(useRunStore.getState().phase).toBe('done');
    expect(useResultStore.getState().layoutHash).toBe(hashB);
    expect(phases).toContain('cancelled'); // A בוטל בדרך
    (phases as unknown as { unsubscribe: () => void }).unsubscribe();
  });
});

describe('typeset-run — שגיאות מתורגמות (§12.1)', () => {
  test('כשל מנוע ⇐ errorCode קטלוגי ב־runStore; אין תוצאה; אין message גולמי', async () => {
    const failing = (() => {
      throw Object.assign(new Error('raw secret message'), { catalogKey: 'errors.engine.ENGINE_BUDGET_EXCEEDED', params: { budget: 1 } });
    }) as unknown as typeof engineTypeset;
    const controller = new TypesetController({ client: new WorkerClient(new Channel(failing)) });
    controller.run(runInputOf(SOURCE_A));
    await settle();
    const run = useRunStore.getState();
    expect(run.phase).toBe('error');
    expect(run.errorCode).toBe('errors.engine.ENGINE_BUDGET_EXCEEDED');
    expect(JSON.stringify(run)).not.toContain('raw secret message');
    expect(useResultStore.getState().ir).toBeNull();
  });

  test('cancel ואז run חדש — המצב נפתח מחדש כרגיל (בלי reset ידני)', async () => {
    const controller = new TypesetController({ client: new WorkerClient(new Channel()) });
    controller.run(runInputOf(SOURCE_A));
    controller.cancel();
    controller.run(runInputOf(SOURCE_B));
    expect(useRunStore.getState().phase).toBe('preparing');
    await settle();
    expect(useRunStore.getState().phase).toBe('done');
    expect(useResultStore.getState().ir!.pages.length).toBeGreaterThan(0);
  });
});
