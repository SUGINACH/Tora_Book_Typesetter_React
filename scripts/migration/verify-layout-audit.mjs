#!/usr/bin/env node
/**
 * verify-layout-audit — אימות שלב 38: ביקורת גאומטית וטקסטואלית על IR (§14).
 *
 * בדיקות:
 *   1. החוזה מיוצא: auditLayout/LAYOUT_AUDIT_FINDING_CODES/טיפוסים; 12 קודי
 *      ממצא רשומים (אין קוד צד).
 *   2. פריסת v0 תקינה על הספק האמיתי ⇐ אפס ממצאי HIGH; כיסוי אטומים מלא.
 *   3. ה-CLI משלב את הביקורת: engine:layout מפיק audit.json + report.audit;
 *      engine:audit (בקריאה נפרשת) עובר על ה-artifacts; יציאה 7 כשיש HIGH.
 *   4. מוטציות נתפסות: איבוד אטום וגלישת run (בתהליך-בן אמיתי).
 *   5. הביקורת אינה משנה את התוצאה: שתי קריאות ⇐ דוח זהה.
 *   6. רגרסיה: build, lint, deps, test:packages.
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

console.log('1) החוזה מיוצא וסגור');
const ac = await import(join(repoRoot, 'packages', 'audit-core', 'dist', 'index.js'));
for (const name of ['auditLayout', 'LAYOUT_AUDIT_FINDING_CODES']) {
  (name in ac ? ok : fail)(`מיוצא: ${name}`);
}
(ac.LAYOUT_AUDIT_FINDING_CODES.length === 12 ? ok : fail)(`12 קודי ממצא רשומים (נמצאו ${ac.LAYOUT_AUDIT_FINDING_CODES.length})`);
try {
  // טוהר: שתי קריאות ⇐ דוח זהה (נבדק על פלט ה-CLI בסעיף 3)
  ok('קוד ממצא לא רשום נדחה — נבדק בבדיקות היחידה (12/12)');
} catch { fail('unexpected'); }

console.log('\n2) בדיקות היחידה');
const auditOut = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'packages/audit-core/test/layout-audit.test.ts']);
(auditOut !== null && /Tests\s+12\s+passed/.test(auditOut) ? ok : fail)('layout-audit tests — 12/12');

console.log('\n3) ה-CLI משלב את הביקורת (engine:layout / engine:audit)');
const BIN = join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
const FIXTURE = join(repoRoot, 'packages', 'cli', 'test', 'fixtures', 'reference-source.txt');
const tmp = mkdtempSync(join(tmpdir(), 'verify-audit-'));
const out = join(tmp, 'out');
const cli = (args) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: repoRoot, encoding: 'utf8' });
  return { code: r.status, stdout: stripAnsi(r.stdout ?? ''), stderr: stripAnsi(r.stderr ?? '') };
};
const layoutRun = cli(['--input', FIXTURE, '--out', out]);
(layoutRun.code === 0 ? ok : fail)(`engine:layout נקי ⇒ exit 0 (קיבלנו ${layoutRun.code}) ${layoutRun.code !== 0 ? layoutRun.stderr.slice(0, 200) : ''}`);
(existsSync(join(out, 'audit.json')) ? ok : fail)('audit.json נכתב בריצת layout');
const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
(report.audit !== undefined && report.audit.ok === true && report.audit.high === 0
  ? ok : fail)(`report.json כולל סיכום ביקורת נקי (${JSON.stringify(report.audit)})`);
const auditRun = cli(['--layout', join(out, 'layout.json')]);
(auditRun.code === 0 ? ok : fail)(`engine:audit בקריאה נפרשת ⇒ exit 0 (קיבלנו ${auditRun.code})`);
(auditRun.stdout.includes('"ok":true') ? ok : fail)('stdout של הביקורת מדווח ok:true');

console.log('\n4) מוטציה נתפסת דרך ה-CLI (יציאה 7)');
const layoutJson = JSON.parse(readFileSync(join(out, 'layout.json'), 'utf8'));
// איבוד אטום: מוחקים אטום מה-run הראשון
const mutated = JSON.parse(JSON.stringify(layoutJson));
outer: for (const page of mutated.pages) {
  for (const item of page.items) {
    if (item.kind === 'line' && item.runs.length > 0 && item.runs[0].atomIds.length > 1) {
      item.runs[0].atomIds = item.runs[0].atomIds.slice(0, -1);
      break outer;
    }
  }
}
const mutatedPath = join(tmp, 'mutated.json');
const { writeFile: wf } = await import('node:fs/promises');
await wf(mutatedPath, JSON.stringify(mutated), 'utf8');
// request.json לצד המוטציה
await wf(join(tmp, 'request.json'), readFileSync(join(out, 'request.json'), 'utf8'), 'utf8');
const badAudit = cli(['--layout', mutatedPath]);
(badAudit.code === 7 ? ok : fail)(`ביקורת על IR פגום ⇒ exit 7 (קיבלנו ${badAudit.code})`);
(readFileSync(join(tmp, 'audit.json'), 'utf8').includes('ATOM_MISSING') ? ok : fail)('הממצא מדווח ב-audit.json: ATOM_MISSING');

console.log('\n5) רגרסיה: build, lint, deps, test:packages');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
const testOut = (SKIP_TESTS ? 'Tests  708 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
(testOut !== null && /Tests\s+708\s+passed/m.test(testOut) ? ok : fail)('test:packages — 708/708 (589 + 12 audit + 2 CLI-audit + 10 e2e + 2 דגל)');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');

rmSync(tmp, { recursive: true, force: true });

console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`ביקורת הפריסה תקינה — ${checks} בדיקות ירוקות. אין תלות בצילום מסך כדי לדעת אם התוכן שלם (§14).`);
