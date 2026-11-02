#!/usr/bin/env node
/**
 * verify-h0-opener — אימות שלב 59: H0 — פותח עמוד/פרק (forcePageTemplate)
 * (אפיון §10.1; פרק ח/M7).
 *
 * שער השלב: **H0 תמיד פותח את תבנית העמוד הנדרשת** — הכותרת הפותחת אינה
 * מוצבת לעולם באמצע עמוד; ההרחבה שמסתיימת בה פותחת עמוד חדש בתבנית
 * שההתנהגות המוזרקת דורשת; ההחלטה בתוך ההרחבה (אין post-pass).
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
const LINE = (h) => ({ id: `l-${seq++}`, heightLu: h, footnoteRefs: [], sidenoteRefs: [] });
const block = (id, lines, extra = {}) => ({ blockId: id, role: 'body', lines, ...extra });
const hd = (id, h, level) => block(id, [LINE(h)], { role: 'heading', headingLevel: level });
const initial = (first) => engine.initialPaginationState({ firstBlockId: first, remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1) });
const src = (blocks, behaviorOf) => engine.createPageCandidateSource({ blocks, templates, pageKind: 'body', ...(behaviorOf ? { headingBehaviorOf: behaviorOf } : {}) });

console.log('1) שלושת מבחני החובה של §10.1');
{
  const lineH = Math.floor(H / 10);
  // (א) תחילת מסמך — H0 ראשון מוצב בראש עמוד 1
  {
    const blocks = [hd('heading|0|A', lineH, 0), block('body|1', Array.from({ length: 10 }, () => LINE(lineH)))];
    const res = engine.searchPages(initial('heading|0|A'), src(blocks), new Ledger('decisions'));
    (res.status === 'complete' && res.path[0].candidateId.startsWith('pg:1:0→')
      && !res.path.some((e) => e.candidateId.includes(':OPEN'))
      && res.path[0].toState.physicalPageIndex === 1 ? ok : fail)('תחילת מסמך: ה-H0 מוצבת בראש עמוד 1 — בלי פתיחה נוספת');
  }
  // (ב) אחרי טור חצי מלא — פותחת עמוד חדש מיד, לא מעבר טור
  {
    const blocks = [block('body|1', Array.from({ length: 5 }, () => LINE(lineH))), hd('heading|0|B', lineH, 0), block('body|2', Array.from({ length: 10 }, () => LINE(lineH)))];
    const exps = src(blocks).expansions(initial('body|1'));
    const openExp = exps.find((e) => e.candidateId.endsWith('heading|0|B@0:OPEN'));
    (openExp !== undefined ? ok : fail)('אחרי טור חצי מלא: גבול :OPEN נוצר לפני ה-H0');
    (openExp && openExp.toState.physicalPageIndex === 2 && openExp.toState.columnIndex === 0
      && openExp.toState.remainingByRegion['page:2:col:0'] === H && openExp.closesRegion === true ? ok : fail)('פותחת עמוד 2 מיד (טור 0 מלא) — לא מעבר לטור 1; סוגרת אזור');
    (openExp && !Object.keys(openExp.toState.remainingByRegion).some((k) => k.startsWith('page:1:')) ? ok : fail)('העמוד החדש מחליף את אזורי הקודם (השארית של עמוד 1 ננטשת — עלות רכיב 8)');
  }
  // (ג) H0 ואחריו H2 עוקב — כל פותחת בעמוד משלה; חריג ליווי
  {
    const blocks = [hd('heading|0|C', lineH, 0), hd('heading|2|D', lineH, 2), block('body|1', Array.from({ length: 10 }, () => LINE(lineH)))];
    const exps = src(blocks).expansions(initial('heading|0|C'));
    const openH2 = exps.find((e) => e.candidateId.endsWith('heading|2|D@0:OPEN'));
    (openH2 !== undefined ? ok : fail)('H0+H2: גבול פותח-עמוד לפני ה-H2 נוצר למרות escort=2 (חריג פתיחה כפויה)');
    (openH2 && openH2.toState.physicalPageIndex === 2 ? ok : fail)('ה-H2 פותחת עמוד 2 — כל פותחת מקבלת עמוד משלה');
    const res = engine.searchPages(initial('heading|0|C'), src(blocks), new Ledger('decisions'));
    (res.status === 'complete' && res.finalState.contentCursor.includes('body|1|f10') ? ok : fail)('מסלול שלם — כיסוי מלא');
  }
}

console.log('\n2) forcePageTemplate — התבנית שהמדיניות דורשת, בפועל');
{
  const lineH = Math.floor(H / 10);
  const blocks = [block('body|1', Array.from({ length: 5 }, () => LINE(lineH))), hd('heading|0|N', lineH, 0), block('body|2', Array.from({ length: 4 }, () => LINE(lineH)))];
  // startOnRecto:false — בידוד מנגנון התבנית מ-parity (שלב 60; ברירת המחדל odd-h0=true הייתה מכניסה ריק לפני verso)
  const full = policy.createTorahPolicy({ schemaVersion: 1, enginePolicyId: 'torah-v1', values: { 'odd-h0': false }, configHash: 'v' }, { 0: { forcePageTemplate: 'notes' } });
  const res = engine.searchPages(initial('body|1'), src(blocks, full.headingBehaviorOf), new Ledger('decisions'));
  (res.status === 'complete' ? ok : fail)('מסלול שלם עם H0 שדורשת notes');
  const openIdx = res.path.findIndex((e) => e.candidateId.endsWith('heading|0|N@0:OPEN'));
  (openIdx >= 0 ? ok : fail)('גבול :OPEN נוצר');
  const opened = res.path[openIdx].toState;
  (opened.pageKind === 'notes' ? ok : fail)('סוג העמוד שנפתח: notes (נשמר במצב — §9.2: hash מבדיל)');
  (opened.remainingByRegion['page:2:col:1'] === undefined && opened.remainingByRegion['page:2:col:0'] !== undefined ? ok : fail)('תבנית notes: טור בודד — אין col:1');
  // ההרחבה שאחרי הפתיחה עובדת מול התבנית הנכונה: ה-H0 נצרכת על עמוד ה-notes
  // (המחולל קורא תבנית לפי state.pageKind — טור שני לא קיים שם ולא נפלה שגיאה)
  const after = res.path[openIdx + 1];
  (after !== undefined && after.toState.contentCursor.includes('body|2') ? ok : fail)('ה-H0 נצרכת על עמוד ה-notes (המחולל עובד מול state.pageKind)');
  // rollback: המדיניות המלאה בלי override — body רגיל
  const res2 = engine.searchPages(initial('body|1'), src(blocks, policy.createTorahPolicy({ schemaVersion: 1, enginePolicyId: 'torah-v1', values: { 'odd-h0': false }, configHash: 'v' }).headingBehaviorOf), new Ledger('decisions'));
  const open2 = res2.path.find((e) => e.candidateId.endsWith('heading|0|N@0:OPEN'));
  (open2 !== undefined && open2.toState.pageKind === 'body' && open2.toState.remainingByRegion['page:2:col:1'] !== undefined ? ok : fail)('ברירת המחדל: עמוד body דו-טורי (rollback — בלי override)');
  // התנהגות בלי הזרקה = legacy (העתק המנוע זהה)
  (engine.legacyHeadingBehaviorOf(0).forcePageTemplate === 'body' && policy.legacyHeadingBehaviorOf(0).forcePageTemplate === 'body' ? ok : fail)('ברירות המחדל H0=body בשני הצדדים (שקילות שלב 58)');
}

console.log('\n3) אין פותחת באמצע עמוד — הליכה נעצרת; אין אובדן תוכן');
{
  const lineH = Math.floor(H / 10);
  const blocks = [block('body|1', Array.from({ length: 20 }, () => LINE(lineH))), hd('heading|0|M', lineH, 0), block('body|2', Array.from({ length: 12 }, () => LINE(lineH)))];
  const res = engine.searchPages(initial('body|1'), src(blocks), new Ledger('decisions'));
  (res.status === 'complete' && res.finalState.contentCursor.includes('body|2|f12') ? ok : fail)('מסלול שלם — כיסוי מלא, אין אובדן');
  // מכל מצב לפני ה-H0: אף הרחבה אינה מזיזה סמן אל תוך/מעבר ל-H0 מבלי לפתוח עמוד
  let noCross = true;
  const stack = [initial('body|1')];
  const seen = new Set();
  while (stack.length > 0) {
    const st = stack.pop();
    if (seen.has(st.stateHash)) continue;
    seen.add(st.stateHash);
    if (st.physicalPageIndex > 4) continue;
    for (const e of src(blocks).expansions(st)) {
      const cur = st.contentCursor;
      const isBeforeH0 = cur.includes('body|1|') && !cur.includes('heading|0|M');
      if (isBeforeH0 && e.toState.contentCursor.includes('heading|0|M|f1')) noCross = false; // סמן עבר את ה-H0 בלי :OPEN
      stack.push(e.toState);
    }
  }
  (noCross ? ok : fail)('אף מסלול אינו מציב את הפותחת באמצע עמוד (ההליכה נעצרת לפניה)');
  // אחרי מחסום H3: הרחבה ריקה שרק פותחת עמוד — בלי הקדמת סמן
  const blocksH3 = [hd('heading|3|S', lineH, 3), hd('heading|0|P', lineH, 0), block('body|1', Array.from({ length: 8 }, () => LINE(lineH)))];
  const res3 = engine.searchPages(initial('heading|3|S'), src(blocksH3), new Ledger('decisions'));
  const emptyIdx = res3.path.findIndex((e, i) => e.candidateId.endsWith('heading|0|P@0:OPEN')
    && (i === 0 ? initial('heading|3|S').contentCursor : res3.path[i - 1].toState.contentCursor) === e.toState.contentCursor);
  (res3.status === 'complete' && emptyIdx >= 0 ? ok : fail)('אחרי מחסום H3: גבול פותח-עמוד ריק (הסמן נשאר — ההתקדמות היא פתיחת העמוד)');
  (res3.path[emptyIdx] && res3.path[emptyIdx].transitions.map((t) => t.action.kind).join(',') === 'open-page' ? ok : fail)('ההרחבה הריקה: open-page בלבד');
  let chainOk = true;
  try { engine.verifyTransitionChain(initial('heading|3|S'), res3.path.flatMap((e) => e.transitions)); } catch { chainOk = false; }
  (chainOk ? ok : fail)('שרשרת המעברים עוברת (כולל ההרחבה הריקה)');
  // פותחת גבוהה מטור ריק ⇒ כשל מפורש (אין חירום לכותרות)
  const blocksTall = [block('body|1', [LINE(lineH)]), hd('heading|0|T', H * 2, 0), block('body|2', [LINE(lineH)])];
  let threw = false;
  try { engine.searchPages(initial('body|1'), src(blocksTall), new Ledger('decisions')); } catch { threw = true; }
  (threw ? ok : fail)('פותחת גבוהה מטור ⇒ כשל מפורש מקוטלג (אין EMERGENCY לכותרות)');
}

console.log('\n4) pageKind במצב — §9.2 (hash מבדיל סוגי עמוד)');
{
  const lineH = Math.floor(H / 10);
  const blocks = [hd('heading|0|K', lineH, 0), block('body|1', Array.from({ length: 6 }, () => LINE(lineH)))];
  const i1 = engine.initialPaginationState({ firstBlockId: 'heading|0|K', remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1) });
  const i2 = engine.initialPaginationState({ firstBlockId: 'heading|0|K', remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1), pageKind: 'toc' });
  (i1.pageKind === 'body' && i2.pageKind === 'toc' ? ok : fail)('initialPaginationState: pageKind ברירת מחדל body, ניתן להזרקה');
  (i1.stateHash !== i2.stateHash ? ok : fail)('סוג עמוד שונה ⇒ stateHash שונה (§9.2: body≠toc זהים מבנית אך שונים בפריסה)');
  // openPage מעביר את הסוג; ברירת מחדל — שמירת הסוג הנוכחי (תאימות שלב 49)
  const p2 = engine.openPage(i2, engine.initialRemainingByRegion(templates.for('body', 2), 2)).state;
  (p2.pageKind === 'toc' ? ok : fail)('openPage ברירת מחדל: שומר על סוג העמוד הנוכחי');
  const p3 = engine.openPage(i2, engine.initialRemainingByRegion(templates.for('notes', 3), 3), 'notes').state;
  (p3.pageKind === 'notes' ? ok : fail)('openPage עם סוג מפורש: עובר לסוג הנדרש');
  // אימות מבני תופס סוג פסול
  (engine.paginationStateIssues({ ...i1, pageKind: 'banana', stateHash: i1.stateHash }).includes('pageKind') ? ok : fail)('paginationStateIssues תופס pageKind פסול');
  // דטרמיניזם על זרימה עם פותחות
  const blocksD = [hd('heading|0|D1', lineH, 0), block('body|1', Array.from({ length: 15 }, () => LINE(lineH))), hd('heading|2|D2', lineH, 2), block('body|2', Array.from({ length: 15 }, () => LINE(lineH)))];
  const once = () => { const r = engine.searchPages(initial('heading|0|D1'), src(blocksD), new Ledger('decisions')); return JSON.stringify({ p: r.path.map((e) => e.candidateId), h: r.finalState.stateHash }); };
  (once() === once() && once() === once() ? ok : fail)('דטרמיניזם: 3 ריצות — מזהים זהים');
}

console.log('\n5) ההחלטה בתוך ההרחבה — אין post-pass (סריקת קוד)');
{
  const cand = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'candidates.ts'), 'utf8');
  (cand.includes('forcePageTemplate ?? input.pageKind') ? ok : fail)('התבנית הנדרשת נקבעת בתוך ההרחבה (forcePageTemplate ?? pageKind)');
  (cand.includes("input.templates.for(state.pageKind, state.physicalPageIndex)") ? ok : fail)('המחולל קורא תבנית לפי סוג העמוד שבמצב (לא סוג הזרימה הקבוע)');
  (cand.includes('pageOpener: { level: openerLevelHere }') && cand.includes(':OPEN') ? ok : fail)('גבולות פותחים מסומנים pageOpener ומזוהים :OPEN במזהה');
  const noPostPass = !/function\s+(balance|fix|adjust|postProcess)\w*\(/.test(cand);
  (noPostPass ? ok : fail)('אין פונקציית תיקון/איזון אחרי-החלטה (ההכרעה בהרחבה בלבד)');
  const stateSrc = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'state.ts'), 'utf8');
  (stateSrc.includes('pageKind: s.pageKind') ? ok : fail)('pageKind נכנס ל־stateHash (stateCore) — §9.2');
}

console.log('\n6) רגרסיית בדיקות');
if (SKIP_TESTS) {
  console.log('  [SKIP] TORA_SKIP_TEST_REGRESSION=1 (הסוויטה רצה במלואה בצעד ה-vitest של ה-CI)');
} else {
  const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'packages/layout-engine/test/h0-opener.test.ts']);
  const m = out.match(/Tests\s+(\d+) passed/);
  (m !== null && Number(m[1]) === 10 ? ok : fail)(`בדיקות h0-opener: 10/10 (התקבל ${m ? m[1] : '?'})`);
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${checks - failures}/${checks} בדיקות`);
process.exit(failures === 0 ? 0 : 1);
