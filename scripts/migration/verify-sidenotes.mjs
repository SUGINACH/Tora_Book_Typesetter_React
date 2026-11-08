#!/usr/bin/env node
/**
 * verify-sidenotes — אימות שלב 54: הערות צד (H7) מעוגנות לשורה
 * (אפיון §10.3 Sidenotes, §9.3#3; פרק ז/M6).
 *
 * בדיקות:
 *   1. חוזה: הייצואים; העיגון לשורה (pend+place עם הקו); אזור חיצוני.
 *   2. ריצה חיה: הצבה באזור החיצוני בלי גזילה מהטור; H7 מרובים;
 *      אין דריסה (תקציד מצטבר ≤ אזור).
 *   3. עקירה: מועמדים עם displacement (רכיב 3); הממתינה נשארת במצב;
 *      החיפוש מעדיף עוגן+הערה יחד (§10.3 "ליד העוגן").
 *   4. FIFO: ממתינה מהעמוד הקודם נצרבת ראשונה לפני חדשות.
 *   5. גדולה מהאזור כולו ⇒ כשל מפורש; תבנית בלי אזור ⇒ דחיית קלט.
 *   6. מסלול שלם: אין הערות צד מנותקות; שרשרת רציפה; דטרמיניזם.
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

const tpl = (side) => engine.buildPageTemplateSet({
  geometry: { pageWidth: 4000000, pageHeight: 5600000, margin: 160000, mainX: 400000, mainWidth: 3200000, columnWidth: 1520000, columnGap: 160000, contentTop: 160000, contentBottom: 5440000 },
  headerHeightLu: 0, footerHeightLu: 0, columns: 2, footnoteColumns: 1, folioPosition: 'bottom_center', showFolio: false, sidenoteWidthLu: side,
});
const templates = tpl(300000);
const templatesNoSide = tpl(null);
const H = templates.for('body', 1).regions.find((r) => r.role === 'body-column' && r.columnIndex === 0).rect.height;
let seq = 0;
const LINE = (h, extra = {}) => ({ id: `l-${seq++}`, heightLu: h, footnoteRefs: [], sidenoteRefs: [], ...extra });
const block = (id, lines) => ({ blockId: id, role: 'body', lines });
const inputFor = (blocks, bodies, t = templates) => ({ blocks, templates: t, pageKind: 'body', noteBodies: bodies });
const initial = (first, t = templates) => engine.initialPaginationState({ firstBlockId: first, remainingByRegion: engine.initialRemainingByRegion(t.for('body', 1), 1) });
const S1 = 'note:v1|doc|sidenote|1';

console.log('1) חוזה');
{
  const src = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'candidates.ts'), 'utf8');
  (src.includes('pendingSidenotesAtStart') && src.includes('placeSidenotes') && src.includes('outer-notes') ? ok : fail)('המחולל נושא הערות צד: אזור חיצוני, ממתינות FIFO, הצבה עם הקו');
  (src.includes('sidenotesDisplaced') && src.includes('עקורה FIFO') ? ok : fail)('עקירה FIFO מתועדת עם אסמכתא (§10.3)');
  (src.includes('sidenoteWidthLu') ? ok : fail)('תבניות דורשות אזור חיצוני להערות צד (דחיית קלט אחרת)');
}

console.log('\n2) הצבה באזור החיצוני — בלי גזילה מהטור; אין דריסה');
{
  const lineH = Math.floor(H / 10);
  const sideH = Math.floor(H / 10);
  const bodies = new Map([
    [S1, engine.makeNoteBodySpec(S1, [sideH])],
    ['note:v1|doc|sidenote|2', engine.makeNoteBodySpec('note:v1|doc|sidenote|2', [sideH])],
    ['note:v1|doc|sidenote|3', engine.makeNoteBodySpec('note:v1|doc|sidenote|3', [sideH])],
  ]);
  const b = block('body|1', [
    LINE(lineH, { sidenoteRefs: [S1] }),
    LINE(lineH, { sidenoteRefs: ['note:v1|doc|sidenote|2'] }),
    LINE(lineH, { sidenoteRefs: ['note:v1|doc|sidenote|3'] }),
    LINE(lineH),
  ]);
  const src = engine.createPageCandidateSource(inputFor([b], bodies));
  const res = engine.searchPages(initial('body|1'), src, new Ledger('decisions'));
  (res.status === 'complete' && res.finalState.pendingSidenotes.length === 0 ? ok : fail)('מסלול שלם — כל הערות הצד הוצבו (אין מנותקות)');
  const perRegion = new Map();
  for (const t of res.path.flatMap((e) => e.transitions)) {
    if (t.action.kind === 'consume-region') {
      const a = t.action;
      perRegion.set(a.regionId, (perRegion.get(a.regionId) ?? 0) + a.amountLu);
    }
  }
  (perRegion.get('page:1:outer') === sideH * 3 ? ok : fail)(`שלוש H7 נצרבו באזור החיצוני (${perRegion.get('page:1:outer')} = ${sideH * 3})`);
  (perRegion.get('page:1:outer') <= H ? ok : fail)('אין דריסה — התקציד המצטבר ≤ תקציב האזור');
  const colUsed = perRegion.get('page:1:col:0') ?? 0;
  (colUsed >= lineH * 3 ? ok : fail)('הטור לא נפגע — ההערות הצד בשוליים, לא מתחת לטקסט');
}

console.log('\n3) עקירה — המנגנון וההעדפה');
{
  const lineH = Math.floor(H / 20);
  const sideH = Math.floor(H / 3);
  const bodies = new Map();
  const blocks = [];
  for (let i = 1; i <= 8; i++) {
    const id = `note:v1|doc|sidenote|${i}`;
    bodies.set(id, engine.makeNoteBodySpec(id, [sideH]));
    blocks.push(block(`body|${i}`, [LINE(lineH, { sidenoteRefs: [id] }), LINE(lineH), LINE(lineH)]));
  }
  const src = engine.createPageCandidateSource(inputFor(blocks, bodies));
  const exps = src.expansions(initial('body|1'));
  const displaced = exps.filter((e) => e.quality[2] > 0);
  (displaced.length > 0 ? ok : fail)(`מועמדים עם עקירה נוצרים (רכיב 3; ${displaced.length})`);
  const d4 = displaced.find((e) => e.candidateId.includes('body|4@1'));
  (d4 !== undefined && d4.toState.pendingSidenotes.includes('note:v1|doc|sidenote|4') ? ok : fail)('העקורה נשארת ממתינה במצב היעד (FIFO לעמוד הבא)');
  const res = engine.searchPages(initial('body|1'), src, new Ledger('decisions'));
  (res.status === 'complete' && res.finalState.pendingSidenotes.length === 0 ? ok : fail)('החיפוש מעדיף עוגן+הערה יחד — מסלול נקי בלי מנותקות (§10.3 "ליד העוגן")');
}

console.log('\n4) FIFO בפועל — ממתינה נצרבת ראשונה');
{
  const lineH = Math.floor(H / 10);
  const sideH = Math.floor(H / 4);
  const bodies = new Map([
    [S1, engine.makeNoteBodySpec(S1, [sideH])],
    ['note:v1|doc|sidenote|2', engine.makeNoteBodySpec('note:v1|doc|sidenote|2', [sideH])],
  ]);
  const b = block('body|1', [LINE(lineH, { sidenoteRefs: ['note:v1|doc|sidenote|2'] }), LINE(lineH), LINE(lineH)]);
  const src = engine.createPageCandidateSource(inputFor([b], bodies));
  const s0 = engine.pendSidenote(initial('body|1'), S1).state;
  const exps = src.expansions(s0);
  const first = exps.find((e) => e.candidateId.endsWith('body|1@1'));
  const place = first.transitions.find((t) => t.action.kind === 'place-sidenotes');
  (place !== undefined && place.action.noteIds[0] === S1 ? ok : fail)('הממתינה מהעמוד הקודם נצרבת ראשונה (FIFO לפי מקור)');
  (first.toState.pendingSidenotes.length === 0 ? ok : fail)('שתיהן הוצבו — הממתינים נוקו');
}

console.log('\n5) גדולה מהאזור / תבנית בלי אזור');
{
  const lineH = Math.floor(H / 10);
  const bodies = new Map([[S1, engine.makeNoteBodySpec(S1, [H + 50000])]]);
  const b = block('body|1', [LINE(lineH), LINE(lineH, { sidenoteRefs: [S1] }), LINE(lineH)]);
  const src = engine.createPageCandidateSource(inputFor([b], bodies));
  let threw = false;
  try { engine.searchPages(initial('body|1'), src, new Ledger('decisions')); } catch { threw = true; }
  (threw ? ok : fail)('הערת צד גדולה מהאזור כולו ⇒ כשל מפורש (אין פיצול/גלישה)');
  let threw2 = false;
  try { engine.createPageCandidateSource(inputFor([b], bodies, templatesNoSide)); } catch { threw2 = true; }
  (threw2 ? ok : fail)('תבנית בלי אזור חיצוני + הפניות H7 ⇒ דחיית קלט מקוטלגת');
}

console.log('\n6) דטרמיניזם');
{
  const lineH = Math.floor(H / 15);
  const sideH = Math.floor(H / 4);
  const blocks = [];
  const bodies = new Map();
  for (let i = 1; i <= 10; i++) {
    const id = `note:v1|doc|sidenote|${i}`;
    bodies.set(id, engine.makeNoteBodySpec(id, [sideH]));
    blocks.push(block(`body|${i}`, Array.from({ length: 6 }, (_, j) => LINE(lineH, j === 2 ? { sidenoteRefs: [id] } : {}))));
  }
  const src = engine.createPageCandidateSource(inputFor(blocks, bodies));
  const once = () => {
    const res = engine.searchPages(initial('body|1'), src, new Ledger('decisions'));
    return JSON.stringify([res.path.map((e) => e.candidateId), res.finalState.stateHash]);
  };
  (once() === once() && once() === once() ? ok : fail)('3 ריצות זהות (מסלול + מצב סופי)');
  const res = engine.searchPages(initial('body|1'), src, new Ledger('decisions'));
  let chainOk = true;
  try { engine.verifyTransitionChain(initial('body|1'), res.path.flatMap((e) => e.transitions)); } catch { chainOk = false; }
  (chainOk && res.finalState.pendingSidenotes.length === 0 ? ok : fail)('שרשרת רציפה; אין הערות צד מנותקות');
}

console.log('\n7) רגרסיה');
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
console.log(`הכל ירוק: ${checks}/${checks} — שלב 54 (הערות צד H7) עבר`);
