/**
 * differential-main.mjs — ריצת ייחוס בתהליך הראשי (Node) להשוואת
 * Node==Worker של שלב 48. אותה בקשה בדיוק כמו differential-worker.mjs
 * (אותו documentId, אותן הגדרות) — ההבדל היחיד: main thread מול worker.
 *
 * שימוש: node scripts/migration/differential-main.mjs <fixture> <documentId>
 * פלט: שורה אחת — layoutHash.
 */
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = join(new URL('.', import.meta.url).pathname, '..', '..');
const ma = await import(join(repoRoot, 'packages', 'measurement-api', 'dist', 'index.js'));
const cm = await import(join(repoRoot, 'packages', 'content-model', 'dist', 'index.js'));
const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const mh = await import(join(repoRoot, 'packages', 'measurement-harfbuzz', 'dist', 'index.js'));

const [fixture, documentId] = process.argv.slice(2);
const manifestBytes = readFileSync(join(repoRoot, 'assets', 'fonts', 'manifest.json'));
const manifest = ma.assertFontManifest(JSON.parse(manifestBytes.toString('utf8')));
const guttman = manifest.find((r) => r.file === 'Guttman-Rashi-Normal.woff2');
const guttmanBytes = new Uint8Array(readFileSync(join(repoRoot, 'assets', 'fonts', guttman.file)));
const font = ma.verifyFontBytes(guttman, guttmanBytes);
const hbMod = await import('harfbuzzjs');
const hb = hbMod.default ?? hbMod;
const wawoff2Mod = await import('wawoff2');
const wawoff2 = wawoff2Mod.default ?? wawoff2Mod;
const provider = await mh.createHarfbuzzProvider({
  hb,
  wasmBytes: new Uint8Array(readFileSync(require.resolve('harfbuzzjs/dist/harfbuzz.wasm'))),
  woff2DecoderBytes: new Uint8Array(readFileSync(require.resolve('wawoff2/build/decompress_binding.js'))),
  decompressWoff2: (b) => wawoff2.decompress(b),
  fonts: [{ record: guttman, bytes: guttmanBytes, key: font }],
});

const VALUES = {
  'size-body': 12, 'line-height-body': 1.34, 'prop-margin': 7.5, 'note-marker-size': 8,
  'note-marker-type': 'super', 'fn-reset-mode': 'page', 'page-num-format': 'gematria', 'page-num-initial-value': 1,
};
const raw = readFileSync(fixture, 'utf8');
const parsed = cm.parseSourceText(raw, { documentId, sourceName: 'fixture.txt' });
const request = {
  document: { ...parsed.doc, transforms: parsed.transforms },
  settings: { schemaVersion: 1, enginePolicyId: 'torah-v1', values: VALUES, configHash: 'c'.repeat(64) },
  assets: { schemaVersion: 1, fonts: [{ usage: 'body', font }], fontsManifestSha256: 'f'.repeat(64), assetsManifestSha256: '0'.repeat(64) },
  trace: 'off',
  budget: { maxCandidatesPerState: 512, maxBeamWidth: 64, maxExpandedStates: 200000, maxOuterIterations: 8 },
  sourceSha256: '5'.repeat(64),
  parserVersion: 'content-model@0.1.0',
};
const out = engine.typeset(request, provider, { policyId: 'torah-v1' });
console.log(out.manifest.layoutHash);
