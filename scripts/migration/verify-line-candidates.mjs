#!/usr/bin/env node
/**
 * verify-line-candidates — אימות שלב 41: מועמדי שורה וחישוב רוחב מגליפים (§7, §8.1).
 *
 * בדיקות:
 *   1. החוזה מיוצא מ־@tora/layout-engine: buildLineBreakPoints, LineCandidateIndex,
 *      buildLineCandidate, lineCandidateId, reconstructMetrics, isTrimmableSpaceText,
 *      endsWithHyphen.
 *   2. נקודות שבירה על פסקה אמיתית: UAX #14 ∩ breakBefore; אין כפילויות; סוף
 *      פסקה קיים; חסומות אינן נקודות.
 *   3. שער השלב: לכל זוג (start,end) חוקי — reconstructMetrics === measure
 *      (כל candidate ניתן לשחזור מהמקור ומהמדידה).
 *   4. רוחב מגליפים: advance לכל אטום תואם לווקטורי ספק הבדיקה; רווחים
 *      עוקבים מחוץ לרוחב; NBSP לא נחתך.
 *   5. דטרמיניזם: שני אינדקסים על אותם קלטים זהים בדיוק.
 *   6. רגרסיה: build, lint, deps, test:packages.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1'; // שיתוף ריצת הסוויטה ב-CI (סבב י"ג)
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
const stripAnsi = (s) => (s == null ? s : String(s).replace(ANSI_RE, '').replace(/\x1b/g, ''));
const run = (cmd, args) => {
  try {
    return stripAnsi(execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }));
  } catch (e) { return stripAnsi(e.stdout ?? null); }
};

const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const cm = await import(join(repoRoot, 'packages', 'content-model', 'dist', 'index.js'));
const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));
const tp = await import(join(repoRoot, 'packages', 'measurement-api', 'dist', 'test-provider.js'));

console.log('1) חוזה מיוצא');
for (const name of ['buildLineBreakPoints', 'LineCandidateIndex', 'buildLineCandidate', 'lineCandidateId', 'reconstructMetrics', 'isTrimmableSpaceText', 'endsWithHyphen']) {
  (typeof engine[name] !== 'undefined' ? ok : fail)(`מיוצא: ${name}`);
}

console.log('\n2) נקודות שבירה על פסקה אמיתית');
const provider = tp.createTestMeasurementProvider();
const FONT = { fontId: 'guttman-rashi-normal', contentSha256: 'a'.repeat(64), family: 'Guttman Rashi', weight: 400, style: 'normal' };
const SOURCE = readFileSync(join(repoRoot, 'test-triggers', 'test-all-triggers.txt'), 'utf8')
  + '\nופסקה עם מילה- שנגמרת במקף ורווחים כפולים  בסוף   וגם NBSP כאן.\n';
const parsed = cm.parseSourceText(SOURCE, { documentId: 'verify-candidates', sourceName: 'test-all-triggers.txt' });
const blocks = la.allBlocks(parsed.doc).filter((b) => b.role !== 'note-body');
// הפסקה הארוכה ביותר — לכיסוי זוגות שחזור רבים; והבלוק עם המילה שנגמרת במקף
let bt = null;
let hyphenBt = null;
for (const b of blocks) {
  const cand = engine.tokenize(b.id, b.inline, new Map());
  const p = engine.buildLineBreakPoints(cand);
  if (bt === null || p.points.length > engine.buildLineBreakPoints(bt).points.length) bt = cand;
  if (hyphenBt === null && cand.atoms.some((a) => engine.endsWithHyphen(a.text))) hyphenBt = cand;
}
const plan = engine.buildLineBreakPoints(bt);
(plan.points.length > 1 ? ok : fail)(`נקודות שבירה: ${plan.points.length} (כולל סוף פסקה)`);
(plan.points.some((p) => p.kind === 'end') ? ok : fail)('סוף פסקה קיים');
const seen = new Set(plan.points.map((p) => p.tokenIndex));
(seen.size === plan.points.length ? ok : fail)('אין נקודות כפולות');
let oppLegal = true;
for (const p of plan.points) {
  if (p.kind !== 'opportunity' && p.kind !== 'mandatory') continue;
  if (bt.atoms[p.atomIndex].breakBefore === 'forbidden') oppLegal = false;
}
(oppLegal ? ok : fail)('כל הזדמנות עוברת את breakBefore של הפרסר');
let blockedNotPoint = true;
for (const b of plan.blocked) {
  if (plan.points.some((p) => p.atomIndex === b.atomIndex)) blockedNotPoint = false;
}
(blockedNotPoint ? ok : fail)(`חסומות (${plan.blocked.length}) אינן נקודות — מסומנות, לא נעלמות`);

console.log('\n3) שער השלב — שחזור כל מועמד');
const shaped = engine.shapeParagraph(bt.atoms, provider, FONT, 16000);
const index = new engine.LineCandidateIndex(bt, shaped, () => 0);
let pairs = 0;
let mismatches = 0;
const MAX_PAIRS = 3000; // כיסוי מדגם דטרמיניסטי — לא כל O(n²) (זמן ריצה ב-CI)
const stride = Math.max(1, Math.ceil(index.breakPlan.points.length / 40)); // ~40×40 זוגות
for (let si = 0; si < index.breakPlan.points.length; si += stride) {
  const start = index.breakPlan.points[si];
  for (let ei = 0; ei < index.breakPlan.points.length; ei += stride) {
    const end = index.breakPlan.points[ei];
    if (end.tokenIndex <= start.tokenIndex) continue;
    const m = index.measure(start.tokenIndex, end.tokenIndex);
    const r = engine.reconstructMetrics(bt, shaped, () => 0, start.tokenIndex, end.tokenIndex);
    pairs += 1;
    if (JSON.stringify(m) !== JSON.stringify(r)) mismatches += 1;
    if (pairs >= MAX_PAIRS) break;
  }
  if (pairs >= MAX_PAIRS) break;
}
(pairs > 50 && mismatches === 0 ? ok : fail)(`שחזור זהה ל־${pairs} זוגות מדגם (פערים: ${mismatches})`);

console.log('\n4) רוחב מגליפים');
let advanceOk = true;
for (let i = 0; i < bt.atoms.length; i++) {
  const text = bt.atoms[i].text;
  let expectW = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    let pm = 600;
    if (cp >= 0x05d0 && cp <= 0x05ea) pm = 556;
    else if (cp === 0x20) pm = 250;
    else if ([0x2e, 0x2c, 0x3a, 0x3b, 0x21, 0x3f, 0x28, 0x29, 0x5b, 0x5d, 0x2d, 0x05be, 0x05f3, 0x05f4].includes(cp)) pm = 300;
    else if (cp >= 0x30 && cp <= 0x39) pm = 500;
    else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) pm = 556;
    else if (cp >= 0x0591 && cp <= 0x05c7) pm = 0;
    expectW += Math.round((pm * 16000) / 1000);
  }
  if (shaped.advances[i] !== expectW) { advanceOk = false; break; }
}
(advanceOk ? ok : fail)('advance לכל אטום = סכום וקטורי ספק הבדיקה (לא CSS)');
const mFull = index.measure(0, bt.tokens.length);
let manualW = 0;
for (let t = 0; t < bt.tokens.length; t++) {
  const tok = bt.tokens[t];
  if (tok.kind === 'atom') manualW += shaped.advances[tok.pIdx] ?? 0;
}
(mFull.widthLu === manualW - mFull.trailingSpaceLu ? ok : fail)(`רוחב = סכום advances − רווחים עוקבים (${mFull.widthLu})`);
(engine.isTrimmableSpaceText('\u00a0') === false && engine.isTrimmableSpaceText('  ') === true ? ok : fail)('NBSP לא נחתך; רצף רווחים נחתך');
let hyphenSeen = false;
if (hyphenBt !== null) {
  const shapedH = engine.shapeParagraph(hyphenBt.atoms, provider, FONT, 16000);
  const indexH = new engine.LineCandidateIndex(hyphenBt, shapedH, () => 0);
  for (let t = 0; t < hyphenBt.tokens.length; t++) {
    const tok = hyphenBt.tokens[t];
    if (tok.kind === 'atom' && engine.endsWithHyphen(hyphenBt.atoms[tok.pIdx].text)) {
      if (indexH.measure(0, t + 1).hyphenEnd) hyphenSeen = true;
      break;
    }
  }
}
(hyphenSeen ? ok : fail)('מילה שנגמרת במקף ⇒ hyphenEnd');

console.log('\n5) דטרמיניזם');
const index2 = new engine.LineCandidateIndex(bt, shaped, () => 0);
(JSON.stringify(index.breakPlan) === JSON.stringify(index2.breakPlan) ? ok : fail)('שני אינדקסים על אותם קלטים — תוכניות שבירה זהות');

console.log('\n6) רגרסיה');
(runCode2('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages');
(runCode2('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages');
(runCode2('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check');
if (!SKIP_TESTS) {
  const t = run('npm', ['run', 'test:packages']);
  (/Tests\s+727\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 727/727');
} else {
  ok('test:packages — [skipped-in-CI: parent step already ran the suite]');
}

function runCode2(cmd, args) {
  try { execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }); return 0; }
  catch { return 1; }
}

console.log(`\nסיכום: ${checks - failures}/${checks}`);
process.exit(failures > 0 ? 1 : 0);
