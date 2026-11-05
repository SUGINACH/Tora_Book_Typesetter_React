#!/usr/bin/env node
/**
 * verify-paragraph-dp — אימות שלב 42: DP גלובלי לפסקה בסגנון Knuth–Plass (§8.2).
 *
 * בדיקות:
 *   1. החוזה מיוצא: breakParagraphDP, CostModel/LineContext/FeasibilityPolicy,
 *      justificationOf, createScalarCostModel, createLevel0Policy, breakParagraphGreedy.
 *   2. דוגמת הפרדה: פסקה שבה greedy נגמר במקף וה־DP נמנע — DP זול משמעותית
 *      והבחירות שונות (הוכחת הגלובליות).
 *   3. דטרמיניזם: שלוש ריצות זהות בדיוק; תיקו יציב.
 *   4. תקציב: מועמד-אחד-למצב ⇒ exhausted=true + מסלול; רישום גזימות.
 *   5. כפייה: שורה לא חוצה forced; השורה שלפניו natural; דחיית
 *      spans-mandatory-break מתועדת.
 *   6. אין מסלור ברמה 0 ⇒ best=null (עם דחיות) — הסולם בשלב 44.
 *   7. greedy מסומן כפיקסטורת השוואה בלבד (בדיקת מקור).
 *   8. רגרסיה: build, lint, deps, test:packages.
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

console.log('1) חוזה מיוצא');
for (const name of ['breakParagraphDP', 'createScalarCostModel', 'createLevel0Policy', 'breakParagraphGreedy', 'justificationOf']) {
  (typeof engine[name] !== 'undefined' ? ok : fail)(`מיוצא: ${name}`);
}

console.log('\n2) דוגמת הפרדה — greedy ≠ optimum');
const provider = tp.createTestMeasurementProvider();
const FONT = { fontId: 'guttman-rashi-normal', contentSha256: 'a'.repeat(64), family: 'Guttman Rashi', weight: 400, style: 'normal' };
const TEXT = 'א ב ג ד ה ו ז ח- ט י כ ל מ נ ס ע';
const W = 96000;
const BUDGET = { maxCandidatesPerState: 64, maxBeamWidth: 8 };
function build(text) {
  const parsed = cm.parseSourceText(`כותרת 1 - ח\n${text}\n`, { documentId: 'verify-dp', sourceName: 'verify-dp.txt' });
  const blocks = la.allBlocks(parsed.doc).filter((b) => b.role !== 'note-body');
  const bt = engine.tokenize(blocks[1].id, blocks[1].inline, new Map());
  const shaped = engine.shapeParagraph(bt.atoms, provider, FONT, 16000);
  return { index: new engine.LineCandidateIndex(bt, shaped, () => 0), bt };
}
const { index } = build(TEXT);
const policy = engine.createLevel0Policy();
const model = engine.createScalarCostModel(W);
const dp = engine.breakParagraphDP(index, model, policy, W, BUDGET);
const greedy = engine.breakParagraphGreedy(index, policy, W);
const greedyCost = greedy.reduce((s, l) => s + engine.scalarLineCost({
  candidate: l.candidate, lineIndex: 0, isFirst: false, isLast: l.justification === 'last', justification: l.justification,
}, W), 0);
(dp.best !== null && dp.best < greedyCost ? ok : fail)(`DP (${dp.best}) זול מ־greedy (${greedyCost}) — הבחירה גלובלית`);
(greedy.some((l) => l.candidate.metrics.hyphenEnd) && dp.lines.every((l) => !l.candidate.metrics.hyphenEnd) ? ok : fail)('greedy נגמר במקף; ה־DP נמנע ממנו');
const dpEnds = dp.lines.map((l) => l.endTok).join(',');
const greedyEnds = greedy.map((l) => l.endTok).join(',');
(dpEnds !== greedyEnds ? ok : fail)('הבחירות שונות בפועל');

console.log('\n3) דטרמיניזם ותיקו');
const a = engine.breakParagraphDP(index, model, policy, W, BUDGET);
const b = engine.breakParagraphDP(index, model, policy, W, BUDGET);
(JSON.stringify(dp) === JSON.stringify(a) && JSON.stringify(a) === JSON.stringify(b) ? ok : fail)('שלוש ריצות זהות בדיוק (כולל רשומות)');

console.log('\n4) תקציב');
const tight = engine.breakParagraphDP(index, model, policy, W, { maxCandidatesPerState: 1, maxBeamWidth: 8 });
(tight.budget.exhausted === true && tight.best !== null ? ok : fail)(`מועמד-אחד-למצב: exhausted=true עם מסלול (best=${tight.best})`);
const tight2 = engine.breakParagraphDP(index, model, policy, W, { maxCandidatesPerState: 1, maxBeamWidth: 8 });
(JSON.stringify(tight) === JSON.stringify(tight2) ? ok : fail)('תוצאת התקציב ההדוק דטרמיניסטית');
(Number.isInteger(tight.best ?? 0) ? ok : fail)('עלות שלמה (אין float/Infinity)');

console.log('\n5) כפייה');
const parsedF = cm.parseSourceText('כותרת 1 - ח\nהתחלה [תוכן\nממשיך] סוף.\n', { documentId: 'verify-dp-f', sourceName: 'f.txt' });
const fn = parsedF.doc.notes.footnotes[0];
const btF = engine.tokenizeNotesBody(fn.noteId, 'א', fn.block.source ?? { documentId: 'verify-dp-f', stream: 'footnote', startUtf16: 0, endUtf16: 1 }, fn.block.inline);
const shapedF = engine.shapeParagraph(btF.atoms, provider, FONT, 16000);
const indexF = new engine.LineCandidateIndex(btF, shapedF, () => 0);
const dpF = engine.breakParagraphDP(indexF, engine.createScalarCostModel(60000), engine.createLevel0Policy(), 60000, BUDGET);
const forcedIdx = btF.tokens.findIndex((t) => t.kind === 'forced');
let noSpan = true;
for (const l of dpF.lines) {
  if (l.startTok < forcedIdx && l.endTok > forcedIdx) noSpan = false;
}
(noSpan && dpF.best !== null ? ok : fail)('שום קו לא חוצה את השבירה הכפויה');
(dpF.lines.some((l) => l.endTok === forcedIdx && l.justification === 'natural') ? ok : fail)('הקו שלפני הכפייה הוא natural');
(dpF.rejections.some((x) => x.reason === 'spans-mandatory-break') ? ok : fail)('דחיית קו חוצה-כפייה מתועדת');

console.log('\n6) אין מסלור ברמה 0');
const parsedL = cm.parseSourceText('כותרת 1 - ח\nאאאאאאאאאאאאאאאאאאאא\n', { documentId: 'verify-dp-l', sourceName: 'l.txt' });
const blocksL = la.allBlocks(parsedL.doc).filter((b) => b.role !== 'note-body');
const btL = engine.tokenize(blocksL[1].id, blocksL[1].inline, new Map());
const shapedL = engine.shapeParagraph(btL.atoms, provider, FONT, 16000);
const indexL = new engine.LineCandidateIndex(btL, shapedL, () => 0);
const dpL = engine.breakParagraphDP(indexL, engine.createScalarCostModel(20000), engine.createLevel0Policy(), 20000, BUDGET);
(dpL.best === null && dpL.rejections.length > 0 ? ok : fail)(`מילה ארוכה מהטור: best=null עם ${dpL.rejections.length} דחיות (סולם החירום — שלב 44)`);

console.log('\n7) greedy מסומן כפיקסטורת השוואה בלבד');
const greedySrc = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'linebreak', 'greedy.ts'), 'utf8');
(greedySrc.includes('פיקסטורת השוואה בלבד') ? ok : fail)('greedy.ts מסומן: פיקסטורת השוואה בלבד');
(!readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'v0', 'typeset-v0.ts'), 'utf8').includes('breakParagraphGreedy') ? ok : fail)('מסלול הייצור (typeset) עדיין בשבירה המקורית — החלפה רק בשלב 47');

console.log('\n8) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check');
if (!SKIP_TESTS) {
  const t = run('npm', ['run', 'test:packages']);
  (/Tests\s+1243\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 1243/1243');
} else {
  ok('test:packages — [skipped-in-CI: parent step already ran the suite]');
}

console.log(`\nסיכום: ${checks - failures}/${checks}`);
process.exit(failures > 0 ? 1 : 0);
