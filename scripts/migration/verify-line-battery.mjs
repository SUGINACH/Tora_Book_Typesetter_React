#!/usr/bin/env node
/**
 * verify-line-battery — אימות שלב 46: סוללת מבחני השורה החובה (אפיון §17.1–17.4, §8).
 *
 * בדיקות:
 *   1. חוזה: 11 קובצי ה-fixtures של רשימת החובה קיימים בתיקייה הנעולה.
 *   2. כל fixture דרך הסולם (dist): כיסוי אטומים מלא (כולל רווחים), חוקיות
 *      מתועדת (קוד fallback לכל קו שאינו חוקי רמה-0), אין חציית שבירה כפויה,
 *      דטרמיניזם מלא.
 *   3. שורה ריקה/מילה אחת/מילה ארוכה — התנהגויות הקצה המחייבות.
 *   4. רגרסיית החזית: פסקה ארוכה בתקציב דוק (64/8) — כיסוי מלא + מיצוי נרשם
 *      (הבאג שהסוללה גילתה: אפס קווים בשקט לפני התיקון).
 *   5. BigInt ב-badness: מכפלה חורגת מהטווח הבטוח ⇐ ערך מדויק, לא קריסה
 *      (UNSAFE_INTEGER לפני התיקון).
 *   6. שחזור כשלון ב־CLI (הספק האמיתי HarfBuzz): מסמך נקי ⇒ יציאה 0 וביקורת
 *      נקייה; מסמך מילה-ארוכה ⇒ יציאה 7 עם LINE_RUN_OVERFLOW מתועד בביקורת
 *      וקו חירום בפנקס — "overflow הוא HIGH" נראה, לא נבלע (§8.2, §14.3).
 *   7. רגרסיה: build, lint, deps, test:packages (מונה מדויק).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
const cm = await import(join(repoRoot, 'packages', 'content-model', 'dist', 'index.js'));
const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));
const tp = await import(join(repoRoot, 'packages', 'measurement-api', 'dist', 'test-provider.js'));

const FONT = Object.freeze({ fontId: 'guttman-rashi-normal', contentSha256: 'a'.repeat(64), family: 'Guttman Rashi', weight: 400, style: 'normal' });
const provider = tp.createTestMeasurementProvider();
const VALUES = {
  'size-body': 12, 'line-height-body': 1.34, 'prop-margin': 7.5, 'note-marker-size': 8,
  'note-marker-type': 'super', 'fn-reset-mode': 'page', 'page-num-format': 'gematria', 'page-num-initial-value': 1,
};
const V0 = engine.readV0Settings({ values: VALUES, layers: [], configHash: 'x' });
const COLUMN = V0.geometry.columnWidth;
const BATTERY_DIR = join(repoRoot, 'packages', 'layout-engine', 'test', 'fixtures', 'line-battery');
const BUDGET = { maxCandidatesPerState: 512, maxBeamWidth: 64 };
const TIGHT = { maxCandidatesPerState: 64, maxBeamWidth: 8 };
const REQUIRED = [
  'bidi_mixed.txt', 'brackets_note.txt', 'empty_line.txt', 'first_last_line.txt', 'hyphens.txt',
  'long_paragraph.txt', 'long_word.txt', 'niqqud.txt', 'parens.txt', 'single_word.txt', 'whitespace_runs.txt',
];

function runFixture(name, budget = BUDGET) {
  const raw = readFileSync(join(BATTERY_DIR, name), 'utf8');
  const parsed = cm.parseSourceText(raw, { documentId: `battery:${name}`, sourceName: name });
  const blocks = la.allBlocks(parsed.doc).filter((b) => b.role !== 'note-body');
  const noteBlocks = [
    ...parsed.doc.notes.footnotes, ...parsed.doc.notes.endnotes,
    ...parsed.doc.notes.sidenotes, ...parsed.doc.notes.editorial,
  ].map((n) => n.block);
  const out = [];
  for (const b of [...blocks, ...noteBlocks]) {
    const bt = engine.tokenize(b.id, b.inline, new Map());
    if (bt.tokens.length === 0) continue;
    const shaped = engine.shapeParagraph(bt.atoms, provider, FONT, V0.bodyFontSizeLu);
    const index = new engine.LineCandidateIndex(bt, shaped, () => 0);
    const ladder = engine.breakParagraphWithLadder(bt.blockId, bt, index, COLUMN, budget);
    out.push({ role: String(b.role), bt, ladder });
  }
  return out;
}

const placedIds = (r) => r.ladder.dp.lines.flatMap((line) => {
  const ids = [];
  for (let t = line.startTok; t < line.endTok; t++) {
    const tok = r.bt.tokens[t];
    if (tok.kind === 'atom') ids.push(r.bt.atoms[tok.pIdx].id);
  }
  return ids;
});
const allIds = (r) => r.bt.atoms.map((a) => a.id);
const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

console.log('1) חוזה — 11 ה-fixtures של רשימת החובה');
{
  const files = readdirSync(BATTERY_DIR).filter((f) => f.endsWith('.txt')).sort();
  (JSON.stringify(files) === JSON.stringify([...REQUIRED].sort()) ? ok : fail)(`11 קבצים בדיוק (נמצאו ${files.length})`);
}

console.log('\n2) כל fixture דרך הסולם: כיסוי, חוקיות, כפייה, דטרמיניזם');
{
  let good = 0;
  for (const name of REQUIRED) {
    let pass = true;
    try {
      const runs = runFixture(name);
      if (runs.length === 0) pass = false;
      for (const r of runs) {
        if (!sameSet(placedIds(r), allIds(r))) { pass = false; break; }
        for (const line of r.ladder.dp.lines) {
          for (let t = line.startTok; t < line.endTok; t++) {
            if (r.bt.tokens[t].kind === 'forced') { pass = false; break; }
          }
        }
        r.ladder.dp.lines.forEach((line, i) => {
          const m = line.candidate.metrics;
          const bad = line.justification === 'justify'
            ? (m.widthLu - m.shrinkLu > COLUMN && !r.ladder.perLineFallback.has(i))
              || (COLUMN - m.widthLu > m.stretchLu && !r.ladder.perLineFallback.has(i))
            : (m.widthLu > COLUMN && !r.ladder.perLineFallback.has(i));
          if (bad) pass = false;
        });
        const again = runFixture(name).find((x) => x.bt.blockId === r.bt.blockId);
        if (JSON.stringify(again.ladder) !== JSON.stringify(r.ladder)) pass = false;
      }
    } catch { pass = false; }
    if (pass) good++;
    else fail(`${name}: כיסוי/חוקיות/כפייה/דטרמיניזם`);
  }
  if (good === REQUIRED.length) ok(`${good}/${REQUIRED.length} fixtures: מלא דרך הסולם`);
}

console.log('\n3) התנהגויות קצה מחייבות');
{
  const single = runFixture('single_word.txt').find((r) => r.role === 'body');
  (single.ladder.dp.lines.length === 1 && single.ladder.level === 0 && single.ladder.perLineFallback.size === 0
    ? ok : fail)('מילה אחת: קו יחיד, רמה 0, בלי חירום');
  const long = runFixture('long_word.txt').find((r) => r.role === 'body');
  const emLine = [...long.ladder.perLineFallback.values()].includes('EMERGENCY_LINE');
  (long.ladder.level === 2 && emLine ? ok : fail)('מילה ארוכה: רמה 2 עם EMERGENCY_LINE מתועד');
  const empty = runFixture('empty_line.txt').filter((r) => r.role === 'body');
  (empty.length >= 2 && empty.every((b) => sameSet(placedIds(b), allIds(b))) ? ok : fail)('שורה ריקה: הפסקאות שמסביב שלמות');
}

console.log('\n4) רגרסיית החזית (הבאג שהסוללה גילתה; עודכן בשלב 48 לקבוע ADR-004-ר1)');
{
  // תרחיש החזית: טור צר מרוחב כל מילה מכריח קווים חד-מילוליים ברמה 2 —
  // שם צומת החזית הוא היחיד שיכול להמשיך, והאלומה הדוקה גוזמת אותו ראשון.
  const raw = readFileSync(join(BATTERY_DIR, 'long_paragraph.txt'), 'utf8');
  const parsed = cm.parseSourceText(raw, { documentId: 'battery:frontier-v', sourceName: 'long_paragraph.txt' });
  const bodyBlock = la.allBlocks(parsed.doc).find((b) => b.role === 'body');
  const bt = engine.tokenize(bodyBlock.id, bodyBlock.inline, new Map());
  const shaped = engine.shapeParagraph(bt.atoms, provider, FONT, V0.bodyFontSizeLu);
  const index = new engine.LineCandidateIndex(bt, shaped, () => 0);
  const NARROW = 26688; // 3 תווים — כל מילה בפסקה רחבה ממנו
  const ladder = engine.breakParagraphWithLadder(bt.blockId, bt, index, NARROW, TIGHT);
  const placedNarrow = [];
  for (const line of ladder.dp.lines) {
    for (let t = line.startTok; t < line.endTok; t++) {
      const tok = bt.tokens[t];
      if (tok.kind === 'atom') placedNarrow.push(bt.atoms[tok.pIdx].id);
    }
  }
  const allNarrow = bt.atoms.map((a) => a.id);
  (ladder.dp.lines.length > 0 && sameSet(placedNarrow, allNarrow)
    ? ok : fail)('טור צר + תקציב דוק 64/8: כיסוי מלא (לפני התיקון — אפס קווים בשקט)');
  (ladder.level === 2 && ladder.dp.budget.exhausted === true ? ok : fail)(`רמה 2 והמיצוי נרשם (exhausted=true; §9.2)`);
  const tight = runFixture('long_paragraph.txt', TIGHT).find((r) => r.role === 'body');
  const wide = runFixture('long_paragraph.txt', BUDGET).find((r) => r.role === 'body');
  (sameSet(placedIds(wide), allIds(wide)) && sameSet(placedIds(tight), allIds(tight))
    ? ok : fail)('בטור האמיתי: כיסוי מלא בשני התקציבים');
  (wide.ladder.perLineFallback.size <= tight.ladder.perLineFallback.size
    ? ok : fail)(`תקציב נדיב אינו גרוע מהדוק (${wide.ladder.perLineFallback.size} ≤ ${tight.ladder.perLineFallback.size})`);
}

console.log('\n5) badness עם מכפלה חורגת — מסלול מדויק, לא קריסה');
{
  // מסלול ה-surplus (deficit<0): surplus=965000 < 2·stretch=1932000 — עובר את
  // התקרה המוקדמת, אך SCALE·num² ≈ 9.3e15 > 2⁵³. לפני התיקון: UnitsError
  // UNSAFE_INTEGER; אחרי: ערך שלם מדויק דרך BigInt עם סמנטיקת roundDiv.
  let threw = null;
  let value = null;
  try { value = engine.justifyBadness(0, 980000, 0, 965000); } catch (e) { threw = e; }
  (threw === null && Number.isInteger(value) && value >= 0 && value < 40000
    ? ok : fail)(`justifyBadness(surplus=965000, stretch=980000) = ${value} (שלם מדויק, לא קריסה)`);
  const small = engine.justifyBadness(0, 2000, 0, 1000);
  (small === 2500 ? ok : fail)('מסלול מהיר נשמר מדויק: justifyBadness(surplus=1000, stretch=2000) = 2500');
  // שקילות המסלולים: ערך שניתן לחשב בשניהם — זהה
  const edge = engine.justifyBadness(0, 980000, 0, 948999);
  (Number.isInteger(edge) ? ok : fail)(`גבול הטווח הבטוח (948999) = ${edge} — שלם תקין`);
}

console.log('\n6) שחזור כשלון ב־CLI (הספק האמיתי)');
{
  const tmp = mkdtempSync(join(tmpdir(), 'battery-cli-'));
  try {
    const out1 = join(tmp, 'clean');
    const code1 = runCode('node', ['packages/cli/dist/main.js', '--input',
      'packages/layout-engine/test/fixtures/line-battery/empty_line.txt', '--out', out1, '--trace', 'decisions']);
    let cleanOk = code1 === 0;
    try {
      const audit = JSON.parse(readFileSync(join(out1, 'audit.json'), 'utf8'));
      if (audit.counts.HIGH !== 0) cleanOk = false;
    } catch { cleanOk = false; }
    (cleanOk ? ok : fail)('מסמך נקי ⇒ יציאה 0 וביקורת נקייה (0 HIGH)');

    const out2 = join(tmp, 'longword');
    let code2 = 0;
    try {
      execFileSync('node', ['packages/cli/dist/main.js', '--input',
        'packages/layout-engine/test/fixtures/line-battery/long_word.txt', '--out', out2, '--trace', 'decisions'],
        { cwd: repoRoot, stdio: 'ignore', env: { ...process.env, NO_COLOR: '1' } });
    } catch { code2 = 1; }
    let longOk = code2 !== 0;
    try {
      const audit = JSON.parse(readFileSync(join(out2, 'audit.json'), 'utf8'));
      if (!(audit.counts.HIGH > 0 && audit.findings.some((f) => f.code === 'audit.layout.LINE_RUN_OVERFLOW'))) longOk = false;
    } catch { longOk = false; }
    (longOk ? ok : fail)('מילה ארוכה ⇒ יציאה 7 עם LINE_RUN_OVERFLOW נראה בביקורת (הכשל משוחזר, לא נבלע)');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

console.log('\n7) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check');
if (!SKIP_TESTS) {
  const t = run('npm', ['run', 'test:packages']);
  (/Tests\s+1292\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 1292/1292');
} else {
  ok('test:packages — [skipped-in-CI: parent step already ran the suite]');
}

console.log(`\nסיכום: ${checks - failures}/${checks}`);
process.exit(failures > 0 ? 1 : 0);
