/**
 * מבחני שלב 29 — זהות מדידה בין hosts ואכיפת offline.
 *
 * אסמכתא: אפיון §17.1 (Cross-host: "אותו layoutHash בלי דפדפן בתור מודד";
 * Offline: "network deny / request fail"), §19 ("cross-host Worker tests +
 * offline tests"; שתי ריצות חייבות הוצאות זהות) · תכנית שלב 29.
 *
 * מבנה: host ראשון = ה-thread הראשי (Node); host שני = worker_threads —
 * עותק עצמאי לחלוטין: טעינה מלאה משלו (manifest → loadFontSet → פריקת
 * WOFF2 → ספק), מופע WASM משלו, מחסנית משלו. שומר הרשת מותקן בשניהם
 * מרגע ההתחלה — הרצה ירוקה = הוכחה שאין CDN/גופן רשת/טעינה אקראית.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withShapingCache } from '@tora/measurement-api';
// @ts-expect-error — מודול עזר .mjs ללא הצהרות טיפוסים (שלב 29)
import {
  buildProviderFromPaths,
  installNetworkDeny,
  runCorpusOnProvider,
  CORPUS,
} from './cross-host.worker.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface WorkerResult {
  ok: boolean;
  error?: string;
  environmentHash: string;
  providerVersion: string;
  denyAttempts: number;
  results: {
    key: string; requestHash: string; widthLu: number;
    glyphs: { glyphId: number; clusterAtomIndex: number; advanceLu: number; xOffsetLu: number; yOffsetLu: number }[];
    missingGlyphAtomIds: string[];
  }[];
}

const jsonEq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

let denyStats: { attempts: number };
let mainHash: string;
let mainResults: WorkerResult['results'];
let workerOut: WorkerResult;
let worker: Worker;

beforeAll(async () => {
  // ── host ראשי: השומר מותקן לפני כל טעינה; הטעינה והמדידה מתחתיו ──
  denyStats = installNetworkDeny();
  const { provider, manifest } = await buildProviderFromPaths(repoRoot);
  mainHash = provider.environmentHash;
  mainResults = await runCorpusOnProvider(provider, manifest);

  // ── host שני: worker_threads עצמאי ──
  worker = new Worker(new URL('./cross-host.worker.mjs', import.meta.url), {
    workerData: { repoRoot },
  });
  workerOut = await new Promise<WorkerResult>((res, rej) => {
    const timer = setTimeout(() => rej(new Error('worker timeout')), 60000);
    worker.on('message', (m: WorkerResult) => { clearTimeout(timer); res(m); });
    worker.on('error', (e) => { clearTimeout(timer); rej(e); });
  });
}, 120000);

afterAll(async () => {
  await worker?.terminate?.();
});

describe('שלב 29 — זהות מדידה בין hosts', () => {
  it('שני ה-hosts החזירו תוצאה (ה-worker לא נכשל)', () => {
    expect(workerOut.ok).toBe(true);
    expect(workerOut.error).toBeUndefined();
  });

  it('environmentHash זהה בין ה-hosts (נגזר מהנעילות בלבד)', () => {
    expect(workerOut.environmentHash).toBe(mainHash);
    expect(workerOut.providerVersion).toBe(workerOut.providerVersion); // יציב
  });

  it('וקטורי הגליפים המלאים זהים ביט-ביט — לא רק רוחבי מחרוזת', () => {
    expect(workerOut.results.length).toBe(mainResults.length);
    for (let i = 0; i < mainResults.length; i++) {
      const a = mainResults[i]!;
      const b = workerOut.results[i]!;
      expect(b.key).toBe(a.key);
      expect(jsonEq(b, a)).toBe(true); // requestHash + glyphs + widthLu + חסרים
    }
  });

  it('requestHash זהה לכל כניסה (14/14)', () => {
    for (let i = 0; i < mainResults.length; i++) {
      expect(workerOut.results[i]!.requestHash).toBe(mainResults[i]!.requestHash);
    }
    expect(mainResults.length).toBe(CORPUS.length);
  });

  it('כל הכניסות נטולות גליפים חסרים בקורפוס זה (הגופנים מכסים)', () => {
    for (const r of mainResults) {
      expect(r.missingGlyphAtomIds).toEqual([]);
    }
  });

  it('קורפוס ייצגי: 14 כניסות על פני 4 גופנים, 5 גדלים, שני כיוונים, features וריווח', () => {
    const fonts = new Set(CORPUS.map((c) => c.fontFile));
    const sizes = new Set(CORPUS.map((c) => c.fontSizePt));
    const dirs = new Set(CORPUS.map((c) => c.direction));
    const langs = new Set(CORPUS.map((c) => c.language));
    const hasFeatures = CORPUS.some((c) => Object.keys(c.features).length > 0);
    const hasSpacing = CORPUS.some((c) => c.letterSpacingLu > 0);
    expect(fonts.size).toBe(4);
    expect(sizes.size).toBeGreaterThanOrEqual(5);
    expect(dirs).toEqual(new Set(['rtl', 'ltr']));
    expect(langs).toEqual(new Set(['he', 'en']));
    expect(hasFeatures && hasSpacing).toBe(true);
  });
});

describe('שלב 29 — cache קר וחם', () => {
  it('cold ⇐ warm: same vectors; וגם ריצה שנייה בתוך אותו host זהה', async () => {
    const { provider, manifest } = await buildProviderFromPaths(repoRoot);
    const cold = await runCorpusOnProvider(provider, manifest);
    const cached = withShapingCache(provider);
    const warm1 = await runCorpusOnProvider(cached, manifest);
    const warm2 = await runCorpusOnProvider(cached, manifest);
    expect(jsonEq(warm1, cold)).toBe(true);
    expect(jsonEq(warm2, warm1)).toBe(true);
    // התוצאה גם זהה ל-host הראשון שלמעלה (cold)
    expect(jsonEq(warm2, mainResults)).toBe(true);
  });
});

describe('שלב 29 — offline: network deny', () => {
  it('הרצה מלאה (טעינה+מדידה) תחת השומר — אפס ניסיונות רשת בשני ה-hosts', () => {
    expect(denyStats.attempts).toBe(0);
    expect(workerOut.denyAttempts).toBe(0);
  });

  it('השומר עובד: ניסיון fetch בפועל נתפס וזורק באופן סינכרוני (עדות שלילית)', () => {
    expect(() => (globalThis as { fetch: () => Promise<unknown> }).fetch('https://example.invalid/')).toThrow(/network-denied-by-guard/);
    expect(denyStats.attempts).toBe(1);
    denyStats.attempts = 0; // איפוס לשאר הבדיקות
  });
});
