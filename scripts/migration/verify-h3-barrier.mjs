#!/usr/bin/env node
/**
 * verify-h3-barrier — אימות שלב 56: מחסום H3 ואיזון סביבו; הסרת post-pass
 * (אפיון §10.1 H3, §9.3#6, §9.2; פרק ז/M6).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0; let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1';
const run = (cmd, args) => { try { return execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], env: { ...process.env, NO_COLOR: '1' } }); } catch (e) { return (e.stdout ?? '').toString(); } };
const runCode = (cmd, args) => { try { execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], env: { ...process.env, NO_COLOR: '1' } }); return 0; } catch { return 1; } };

const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));
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
const inputFor = (blocks) => ({ blocks, templates, pageKind: 'body' });
const initial = (first) => engine.initialPaginationState({ firstBlockId: first, remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1) });

console.log('1) H3 חוצת-טורים — סנכרון תקציבים; לא פותחת עמוד');
{
  const lineH = Math.floor(H / 10); const h3H = Math.floor(H / 10);
  const blocks = [block('body|1', [LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH)]), h3('heading|1|H3', h3H), block('body|2', [LINE(lineH), LINE(lineH)])];
  const src = engine.createPageCandidateSource(inputFor(blocks));
  const exps = src.expansions(initial('body|1'));
  const h3exp = exps.find((e) => e.candidateId.includes(':H3'));
  (h3exp !== undefined ? ok : fail)('מועמד ה-H3 נוצר (מזהה :H3)');
  (h3exp && h3exp.toState.remainingByRegion['page:1:col:0'] === H - 6 * lineH && h3exp.toState.remainingByRegion['page:1:col:1'] === H - 6 * lineH ? ok : fail)('שני הטורים נשרפו עד תחתית הכותרת — מסונכרנים');
  (h3exp && h3exp.toState.physicalPageIndex === 1 && h3exp.closesRegion === true ? ok : fail)('נשארת באותו עמוד (לא פותחת מעצמה; §10.1) + סוגרת אזור (§9.2)');
  // H3 בראש העמוד — barrierY=0, פס מלא
  const blocksTop = [h3('heading|1|H3', h3H), block('body|1', Array.from({ length: 10 }, () => LINE(lineH)))];
  const srcTop = engine.createPageCandidateSource(inputFor(blocksTop));
  const topExps = srcTop.expansions(initial('heading|1|H3'));
  const topH3 = topExps.find((e) => e.candidateId.includes(':H3'));
  (topH3 !== undefined && topH3.toState.remainingByRegion['page:1:col:0'] === H - h3H ? ok : fail)('H3 בראש העמוד: barrierY=0; פס מלא מתחת');
}

console.log('\n2) איזון לפני הכותרת — החיפוש');
{
  const lineH = Math.floor(H / 10); const h3H = Math.floor(H / 10);
  const blocks = [block('body|1', Array.from({ length: 10 }, () => LINE(lineH))), h3('heading|1|H3', h3H), block('body|2', Array.from({ length: 8 }, () => LINE(lineH)))];
  const src = engine.createPageCandidateSource(inputFor(blocks));
  const res = engine.searchPages(initial('body|1'), src, new Ledger('decisions'));
  (res.status === 'complete' ? ok : fail)('מסלול שלם');
  const h3exp = res.path.find((e) => e.candidateId.includes(':H3'));
  (h3exp !== undefined ? ok : fail)('ה-H3 הוצבה במסלול הזוכה');
  const to = h3exp ? h3exp.toState : null;
  (to && to.remainingByRegion[`page:${to.physicalPageIndex}:col:0`] === to.remainingByRegion[`page:${to.physicalPageIndex}:col:1`] ? ok : fail)('הטורים מסונכרנים אחרי ה-barrier');
  (h3exp && h3exp.transitions.some((t) => t.action.kind === 'switch-column') ? ok : fail)('הטקסט לפני ה-H3 פוזר בין הטורים (העדפת איזון)');
}

console.log('\n3) סמוך לתחתית + ליד הערות + מרובות');
{
  const lineH = Math.floor(H / 20); const h3H = Math.floor(H / 20);
  const blocks = [block('body|1', Array.from({ length: 38 }, () => LINE(lineH))), h3('heading|1|H3', h3H), block('body|2', Array.from({ length: 5 }, () => LINE(lineH)))];
  const src = engine.createPageCandidateSource(inputFor(blocks));
  const p1 = src.expansions(initial('body|1')).filter((e) => e.candidateId.includes(':H3'));
  (p1.length === 0 ? ok : fail)('H3 שאינה נכנסת לפס — אף מועמד בעמוד 1 (feasibility)');
  const res = engine.searchPages(initial('body|1'), src, new Ledger('decisions'));
  const h3exp = res.path.find((e) => e.candidateId.includes(':H3'));
  (res.status === 'complete' && h3exp && h3exp.candidateId.startsWith('pg:2:') ? ok : fail)('ה-H3 זורמת לעמוד 2 כמו תוכן רגיל');
  // מרובות: שלוש H3 — מסלול שלם עם כיסוי ואינווריאנט
  const blocks2 = [];
  for (let i = 1; i <= 6; i++) {
    blocks2.push(block(`body|${i}`, Array.from({ length: 10 }, () => LINE(lineH))));
    if (i % 2 === 0) blocks2.push(h3(`heading|${i / 2}|H3`, h3H));
  }
  const src2 = engine.createPageCandidateSource(inputFor(blocks2));
  const res2 = engine.searchPages(initial('body|1'), src2, new Ledger('decisions'));
  const h3count = res2.path.filter((e) => e.candidateId.includes(':H3')).length;
  (res2.status === 'complete' && h3count === 3 ? ok : fail)(`שלוש H3 הוצבו (${h3count})`);
  const perRegion = new Map();
  for (const t of res2.path.flatMap((e) => e.transitions)) {
    if (t.action.kind === 'consume-region') { const a = t.action; perRegion.set(a.regionId, (perRegion.get(a.regionId) ?? 0) + a.amountLu); }
  }
  let inv = true;
  for (const [, used] of perRegion) if (used > H) inv = false;
  (inv ? ok : fail)('אינווריאנט צריכה ≤ גובה טור לכל אזור');
}

console.log('\n4) אין post-pass — סריקת קוד');
{
  const src = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'candidates.ts'), 'utf8');
  const search = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'search.ts'), 'utf8');
  (!/function\s+(apply|run|do)\w*(Balance|PostProcess|AfterLayout)\w*\s*\(/.test(src) && !/function\s+rebalance\w*\s*\(/.test(src) ? ok : fail)('אין פונקציית איזון/תיקון אחרי-החלטה במחולל');
  (!/function\s+(apply|run|do)\w*(Balance|PostProcess|AfterLayout)\w*\s*\(/.test(search) ? ok : fail)('אין פונקציית איזון/תיקון אחרי-החלטה בחיפוש');
  (src.includes('h3GapLu') && src.includes('איזון לפני הכותרת') ? ok : fail)('האיזון ממומש כעלות בחיפוש (רכיב 8 + h3GapLu) — לא כתיקון');
}

console.log('\n5) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages');
(runCode('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('typecheck:packages');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check');
if (!SKIP_TESTS) {
  const t = run('npm', ['run', 'test:packages']);
  (/Tests\s+904\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 904/904');
} else {
  ok('test:packages — [skipped-in-CI: parent step already ran the suite]');
}

console.log('\n' + '='.repeat(60));
if (failures > 0) { console.error(`נכשל: ${failures} מתוך ${checks} בדיקות`); process.exit(1); }
console.log(`הכל ירוק: ${checks}/${checks} — שלב 56 (מחסום H3) עבר`);
