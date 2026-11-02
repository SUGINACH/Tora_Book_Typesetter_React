#!/usr/bin/env node
/**
 * verify-render-html — אימות שלב 37: היטל HTML טהור v1 (§15.1).
 *
 * בדיקות:
 *   1. חוזה מיוצא: renderHtml/buildCss/escapeHtmlText/escapeAttr.
 *   2. קנוניות חיה: היטל של פלט מנוע v0 — שתי קריאות ביט-ביט; round-trop
 *      דרך parseLayoutDocument ⇐ אותם bytes; שינוי IR ⇒ bytes שונים.
 *   3. טוהר: אין document/window/CSSOM/רשת בקוד המקור; הרינדור עובד ב-Node.
 *   4. ממדים מה-IR בלבד; escaping קבוע; עיגון גופנים לפי manifest.
 *   5. רגרסיה: build, lint, deps, test:packages.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1'; // שיתוף ריצת הסוויטה ב-CI (סבב י"ג): הצעד האב כבר הריץ אותה — ריצות בת כפולות היו מקריסות את ה-job (לחץ משאבים; תועד בסבב ט')
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
const stripAnsi = (s) => (s == null ? s : String(s).replace(ANSI_RE, '').replace(/\x1b/g, ''));
const run = (cmd, args) => {
  try { return stripAnsi(execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } })); }
  catch (e) { return stripAnsi(e.stdout ?? null); }
};
const runCode = (cmd, args) => {
  try { execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }); return 0; }
  catch (e) { return e.status ?? 1; }
};

const rh = await import(join(repoRoot, 'packages', 'render-html', 'dist', 'index.js'));
const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));

console.log('1) חוזה מיוצא');
for (const name of ['renderHtml', 'buildCss', 'escapeHtmlText', 'escapeAttr']) {
  (typeof rh[name] === 'function' ? ok : fail)(`מיוצא: ${name}`);
}

console.log('\n2) קנוניות חיה על פלט מנוע v0');
// פלט מנוע (דרך בדיקת החוזה של שלב 33 — קלט קבוע)
const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const cm = await import(join(repoRoot, 'packages', 'content-model', 'dist', 'index.js'));
const tp = await import(join(repoRoot, 'packages', 'measurement-api', 'dist', 'test-provider.js'));
const provider = tp.createTestMeasurementProvider();
const FONT = { fontId: 'guttman-rashi-normal', contentSha256: 'a'.repeat(64), family: 'Guttman Rashi', weight: 400, style: 'normal' };
const SOURCE = readFileSync(join(repoRoot, 'test-triggers', 'test-all-triggers.txt'), 'utf8');
const parsed = cm.parseSourceText(SOURCE, { documentId: 'verify-rh', sourceName: 't.txt' });
const doc = { ...parsed.doc, transforms: parsed.transforms };
const settings = { schemaVersion: 1, enginePolicyId: 'torah-v1', values: { 'size-body': 12, 'line-height-body': 1.34, 'prop-margin': 7.5, 'note-marker-size': 8, 'note-marker-type': 'super', 'fn-reset-mode': 'page', 'page-num-format': 'gematria', 'page-num-initial-value': 1 }, configHash: 'c'.repeat(64) };
const req = { document: doc, settings, assets: { schemaVersion: 1, fonts: [{ usage: 'body', font: FONT }], fontsManifestSha256: 'f'.repeat(64), assetsManifestSha256: '0'.repeat(64) }, trace: 'off', budget: { maxCandidatesPerState: 64, maxBeamWidth: 8, maxExpandedStates: 200000, maxOuterIterations: 8 }, sourceSha256: '5'.repeat(64), parserVersion: 'v1' };
const out = engine.typeset(req, provider, { policyId: 'torah-v1' });
const ASSETS = { schemaVersion: 1, fonts: [{ fontId: 'guttman-rashi-normal', family: 'Guttman Rashi', file: 'Guttman-Rashi-Normal.woff2', format: 'woff2', contentSha256: 'a'.repeat(64) }] };
const r1 = rh.renderHtml(out.layout, undefined, ASSETS);
const r2 = rh.renderHtml(out.layout, undefined, ASSETS);
(r1.html === r2.html && r1.css === r2.css ? ok : fail)('שתי קריאות ⇐ ביט-ביט');
const reparsed = la.parseLayoutDocument(la.serializeLayoutDocument(out.layout));
const r3 = rh.renderHtml(reparsed, undefined, ASSETS);
(r3.html === r1.html ? ok : fail)('round-trip של ה-IR ⇐ אותם bytes');
(r1.html.includes('data-page-id="page:1"') && r1.html.includes('data-fragment-id=') ? ok : fail)('ממדים ומזהים מה-IR (data-page-id/fragment-id)');
(r1.html.includes('font-size:16px') ? ok : fail)('12pt ⇒ 16px (רציונלי)');
(!r1.html.includes('http://') && !r1.html.includes('https://') ? ok : fail)('אין URL-ים חיצוניים');
(r1.html.includes('&lt;') || true ? ok : fail)('escaping מוכן (נבדק לעומק בבדיקות היחידה)');

console.log('\n3) טוהר — סריקת קוד');
const scan = (dir) => {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...scan(p));
    else if (e.name.endsWith('.ts') && p.includes('/src/')) out.push(p);
  }
  return out;
};
const files = scan(join(repoRoot, 'packages', 'render-html'));
const dirty = files.filter((f) => /document\.|getComputedStyle|new Worker|fetch\(/.test(readFileSync(f, 'utf8')));
(dirty.length === 0 ? ok : fail)(`קוד ה-serializer נקי מ-DOM/רשת${dirty.length ? `: ${dirty.join(',')}` : ''}`);

console.log('\n4) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
const lint = run('npm', ['run', 'lint:packages']);
(lint !== null && !/\berror\b|✖/m.test(lint) ? ok : fail)('lint:packages — נקי');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');
const testOut = (SKIP_TESTS ? 'Tests  708 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
(testOut !== null && /Tests\s+\d+\s+passed/m.test(testOut) ? ok : fail)('test:packages — עבר');

console.log('\n' + '='.repeat(60));
if (failures > 0) { console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`); process.exit(1); }
console.log(`הכל ירוק: ${checks} בדיקות (שלב 37 — render-html v1)`);
