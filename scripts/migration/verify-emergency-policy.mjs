#!/usr/bin/env node
/**
 * verify-emergency-policy — אימות שלב 44: מדיניות חירום מדורגת ומילה ארוכה (§8.2, §14).
 *
 * בדיקות:
 *   1. חוזה: breakParagraphWithLadder, createLevel1Policy, createLevel2Policy, LadderResult.
 *   2. רמה 0 לפסקה רגילה; רמה 1 עם EMERGENCY_STRETCH; רמה 2 למילה ארוכה
 *      (המילה בשלמותה, EMERGENCY_LINE, אטומים לא נחתכים).
 *   3. קו רב־מילילי אינו מתמזג למקטע ענק (רמה 2 מחייבת כללי רמה 1).
 *   4. כשל מפורש: allowOverflow=false ⇒ NO_LEGAL_LINE_BREAK מקוטלג.
 *   5. רישומי חירום תקפים בפנקס אמיתי עם spans; קודי fallback ברשומות הקו.
 *   6. דטרמיניזם מלא של הסולם.
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
for (const name of ['breakParagraphWithLadder', 'createLevel1Policy', 'createLevel2Policy']) {
  (typeof engine[name] !== 'undefined' ? ok : fail)(`מיוצא: ${name}`);
}

console.log('\n2) הסולם בפועל');
const provider = tp.createTestMeasurementProvider();
const FONT = { fontId: 'guttman-rashi-normal', contentSha256: 'a'.repeat(64), family: 'Guttman Rashi', weight: 400, style: 'normal' };
const BUDGET = { maxCandidatesPerState: 64, maxBeamWidth: 8 };
function ladder(text, W, options) {
  const parsed = cm.parseSourceText(`כותרת 1 - ח\n${text}\n`, { documentId: 'verify-emg', sourceName: 'verify-emg.txt' });
  const blocks = la.allBlocks(parsed.doc).filter((b) => b.role !== 'note-body');
  const bt = engine.tokenize(blocks[1].id, blocks[1].inline, new Map());
  const shaped = engine.shapeParagraph(bt.atoms, provider, FONT, 16000);
  const index = new engine.LineCandidateIndex(bt, shaped, () => 0);
  return { r: engine.breakParagraphWithLadder('v-emg', bt, index, W, BUDGET, options), bt, index };
}
const normal = ladder('א ב ג ד ה ו ז ח ט י כ ל מ', 100000);
(normal.r.level === 0 && normal.r.perLineFallback.size === 0 && normal.r.emergencyRecords.length === 0 ? ok : fail)('פסקה רגילה: רמה 0, אפס fallback, אפס רישומי חירום');
// W=43100 (עודכן בשלב 48 לקבוע ADR-004-ר1 — מתיחה=רווח מלא פר-רווח)
const stretch = ladder('א ב ג ד', 43100);
(stretch.r.level === 1 && stretch.r.perLineFallback.get(0) === 'EMERGENCY_STRETCH' && stretch.r.dp.best.fallbackSeverity === 1 ? ok : fail)('רמה 1: EMERGENCY_STRETCH (MEDIUM=1) על הקו החורג');
const LONG = 'א ב ג ד אאאאאאאאאאאאאאאאאאאא ה ו ז ח';
const giant = ladder(LONG, 30000);
(giant.r.level === 2 ? ok : fail)(`מילה ארוכה: רמה 2 (הופקד ב־${giant.r.level})`);
const giantAtom = giant.bt.atoms.find((a) => a.text.length >= 19);
let giantLine = null;
for (const l of giant.r.dp.lines) {
  for (let t = l.startTok; t < l.endTok; t++) {
    const tok = giant.bt.tokens[t];
    if (tok.kind === 'atom' && giant.bt.atoms[tok.pIdx].id === giantAtom.id) giantLine = l;
  }
}
(giantLine !== null && giantLine.candidate.metrics.widthLu > 30000 ? ok : fail)('המילה הארוכה על קו משלה — הגלישה נראית (לא נמדדה כאפס)');
(giant.r.perLineFallback.get(giant.r.dp.lines.indexOf(giantLine)) === 'EMERGENCY_LINE' ? ok : fail)('קוד EMERGENCY_LINE לקו הגולש');
(giant.r.dp.lines.length > 4 ? ok : fail)(`אין מקטע ענק: ${giant.r.dp.lines.length} קווים (רמה 2 מחייבת כללי רמה 1 לבני־שבירה)`);
// אטומים לא נמחקו
const wordIds = new Set(giant.bt.atoms.filter((a) => a.text.trim().length > 0).map((a) => a.id));
const placed = new Set();
for (const l of giant.r.dp.lines) {
  for (let t = l.startTok; t < l.endTok; t++) {
    const tok = giant.bt.tokens[t];
    if (tok.kind === 'atom' && wordIds.has(giant.bt.atoms[tok.pIdx].id)) placed.add(giant.bt.atoms[tok.pIdx].id);
  }
}
(placed.size === wordIds.size ? ok : fail)(`כל ${wordIds.size} אטומי המילים הוצבו — אין מחיקת תוכן`);

console.log('\n3) כשל מפורש');
let threw = null;
try { ladder(LONG, 30000, { allowOverflow: false }); } catch (e) { threw = e; }
(threw !== null && String(threw).includes('errors.engine.NO_LEGAL_LINE_BREAK') ? ok : fail)('allowOverflow=false ⇒ NO_LEGAL_LINE_BREAK מקוטלג (לא טקסט קטוע)');

console.log('\n4) רישומי חירום בפנקס');
try {
  const ledger = new la.DecisionLedgerBuilder('decisions');
  for (const rec of giant.r.emergencyRecords) ledger.append(rec);
  const built = ledger.build();
  (built.records.length === 3 ? ok : fail)(`3 רשומות חירום (L0 נכשל, L1 נכשל, L2 הופעל) — התקבלו ${built.records.length}`);
  ((built.summary.fallbacks.EMERGENCY_LINE ?? 0) > 0 ? ok : fail)('fallbacks.EMERGENCY_LINE נספר בסיכום הפנקס');
  const applied = giant.r.emergencyRecords.find((r) => r.scopeId.endsWith(':applied'));
  (applied !== undefined && applied.sourceSpans.length > 0 ? ok : fail)('רשומת ההפעלה נושאת spans של הקווים שנפגעו');
} catch (e) {
  fail(`הפנקס דחה רשומת חירום: ${String(e).slice(0, 90)}`);
}
const lineEntries = engine.dpLedgerEntries('v-emg', giant.bt, giant.r.dp, 30000, giant.r.perLineFallback);
(lineEntries.filter((e) => e.fallbackCode !== undefined).length === giant.r.perLineFallback.size ? ok : fail)('קודי ה-fallback זורמים לרשומות הקו');

console.log('\n5) דטרמיניזם');
const a = ladder(LONG, 30000).r;
const b = ladder(LONG, 30000).r;
(a.level === b.level && JSON.stringify(a.emergencyRecords) === JSON.stringify(b.emergencyRecords)
  && JSON.stringify([...a.perLineFallback.entries()]) === JSON.stringify([...b.perLineFallback.entries()]) ? ok : fail)('אותה רמה, אותם קודים ואותן רשומות בכל ריצה');

console.log('\n6) קטלוג השגיאות');
(readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'errors.ts'), 'utf8').includes('NO_LEGAL_LINE_BREAK') ? ok : fail)('הקוד NO_LEGAL_LINE_BREAK רשום בקטלוג המנוע');

console.log('\n7) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check');
if (!SKIP_TESTS) {
  const t = run('npm', ['run', 'test:packages']);
  (/Tests\s+899\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 899/899');
} else {
  ok('test:packages — [skipped-in-CI: parent step already ran the suite]');
}

console.log(`\nסיכום: ${checks - failures}/${checks}`);
process.exit(failures > 0 ? 1 : 0);
