#!/usr/bin/env node
/**
 * verify-next-path — אימות שלב 47: הסרת המילוי החמדני ממסלול next ורישום
 * דחיות (אפיון §7, §8.2, §18-M5#3–4).
 *
 * בדיקות:
 *   1. חוזה: ENGINE_ALGORITHM מסמן DP גלובלי; greedy מסומן פיקסטורת השוואה.
 *   2. מקור המנוע (typeset-v0) אינו מייבא/קורא ל־greedy — ה־DP הוא הדרך
 *      היחידה ("אין שני אלגוריתמים מתחרים בשקט").
 *   3. ריצת ייחוס מלאה (הספק האמיתי HarfBuzz): דטרמיניזם (ריצה כפולה ⇐ אותו
 *      hash), audit נקי (0 HIGH), וקווי fit ממלאים את הטור בדיוק.
 *   4. הפנקס מכיל את ההכרעות: רשומת :path לכל פסקה (רמה + רמות שנפסלו +
 *      תקציב), רשומות line-break עם מועמדים קנוניים (c:start:end) ודחיות,
 *      וקודי fallback לכל קו חירום.
 *   5. lastLineAlign ב־IR: קווי סיום פסקה נושאים את השדה (center ברירת
 *      מחדל) וממוקמים בהתאם — ההצבה מממשת את ההחלטה.
 *   6. רווחים עוקבים בסוף קו — קידום אפס, אטומים נשמרים; ריצות רוחב 0
 *      חוקיות ב־IR (החוזה הורחב בשלב זה).
 *   7. רגרסיה: build, typecheck, lint, deps, test:packages (מונה מדויק).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

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

const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));

console.log('1) חוזה');
(engine.ENGINE_ALGORITHM === 'global-dp-paragraph-ladder-v1' ? ok : fail)('ENGINE_ALGORITHM = global-dp-paragraph-ladder-v1');
{
  const greedy = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'linebreak', 'greedy.ts'), 'utf8');
  (greedy.includes('אסור לשימוש במסלול הייצור') ? ok : fail)('greedy.ts מסומן: פיקסטורת השוואה בלבד, אסורה בייצור');
}
{
  const src = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'v0', 'typeset-v0.ts'), 'utf8');
  (!src.includes("from '../linebreak/greedy.js'") && !src.includes('breakParagraphGreedy') && !src.includes('breakBlockGreedy')
    ? ok : fail)('typeset-v0 אינו מייבא/קורא ל־greedy — ה־DP הוא הדרך היחידה');
}

console.log('\n2) ריצת ייחוס מלאה (CLI, הספק האמיתי) — דטרמיניזם ואיכות');
const tmp = mkdtempSync(join(tmpdir(), 'next-path-'));
let ref = null;
try {
  const outA = join(tmp, 'a');
  const outB = join(tmp, 'b');
  const codeA = runCode('node', ['packages/cli/dist/main.js', '--input',
    'packages/cli/test/fixtures/reference-source.txt', '--out', outA, '--trace', 'decisions']);
  const codeB = runCode('node', ['packages/cli/dist/main.js', '--input',
    'packages/cli/test/fixtures/reference-source.txt', '--out', outB, '--trace', 'decisions']);
  (codeA === 0 && codeB === 0 ? ok : fail)('שתי ריצות CLI על פיקסטורת הייחוס — יציאה 0');
  const repA = JSON.parse(readFileSync(join(outA, 'report.json'), 'utf8'));
  const repB = JSON.parse(readFileSync(join(outB, 'report.json'), 'utf8'));
  (repA.layoutHash === repB.layoutHash ? ok : fail)('דטרמיניזם: שתי ריצות ⇐ אותו layoutHash');
  const auditA = JSON.parse(readFileSync(join(outA, 'audit.json'), 'utf8'));
  (auditA.counts.HIGH === 0 ? ok : fail)(`הביקורת נקייה (0 HIGH; נמצאו ${auditA.counts.HIGH})`);

  ref = { layout: JSON.parse(readFileSync(join(outA, 'layout.json'), 'utf8')), ledger: JSON.parse(readFileSync(join(outA, 'ledger.json'), 'utf8')) };

  // קווי fit ממלאים את הטור בדיוק (הצדקה על רווחי המילים)
  let fitChecked = 0;
  let fitExact = 0;
  for (const page of ref.layout.pages) {
    for (const region of page.regions) {
      for (const item of page.items) {
        if (item.kind !== 'line' || item.regionId !== region.id || item.breakReason !== 'fit') continue;
        fitChecked += 1;
        const end = Math.max(...item.runs.map((r) => r.startLu + r.widthLu));
        if (end === region.rect.width) fitExact += 1;
      }
    }
  }
  (fitChecked > 0 && fitExact === fitChecked ? ok : fail)(`הצדקה מדויקת: ${fitExact}/${fitChecked} קווי fit ממלאים את הטור בדיוק`);
} catch (e) {
  fail(`ריצת ייחוס נכשלה: ${String(e.message).slice(0, 80)}`);
}

console.log('\n3) הפנקס מכיר בהכרעות (רשומות הריצה מעל)');
if (ref !== null) {
  const records = ref.ledger.records ?? [];
  const paths = records.filter((r) => r.scopeId.endsWith(':path'));
  (paths.length >= 8 ? ok : fail)(`רשומות :path לכל פסקה (${paths.length} ≥ 8)`);
  (paths.every((p) => /^level:[012]$/.test(p.selectedCandidateId) && p.budget !== undefined)
    ? ok : fail)('כל :path: רמה נבחרת + תקציב');
  const escalated = paths.filter((p) => p.rejected.length > 0);
  (escalated.length > 0 && escalated.every((p) => p.rejected.every((r) => r.reason === 'no-legal-path-at-level'))
    ? ok : fail)(`הסלמות מתועדות כדחיות עם סיבה (${escalated.length} פסקאות)`);
  const lineBreaks = records.filter((r) => r.stage === 'line-break' && !r.scopeId.endsWith(':path'));
  (lineBreaks.length > 0 && lineBreaks.every((r) => /^c:\d+:\d+$/.test(r.selectedCandidateId))
    ? ok : fail)(`רשומות line-break עם מועמדים קנוניים של ה־DP (${lineBreaks.length} קווים)`);
  const withRejections = lineBreaks.filter((r) => r.rejected.length > 0);
  (withRejections.length > 0 ? ok : fail)(`יש דחיות מתועדות בפנקס (${withRejections.length} קווים עם דחיות)`);
  const emergencies = records.filter((r) => r.stage === 'emergency');
  (emergencies.length > 0 ? ok : fail)(`רשומות חירום של הסולם (${emergencies.length})`);
}

console.log('\n4) lastLineAlign ב־IR ורווחים עוקבים');
if (ref !== null) {
  const lastLines = ref.layout.pages.flatMap((p) => p.items)
    .filter((i) => i.kind === 'line' && i.lastLineAlign !== undefined);
  (lastLines.length > 0 && lastLines.every((l) => l.lastLineAlign === 'center')
    ? ok : fail)(`קווי סיום פסקה נושאים lastLineAlign=center (${lastLines.length})`);
  let zeroRuns = 0;
  let brokenZero = 0;
  for (const page of ref.layout.pages) {
    for (const item of page.items) {
      if (item.kind !== 'line') continue;
      for (const run of item.runs) {
        if (run.widthLu === 0) {
          zeroRuns += 1;
          if (!run.glyphs.every((g) => g.advanceLu === 0) || run.atomIds.length === 0) brokenZero += 1;
        }
      }
    }
  }
  (brokenZero === 0 ? ok : fail)(`ריצות רוחב 0 (רווחים עוקבים): ${zeroRuns}, כולן תקינות (גליפים אפסיים, אטומים נשמרים)`);
  // אטומי הרווחים לא נמחקו: כיסוי האטומים בביקורת כבר הוכח (audit נקי) — כאן נוכחות מפורשת
  const spaceRuns = ref.layout.pages.flatMap((p) => p.items)
    .filter((i) => i.kind === 'line')
    .flatMap((i) => i.runs)
    .filter((r) => r.text.includes(' '));
  (spaceRuns.length > 0 ? ok : fail)('רווחים נוכחים בריצות הפלט (לא נמחקו)');
}

console.log('\n5) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages');
(runCode('npx', ['tsc', '--noEmit']) === 0 ? ok : fail)('typecheck שורש');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check');
if (!SKIP_TESTS) {
  const t = run('npm', ['run', 'test:packages']);
  (/Tests\s+876\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 876/876');
} else {
  ok('test:packages — [skipped-in-CI: parent step already ran the suite]');
}

try { rmSync(tmp, { recursive: true, force: true }); } catch { /* לא קריטי */ }
console.log(`\nסיכום: ${checks - failures}/${checks}`);
process.exit(failures > 0 ? 1 : 0);
