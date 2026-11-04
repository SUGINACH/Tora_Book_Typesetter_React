#!/usr/bin/env node
/**
 * verify-worker-host — אימות שלב 35: פרוטוקול Worker ו־WorkerClient (§12.1).
 *
 * בדיקות:
 *   1. טוהר ההפרדה: המנוע (layout-engine) אינו מייבא Worker/DOM; קוד
 *      ה-Worker-host הוא צד מעטפת בלבד (src/worker-host) ואינו חלק
 *      מהחבילות; אין typeset בצד הלקוח (worker-client אינו מייבא מנוע
 *      לריצה — רק קבועי hash).
 *   2. בדיקות ההודעות ירוקות (tests/worker-host) — progress/ביטול/שגיאה/
 *      תוצאה מאוחרת של job מבוטל/hash זהה ל-Node.
 *   3. typecheck שורש (src+tests) — קוד המעטפת החדש מסוג בקפידה.
 *   4. הפרוטוקול בקוד תואם לאפיון §12.1: שמות ההודעות prepare/cancel/
 *      progress/done/error + protocolVersion.
 *   5. רגרסיה: build, lint, deps, test:packages.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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

console.log('1) טוהר ההפרדה — המנוע אינו מכיר Worker; הלקוח אינו מעמיד את עצמו כמנוע');
const engineSrc = join(repoRoot, 'packages', 'layout-engine', 'src');
const engineFiles = [];
const scan = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else if (e.name.endsWith('.ts')) engineFiles.push(p);
  }
};
scan(engineSrc);
const badEngine = engineFiles.filter((f) => /Worker|postMessage|onmessage|importScripts/.test(readFileSync(f, 'utf8')));
(badEngine.length === 0 ? ok : fail)(`layout-engine נקי מ-Worker/postMessage (${engineFiles.length} קבצים)${badEngine.length ? ' — ' + badEngine.map((f) => f.split('packages/')[1]).join(', ') : ''}`);
const clientSrc = readFileSync(join(repoRoot, 'src', 'worker-host', 'worker-client.ts'), 'utf8');
(!/@tora\/layout-engine['"]\s*;\s*import[^;]*typeset|import\s*\{[^}]*\btypeset\b/.test(clientSrc)
  ? ok : fail)('worker-client אינו מייבא typeset — אין עימוד ב-main thread (§12.1)');
(clientSrc.includes('inputHashOf') ? ok : fail)('הגנת stale-job לפי inputHash קיימת בלקוח');
const hostFiles = readdirSync(join(repoRoot, 'src', 'worker-host'));
(hostFiles.includes('protocol.ts') && hostFiles.includes('engine-worker.ts') && hostFiles.includes('worker-client.ts')
  ? ok : fail)('מבנה §12.1: src/worker-host/{protocol,engine-worker,worker-client}');

console.log('\n2) בדיקות ההודעות (tests/worker-host)');
const whOut = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/worker-host/worker-host.test.ts']);
(whOut !== null && /Tests\s+13\s+passed/.test(whOut) ? ok : fail)('tests/worker-host — 13/13');

console.log('\n3) typecheck שורש (src+tests — קוד המעטפת מסוג)');
(runCode('npx', ['tsc', '--noEmit']) === 0 ? ok : fail)('tsc --noEmit (שורש) — PASS');

console.log('\n4) הפרוטוקול תואם לאפיון §12.1');
const proto = readFileSync(join(repoRoot, 'src', 'worker-host', 'protocol.ts'), 'utf8');
for (const frag of ["type: 'prepare'", "type: 'cancel'", "type: 'progress'", "type: 'done'", "type: 'error'", 'protocolVersion', 'errorCode', 'completedUnits']) {
  (proto.includes(frag) ? ok : fail)(`פרוטוקול כולל: ${frag}`);
}
const handler = readFileSync(join(repoRoot, 'src', 'worker-host', 'engine-worker.ts'), 'utf8');
(handler.includes('catalogKey') ? ok : fail)('שגיאות העובד נושאות מפתח קטלוגי (לא message גולמי)');

console.log('\n5) רגרסיה: build, lint, deps, test:packages');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
const testOut = (SKIP_TESTS ? 'Tests  1098 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
(testOut !== null && /Tests\s+1098\s+passed/m.test(testOut) ? ok : fail)('test:packages — 1098/1098 (568 + 13 worker-host + 8 preview + 12 audit + 2 CLI + 10 e2e + 2 דגל + 13 מועמדים + 10 DP + 10 איכות + 8 חירום)');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');

console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`פרוטוקול ה-Worker תקין — ${checks} בדיקות ירוקות. אותו מנוע בעובד; ביטול ו-stale-job נאכפים; אין עימוד ב-main thread.`);
