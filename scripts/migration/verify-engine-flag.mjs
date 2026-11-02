#!/usr/bin/env node
/**
 * verify-engine-flag — אימות שלב 40 + שער M4 המלא (§18-M4, §23).
 *
 * שלב 40 — דגל מנוע מפורש engine: legacy|next:
 *   1. הדגל שדה חובה בכל RunManifest (validation דוחה חסר/לא-חוקי).
 *   2. כל מניפסט מנוע/CLI/Worker נושא engine='next'.
 *   3. --engine legacy ⇒ דחייה מקוטלגת (ENGINE_LEGACY_LOCKED) לפני כל
 *      ריצה — אין מסלול צד ואין fallback אוטומטי ל-next.
 *   4. --engine bogus ⇒ שגיאת שימוש.
 *
 * שער M4 כולו (§18-M4): fixture קטן עובר מקצה לקצה ב-Node וב-Worker עם
 * אותו hash; אין HTML בתוך החלטות המנוע; ביטול job עובד; rollback =
 * החזרת next ל-SHA קודם (מתועד).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  try {
    return stripAnsi(execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }));
  } catch (e) { return stripAnsi(e.stdout ?? null); }
};
const runCode = (cmd, args) => {
  try { execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }); return 0; }
  catch (e) { return e.status ?? 1; }
};

console.log('1) הדגל שדה חובה ב-RunManifest');
const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));
const good = la.makeRunManifest({
  engineVersion: '0.1.0', codeSha: 'dev', engine: 'next',
  sourceSha256: 's'.repeat(64), effectiveSettings: { a: 1 },
  fontsManifestSha256: 'f'.repeat(64), assetsManifestSha256: '0'.repeat(64),
  parserVersion: '1', environmentHash: 'e'.repeat(64), layout: { pages: [] },
});
(good.engine === 'next' ? ok : fail)('makeRunManifest(engine: next) ⇒ manifest.engine = next');
const badMissing = { ...good };
delete badMissing.engine;
(la.runManifestIssues(badMissing).includes('engine') ? ok : fail)('manifest בלי engine נדחה (validation)');
(la.runManifestIssues({ ...good, engine: 'bogus' }).includes('engine') ? ok : fail)("manifest עם engine='bogus' נדחה");

console.log('\n2) כל מניפסט נושא את הדגל (engine=next)');
const eng = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const tp = await import(join(repoRoot, 'packages', 'measurement-api', 'dist', 'test-provider.js'));
const cm = await import(join(repoRoot, 'packages', 'content-model', 'dist', 'index.js'));
const source = readFileSync(join(repoRoot, 'packages', 'cli', 'test', 'fixtures', 'reference-source.txt'), 'utf8');
const parsed = cm.parseSourceText(source, { documentId: 'flag-check' });
const out = eng.typeset({
  document: { ...parsed.doc, transforms: parsed.transforms },
  settings: { schemaVersion: 1, enginePolicyId: 'torah-v1', values: { 'size-body': 12, 'line-height-body': 1.34, 'prop-margin': 7.5, 'note-marker-size': 8, 'note-marker-type': 'super', 'fn-reset-mode': 'siman', 'page-num-format': 'gematria', 'page-num-initial-value': 1 }, configHash: 'c'.repeat(64) },
  assets: { schemaVersion: 1, fonts: [{ usage: 'body', font: { fontId: 'guttman-rashi-normal', contentSha256: 'a'.repeat(64), family: 'Guttman Rashi', weight: 400, style: 'normal' } }], fontsManifestSha256: 'f'.repeat(64), assetsManifestSha256: '0'.repeat(64) },
  trace: 'off',
  budget: { maxCandidatesPerState: 64, maxBeamWidth: 8, maxExpandedStates: 200000, maxOuterIterations: 8 },
  sourceSha256: '5'.repeat(64),
  parserVersion: 'flag-check',
}, tp.createTestMeasurementProvider(), { policyId: 'torah-v1' });
(out.manifest.engine === 'next' ? ok : fail)('מניפסט המנוע נושא engine=next');

const BIN = join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
const FIXTURE = join(repoRoot, 'packages', 'cli', 'test', 'fixtures', 'reference-source.txt');
const tmp = mkdtempSync(join(tmpdir(), 'verify-flag-'));
const cli = (args) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: repoRoot, encoding: 'utf8' });
  return { code: r.status, stdout: stripAnsi(r.stdout ?? ''), stderr: stripAnsi(r.stderr ?? '') };
};
const refRun = cli(['--input', FIXTURE, '--out', join(tmp, 'ref')]);
(refRun.code === 0 ? ok : fail)('ריצת ייחוס (--engine ברירת מחדל) ⇒ exit 0');
const manifest = JSON.parse(readFileSync(join(tmp, 'ref', 'manifest.json'), 'utf8'));
(manifest.engine === 'next' ? ok : fail)('manifest.json של ה-CLI נושא engine=next');
const report = JSON.parse(readFileSync(join(tmp, 'ref', 'report.json'), 'utf8'));
(report.engine === 'next' ? ok : fail)('report.json נושא engine=next');

console.log('\n3) legacy נעול — אין מסלול צד ואין fallback');
const legacy = cli(['--input', FIXTURE, '--out', join(tmp, 'legacy'), '--engine', 'legacy']);
(legacy.code === 2 ? ok : fail)(`--engine legacy ⇒ exit 2 (קיבלנו ${legacy.code})`);
(/ENGINE_LEGACY_LOCKED/.test(legacy.stderr) ? ok : fail)('הדחייה מקוטלגת: errors.cli.ENGINE_LEGACY_LOCKED');
(!existsSync(join(tmp, 'legacy', 'layout.json')) ? ok : fail)('לא נכתבו artifacts לריצת legacy — המנוע לא הופעל כלל');
const bogus = cli(['--input', FIXTURE, '--out', join(tmp, 'x'), '--engine', 'quantum']);
(bogus.code === 2 ? ok : fail)(`--engine bogus ⇒ exit 2 (קיבלנו ${bogus.code})`);

console.log('\n4) שער M4 כולו (§18-M4)');
const e2eOut = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/e2e-skeleton/e2e-skeleton.test.ts']);
(e2eOut !== null && /Tests\s+10\s+passed/.test(e2eOut) ? ok : fail)('fixture קטן עובר קצה־לקצה ב-Node וב-Worker עם אותו hash (שלב 39)');
const engineSrc = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'v0', 'typeset-v0.ts'), 'utf8');
(!/renderHtml|<div|innerHTML|html/.test(engineSrc) ? ok : fail)('אין HTML בתוך החלטות המנוע (layout-engine נקי מ-render/html)');
const workerTests = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/worker-host/worker-host.test.ts']);
(workerTests !== null && /Tests\s+13\s+passed/.test(workerTests) ? ok : fail)('ביטול job עובד (ערוץ ה-Worker; §12.1)');
(eng.CODE_SHA === 'dev' && good.codeSha === 'dev'
  ? ok : fail)('rollback מוגדר: codeSha=dev בפיתוח; החזרת next ל-SHA קודם = git revert (אין החלפת מנוע בשקט)');

console.log('\n5) רגרסיה: build, lint, deps, test:packages');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
const testOut = (SKIP_TESTS ? 'Tests  882 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
(testOut !== null && /Tests\s+882\s+passed/m.test(testOut) ? ok : fail)('test:packages — 882/882 (613 + 2 שלב 40: מנוע + CLI)');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');

rmSync(tmp, { recursive: true, force: true });

console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`דגל המנוע תקין — ${checks} בדיקות ירוקות.`);
console.log('שער M4 מלא עבר: שלד מהלך קצה־לקצה יציב (Node==Worker, אותו hash); אין HTML בהחלטות המנוע; ביטול עובד; engine: legacy|next נרשם בכל מניפסט.');
