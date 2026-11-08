/**
 * e2e-skeleton.test.ts — מבחן שלד מהלך קצה־לקצה (שלב 39; אפיון §17–19, §18-M4).
 *
 * שרשרת ההוכחה על fixture ייחוס אחד, הכול עם אותו layoutHash:
 *   CLI (תהליך אמיתי, ספק אמיתי) ← IR קנוני ← audit ← HTML ← Worker (הערוץ)
 *   ← preview (מודל ההיטל).
 *
 * מה מוכח כאן (שער M4):
 *   1. שלוש ריצות CLI ⇐ אותו hash; אדישות לשם קובץ (§17.2#1, #8).
 *   2. Node בתהליך: trace off/decisions ⇐ אותו hash (§17.2#2); cold/warm
 *      (withShapingCache) ⇐ אותו hash; הכול == hash ה-CLI.
 *   3. Worker: אותה בקשה דרך הפרוטוקול (WorkerClient+handler) ⇐ אותו hash
 *      (§17.2#3 — Node==Worker); ביטול job עובד ואינו משפיע על הבא (§17.2#10).
 *   4. HTML: render-html מה-IR — קנוני ביט-ביט; אותם bytes מה-IR של ה-Worker.
 *   5. Audit: הפריסה נקייה (0 HIGH) וכיסוי האטומים מלא.
 *   6. Preview: מודל ההיטל דטרמיניסטי ומכסה את העמודים.
 *
 * זהו מבחן ארכיטקטוני — לא מבחן דפדפן של המנוע (§18-M4; דפדפן בשכבת
 * ה-visual audit העתידית). הספק: HarfBuzz/WASM האמיתי בכל הרגליים.
 */
import { afterAll, describe, expect, test } from 'vitest';
import { WorkerClient, WorkerJobCancelled, type WorkerLike } from '../../src/worker-host/worker-client.js';
import { createEngineHandler } from '../../src/worker-host/engine-worker.js';
import { projectLayout } from '../../src/renderers/preview-model.js';
import type { FontManifestRecord, MeasurementProvider, TypesetRequest } from '@tora/layout-api';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const BIN = join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
const FIXTURE = join(repoRoot, 'packages', 'cli', 'test', 'fixtures', 'reference-source.txt');
const require = createRequire(import.meta.url);

// ─────────────────────────── עזרי ספק אמיתי ───────────────────────────

const ma = await import('@tora/measurement-api');
const cm = await import('@tora/content-model');
const la = await import('@tora/layout-api');
const engine = await import('@tora/layout-engine');
const rh = await import('@tora/render-html');
const ss = await import('@tora/settings-schema');
const mh = await import('@tora/measurement-harfbuzz');

const manifestPath = join(repoRoot, 'assets', 'fonts', 'manifest.json');
const manifestBytes = await readFile(manifestPath);
const manifest = ma.assertFontManifest(JSON.parse(manifestBytes.toString('utf8')));
const guttmanFound = manifest.find((r) => r.file === 'Guttman-Rashi-Normal.woff2');
if (guttmanFound === undefined) throw new Error('Guttman-Rashi-Normal not in manifest');
const guttman: FontManifestRecord = guttmanFound;
const guttmanBytes = new Uint8Array(await readFile(join(repoRoot, 'assets', 'fonts', guttman.file)));
const guttmanKey = ma.verifyFontBytes(guttman, guttmanBytes);
const fontsManifestSha256 = ma.sha256Bytes(new TextEncoder().encode(manifestBytes.toString('utf8')));

