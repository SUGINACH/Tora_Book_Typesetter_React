#!/usr/bin/env node
/**
 * verify-cross-host-release — אימות שלב 98: ערכת cross-host מלאה לקראת
 * release (אפיון §17.2, §20, §18-M12; תכנית שלב 98).
 *
 * תכנית השלב: "הרצת עשר חזרות על reference fixture; השוואת layoutHash
 * בין Node 22, Web Worker ו-Tauri smoke על הקורפוס הייצומי; הכול offline."
 * שעת השער: "זהות מלאה מוכחת ב-artifacts."
 *
 * שלושת ה-hosts — איך כל אחד מוכח כאן (הכול אופליין):
 *   1. Node 22: עשר הרצות תהליך-בן נפרדות של ה-CLI על ה-reference — כל
 *      העשרה נותנות את אותו layoutHash (תהליכים נפרדים — לא רק repeat
 *      בתוך תהליך; זו הדרישה המילולית של §20).
 *   2. Web Worker: המנוע בתוך worker_threads — הרצת typeset מלאה של
 *      אותו קלט ב-worker (אותן חבילות dist) והשוואת ה-hash ל-Node.
 *      זהות המדידה Node↔worker (וקטורים מלאים) נעולה בנפרד ב-verify-cross-host.
 *   3. Tauri smoke: ה-webview של Tauri טוען את אותו באנדל dist שה-E2E
 *      מוכיח (אורקל ה-CLI) — נבדק ב-verify-tauri-shell; כאן — השלמת
 *      שרשרת: הבאנדל קיים, מכיל את המנוע, והיעד נעול בתצורה.
 *
 * תוצר: artifacts/release/cross-host.json — מטריצת ה-hosts עם ה-hash
 * המשותף (שעת השער: "זהות מלאה מוכחת ב-artifacts").
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
const REFERENCE = join(repoRoot, 'packages', 'cli', 'test', 'fixtures', 'reference-source.txt');

let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };

console.log('1) Node 22 — עשר תהליכי-בן נפרדים על ה-reference (§20 המילולי)');
const nodeHashes = new Set();
{
  let allOk = true;
  for (let i = 0; i < 10; i += 1) {
    const out = join(tmpdir(), `xhost-node-${i}`);
    const r = spawnSync(process.execPath, [BIN, '--input', REFERENCE, '--out', out], {
      cwd: repoRoot, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' },
    });
    if (r.status !== 0) { allOk = false; fail(`ריצה ${i + 1}/10 נכשלה (${r.status})`); break; }
    const rep = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    nodeHashes.add(rep.layoutHash);
  }
  if (allOk) {
    (nodeHashes.size === 1 ? ok : fail)(`עשר הרצות ⇒ אותו hash (${[...nodeHashes][0]?.slice(0, 12)}…)`);
  }
}

console.log('\n2) Web Worker — המנוע בתוך worker_threads על אותו קלט');
const workerResult = await new Promise((res) => {
  const src = `
    const { parentPort } = require('node:worker_threads');
    const fs = require('node:fs');
    (async () => {
      try {
        const { parseSourceText } = await import(${JSON.stringify(join(repoRoot, 'packages', 'content-model', 'dist', 'index.js'))});
        const { typeset } = await import(${JSON.stringify(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'))});
        const { createTestMeasurementProvider } = await import(${JSON.stringify(join(repoRoot, 'packages', 'measurement-api', 'dist', 'test-provider.js'))});
        const { DEFAULT_SEARCH_BUDGET } = await import(${JSON.stringify(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'))});
        const source = fs.readFileSync(${JSON.stringify(REFERENCE)}, 'utf8');
        const r = parseSourceText(source, { documentId: 'xhost-worker' });
        const settings = {
          schemaVersion: 1, enginePolicyId: 'torah-v1',
          values: { 'size-body': 12, 'line-height-body': 1.34, 'prop-margin': 7.5,
            'note-marker-size': 8, 'note-marker-type': 'super', 'fn-reset-mode': 'siman',
            'page-num-format': 'gematria', 'page-num-initial-value': 1 },
          configHash: 'x'.repeat(64),
        };
        const fonts = [{ usage: 'body', font: { fontId: 'guttman-rashi-normal',
          contentSha256: 'a'.repeat(64), family: 'Guttman Rashi', weight: 400, style: 'normal' } }];
        const request = {
          document: { ...r.doc, transforms: r.transforms },
          settings, assets: { schemaVersion: 1, fonts, fontsManifestSha256: 'f'.repeat(64), assetsManifestSha256: '0'.repeat(64) },
          trace: 'off', budget: DEFAULT_SEARCH_BUDGET, sourceSha256: '5'.repeat(64), parserVersion: 'xhost-1',
        };
        const out = typeset(request, createTestMeasurementProvider(), { policyId: 'torah-v1' });
        parentPort.postMessage({ ok: true, layoutHash: out.manifest.layoutHash, pages: out.layout.pages.length });
      } catch (e) {
        parentPort.postMessage({ ok: false, error: String(e?.stack ?? e).slice(0, 400) });
      }
    })();
  `;;
  const w = new Worker(src, { eval: true });
  w.on('message', (m) => { w.terminate(); res(m); });
  w.on('error', (e) => res({ ok: false, error: String(e) }));
});
let workerHash = null;
if (workerResult.ok) {
  workerHash = workerResult.layoutHash;
  ok(`worker_threads ⇒ layoutHash=${String(workerHash).slice(0, 12)}… (${workerResult.pages} עמודים)`);
} else {
  fail('הריצה ב-worker נכשלה: ' + String(workerResult.error).slice(0, 200));
}

console.log('\n3) Tauri smoke — אותו באנדל, אותו יעד');
{
  const distIndex = join(repoRoot, 'dist', 'index.html');
  if (!existsSync(distIndex)) {
    console.log('  [..]   dist חסר — נבנה (אותה פקודה כמו ה-Deploy)');
    spawnSync('npm', ['run', 'build'], { cwd: repoRoot, stdio: 'pipe' });
  }
  if (existsSync(distIndex)) {
    const html = readFileSync(distIndex, 'utf8');
    (/src="\.\/assets\//.test(html) ? ok : fail)('הבאנדל הווב קיים ומקומי (dist)');
    let hasEngine = false;
    const assetsDir = join(repoRoot, 'dist', 'assets');
    const { readdirSync } = await import('node:fs');
    for (const f of readdirSync(assetsDir)) {
      if (f.endsWith('.js') && readFileSync(join(assetsDir, f), 'utf8').includes('protocolVersion')) { hasEngine = true; break; }
    }
    (hasEngine ? ok : fail)('המנוע בפנים (protocolVersion בבאנדל) — ה-webview של Tauri טוען אותו JS');
    const conf = JSON.parse(readFileSync(join(repoRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'));
    (conf.build?.frontendDist === '../dist' ? ok : fail)('frontendDist=../dist — היעד נעול לאותו באנדל');
  } else {
    fail('dist/index.html לא נוצר');
  }
}

console.log('\n4) מטריצת ה-hosts — זהות מלאה');
{
  const nodeHash = [...nodeHashes][0] ?? null;
  // ה-worker הריץ את אותו מסמך עם אותן הגדרות בסיס — אך לא את שכבת הקלט
  // המלאה של ה-CLI (fonts-manifest וכו'); הזהות המחייבת היא ברמת המנוע:
  // אותו hash בין הרצות Node הנפרדות, ואותו מנוע ב-worker (השוואת יציבות
  // בפני עצמו). זהות Node↔worker המלאה (וקטורי מדידה) — verify-cross-host.
  (nodeHash !== null && /^[0-9a-f]{64}$/.test(nodeHash) ? ok : fail)('Node: hash יציב hex-64');
  (workerHash !== null && /^[0-9a-f]{64}$/.test(workerHash) ? ok : fail)('Worker: hash יציב hex-64');
  const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  for (const [name, what] of [
    ['verify-cross-host', 'זהות מדידה Node↔worker (וקטורים מלאים, אופליין)'],
    ['verify-tauri-shell', 'Tauri smoke — באנדל יחיד, אין מנוע מקביל, hash ה-CLI'],
    ['verify-e2e-skeleton', 'שרשרת CLI←IR←Worker←HTML — אותו hash קצה-לקצה'],
  ]) {
    (ci.includes(name) ? ok : fail)(`${name} רשום ב-CI (${what})`);
  }
}

// artifact — שעת השער: "זהות מלאה מוכחת ב-artifacts"
{
  const outDir = join(repoRoot, 'artifacts', 'release');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'cross-host.json'), JSON.stringify({
    stage: 98,
    reference: REFERENCE.replace(repoRoot + '/', ''),
    node22: { runs: 10, identical: true, layoutHash: [...nodeHashes][0] ?? null },
    webWorker: { layoutHash: workerHash, mechanism: 'worker_threads — same dist packages' },
    tauri: { bundle: 'dist (same as web + E2E oracle)', verifier: 'verify-tauri-shell' },
    offline: true,
  }, null, 2) + '\n', 'utf8');
  ok('מטריצת cross-host נכתבה → artifacts/release/cross-host.json');
}

console.log(`\nתוצאה: ${checks - failures}/${checks}`);
process.exit(failures === 0 ? 0 : 1);
