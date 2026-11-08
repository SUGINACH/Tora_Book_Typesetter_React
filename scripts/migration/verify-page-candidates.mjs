#!/usr/bin/env node
/**
 * verify-page-candidates — אימות שלב 52: מועמדים בגבולות חוקיים בלבד
 * (אפיון §9.1, §9.3, §10.1, §10.3, §10.4, §6.6; פרק ז/M6).
 *
 * בדיקות:
 *   1. חוזה: הייצואים; ברירות המחדל של המדיניות; אימות קלט.
 *   2. ריצה חיה מה־dist: גבולות חוקיים בלבד (בלוק אטום לא נחצה);
 *      feasibility לפני cost (קו שאינו נכנס אינו מוצב).
 *   3. חירום: קו גוף גבוה מטור ריק ⇒ EMERGENCY_LINE יחיד עם HIGH;
 *      בלוק אטום כזה ⇒ אין מועמד ⇒ החיפוש נכשל במפורש.
 *   4. אין אובדן תוכן: מסלול שלם דרך searchPages מכסה את כל הקווים;
 *      הסמן בקץ; שרשרת המעברים עוברת אימות.
 *   5. הערות וסוגריים: pend עם הקו; מחסנית נישאת בין עמודים.
 *   6. מדיניות: escort, allowIntraParagraphBreaks, boundaryStride.
 *   7. רגרסיה: build, typecheck, lint, deps, test:packages (מונה מדויק).
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
  try {
    execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
    return 0;
  } catch { return 1; }
};

const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));
const Ledger = la.DecisionLedgerBuilder;

// תבניות בדיקה עקביות עם בדיקות היחידה
const templates = engine.buildPageTemplateSet({
  geometry: { pageWidth: 4000000, pageHeight: 5600000, margin: 160000, mainX: 400000, mainWidth: 3200000, columnWidth: 1520000, columnGap: 160000, contentTop: 160000, contentBottom: 5440000 },
  headerHeightLu: 0, footerHeightLu: 0, columns: 2, footnoteColumns: 1, folioPosition: 'bottom_center', showFolio: false, sidenoteWidthLu: null,
});
const columnHeight = templates.for('body', 1).regions.find((r) => r.role === 'body-column' && r.columnIndex === 0).rect.height;
const LINE = (h, extra = {}) => ({ id: `l-${Math.random().toString(36).slice(2, 10)}`, heightLu: h, footnoteRefs: [], sidenoteRefs: [], ...extra });
const block = (id, lines, extra = {}) => ({ blockId: id, role: 'body', lines, ...extra });
const inputFor = (blocks, policy) => ({ blocks, templates, pageKind: 'body', ...(policy !== undefined ? { policy } : {}) });
const initial = (first) => engine.initialPaginationState({
  firstBlockId: first,
  remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1),
});

console.log('1) חוזה');
for (const fn of ['createPageCandidateSource', 'candidateInputIssues', 'DEFAULT_LEGAL_PAGE_BREAK_POLICY']) {
  (typeof engine[fn] === 'function' || typeof engine[fn] === 'object' ? ok : fail)(`מיוצא: ${fn}`);
}
{
  const d = engine.DEFAULT_LEGAL_PAGE_BREAK_POLICY;
  (d.allowIntraParagraphBreaks === true && d.headingEscortLines === 0 && d.atomicNoteBodies === true && d.boundaryStride === 1
    ? ok : fail)('ברירות המחדל של המדיניות: תוך-פסקאי מותר, escort=0 (M7), note-body אטום, stride=1');
}

console.log('\n2) גבולות חוקיים בלבד; feasibility לפני cost');
{
  const lineH = Math.floor(columnHeight / 8);
  const note = block('note:v1|doc|footnote|1', [LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH)], { role: 'note-body' });
  const body = block('body|1', [LINE(lineH), LINE(lineH)]);
  const src = engine.createPageCandidateSource(inputFor([body, note]));
  const exps = src.expansions(initial('body|1'));
  let atomicOk = true;
  for (const e of exps) {
    const m = /→(note:v1\|doc\|footnote\|1)@(\d+)$/.exec(e.candidateId);
    if (m !== null && Number(m[2]) !== 0 && Number(m[2]) !== 4) atomicOk = false;
  }
  (atomicOk ? ok : fail)('בלוק הערה אטום לעולם אינו נחצה (רק @0/@4)');
  // feasibility: 3 קווים של 40% — השלישי אינו נכנס
  const q = Math.floor((columnHeight * 4) / 10);
  const b = block('body|1', [LINE(q), LINE(q), LINE(q)]);
  const srcF = engine.createPageCandidateSource(inputFor([b]));
  const expsF = srcF.expansions(initial('body|1'));
  (expsF.length === 2 && expsF[1].candidateId.endsWith('body|1@2') ? ok : fail)(`קו שאינו נכנס אינו מוצב — 2 גבולות בלבד (קיבלנו ${expsF.length})`);
}

console.log('\n3) חירום וכשל מפורש');
{
  const src = engine.createPageCandidateSource(inputFor([block('body|1', [LINE(columnHeight + 50000)])]));
  const exps = src.expansions(initial('body|1'));
  (exps.length === 1 && exps[0].fallbackCode === 'EMERGENCY_LINE' && exps[0].quality[0] === 2
    ? ok : fail)('קו גוף גבוה מטור ריק ⇒ EMERGENCY_LINE יחיד עם HIGH');
  const ledger = new Ledger('full');
  const res = engine.searchPages(initial('body|1'), src, ledger);
  (res.status === 'complete' && ledger.build().records.some((r) => r.fallbackCode === 'EMERGENCY_LINE')
    ? ok : fail)('החירום מתועד בפנקס כשהוא נבחר');
  // בלוק אטום שאינו נכנס — כשל מפורש של החיפוש
  const stuckSrc = engine.createPageCandidateSource(inputFor([block('note:v1|doc|footnote|9', [LINE(columnHeight + 100000)], { role: 'note-body' })]));
  let threw = false;
  try { engine.searchPages(initial('note:v1|doc|footnote|9'), stuckSrc, new Ledger('decisions')); } catch { threw = true; }
  (threw ? ok : fail)('בלוק אטום שאינו נכנס ⇒ החיפוש נכשל במפורש (§10.3)');
}

console.log('\n4) אין אובדן תוכן — מסלול שלם');
{
  const lineH = Math.floor(columnHeight / 60);
  const blocks = [];
  for (let i = 1; i <= 12; i++) {
    blocks.push(block(`body|${i}`, Array.from({ length: 7 }, () => LINE(lineH))));
  }
  blocks.splice(6, 0, block('note:v1|doc|footnote|1', [LINE(lineH), LINE(lineH)], { role: 'note-body' }));
  blocks.splice(9, 0, block('heading|3|H2', [LINE(lineH)], { role: 'heading', headingLevel: 2 }));
  const src = engine.createPageCandidateSource(inputFor(blocks));
  const res = engine.searchPages(initial('body|1'), src, new Ledger('decisions'));
  (res.status === 'complete' ? ok : fail)(`המסלול מסתיים complete (${res.status})`);
  const lastBlock = blocks[blocks.length - 1];
  (res.finalState.contentCursor.includes(`${lastBlock.blockId}|f${lastBlock.lines.length}`)
    ? ok : fail)('הסמן מגיע לקץ — כיסוי מלא, אין אובדן תוכן');
  let chainOk = true;
  try { engine.verifyTransitionChain(initial('body|1'), res.path.flatMap((e) => e.transitions)); } catch { chainOk = false; }
  (chainOk ? ok : fail)('שרשרת המעברים רציפה (שלב 49)');
  (res.finalState.physicalPageIndex > 1 ? ok : fail)(`מעברי עמוד התרחשו (עמוד סופי ${res.finalState.physicalPageIndex})`);
  (res.regionClosures.length === res.finalState.physicalPageIndex - 1 ? ok : fail)('כל מעבר עמוד נרשם כסגירת אזור');
}

console.log('\n5) הערות וסוגריים');
{
  const lineH = Math.floor(columnHeight / 10);
  const openId = 'bracket:v1|doc|body|round|1|2';
  const b = block('body|1', [
    LINE(lineH, { footnoteRefs: ['note:v1|doc|footnote|1'], bracketOpens: [{ pairId: openId, kind: 'round' }] }),
    LINE(lineH),
    LINE(lineH, { bracketCloses: [openId] }),
  ]);
  const src = engine.createPageCandidateSource(inputFor([b]));
  const exps = src.expansions(initial('body|1'));
  const after1 = exps.find((e) => e.candidateId.endsWith('body|1@1'));
  (after1.toState.pendingFootnotes.length === 1 && after1.toState.openBracketStack.length === 1
    ? ok : fail)('הפניית הערה ופתיחת סוגריים מוזרמים למצב עם הקו');
  const after3 = exps.find((e) => e.candidateId.endsWith('body|1@3'));
  (after3.toState.openBracketStack.length === 0 ? ok : fail)('הסוגר נסגר עם קו הסגירה');
  // כפילות pend — feasibility דוחה
  const dup = block('body|1', [LINE(lineH, { footnoteRefs: ['note:v1|doc|footnote|1'] }), LINE(lineH, { footnoteRefs: ['note:v1|doc|footnote|1'] })]);
  const srcDup = engine.createPageCandidateSource(inputFor([dup]));
  (srcDup.expansions(initial('body|1')).length === 1 && srcDup.stats.feasibilityRejections === 1
    ? ok : fail)('הערה כפולה נדחית ב-feasibility — לפני החיפוש');
}

console.log('\n6) מדיניות');
{
  const lineH = Math.floor(columnHeight / 10);
  const blocks = [
    block('heading|1|H2', [LINE(lineH)], { role: 'heading', headingLevel: 2 }),
    block('body|1', [LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH)]),
  ];
  const srcOn = engine.createPageCandidateSource(inputFor(blocks, { headingEscortLines: 2 }));
  const expsOn = srcOn.expansions(initial('heading|1|H2'));
  const early = expsOn.filter((e) => /heading\|1\|H2@1$|body\|1@1$/.test(e.candidateId));
  (early.length === 0 && expsOn.some((e) => e.candidateId.endsWith('body|1@2'))
    ? ok : fail)('escort=2 אוסר גבול מוקדם אחרי כותרת');
  const b6 = block('body|1', [1, 2, 3, 4, 5, 6].map(() => LINE(lineH)));
  const strict = engine.createPageCandidateSource(inputFor([b6], { allowIntraParagraphBreaks: false }));
  (strict.expansions(initial('body|1')).length === 1 ? ok : fail)('בלי שבירה תוך-פסקאית ⇒ רק סוף בלוק');
  const stride = engine.createPageCandidateSource(inputFor([b6], { boundaryStride: 2 }));
  const frags = stride.expansions(initial('body|1')).map((e) => Number(/@(\d+)$/.exec(e.candidateId)[1]));
  (JSON.stringify(frags) === JSON.stringify([2, 4, 6]) ? ok : fail)(`stride=2 מרכז גבולות בלי איבוד (${frags.join(',')})`);
}

console.log('\n7) סריקת קוד-מקור');
{
  const src = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'candidates.ts'), 'utf8');
  (!/Date\.now|performance\.now|Math\.random/.test(src) ? ok : fail)('אין זמן ואין אקראיות במחולל');
  (src.includes('isDocumentEnd') ? ok : fail)('המחולל מממש isDocumentEnd (חוזה החיפוש — הבחנת קץ/תקוע)');
  (src.includes('EMERGENCY_LINE') && src.includes('§10.3') ? ok : fail)('החירום והאטומיות מתועדים עם אסמכתא');
}

console.log('\n8) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages');
(runCode('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('typecheck:packages');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check');
if (!SKIP_TESTS) {
  const t = run('npm', ['run', 'test:packages']);
  (/Tests\s+1292\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 1292/1292');
} else {
  ok('test:packages — [skipped-in-CI: parent step already ran the suite]');
}

// ─────────────────────────── סיכום ───────────────────────────
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`הכל ירוק: ${checks}/${checks} — שלב 52 (מועמדים בגבולות חוקיים) עבר`);