/** ספק HarfBuzz אמיתי מהנעילות (אותו bytes; ADR-003). */
async function buildProvider(): Promise<MeasurementProvider> {
  const hbMod = (await import('harfbuzzjs')) as unknown as { default?: unknown };
  const hb = (hbMod.default ?? hbMod) as never;
  const wawoff2Mod = (await import('wawoff2')) as { default?: unknown; decompress: (b: Uint8Array) => Promise<Uint8Array> };
  const wawoff2 = (wawoff2Mod.default ?? wawoff2Mod) as { decompress: (b: Uint8Array) => Promise<Uint8Array> };
  return mh.createHarfbuzzProvider({
    hb,
    wasmBytes: new Uint8Array(await readFile(require.resolve('harfbuzzjs/dist/harfbuzz.wasm'))),
    woff2DecoderBytes: new Uint8Array(await readFile(require.resolve('wawoff2/build/decompress_binding.js'))),
    decompressWoff2: (bytes: Uint8Array) => wawoff2.decompress(bytes),
    fonts: [{ record: guttman, bytes: guttmanBytes, key: guttmanKey }],
  });
}

/** בקשה זהה ל-CLI (אותם רכיבי inputHash; documentId קבוע). */
async function buildRequest(trace: 'off' | 'decisions') {
  const registry = ss.buildSettingRegistry(JSON.parse(await readFile(join(repoRoot, 'packages', 'settings-schema', 'registry.json'), 'utf8')));
  const settings = ss.buildEffectiveSettings(registry, []);
  const source = await readFile(FIXTURE, 'utf8');
  const parsed = cm.parseSourceText(source, { documentId: 'cli-reference' });
  return {
    request: {
      document: { ...parsed.doc, transforms: parsed.transforms },
      settings,
      assets: {
        schemaVersion: 1,
        fonts: [
          { usage: 'body', font: guttmanKey },
          { usage: 'note-body', font: guttmanKey },
          { usage: 'heading', font: guttmanKey },
          { usage: 'note-marker', font: guttmanKey },
        ],
        fontsManifestSha256,
        assetsManifestSha256: '0'.repeat(64),
      },
      trace,
      budget: la.DEFAULT_SEARCH_BUDGET,
      sourceSha256: ma.sha256Bytes(new TextEncoder().encode(source)),
      parserVersion: 'content-model@0.1.0',
    } as TypesetRequest,
    source,
  };
}

const tmp = await mkdtemp(join(tmpdir(), 'e2e-skeleton-'));
const runCliBin = (args: string[]) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: repoRoot, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

// ─────────────────────────── 1. CLI — שלוש ריצות ───────────────────────────

const out1 = join(tmp, 'run1');
const out2 = join(tmp, 'run2');
const out3 = join(tmp, 'run3');
const copyFixture = join(tmp, 'renamed-book.txt');
await cp(FIXTURE, copyFixture);

const r1 = runCliBin(['--input', FIXTURE, '--out', out1, '--trace', 'decisions', '--html']);
const r2 = runCliBin(['--input', FIXTURE, '--out', out2]);
const r3 = runCliBin(['--input', copyFixture, '--out', out3]);

if (r1.code !== 0 || r2.code !== 0 || r3.code !== 0) {
  throw new Error(`CLI runs failed: ${r1.stderr.slice(0, 300)} | ${r2.stderr.slice(0, 200)}`);
}
const H1 = (JSON.parse(r1.stdout.trim().split('\n').pop() as string) as { layoutHash: string }).layoutHash;
const H2 = (JSON.parse((await readFile(join(out2, 'report.json'), 'utf8'))) as { layoutHash: string }).layoutHash;
const H3 = (JSON.parse((await readFile(join(out3, 'report.json'), 'utf8'))) as { layoutHash: string }).layoutHash;

