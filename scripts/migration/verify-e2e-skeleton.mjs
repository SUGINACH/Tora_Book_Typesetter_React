#!/usr/bin/env node
/**
 * verify-e2e-skeleton — אימות שלב 39: מבחן שלד מהלך קצה־לקצה (§17–19, §18-M4).
 *
 * שרשרת: CLI ← IR ← audits ← HTML ← Worker ← preview — הכול על אותו
 * layoutHash, על הספק האמיתי (HarfBuzz/WASM), בשלוש ריצות, trace on/off,
 * cold/warm (§17.2#1–#3, #8, #10).
 *
 * בדיקות:
 *   1. מבחן ה-E2E הארכיטקטוני (tests/e2e-skeleton) — 10 בדיקות ירוקות.
 *   2. Artifacts לפרסום: ריצת ייחוס ← artifacts/e2e-reference/ (manifest/
 *      ledger/audit/report/layout/preview.html) — מועלים כ-artifact של CI.
 *   3. engine:verify — הסקריפט הרשמי של §12.2 מריץ בדיוק את המאמת הזה.
 *   4. רגרסיה: build, lint, deps, test:packages.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
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

console.log('1) מבחן ה-E2E הארכיטקטוני (tests/e2e-skeleton)');
const e2eOut = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/e2e-skeleton/e2e-skeleton.test.ts']);
(e2eOut !== null && /Tests\s+10\s+passed/.test(e2eOut) ? ok : fail)('tests/e2e-skeleton — 10/10 (CLI×3 + Node trace/cold-warm + Worker + HTML + audit + preview + שחזור)');

(runCode('npx', ['tsc', '--noEmit']) === 0 ? ok : fail)('typecheck שורש (src+tests) — PASS (vitest אינו בודק טיפוסים)');

console.log('\n2) Artifacts לפרסום — ריצת ייחוס ל-artifacts/e2e-reference/');
const BIN = join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
const FIXTURE = join(repoRoot, 'packages', 'cli', 'test', 'fixtures', 'reference-source.txt');
const tmp = mkdtempSync(join(tmpdir(), 'verify-e2e-'));
const refRun = spawnSync(process.execPath, [BIN, '--input', FIXTURE, '--out', join(tmp, 'ref'), '--trace', 'decisions', '--html'], { cwd: repoRoot, encoding: 'utf8' });
(refRun.status === 0 ? ok : fail)(`ריצת ייחוס ⇒ exit 0 (${refRun.stderr?.slice(0, 200) ?? ''})`);
const artifactDir = join(repoRoot, 'artifacts', 'e2e-reference');
mkdirSync(artifactDir, { recursive: true });
let allThere = true;
for (const f of ['layout.json', 'manifest.json', 'ledger.json', 'request.json', 'report.json', 'audit.json', 'preview.html']) {
  try {
    cpSync(join(tmp, 'ref', f), join(artifactDir, f));
    if (!existsSync(join(artifactDir, f))) allThere = false;
  } catch { allThere = false; fail(`חסר artifact: ${f}`); }
}
(allThere ? ok : fail)('שבעה artifacts הועתקו ל-artifacts/e2e-reference/ (עולים כ-artifact ב-CI)');
const report = JSON.parse(readFileSync(join(artifactDir, 'report.json'), 'utf8'));
(report.deterministic === true && report.audit.ok === true && report.repeats === 1
  ? ok : fail)(`דוח הייחוס: layoutHash=${String(report.layoutHash).slice(0, 14)}…, audit נקי`);
const audit = JSON.parse(readFileSync(join(artifactDir, 'audit.json'), 'utf8'));
(audit.stats.placedAtomOccurrences === audit.stats.contentAtoms && audit.stats.contentAtoms > 150
  ? ok : fail)(`כיסוי אטומים מלא: ${audit.stats.placedAtomOccurrences}/${audit.stats.contentAtoms}`);
rmSync(tmp, { recursive: true, force: true });

console.log('\n3) engine:verify — הפקודה הרשמית (§12.2)');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
(pkg.scripts['engine:verify'] === 'node scripts/migration/verify-e2e-skeleton.mjs'
  ? ok : fail)('package.json: engine:verify = verify-e2e-skeleton (מבחן שלד המהלך)');
(pkg.scripts['engine:layout'] !== undefined && pkg.scripts['engine:audit'] !== undefined
  ? ok : fail)('engine:layout / engine:audit קיימים (§12.2)');

console.log('\n4) רגרסיה: build, lint, deps, test:packages');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
const testOut = run('npm', ['run', 'test:packages']);
(testOut !== null && /Tests\s+615\s+passed/m.test(testOut) ? ok : fail)('test:packages — 615/615 (603 + 10 e2e + 2 דגל מנוע)');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');

console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`שלד המהלך יציב — ${checks} בדיקות ירוקות. אותו hash מקצה לקצה ב-Node וב-Worker; מוכן להחלפת אלגוריתם השבירה (M5).`);
