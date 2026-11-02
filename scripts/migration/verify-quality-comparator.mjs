#!/usr/bin/env node
/**
 * verify-quality-comparator — אימות שלב 43: אילוצים קשים מול עלויות,
 * QualityVector ו־comparator לקסיקוגרפי (§6.6, §8.2; ADR-004).
 *
 * בדיקות:
 *   1. חוזה: compareQuality/addQuality/lineQualityVector/createQualityCostModel/
 *      QUALITY_VECTOR_KEYS/ZERO_QUALITY/dpLedgerEntries/compareBreakSequences.
 *   2. ADR-004 קיים ונעול: 9 רכיבים בסדר המתועד; סטטוס "מקובל" ברישום ה־ADR.
 *   3. אילוץ קשה: מועמד גלישה נפסל לפני תמחור (best=null, לא מסלור גולש).
 *   4. לקסיקוגרפיה: fallback > badness; runt > badness; badness > hyphen.
 *   5. תכונות הסדר על מדגם דטרמיניסטי: אנטי־סימטריה, אינווריאנטיות לחיבור.
 *   6. פנקס: dpLedgerEntries ⇐ פנקס אמיתי מקבל בלי שגיאות; דחיות עם סיבות.
 *   7. רגרסיה: build, lint, deps, test:packages.
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
for (const name of ['compareQuality', 'addQuality', 'lineQualityVector', 'createQualityCostModel', 'QUALITY_VECTOR_KEYS', 'ZERO_QUALITY', 'dpLedgerEntries', 'compareBreakSequences']) {
  (typeof engine[name] !== 'undefined' ? ok : fail)(`מיוצא: ${name}`);
}

console.log('\n2) ADR-004');
const adr = readFileSync(join(repoRoot, 'docs', 'adr', 'ADR-004-linebreak-quality.md'), 'utf8');
(adr.includes('## מצב ההחלטה') && adr.includes('**מקובל**') ? ok : fail)('ADR-004 נעול (מצב: מקובל)');
const orderOk = engine.QUALITY_VECTOR_KEYS.join(',') === 'fallbackSeverity,headingEscortDebt,noteDisplacement,widowOrphanDebt,runtDebt,lineBadness,hyphenDebt,columnImbalance,pageCountDebt';
(orderOk && adr.includes('| 1 | `fallbackSeverity`') && adr.includes('| 9 | `pageCountDebt`') ? ok : fail)('9 רכיבים בסדר ADR-004 — בקוד ובמסמך');
(readFileSync(join(repoRoot, 'docs', 'adr', 'README.md'), 'utf8').includes('ADR-004') ? ok : fail)('ADR-004 רשום בטבלת ה־ADR');

console.log('\n3) אילוץ קשה מול cost');
const provider = tp.createTestMeasurementProvider();
const FONT = { fontId: 'guttman-rashi-normal', contentSha256: 'a'.repeat(64), family: 'Guttman Rashi', weight: 400, style: 'normal' };
function build(text) {
  const parsed = cm.parseSourceText(`כותרת 1 - ח\n${text}\n`, { documentId: 'verify-q', sourceName: 'verify-q.txt' });
  const blocks = la.allBlocks(parsed.doc).filter((b) => b.role !== 'note-body');
  const bt = engine.tokenize(blocks[1].id, blocks[1].inline, new Map());
  const shaped = engine.shapeParagraph(bt.atoms, provider, FONT, 16000);
  return { index: new engine.LineCandidateIndex(bt, shaped, () => 0), bt };
}
const BUDGET = { maxCandidatesPerState: 64, maxBeamWidth: 8 };
const { index: idxOverflow } = build('א ב ג ד אאאאאאאאאאאאאאאאאאאא ה ו ז ח');
const dpO = engine.breakParagraphDP(idxOverflow, engine.createQualityCostModel(30000), engine.createLevel0Policy(), 30000, BUDGET);
(dpO.best === null && dpO.rejections.some((r) => r.reason === 'overflow') ? ok : fail)('מועמד גלישה נפסל לפני תמחור — אין מסלור גולש במחיר badness 0');

console.log('\n4) לקסיקוגרפיה');
const Z = engine.ZERO_QUALITY;
const v = (o) => ({ ...Z, ...o });
(engine.compareQuality(v({ fallbackSeverity: 1, lineBadness: 0 }), v({ lineBadness: 999999 })) > 0 ? ok : fail)('fallbackSeverity מנצח lineBadness ענק');
(engine.compareQuality(v({ runtDebt: 1 }), v({ lineBadness: 999999 })) > 0 ? ok : fail)('runtDebt מנצח lineBadness');
(engine.compareQuality(v({ lineBadness: 5000 }), v({ lineBadness: 5000, hyphenDebt: 7 })) < 0 ? ok : fail)('badness שווה ⇒ פחות מקפים מנצח');

console.log('\n5) תכונות הסדר (מדגם דטרמיניסטי)');
let seed = 987654321;
const rnd = (max) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % max; };
let antisym = true;
let invariance = true;
for (let i = 0; i < 500; i++) {
  const a = v({ fallbackSeverity: rnd(3), widowOrphanDebt: rnd(3), runtDebt: rnd(2), lineBadness: rnd(40001), hyphenDebt: rnd(4) });
  const b = v({ fallbackSeverity: rnd(3), widowOrphanDebt: rnd(3), runtDebt: rnd(2), lineBadness: rnd(40001), hyphenDebt: rnd(4) });
  const c = v({ fallbackSeverity: rnd(2), lineBadness: rnd(1000) });
  const ab = engine.compareQuality(a, b);
  const ba = engine.compareQuality(b, a);
  if (Math.sign(ab) !== -Math.sign(ba)) antisym = false;
  if (ab < 0 && engine.compareQuality(engine.addQuality(a, c), engine.addQuality(b, c)) >= 0) invariance = false;
}
(antisym ? ok : fail)('אנטי־סימטריה על 500 זוגות');
(invariance ? ok : fail)('אינווריאנטיות לחיבור — תנאי ה־DP');

console.log('\n6) פנקס — דחיות וניצחונות');
const { index: idxLedger, bt: btLedger } = build('א ב ג ד ה ו ז ח- ט י כ ל מ נ ס ע');
const W = 96000;
const dpL = engine.breakParagraphDP(idxLedger, engine.createQualityCostModel(W), engine.createLevel0Policy(), W, BUDGET);
const entries = engine.dpLedgerEntries('verify-block', btLedger, dpL, W);
(entries.length === dpL.lines.length && entries.length > 0 ? ok : fail)(`רשומה לכל קו (${entries.length})`);
try {
  const ledger = new la.DecisionLedgerBuilder('decisions');
  for (const e of entries) ledger.append(e);
  (ledger.build()?.records.length === entries.length ? ok : fail)('הפנקס האמיתי מקבל את כל הרשומות בלי שגיאות סכמה');
} catch (e) {
  fail(`הפנקס דחה רשומה: ${String(e).slice(0, 80)}`);
}
const reasons = new Set(entries.flatMap((e) => e.rejected.map((r) => r.reason)));
(reasons.size > 0 && [...reasons].every((r) => ['overflow', 'underfill', 'dominated-by-comparator', 'spans-mandatory-break'].includes(r)) ? ok : fail)(`דחיות עם קודי סיבה מוכרים: ${[...reasons].join(', ')}`);
(engine.compareBreakSequences([2, 8], [2, 8, 12]) < 0 && engine.compareBreakSequences([3], [2]) > 0 ? ok : fail)('תיקו לפי רצף אינדקסי שבירה (קנוני)');

console.log('\n7) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check');
if (!SKIP_TESTS) {
  const t = run('npm', ['run', 'test:packages']);
  (/Tests\s+669\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 669/669');
} else {
  ok('test:packages — [skipped-in-CI: parent step already ran the suite]');
}

console.log(`\nסיכום: ${checks - failures}/${checks}`);
process.exit(failures > 0 ? 1 : 0);