describe('שלב 39: שלד מהלך קצה־לקצה — CLI ← IR ← audit ← HTML ← Worker ← preview', () => {
  test('CLI: שלוש ריצות (כולל שם קובץ שונה) ⇐ אותו layoutHash; artifacts מלאים', () => {
    expect(r1.code).toBe(0);
    expect(r2.code).toBe(0);
    expect(r3.code).toBe(0);
    expect(H1).toHaveLength(64);
    expect(H2).toBe(H1);
    expect(H3).toBe(H1);
    for (const f of ['layout.json', 'manifest.json', 'ledger.json', 'request.json', 'report.json', 'audit.json', 'preview.html']) {
      expect(existsSync(join(out1, f)), `${f} חסר`).toBe(true);
    }
  });

  test('IR הקנוני של ה-CLI שומר את ה-hash ב-round-trip; המניפססט תואם', async () => {
    const layoutJson = await readFile(join(out1, 'layout.json'), 'utf8');
    const layout = la.parseLayoutDocument(layoutJson);
    expect(la.layoutHash(layout)).toBe(H1);
    const manifestJson = JSON.parse(await readFile(join(out1, 'manifest.json'), 'utf8'));
    expect(manifestJson.layoutHash).toBe(H1);
    expect(manifestJson.fontsManifestSha256).toBe(fontsManifestSha256);
  });

  test('Node בתהליך: trace off/decisions ⇐ אותו hash כמו ה-CLI (§17.2#2)', async () => {
    const provider = await buildProvider();
    const off = await buildRequest('off');
    const on = await buildRequest('decisions');
    const a = engine.typeset(off.request, provider, { policyId: 'torah-v1' });
    const b = engine.typeset(on.request, provider, { policyId: 'torah-v1' });
    expect(a.manifest.layoutHash).toBe(H1);
    expect(b.manifest.layoutHash).toBe(H1);
    expect(a.ledger).toBeUndefined();
    expect(b.ledger).toBeDefined();
  });

  test('cold/warm (withShapingCache שלב 26) ⇐ אותו hash (§17.2#2)', async () => {
    const provider = await buildProvider();
    const cached = ma.withShapingCache(provider);
    const { request } = await buildRequest('off');
    const cold = engine.typeset(request, cached, { policyId: 'torah-v1' });
    const warm = engine.typeset(request, cached, { policyId: 'torah-v1' });
    expect(cold.manifest.layoutHash).toBe(H1);
    expect(warm.manifest.layoutHash).toBe(H1);
  });

  test('Worker (הפרוטוקול): אותו hash כמו Node/CLI (§17.2#3); ביטול עובד (§17.2#10)', async () => {
    const clientHandlerRef: { h?: (msg: unknown) => void } = {};
    const handler = createEngineHandler({
      createProvider: async () => buildProvider(),
      typeset: engine.typeset,
    });
    const port = { post: (m: unknown) => queueMicrotask(() => clientHandlerRef.h?.(m)) };
    const channel: WorkerLike = {
      postMessage: (msg) => { void handler(msg, port); },
      onMessage: (h) => { clientHandlerRef.h = h as (msg: unknown) => void; },
    };
    const client = new WorkerClient(channel);
    const { request } = await buildRequest('off');
    const payload = {
      request,
      fonts: [{ record: guttman, bytes: guttmanBytes }],
      wasmBytes: new Uint8Array(await readFile(require.resolve('harfbuzzjs/dist/harfbuzz.wasm'))),
      woff2DecoderBytes: new Uint8Array(await readFile(require.resolve('wawoff2/build/decompress_binding.js'))),
    };
    const handle = client.submit(payload);
    const result = await handle.done;
    expect(result.layoutHash).toBe(H1);
    // ביטול: job שמבוטל נדחה; הבא עובד
    const cancelledHandle = client.submit(payload);
    cancelledHandle.cancel();
    await expect(cancelledHandle.done).rejects.toBeInstanceOf(WorkerJobCancelled);
    const next = client.submit(payload);
    const nextResult = await next.done;
    expect(nextResult.layoutHash).toBe(H1);
  });

  test('HTML: render-html קנוני מה-IR — ביט-ביט; אותם bytes כמו preview.html של ה-CLI', async () => {
    const assetManifest = {
      schemaVersion: 1 as const,
      fonts: [{
        fontId: guttman.fontId,
        family: (guttman as unknown as { nameTable?: { family?: string | null } }).nameTable?.family ?? guttman.family ?? guttman.file,
        // שם הקובץ יחסית לספריית fonts/ — buildCss מוסיף את הקידומת בעצמו.
        // תוקן 2026-11-09: קידומת כפולה (fonts/fonts/…) בנתה 404 לכל
        // preview.html; ה-runner והבדיקה חייבים את אותו נתיב יחיד.
        file: guttman.file,
        format: guttman.binaryFormat,
        contentSha256: guttman.sha256,
      }],
    };
    const layout = la.parseLayoutDocument(await readFile(join(out1, 'layout.json'), 'utf8'));
    const a = rh.renderHtml(layout, { schemaVersion: 1 }, assetManifest);
    const b = rh.renderHtml(layout, { schemaVersion: 1 }, assetManifest);
    expect(a.html).toBe(b.html);
    expect(a.html).toContain('data-page');
    // ה-HTML מה-IR של ריצת ה-CLI השנייה — אותם bytes (אותה פריסה)
    const layout2 = la.parseLayoutDocument(await readFile(join(out2, 'layout.json'), 'utf8'));
    const c = rh.renderHtml(layout2, { schemaVersion: 1 }, assetManifest);
    expect(c.html).toBe(a.html);
    // preview.html שהפיק ה-CLI עצמו — גם הוא אותם bytes
    const cliHtml = await readFile(join(out1, 'preview.html'), 'utf8');
    expect(cliHtml).toBe(a.html);
  });

  test('Audit: הפריסה נקייה — 0 HIGH וכיסוי אטומים מלא (§14)', async () => {
    const audit = JSON.parse(await readFile(join(out1, 'audit.json'), 'utf8'));
    expect(audit.ok).toBe(true);
    expect(audit.counts.HIGH).toBe(0);
    expect(audit.stats.placedAtomOccurrences).toBe(audit.stats.contentAtoms);
    expect(audit.stats.contentAtoms).toBeGreaterThan(150);
  });

  test('Preview: מודל ההיטל דטרמיניסטי ומכסה את כל העמודים (§13.2)', async () => {
    const layout = la.parseLayoutDocument(await readFile(join(out1, 'layout.json'), 'utf8'));
    const a = projectLayout(layout);
    const b = projectLayout(layout);
    expect(a).toEqual(b);
    expect(a.length).toBe(layout.pages.length);
    expect(a[0]?.lines.length).toBeGreaterThan(0);
  });

  test('engine:audit בקריאה נפרשת על ה-artifacts ⇒ exit 0', () => {
    const r = runCliBin(['--layout', join(out1, 'layout.json')]);
    expect(r.code).toBe(0);
  });

  test('שחזור מלא מ-request.json: אותה בקשה ⇐ אותו hash (שחזור offline)', async () => {
    const req = JSON.parse(await readFile(join(out1, 'request.json'), 'utf8'));
    const parsed = cm.parseSourceText(req.source, { documentId: 'cli-reference' });
    const registry = ss.buildSettingRegistry(JSON.parse(await readFile(join(repoRoot, 'packages', 'settings-schema', 'registry.json'), 'utf8')));
    // שכבת ההגדרות שנשמרה — דרך אותו צינור ייבוא
    const settings = ss.buildEffectiveSettings(registry, [req.settings]);
    const request = {
      document: { ...parsed.doc, transforms: parsed.transforms },
      settings,
      assets: {
        schemaVersion: 1,
        fonts: [
          { usage: 'body', font: guttmanKey },
          { usage: 'note-body', font: guttmanKey },
          { usage: 'heading', font: guttmanKey },
          { usage: 'note-marker', font: guttmanKey },
        ],
        fontsManifestSha256: req.assets.fontsManifestSha256,
        assetsManifestSha256: '0'.repeat(64),
      },
      trace: 'off' as const,
      budget: la.DEFAULT_SEARCH_BUDGET,
      sourceSha256: req.sourceSha256,
      parserVersion: req.parserVersion,
    } as TypesetRequest;
    const provider = await buildProvider();
    const out = engine.typeset(request, provider, { policyId: 'torah-v1' });
    expect(out.manifest.layoutHash).toBe(H1);
  });
});

// ניקוי הזמני בסוף הקובץ — ה-artifacts הקבועים ל-CI נשמרים על ידי המאמת
afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});
