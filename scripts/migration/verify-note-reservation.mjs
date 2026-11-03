#!/usr/bin/env node
/**
 * verify-note-reservation — אימות שלב 53: שריון הערות שוליים בתוך החיפוש
 * (אפיון §9.3#5, §10.3; ADR-005; פרק ז/M6).
 *
 * בדיקות:
 *   1. חוזה: ADR-005 קיים; הייצואים; LONG_NOTE_SPLIT רשום בקטלוג.
 *   2. reserveNote — ארבע ההכרעות (fits/defer/split/fail) לפי ADR-005.
 *   3. הצריבה מצמצמת את הגוף (§9.3#5): קו+הערה נבדקים יחד בגבולות.
 *   4. דחיית עוגן + מסלול שלם: ההערה נוסעת עם הקו; אין יתומות
 *      (pendingFootnotes נוקה); אינווריאנט קווים+הערות ≤ תוכן.
 *   5. הפרדה פעם אחת לעמוד; שתי הערות לעוגן — הכל או כלום.
 *   6. פיצול: LONG_NOTE_SPLIT בפנקס; ההמשך #cont מוצב בעמוד הבא;
 *      בלי פיצול ⇒ כשל מפורש.
 *   7. אין post-pass: הצריבה בתוך הרחבות החיפוש (מעברי consume/place
 *      בשרשרת לפני מעבר הטור).
 *   8. רגרסיה: build, typecheck, lint, deps, test:packages (מונה מדויק).
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

console.log('1) חוזה');
{
  const adr = readFileSync(join(repoRoot, 'docs', 'adr', 'ADR-005-long-note-split.md'), 'utf8');
  (adr.includes('דחיית עוגן') && adr.includes('LONG_NOTE_SPLIT') && adr.includes('בגבולות קווים') ? ok : fail)('ADR-005 קיים ונועל: דחיית עוגן כברירת מחדל; פיצול בגבולות קווים בלבד');
  (la.LAYOUT_FALLBACK_CODES['LONG_NOTE_SPLIT'] !== undefined ? ok : fail)('LONG_NOTE_SPLIT רשום בקטלוג ה-fallback');
  for (const fn of ['makeNoteBodySpec', 'reserveNote', 'resolveNotePolicy', 'noteBodyIssues', 'continuationNoteId', 'DEFAULT_NOTE_RESERVATION_POLICY']) {
    (typeof engine[fn] === 'function' || typeof engine[fn] === 'object' ? ok : fail)(`מיוצא: ${fn}`);
  }
  (engine.DEFAULT_NOTE_RESERVATION_POLICY.separatorHeightLu === 0 && engine.DEFAULT_NOTE_RESERVATION_POLICY.allowLongNoteSplit === false
    ? ok : fail)('ברירות המחדל: בלי הפרדה, בלי פיצול (ADR-005)');
}

console.log('\n2) reserveNote — ארבע ההכרעות');
{
  const policy = engine.resolveNotePolicy();
  const spec = engine.makeNoteBodySpec('note:v1|doc|footnote|1', [1000, 1000]);
  (engine.reserveNote(spec, 3000, 5000, policy).kind === 'fits' ? ok : fail)('fits: נכנסת במלואה');
  (engine.reserveNote(spec, 1500, 5000, policy).kind === 'defer' ? ok : fail)('defer: נכנסת לעמוד ריק, לא לכאן — דחיית עוגן');
  const splitPolicy = engine.resolveNotePolicy({ allowLongNoteSplit: true });
  const split = engine.reserveNote(spec, 1500, 5000, splitPolicy);
  (split.kind === 'split' && split.placedLines === 1 && split.continuationId === 'note:v1|doc|footnote|1#cont' ? ok : fail)('split: בגבול קווים עם המשך קנוני #cont');
  const huge = engine.makeNoteBodySpec('note:v1|doc|footnote|2', [3000, 3000, 3000]);
  (engine.reserveNote(huge, 5000, 5000, policy).kind === 'fail' ? ok : fail)('fail: גדולה מעמוד ריק בלי פיצול');
  (engine.reserveNote(huge, 5000, 5000, splitPolicy).kind === 'split' ? ok : fail)('split חובה: גדולה מעמוד ריק עם פיצול');
}

// תבניות בדיקה עקביות עם בדיקות היחידה
const templates = engine.buildPageTemplateSet({
  geometry: { pageWidth: 4000000, pageHeight: 5600000, margin: 160000, mainX: 400000, mainWidth: 3200000, columnWidth: 1520000, columnGap: 160000, contentTop: 160000, contentBottom: 5440000 },
  headerHeightLu: 0, footerHeightLu: 0, columns: 2, footnoteColumns: 1, folioPosition: 'bottom_center', showFolio: false, sidenoteWidthLu: null,
});
const H = templates.for('body', 1).regions.find((r) => r.role === 'body-column' && r.columnIndex === 0).rect.height;
let lineSeq = 0;
const LINE = (h, extra = {}) => ({ id: `l-${lineSeq++}`, heightLu: h, footnoteRefs: [], sidenoteRefs: [], ...extra });
const block = (id, lines, extra = {}) => ({ blockId: id, role: 'body', lines, ...extra });
const inputFor = (blocks, noteBodies, notePolicy) => ({ blocks, templates, pageKind: 'body', ...(noteBodies ? { noteBodies } : {}), ...(notePolicy ? { notePolicy } : {}) });
const initial = (first) => engine.initialPaginationState({ firstBlockId: first, remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1) });
const N1 = 'note:v1|doc|footnote|1';

console.log('\n3) הצריבה מצמצמת את הגוף (§9.3#5)');
{
  const lineH = Math.floor(H / 4);
  const noteH = Math.floor(H / 4);
  const bodies = new Map([[N1, engine.makeNoteBodySpec(N1, [noteH])]]);
  const b = block('body|1', [LINE(lineH), LINE(lineH, { footnoteRefs: [N1] }), LINE(lineH), LINE(lineH)]);
  const src = engine.createPageCandidateSource(inputFor([b], bodies));
  const exps = src.expansions(initial('body|1'));
  const frags = exps.map((e) => Number(/@(\d+)$/.exec(e.candidateId)[1]));
  (JSON.stringify(frags) === JSON.stringify([1, 2, 3]) ? ok : fail)(`קו+הערה נבדקים יחד — 3 גבולות (קיבלנו ${frags.join(',')})`);
  const after2 = exps.find((e) => e.candidateId.endsWith('body|1@2'));
  (after2.toState.pendingFootnotes.length === 0 && after2.toState.remainingByRegion['page:1:notes'] === H - noteH
    ? ok : fail)('ההערה הוצבה עם הקו: ממתינים נוקו, תקציד ההערות נצרב');
}

console.log('\n4) מסלול שלם — אין יתומות; אינווריאנט');
{
  const lineH = Math.floor(H / 20);
  const blocks = [];
  const bodies = new Map();
  for (let i = 1; i <= 8; i++) {
    const lines = Array.from({ length: 6 }, (_, j) => LINE(lineH, j === 2 ? { footnoteRefs: [`note:v1|doc|footnote|${i}`] } : {}));
    blocks.push(block(`body|${i}`, lines));
    bodies.set(`note:v1|doc|footnote|${i}`, engine.makeNoteBodySpec(`note:v1|doc|footnote|${i}`, [lineH * 2, lineH]));
  }
  const src = engine.createPageCandidateSource(inputFor(blocks, bodies));
  const res = engine.searchPages(initial('body|1'), src, new Ledger('decisions'));
  (res.status === 'complete' && res.finalState.pendingFootnotes.length === 0 ? ok : fail)('מסלול שלם; כל ההערות הוצבו — אין יתומות');
  const perRegion = new Map();
  for (const t of res.path.flatMap((e) => e.transitions)) {
    if (t.action.kind === 'consume-region') {
      perRegion.set(t.action.regionId, (perRegion.get(t.action.regionId) ?? 0) + t.action.amountLu);
    }
  }
  let invariantOk = true;
  for (const [regionId, used] of perRegion) {
    if (regionId.endsWith(':col:0') || regionId.endsWith(':col:1')) {
      const page = Number(/page:(\d+):/.exec(regionId)[1]);
      const notesUsed = perRegion.get(`page:${page}:notes`) ?? 0;
      if (used + notesUsed > H) invariantOk = false;
    }
  }
  (invariantOk ? ok : fail)('אינווריאנט לכל טור: קווים + הערות ≤ גובה התוכן');
  let chainOk = true;
  try { engine.verifyTransitionChain(initial('body|1'), res.path.flatMap((e) => e.transitions)); } catch { chainOk = false; }
  (chainOk ? ok : fail)('שרשרת המעברים רציפה (שלב 49)');
}

console.log('\n5) הפרדה ושתי הערות לעוגן');
{
  const lineH = Math.floor(H / 10);
  const noteH = Math.floor(H / 10);
  const bodies = new Map([
    [N1, engine.makeNoteBodySpec(N1, [noteH])],
    ['note:v1|doc|footnote|2', engine.makeNoteBodySpec('note:v1|doc|footnote|2', [noteH])],
  ]);
  const b = block('body|1', [LINE(lineH, { footnoteRefs: [N1, 'note:v1|doc|footnote|2'] }), LINE(lineH), LINE(lineH)]);
  const src = engine.createPageCandidateSource(inputFor([b], bodies, { separatorHeightLu: 500 }));
  const exps = src.expansions(initial('body|1'));
  const after1 = exps.find((e) => e.candidateId.endsWith('body|1@1'));
  const notesConsume = after1.transitions.filter((t) => t.action.kind === 'consume-region' && t.action.regionId === 'page:1:notes');
  (notesConsume.length === 1 && notesConsume[0].action.amountLu === noteH * 2 + 500
    ? ok : fail)(`שתי הערות לעוגן + הפרדה פעם אחת (${notesConsume.length ? notesConsume[0].action.amountLu : '—'} = ${noteH * 2 + 500})`);
  (after1.toState.pendingFootnotes.length === 0 ? ok : fail)('הכל או כלום — שתיהן הוצבו יחד');
}

console.log('\n6) פיצול — LONG_NOTE_SPLIT וההמשך');
{
  const lineH = Math.floor(H / 20);
  const perLine = Math.floor((H + 3 * lineH) / 30);
  const bodies = new Map([[N1, engine.makeNoteBodySpec(N1, Array.from({ length: 30 }, () => perLine))]]);
  const b = block('body|1', [LINE(lineH, { footnoteRefs: [N1] }), ...Array.from({ length: 29 }, () => LINE(lineH))]);
  // בלי פיצול — כשל מפורש
  const srcFail = engine.createPageCandidateSource(inputFor([b], bodies));
  let threw = false;
  try { engine.searchPages(initial('body|1'), srcFail, new Ledger('decisions')); } catch { threw = true; }
  (threw ? ok : fail)('הערה גדולה מעמוד ריק בלי פיצול ⇒ כשל מפורש (§8.2)');
  // עם פיצול — מסלול שלם + LONG_NOTE_SPLIT בפנקס + ההמשך מוצב
  const ledger = new Ledger('full');
  const srcSplit = engine.createPageCandidateSource(inputFor([b], bodies, { allowLongNoteSplit: true }));
  const res = engine.searchPages(initial('body|1'), srcSplit, ledger);
  (res.status === 'complete' ? ok : fail)(`עם פיצול המסלול מסתיים complete (${res.status})`);
  const splits = ledger.build().records.filter((r) => r.fallbackCode === 'LONG_NOTE_SPLIT');
  (splits.length > 0 ? ok : fail)(`LONG_NOTE_SPLIT נרשם בפנקס (${splits.length})`);
  (res.finalState.pendingFootnotes.length === 0 ? ok : fail)('ההמשך מוצב — אין ממתינים בקץ');
}

console.log('\n7) אין post-pass');
{
  const src = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'candidates.ts'), 'utf8');
  (src.includes('notesPlacedHeightLu') && src.includes('place-footnotes') === false ? ok : fail)('הצריבה בתוך ההרחבות — מעברי consume/notes בשרשרת הגבול');
  (src.includes('LONG_NOTE_SPLIT') ? ok : fail)('קוד הפיצול מוצמד להרחבה המפרשת');
  const search = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'search.ts'), 'utf8');
  (!/post-?pass/i.test(search) ? ok : fail)('אין post-pass בחיפוש');
}

console.log('\n8) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages');
(runCode('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('typecheck:packages');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check');
if (!SKIP_TESTS) {
  const t = run('npm', ['run', 'test:packages']);
  (/Tests\s+949\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 949/949');
} else {
  ok('test:packages — [skipped-in-CI: parent step already ran the suite]');
}

// ─────────────────────────── סיכום ───────────────────────────
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`הכל ירוק: ${checks}/${checks} — שלב 53 (שריון הערות בחיפוש) עבר`);
