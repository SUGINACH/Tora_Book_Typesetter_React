#!/usr/bin/env node
/**
 * verify-brackets-crosspage — אימות שלב 65: סוגריים חוצי עמוד בתוך המצב
 * (אפיון §10.4; פרק ח/M7).
 *
 * שער השלב: **אין pass תיקון סוגריים; כל דיכוי רשום** — המחסנית במצב
 * (§9.1; אין protectParens); חציות-עמוד מזוהות בדיוק (הקו האחרון); קלט
 * לקוי מדווח; הטרנספורמציות עם סיבה ומקור.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
const initial = (first) => engine.initialPaginationState({ firstBlockId: first, remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1) });
const src = (blocks) => engine.createPageCandidateSource({ blocks, templates, pageKind: 'body' });

console.log('1) מקוננים חוצי טור ועמוד — המחסנית במצב; שרשרת עוברת; אין pass תיקון');
{
  const lineH = Math.floor(H / 10);
  const A = 'bracket:v1|doc|body|round|10|20';
  const B = 'bracket:v1|doc|body|square|30|40';
  const lines = [
    LINE(lineH, { bracketOpens: [{ pairId: A, kind: 'round' }] }),
    ...Array.from({ length: 12 }, () => LINE(lineH)),
    LINE(lineH, { bracketOpens: [{ pairId: B, kind: 'square' }] }),
    ...Array.from({ length: 10 }, () => LINE(lineH)),
    LINE(lineH, { bracketCloses: [B, A] }),
  ];
  const blocks = [block('body|1', lines)];
  const res = engine.searchPages(initial('body|1'), src(blocks), new Ledger('decisions'));
  (res.status === 'complete' && res.finalState.openBracketStack.length === 0 && res.finalState.physicalPageIndex > 1 ? ok : fail)('מקוננים חוצים עמודים: complete; המחסנית מתרוקנת בקץ');
  let chainOk = true;
  try { engine.verifyTransitionChain(initial('body|1'), res.path.flatMap((e) => e.transitions)); } catch { chainOk = false; }
  (chainOk ? ok : fail)('שרשרת המעברים עוברת — כל פתיחה/סגירה במעברי המצב (LIFO)');
}

console.log('\n2) חציית עמוד מזוהה בדיוק — הקו האחרון בלבד');
{
  const lineH = Math.floor(H / 10);
  const A = 'bracket:v1|doc|body|round|1|9';
  const MID = 'bracket:v1|doc|body|round|2|4';
  const blocks = [
    block('body|1', [
      ...Array.from({ length: 19 }, () => LINE(lineH)),
      LINE(lineH, { bracketOpens: [{ pairId: A, kind: 'round' }] }),
    ]),
    block('body|2', [
      ...Array.from({ length: 4 }, () => LINE(lineH)),
      LINE(lineH, { bracketOpens: [{ pairId: MID, kind: 'round' }] }),
      ...Array.from({ length: 6 }, () => LINE(lineH)),
      LINE(lineH, { bracketCloses: [MID, A] }),
    ]),
  ];
  const res = engine.searchPages(initial('body|1'), src(blocks), new Ledger('decisions'));
  const crossings = engine.bracketPageCrossingsOf(initial('body|1'), res.path);
  const pageCrossings = crossings.filter((c) => !c.atDocumentEnd);
  (res.status === 'complete' && pageCrossings.length === 1 && pageCrossings[0].pairId === A && pageCrossings[0].physicalPageIndex === 1
    ? ok : fail)('רק הפותח שבקו האחרון של עמוד 1 — לא הפתיחה שבאמצע עמוד 2');
  (crossings.filter((c) => c.atDocumentEnd).length === 0 ? ok : fail)('אין דיווחי קלט-לקוי (הזוגות נסגרו)');
  const again = engine.searchPages(initial('body|1'), src(blocks), new Ledger('decisions'));
  (JSON.stringify(engine.bracketPageCrossingsOf(initial('body|1'), again.path)) === JSON.stringify(crossings) ? ok : fail)('הזיהוי דטרמיניסטי בין ריצות');
}

console.log('\n3) סוגר לא סגור בקלט — מדווח; לא "מתוקן בשקט"');
{
  const lineH = Math.floor(H / 10);
  const U = 'bracket:v1|doc|body|round|3|7';
  const blocks = [block('body|1', [...Array.from({ length: 5 }, () => LINE(lineH)), LINE(lineH, { bracketOpens: [{ pairId: U, kind: 'round' }] }), ...Array.from({ length: 3 }, () => LINE(lineH))])];
  const res = engine.searchPages(initial('body|1'), src(blocks), new Ledger('decisions'));
  const crossings = engine.bracketPageCrossingsOf(initial('body|1'), res.path);
  (res.status === 'complete' && crossings.filter((c) => c.atDocumentEnd && c.pairId === U).length === 1
    ? ok : fail)('זוג שלא נסגר — atDocumentEnd מדווח (העימוד מסתיים; האמת במצב)');
  (res.finalState.openBracketStack.length === 1 ? ok : fail)('המחסנית נשארת פתוחה במצב — לא תיקון שקט');
}

console.log('\n4) מדיניות התצוגה — TransformRecord עם סיבה ומקור (§10.4)');
{
  const crossing = { pairId: 'bracket:v1|doc|body|round|1|9', kind: 'round', physicalPageIndex: 2, candidateId: 'x', atDocumentEnd: false };
  const atom = (v) => v;
  (policy.DEFAULT_BRACKET_DISPLAY_POLICY.pageEndOpen === 'none' && policy.bracketTransformFor(crossing, policy.DEFAULT_BRACKET_DISPLAY_POLICY, atom(), atom()) === null
    ? ok : fail)('ברירת המחדל: none — הסוגר חוצה כחוק, אין שינוי נוסח');
  const sup = policy.bracketTransformFor(crossing, { pageEndOpen: 'suppress' }, 'atom:v1|1', 'mark:1');
  (sup.kind === 'suppress' && sup.from.length === 1 && sup.to.length === 0 && sup.reason === 'bracket-open-at-page-end'
    ? ok : fail)('suppress: תו מושמט מותר — from=האטום, reason מתועד');
  const mark = policy.bracketTransformFor(crossing, { pageEndOpen: 'continuation-mark' }, 'atom:v1|1', 'mark:1');
  (mark.kind === 'insert' && mark.from.length === 0 && mark.to.length === 1 && mark.reason === 'bracket-continuation-mark'
    ? ok : fail)('continuation-mark: תו מיוצר — to=האטום שנולד, reason מתועד');
  (policy.bracketTransformFor({ ...crossing, atDocumentEnd: true }, { pageEndOpen: 'suppress' }, 'a', 'b') === null
    ? ok : fail)('קלט לקוי — אף טרנספורמציה (מדווח, לא מתוקן)');
  (policy.torahRegistrySignature().includes('brackets.cross-page@') && policy.torahRuleIssues().length === 0 ? ok : fail)('המרשם: brackets.cross-page רשום ותקין');
}

console.log('\n5) אין pass תיקון — סריקת קוד');
{
  const cand = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'candidates.ts'), 'utf8');
  (cand.includes('bracketPageEndOpens') && cand.includes('bracketPageCrossingsOf') ? ok : fail)('הזיהוי בהרחבות עצמן (bracketPageEndOpens) + פונקציית סיכום טהורה');
  const stateSrc = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'state.ts'), 'utf8');
  (stateSrc.includes('openBracketStack') ? ok : fail)('המחסנית חיה במצב (§9.1; שלב 49)');
  const noFixPass = !/function\s+(fixBrackets|protectParens|adjustBrackets)\w*\(/.test(cand);
  (noFixPass ? ok : fail)('אין פונקציית תיקון סוגריים אחרי-החלטה (אין protectParens)');
}

console.log('\n6) רגרסיית בדיקות');
if (SKIP_TESTS) {
  console.log('  [SKIP] TORA_SKIP_TEST_REGRESSION=1 (הסוויטה רצה במלואה בצעד ה-vitest של ה-CI)');
} else {
  const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'packages/layout-engine/test/brackets-crosspage.test.ts']);
  const m = out.match(/Tests\s+(\d+) passed/);
  (m !== null && Number(m[1]) === 5 ? ok : fail)(`בדיקות brackets-crosspage: 5/5 (התקבל ${m ? m[1] : '?'})`);
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${checks - failures}/${checks} בדיקות`);
process.exit(failures === 0 ? 0 : 1);
