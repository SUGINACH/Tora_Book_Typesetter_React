#!/usr/bin/env node
/**
 * verify-h3-policy — אימות שלב 62: [ADR-006] H3 — כותרת רוחבית ברמת המדיניות
 * (אפיון §10.1 H3, §11.2, §22.6; פרק ח/M7).
 *
 * שער השלב: **H3 נכונה בכל המיקומים הקיצוניים** — בהזרקת המדיניות המלאה:
 * אמצע טור, סמוך לתחתית (זורמת עמוד דרך מילוי — לא פותחת מעצמה), בין
 * פסקאות, עם הערות (המרחב המשותף); עיטור צד נמדד בגובה הפס; ADR-006 קיים.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0; let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1';
const run = (cmd, args) => { try { return execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], env: { ...process.env, NO_COLOR: '1' } }); } catch (e) { return (e.stdout ?? '').toString(); } };

const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));
const policy = await import(join(repoRoot, 'packages', 'policy-torah', 'dist', 'index.js'));
const Ledger = la.DecisionLedgerBuilder;

const templates = engine.buildPageTemplateSet({
  geometry: { pageWidth: 4000000, pageHeight: 5600000, margin: 160000, mainX: 400000, mainWidth: 3200000, columnWidth: 1520000, columnGap: 160000, contentTop: 160000, contentBottom: 5440000 },
  headerHeightLu: 0, footerHeightLu: 0, columns: 2, footnoteColumns: 1, folioPosition: 'bottom_center', showFolio: false, sidenoteWidthLu: null,
});
const H = templates.for('body', 1).regions.find((r) => r.role === 'body-column' && r.columnIndex === 0).rect.height;
let seq = 0;
const LINE = (h, extra = {}) => ({ id: `l-${seq++}`, heightLu: h, footnoteRefs: [], sidenoteRefs: [], ...extra });
const block = (id, lines, extra = {}) => ({ blockId: id, role: 'body', lines, ...extra });
const h3 = (id, h) => block(id, [LINE(h)], { role: 'heading', headingLevel: 3 });
const initial = (first) => engine.initialPaginationState({ firstBlockId: first, remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1) });
const src = (blocks, behaviorOf, noteBodies) => engine.createPageCandidateSource({ blocks, templates, pageKind: 'body', ...(behaviorOf ? { headingBehaviorOf: behaviorOf } : {}), ...(noteBodies ? { noteBodies } : {}) });
const mkSettings = (values = {}) => ({ schemaVersion: 1, enginePolicyId: 'torah-v1', values, configHash: 'v' });
const fullPolicy = policy.createTorahPolicy(mkSettings());
const fromStateOf = (res, i, first) => (i === 0 ? first : res.path[i - 1].toState);

console.log('1) ארבעת מקרי החובה — בהזרקת המדיניות המלאה');
{
  const lineH = Math.floor(H / 10);
  // (א) אמצע טור
  {
    const blocks = [block('body|1', [LINE(lineH), LINE(lineH), LINE(lineH)]), h3('heading|1|A', lineH), block('body|2', [LINE(lineH), LINE(lineH)])];
    const exps = src(blocks, fullPolicy.headingBehaviorOf).expansions(initial('body|1'));
    const barrier = exps.find((e) => e.candidateId.includes(':H3'));
    (barrier !== undefined && barrier.toState.remainingByRegion['page:1:col:0'] === H - 4 * lineH
      && barrier.toState.remainingByRegion['page:1:col:1'] === H - 4 * lineH && barrier.toState.physicalPageIndex === 1
      ? ok : fail)('(א) אמצע טור: barrier מסונכרן באותו עמוד');
  }
  // (ב) סמוך לתחתית — 19 קווים: שום איזון אינו מכניס את הפס
  {
    const blocks = [block('body|1', Array.from({ length: 19 }, () => LINE(lineH))), h3('heading|1|B', lineH), block('body|2', Array.from({ length: 5 }, () => LINE(lineH)))];
    const res = engine.searchPages(initial('body|1'), src(blocks, fullPolicy.headingBehaviorOf), new Ledger('decisions'));
    const barrierIdx = res.path.map((e, i) => ({ e, i })).filter(({ e }) => e.candidateId.includes(':H3'));
    const noBarrierOnP1 = barrierIdx.length === 1 && fromStateOf(res, barrierIdx[0].i, initial('body|1')).physicalPageIndex === 2;
    (res.status === 'complete' && noBarrierOnP1 ? ok : fail)('(ב) סמוך לתחתית: ה-barrier רק בעמוד 2 — לא פותחת מעצמה');
    const intoPage2 = res.path[barrierIdx[0].i - 1];
    (intoPage2 !== undefined && !intoPage2.candidateId.includes(':H3') && intoPage2.toState.physicalPageIndex === 2
      ? ok : fail)('(ב) המעבר לעמוד 2 — הרחבת מילוי רגילה (לא מועמד barrier)');
  }
  // (ג) בין פסקאות — שתי H3
  {
    const blocks = [
      block('body|1', Array.from({ length: 4 }, () => LINE(lineH))),
      h3('heading|2|C1', lineH),
      block('body|2', Array.from({ length: 4 }, () => LINE(lineH))),
      h3('heading|3|C2', lineH),
      block('body|3', Array.from({ length: 4 }, () => LINE(lineH))),
    ];
    const res = engine.searchPages(initial('body|1'), src(blocks, fullPolicy.headingBehaviorOf), new Ledger('decisions'));
    (res.status === 'complete' && res.path.filter((e) => e.candidateId.includes(':H3')).length === 2
      && res.finalState.contentCursor.includes('body|3|f4') ? ok : fail)('(ג) בין פסקאות: שני barriers; כיסוי מלא');
  }
  // (ד) עם הערות — המרחב המשותף
  {
    const bodies = new Map([['note:v1|doc|footnote|1', engine.makeNoteBodySpec('note:v1|doc|footnote|1', [lineH * 2])]]);
    const blocks = [
      block('body|1', [LINE(lineH, { footnoteRefs: ['note:v1|doc|footnote|1'] }), LINE(lineH), LINE(lineH)]),
      h3('heading|1|D', lineH),
      block('body|2', Array.from({ length: 4 }, () => LINE(lineH))),
    ];
    const res = engine.searchPages(initial('body|1'), src(blocks, fullPolicy.headingBehaviorOf, bodies), new Ledger('decisions'));
    (res.status === 'complete' && res.finalState.pendingFootnotes.length === 0 ? ok : fail)('(ד) עם הערות: complete בלי יתומות');
    let invariantOk = true;
    for (const e of res.path) {
      const colR = e.toState.remainingByRegion[`page:${e.toState.physicalPageIndex}:col:${e.toState.columnIndex}`];
      const notesR = e.toState.remainingByRegion[`page:${e.toState.physicalPageIndex}:notes`];
      if (colR !== undefined && notesR !== undefined) {
        const notesBudget = templates.for('body', 1).footnoteAnchor?.rect.height ?? 0;
        if (H - colR + Math.max(0, notesBudget - notesR) > H + 1) invariantOk = false;
      }
    }
    (invariantOk ? ok : fail)('(ד) אינווריאנט: טור + גוש הערות ≤ עמוד לאורך המסלול');
  }
}

console.log('\n2) עיטור צד נמדד — גובה הפס = מקסימום(קווים, em × קו ראשון)');
{
  const lineH = Math.floor(H / 10);
  const blocks = [block('body|1', [LINE(lineH), LINE(lineH)]), h3('heading|1|O', lineH), block('body|2', [LINE(lineH), LINE(lineH)])];
  (fullPolicy.headingBehaviorOf(3).barrierOrnamentEm === 0 ? ok : fail)('ברירת המחדל: אין עיטור (h3-ornament-l/r=none — Orange נעול)');
  const expsDefault = src(blocks, fullPolicy.headingBehaviorOf).expansions(initial('body|1'));
  (expsDefault.find((e) => e.candidateId.includes(':H3'))?.toState.remainingByRegion['page:1:col:0'] === H - 3 * lineH
    ? ok : fail)('בלי עיטור: הפס בגובה הטקסט (3 קווים נשרפו)');
  const orn = policy.createTorahPolicy(mkSettings({ 'h3-ornament-l': 'diamonds', 'dim-h3-side-h': '2em' }));
  (orn.headingBehaviorOf(3).barrierOrnamentEm === 2 ? ok : fail)("h3-ornament-l='diamonds' + dim-h3-side-h='2em' ⇒ barrierOrnamentEm=2");
  const expsOrn = src(blocks, orn.headingBehaviorOf).expansions(initial('body|1'));
  const b = expsOrn.find((e) => e.candidateId.includes(':H3'));
  (b !== undefined && b.toState.remainingByRegion['page:1:col:0'] === H - 4 * lineH && b.toState.remainingByRegion['page:1:col:1'] === H - 4 * lineH
    ? ok : fail)('עם עיטור: הפס = max(טקסט, 2em) = 2 קווים — העיטור תופס בדיוק את שנמדד');
  const ornHalf = policy.createTorahPolicy(mkSettings({ 'h3-ornament-r': 'spear', 'dim-h3-side-h': '0.5em' }));
  (ornHalf.headingBehaviorOf(3).barrierOrnamentEm === 0.5 ? ok : fail)("h3-ornament-r='spear' + 0.5em ⇒ העיטור נמדד גם מימין");
}

console.log('\n3) אין פתיחת עמוד שלא לפי מדיניות + מרשם + ADR');
{
  const b = fullPolicy.headingBehaviorOf(3);
  (b.flowRole === 'full-width-barrier' && b.forcePageBreak === false && b.forcePageTemplate === undefined && b.startOnRecto === undefined
    ? ok : fail)('ל-H3 אין forcePageBreak/Template/recto — היא אינה פותחת עמוד');
  (policy.torahRegistrySignature().includes('heading.h3.barrier@2') ? ok : fail)('המרשם: heading.h3.barrier@2 (rollback = v1)');
  (policy.headingBehaviorId(b) === 'heading:v1|L3|full-width-barrier|esc2|f0' ? ok : fail)('מזהה H3 הברירת-דרגתי יציב (עיטור 0 — בלי סמן)');
  const adrPath = join(repoRoot, 'docs', 'adr', 'ADR-006-h3-behavior.md');
  if (existsSync(adrPath)) {
    const adr = readFileSync(adrPath, 'utf8');
    (adr.includes('full-width synchronization barrier') && adr.includes('חלופות שנדחו') && adr.includes('post-pass')
      ? ok : fail)('ADR-006 קיים ומתעד: ההחלטה, חלופות שנדחו, אין post-pass');
  } else {
    fail('ADR-006 חסר');
  }
  // דטרמיניזם בהזרקת המדיניות
  const lineH = Math.floor(H / 10);
  const blocks = [block('body|1', Array.from({ length: 6 }, () => LINE(lineH))), h3('heading|1|Z', lineH), block('body|2', Array.from({ length: 6 }, () => LINE(lineH)))];
  const once = () => { const r = engine.searchPages(initial('body|1'), src(blocks, fullPolicy.headingBehaviorOf), new Ledger('decisions')); return JSON.stringify({ p: r.path.map((e) => e.candidateId), h: r.finalState.stateHash }); };
  (once() === once() && once() === once() ? ok : fail)('דטרמיניזם: 3 ריצות — מזהים זהים');
}

console.log('\n4) רגרסיית בדיקות');
if (SKIP_TESTS) {
  console.log('  [SKIP] TORA_SKIP_TEST_REGRESSION=1 (הסוויטה רצה במלואה בצעד ה-vitest של ה-CI)');
} else {
  const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'packages/layout-engine/test/h3-policy.test.ts']);
  const m = out.match(/Tests\s+(\d+) passed/);
  (m !== null && Number(m[1]) === 7 ? ok : fail)(`בדיקות h3-policy: 7/7 (התקבל ${m ? m[1] : '?'})`);
  const out2 = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'packages/layout-engine/test/h3-barrier.test.ts']);
  const m2 = out2.match(/Tests\s+(\d+) passed/);
  (m2 !== null ? ok : fail)(`רגרסיית h3-barrier (שלב 56): ${m2 ? m2[1] : '?'} ירוקות`);
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${checks - failures}/${checks} בדיקות`);
process.exit(failures === 0 ? 0 : 1);
