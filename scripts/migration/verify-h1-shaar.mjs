#!/usr/bin/env node
/**
 * verify-h1-shaar — אימות שלב 60: H1 — שער משנה/חלק ופתיחת עמוד
 * (אפיון §10.1 H1, §11.2; פרק ח/M7).
 *
 * שער השלב: **H1 פותח עמוד ומעוגן** — עמוד sub-shaar עם הכותרת בתיבה,
 * parity (recto), מיקום שמור לכל שער, פיצול כותרת, עוגן אמיתי (אין pageEstimate).
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
const BOX_H = templates.for('sub-shaar', 1).regions.find((r) => r.role === 'custom-box').rect.height;
let seq = 0;
const LINE = (h) => ({ id: `l-${seq++}`, heightLu: h, footnoteRefs: [], sidenoteRefs: [] });
const block = (id, lines, extra = {}) => ({ blockId: id, role: 'body', lines, ...extra });
const hd = (id, h, level) => block(id, [LINE(h)], { role: 'heading', headingLevel: level });
const initial = (first, kind = 'body') => engine.initialPaginationState({ firstBlockId: first, remainingByRegion: engine.initialRemainingByRegion(templates.for(kind, 1), 1), pageKind: kind });
const src = (blocks, behaviorOf) => engine.createPageCandidateSource({ blocks, templates, pageKind: 'body', ...(behaviorOf ? { headingBehaviorOf: behaviorOf } : {}) });
const fromStateOf = (res, i, first) => (i === 0 ? first : res.path[i - 1].toState);
const fullPolicy = policy.createTorahPolicy({ schemaVersion: 1, enginePolicyId: 'torah-v1', values: {}, configHash: 'v' });

console.log('1) H1 פותחת עמוד sub-shaar — הכותרת בתיבה; הזרימה ממשיכה בעמוד הגוף הבא');
{
  const lineH = Math.floor(H / 10);
  const blocks = [block('body|1', Array.from({ length: 5 }, () => LINE(lineH))), hd('heading|1|P', lineH * 2, 1), block('body|2', Array.from({ length: 8 }, () => LINE(lineH)))];
  const res = engine.searchPages(initial('body|1'), src(blocks, fullPolicy.headingBehaviorOf), new Ledger('decisions'));
  (res.status === 'complete' ? ok : fail)('מסלול שלם');
  const shaarIdx = res.path.findIndex((e) => e.candidateId.includes(':SHAAR'));
  (shaarIdx >= 0 ? ok : fail)('הרחבת שער (:SHAAR) נוצרה');
  const shaarState = fromStateOf(res, shaarIdx, initial('body|1'));
  (shaarState.pageKind === 'sub-shaar' ? ok : fail)('עמוד השער: sub-shaar (תיבה, בלי טורי גוף)');
  const shaarExp = res.path[shaarIdx];
  const boxConsume = shaarExp.transitions.find((tr) => tr.action.kind === 'consume-region' && tr.action.regionId.endsWith(':box'));
  (boxConsume !== undefined && boxConsume.action.amountLu === lineH * 2 ? ok : fail)('הכותרת האטומית נצרכת מתיבת השער במלוא גובהה');
  (shaarExp.toState.pageKind === 'body' && shaarExp.toState.physicalPageIndex === shaarState.physicalPageIndex + 1 ? ok : fail)('ההמשך — עמוד גוף חדש אחרי השער');
  let chainOk = true;
  try { engine.verifyTransitionChain(initial('body|1'), res.path.flatMap((e) => e.transitions)); } catch { chainOk = false; }
  (chainOk ? ok : fail)('שרשרת המעברים עוברת');
  (res.finalState.contentCursor.includes('body|2|f8') ? ok : fail)('כיסוי מלא — הסמן בקץ');
}

console.log('\n2) parity — השער תמיד recto; עמוד ריק לפני verso (legacy ensureOddPageStart)');
{
  const lineH = Math.floor(H / 10);
  const blocks = [block('body|1', Array.from({ length: 5 }, () => LINE(lineH))), hd('heading|1|Q', lineH, 1), block('body|2', Array.from({ length: 5 }, () => LINE(lineH)))];
  const res = engine.searchPages(initial('body|1'), src(blocks, fullPolicy.headingBehaviorOf), new Ledger('decisions'));
  (res.status === 'complete' ? ok : fail)('מסלול שלם');
  const shaarIdx = res.path.findIndex((e) => e.candidateId.includes(':SHAAR'));
  const shaarState = fromStateOf(res, shaarIdx, initial('body|1'));
  (shaarState.physicalPageIndex % 2 === 1 ? ok : fail)(`עמוד השער אי-זוגי (recto) — ${shaarState.physicalPageIndex}`);
  const before = res.path[shaarIdx - 1];
  const beforeFrom = fromStateOf(res, shaarIdx - 1, initial('body|1'));
  (beforeFrom.physicalPageIndex === shaarState.physicalPageIndex - 1 && beforeFrom.physicalPageIndex % 2 === 0
    && before.toState.contentCursor.includes('heading|1|Q|f0') ? ok : fail)('עמוד ריק ב-verso לפני השער — הסמן נשאר בראש ה-H1 (רק פתיחת עמוד)');
  // המדיניות: odd-h1=true ברירת מחדל; odd-h2=false
  (policy.legacyHeadingBehaviorOf(1).startOnRecto === true && policy.legacyHeadingBehaviorOf(2).startOnRecto === undefined ? ok : fail)('ברירות legacy: odd-h1=true, odd-h2=false (Orange נעול)');
  // rollback: odd-h1=false — אין כפיית recto
  const noRecto = policy.createTorahPolicy({ schemaVersion: 1, enginePolicyId: 'torah-v1', values: { 'odd-h1': false }, configHash: 'v' });
  const res2 = engine.searchPages(initial('body|1'), src(blocks, noRecto.headingBehaviorOf), new Ledger('decisions'));
  const shaarIdx2 = res2.path.findIndex((e) => e.candidateId.includes(':SHAAR'));
  const shaarState2 = fromStateOf(res2, shaarIdx2, initial('body|1'));
  (res2.status === 'complete' && shaarState2.physicalPageIndex === 2 ? ok : fail)('odd-h1=false: השער בעמוד 2 (verso) ישירות — בלי ריק (rollback להגדרה)');
}

console.log('\n3) מיקום שמור לכל שער + עוגנים (אין pageEstimate)');
{
  const lineH = Math.floor(H / 10);
  const blocks = [
    block('body|1', Array.from({ length: 5 }, () => LINE(lineH))),
    hd('heading|1|A', lineH, 1),
    block('body|2', Array.from({ length: 20 }, () => LINE(lineH))),
    hd('heading|1|B', lineH, 1),
    block('body|3', Array.from({ length: 5 }, () => LINE(lineH))),
  ];
  const res = engine.searchPages(initial('body|1'), src(blocks, fullPolicy.headingBehaviorOf), new Ledger('decisions'));
  (res.status === 'complete' && res.path.filter((e) => e.candidateId.includes(':SHAAR')).length === 2 ? ok : fail)('שני שערים — שתי הרחבות :SHAAR');
  const boxA = templates.for('sub-shaar', 1).regions.find((r) => r.role === 'custom-box').rect;
  const boxB = templates.for('sub-shaar', 3).regions.find((r) => r.role === 'custom-box').rect;
  (JSON.stringify(boxA) === JSON.stringify(boxB) ? ok : fail)('גאומטריית התיבה זהה לכל שער (§11.2 — אין reset)');
  const anchors = engine.headingAnchorsOf(initial('body|1'), res.path, blocks);
  const h1s = anchors.filter((a) => a.level === 1);
  (h1s.length === 2 && h1s.every((a) => a.pageKind === 'sub-shaar' && a.physicalPageIndex % 2 === 1) ? ok : fail)('עוגני H1: עמודי שער recto אמיתיים');
  const runOnce = () => JSON.stringify(engine.headingAnchorsOf(initial('body|1'), res.path, blocks));
  (runOnce() === runOnce() ? ok : fail)('טבלת העוגנים דטרמיניסטית');
}

console.log('\n4) פיצול כותרת — splitShaarTitle (המקפים במדיניות, לא ברנדרר)');
{
  const a = policy.splitShaarTitle('חלק א - בראשית');
  (a.primary === 'חלק א' && a.secondary === 'בראשית' && a.dash === '-' ? ok : fail)('מקף רגיל: primary/secondary');
  const b = policy.splitShaarTitle('חלק ב — שמות');
  (b.primary === 'חלק ב' && b.dash === '—' ? ok : fail)('קו ארוך (em-dash)');
  const c = policy.splitShaarTitle('חלק ד');
  (c.primary === 'חלק ד' && c.secondary === '' && c.dash === null ? ok : fail)('בלי מקף — הכל primary');
  (policy.splitShaarTitle('א—ב-ג').secondary === 'ב-ג' ? ok : fail)('המקף הראשון (הארוך) קובע — דטרמיניסטי');
}

console.log('\n5) כשלים מפורשים + rollback (mode-h1)');
{
  const lineH = Math.floor(H / 10);
  const tall = [hd('heading|1|T', BOX_H * 2, 1), block('body|1', [LINE(lineH)])];
  let threw = false;
  try { engine.searchPages(initial('heading|1|T', 'sub-shaar'), src(tall, fullPolicy.headingBehaviorOf), new Ledger('decisions')); } catch { threw = true; }
  (threw ? ok : fail)('כותרת גבוהה מהתיבה ⇒ כשל מפורש (אין גלישה שקטה)');
  let threw2 = false;
  try { src([block('body|1', [LINE(lineH)])]).expansions(initial('body|1', 'sub-shaar')); } catch { threw2 = true; }
  (threw2 ? ok : fail)('בלוק לא-כותרת בעמוד שער ⇒ שגיאת קלט מקוטלגת');
  const hidden = policy.createTorahPolicy({ schemaVersion: 1, enginePolicyId: 'torah-v1', values: { 'mode-h1': 'new_page_1col' }, configHash: 'v' });
  (hidden.headingBehaviorOf(1).forcePageTemplate === 'body' ? ok : fail)('mode-h1=new_page_1col (שער מוסתר): H1 פותחת body (rollback להגדרה)');
  const blocks = [block('body|1', Array.from({ length: 5 }, () => LINE(lineH))), hd('heading|1|N', lineH, 1), block('body|2', Array.from({ length: 5 }, () => LINE(lineH)))];
  const res = engine.searchPages(initial('body|1'), src(blocks, hidden.headingBehaviorOf), new Ledger('decisions'));
  (res.status === 'complete' && !res.path.some((e) => e.candidateId.includes(':SHAAR')) ? ok : fail)('שער מוסתר: אין הרחבת :SHAAR — H1 בעמוד גוף');
  const anchors = engine.headingAnchorsOf(initial('body|1'), res.path, blocks);
  (anchors.find((a) => a.blockId === 'heading|1|N')?.pageKind === 'body' ? ok : fail)('העוגן של H1 המוסתר — עמוד גוף');
}

console.log('\n6) שקילות מנוע↔policy + מרשם (rollback = גרסה קודמת)');
{
  let same = true;
  for (let level = 0; level <= 7; level++) {
    const e = engine.legacyHeadingBehaviorOf(level);
    const p = policy.legacyHeadingBehaviorOf(level);
    if (e.forcePageTemplate !== p.forcePageTemplate || e.startOnRecto !== p.startOnRecto) same = false;
  }
  (same ? ok : fail)('ברירות H0–H7 זהות בין המנוע ל-policy (כולל sub-shaar+recto ל-H1)');
  (policy.headingBehaviorId(policy.legacyHeadingBehaviorOf(1)) === 'heading:v1|L1|page-opener|esc2|f1|tsub-shaar|r1' ? ok : fail)('מזהה H1 קנוני כולל תבנית+recto (נעילת rollback)');
  const sig = policy.torahRegistrySignature();
  (sig.includes('heading.h1.shaar@2') && sig.includes('heading.h0.opener@2') ? ok : fail)('המרשם: גרסאות כללי H0/H1 הועלו ל-2 (parity/shaar; rollback = v1)');
  (policy.torahRuleIssues().length === 0 ? ok : fail)('המרשם תקין');
}

console.log('\n7) ההחלטה בתוך ההרחבה — אין post-pass (סריקת קוד)');
{
  const cand = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'candidates.ts'), 'utf8');
  (cand.includes('buildShaarPlacement') && cand.includes(':SHAAR') ? ok : fail)('הצבת השער בהרחבה ייעודית (buildShaarPlacement; :SHAAR)');
  (cand.includes('needsBlankForRecto') ? ok : fail)('כפיית recto בתוך ההרחבה (עמוד ריק לפני verso)');
  (cand.includes('pageKind === requiredKindHere') ? ok : fail)('הפותחת מוצבת רק בעמוד הסוג שהמדיניות דורשת');
  const noPostPass = !/function\s+(balance|fix|adjust|postProcess)\w*\(/.test(cand);
  (noPostPass ? ok : fail)('אין פונקציית תיקון אחרי-החלטה');
}

console.log('\n8) רגרסיית בדיקות');
if (SKIP_TESTS) {
  console.log('  [SKIP] TORA_SKIP_TEST_REGRESSION=1 (הסוויטה רצה במלואה בצעד ה-vitest של ה-CI)');
} else {
  const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'packages/layout-engine/test/h1-shaar.test.ts']);
  const m = out.match(/Tests\s+(\d+) passed/);
  (m !== null && Number(m[1]) === 12 ? ok : fail)(`בדיקות h1-shaar: 12/12 (התקבל ${m ? m[1] : '?'})`);
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${checks - failures}/${checks} בדיקות`);
process.exit(failures === 0 ? 0 : 1);
