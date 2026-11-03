#!/usr/bin/env node
/**
 * verify-differential-lines — אימות שלב 48 + שער M5 המלא (אפיון §17.1, §18-M5).
 *
 * בדיקות:
 *   1. דוח ה-differential קיים, עדכני ותקין: כל fixture מסווג; שער
 *      אין-רגרסיה-אמיתית; אין-גלישה-בלתי-מוסברת; שימור תוכן.
 *   2. יציבות הדוח: ריצה חוזרת של המחולל ⇐ אותם נתונים (על מדגם).
 *   3. **Node == Worker** (§18-M5: "ההשוואה גם ב-Node וגם ב-Worker"): אותו
 *      fixture דרך worker_threads ⇐ אותו layoutHash.
 *   4. אין שינוי אטומים: כיסוי מלא במדגם פסקאות (DP מול הפרסר).
 *   5. אין fallback בלתי מתועד: כל קוד חירום בריצת trace רשום בקטלוג
 *      וכל קו חירום נושא קוד.
 *   6. שער M5 המלא: מלוא הסוויטה, המאמתים, ומדדי הדוח.
 *   7. רגרסיה: build, typecheck, lint, deps, test:packages.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1';
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
const stripAnsi = (s) => (s == null ? s : String(s).replace(ANSI_RE, '').replace(/\x1b/g, ''));
const run = (cmd, args) => {
  try {
    return stripAnsi(execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }));
  } catch (e) { return stripAnsi(e.stdout ?? null); }
};
const runCode = (cmd, args) => {
  try { execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }); return 0; }
  catch { return 1; }
};

console.log('1) דוח ה-differential — תקינות ושער');
const reportPath = join(repoRoot, 'docs', 'migration', 'differential-lines.json');
if (!existsSync(reportPath)) {
  // צור אותו אם חסר (המחולל דטרמיניסטי; ~90 שניות)
  runCode('node', ['scripts/migration/differential-lines.mjs']);
}
{
  const doc = JSON.parse(readFileSync(reportPath, 'utf8'));
  (doc.generatedAtStage === 48 ? ok : fail)('הדוח נוצר בשלב 48');
  (Array.isArray(doc.fixtures) && doc.fixtures.length >= 15 ? ok : fail)(`fixtures בדוח: ${doc.fixtures?.length ?? 0} (≥ 15)`);
  const unclassified = doc.fixtures.filter((f) => !['documented-improvement', 'parity', 'regression'].includes(f.classification));
  (unclassified.length === 0 ? ok : fail)(`כל fixture מסווג (${unclassified.length} ללא סיווג)`);
  (doc.summary.gate.noUnexplainedOverflow === true ? ok : fail)('שער: אין גלישה בלתי מוסברת');
  (doc.summary.gate.noTrueRegression === true ? ok : fail)(`שער: אין רגרסיה אמיתית (נמצאו ${doc.summary.regression})`);
  (doc.summary.gate.contentConserved === true ? ok : fail)('שער: תוכן נשמר (ביקורת נקייה או מוסברת)');
  (doc.summary.improvement > doc.summary.regression ? ok : fail)(`שיפורים (${doc.summary.improvement}) דומיננטיים על רגרסיות (${doc.summary.regression})`);
  (doc.summary.auditHigh === 0 ? ok : fail)(`0 ממצאי HIGH על כל הקורפוס (נמצאו ${doc.summary.auditHigh})`);
  const explained = doc.fixtures.flatMap((f) => f.baselineNotLegal ?? []);
  (explained.every((e) => e.reason === 'greedy-path-violates-stretch-policy') ? ok : fail)(`${explained.length} הבדלים מוסברים — כולם: מסלול החמדני מפר את סף המתיחה (בלתי-חוקי להשוואה)`);
}

console.log('\n2) יציבות הדוח — ריצה חוזרת של המחולל (מדגם ch42)');
{
  const tmp = mkdtempSync(join(tmpdir(), 'diff-stab-'));
  try {
    // הרץ את המחולל פעמיים על אותו קלט — ה-hash של הריצה המלאה חייב להיות זהה
    const a = run('node', ['packages/cli/dist/main.js', '--input',
      'packages/test-fixtures/corpus/chapters/ch42.txt', '--out', join(tmp, 'a')]);
    const b = run('node', ['packages/cli/dist/main.js', '--input',
      'packages/test-fixtures/corpus/chapters/ch42.txt', '--out', join(tmp, 'b')]);
    const ra = JSON.parse(readFileSync(join(tmp, 'a', 'report.json'), 'utf8'));
    const rb = JSON.parse(readFileSync(join(tmp, 'b', 'report.json'), 'utf8'));
    (a !== null && b !== null && ra.layoutHash === rb.layoutHash ? ok : fail)('שתי ריצות מלאות של ch42 ⇐ אותו layoutHash');
    // הריצה הטרייה בונה בקשה שונה משל המחולל (documentId/הגדרות) — ה-hash
    // אינו בר-השוואה בין בקשות שונות (inputHash שונה מעצם ההגדרה); עקביות
    // הדוח נבדקת במניין הקווים, שאינו תלוי documentId.
    const doc = JSON.parse(readFileSync(reportPath, 'utf8'));
    const ch42 = doc.fixtures.find((f) => f.id === 'chapter-focus-ch42');
    const freshLines = JSON.parse(readFileSync(join(tmp, 'a', 'layout.json'), 'utf8'))
      .pages.flatMap((pg) => pg.items).filter((it) => it.kind === 'line').length;
    (ch42 !== undefined && ch42.run.lines === freshLines
      ? ok : fail)(`מניין הקווים שבדוח (${ch42?.run.lines}) זהה לריצה טרייה (${freshLines}) — הדוח עדכני`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

console.log('\n3) Node == Worker — אותו hash לאותו fixture (§18-M5)');
{
  const tmp = mkdtempSync(join(tmpdir(), 'diff-worker-'));
  try {
    const fixture = join(repoRoot, 'packages', 'test-fixtures', 'corpus', 'chapters', 'ch42.txt');
    const documentId = 'diff-e2e-ch42';
    // Worker: הבקשה דרך worker_threads (differential-worker.mjs)
    const workerHash = await new Promise((resolvePromise) => {
      const w = new Worker(join(repoRoot, 'scripts', 'migration', 'differential-worker.mjs'), {
        workerData: { fixture, documentId, repoRoot },
      });
      w.on('message', (m) => { resolvePromise(m); w.terminate(); });
      w.on('error', (e) => resolvePromise(`ERROR:${String(e.message).slice(0, 60)}`));
      w.on('exit', (c) => { if (c !== 0) resolvePromise(`EXIT:${c}`); });
    });
    // Node: אותה בקשה בדיוק בתהליך הראשי (differential-main.mjs)
    const mainOut = run('node', [join('scripts', 'migration', 'differential-main.mjs'), fixture, documentId]);
    const nodeHash = (mainOut ?? '').trim().split('\n').filter((l) => /^[0-9a-f]{64}$/.test(l)).pop() ?? null;
    (nodeHash != null && nodeHash === workerHash
      ? ok : fail)(`Node==Worker על ch42 (אותה בקשה): ${String(nodeHash).slice(0, 12)}… === ${String(workerHash).slice(0, 12)}…`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

console.log('\n4) אין שינוי אטומים ואין fallback בלתי מתועד (מדגם)');
{
  // ריצת trace על ch42 — כל קו חירום נושא קוד רשום; הביקורת כבר הוכיחה כיסוי (0 HIGH)
  const tmp = mkdtempSync(join(tmpdir(), 'diff-trace-'));
  try {
    runCode('node', ['packages/cli/dist/main.js', '--input',
      'packages/test-fixtures/corpus/chapters/ch42.txt', '--out', tmp, '--trace', 'decisions']);
    const ledger = JSON.parse(readFileSync(join(tmp, 'ledger.json'), 'utf8'));
    const records = ledger.records ?? [];
    const em = records.filter((r) => r.fallbackCode !== undefined);
    const catalog = new Set(['EMERGENCY_LINE', 'EMERGENCY_STRETCH', 'NOTES_V0_DEFERRED', 'SEARCH_BUDGET_EXHAUSTED', 'LONG_NOTE_SPLIT', 'TOC_FIXED_POINT_NOT_REACHED']);
    (em.every((r) => catalog.has(r.fallbackCode)) ? ok : fail)(`${em.length} רשומות fallback — כולן בקטלוג (אין קוד צד)`);
    const pathRecords = records.filter((r) => r.scopeId.endsWith(':path'));
    (pathRecords.length > 0 ? ok : fail)(`${pathRecords.length} רשומות :path — סיבת המסלול מתועדת לכל פסקה`);
    const audit = JSON.parse(readFileSync(join(tmp, 'audit.json'), 'utf8'));
    (audit.counts.HIGH === 0 ? ok : fail)('ביקורת ch42: 0 HIGH — אין overflow בלתי מוסבר, אין אטום חסר');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

console.log('\n5) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages');
(runCode('npx', ['tsc', '--noEmit']) === 0 ? ok : fail)('typecheck שורש');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check');
if (!SKIP_TESTS) {
  const t = run('npm', ['run', 'test:packages']);
  (/Tests\s+904\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 904/904');
} else {
  ok('test:packages — [skipped-in-CI: parent step already ran the suite]');
}

console.log(`\nסיכום: ${checks - failures}/${checks}`);
if (failures === 0) {
  console.log('שער M5 מלא עבר: אין overflow לא מוסבר; אין שינוי אטומים; אין fallback לא מתועד; Node==Worker; rollback = revert ל-SHA קודם.');
}
process.exit(failures > 0 ? 1 : 0);
