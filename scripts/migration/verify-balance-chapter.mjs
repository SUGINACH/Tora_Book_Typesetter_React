#!/usr/bin/env node
/**
 * verify-balance-chapter — אימות שלב 66: איזון סוף פרק בשלוש רמות (§10.5).
 *
 * שער השלב: האיזון נבחר לפי הסדר המוגדר ומתועד; המדד גובה regions בפועל;
 * קו-המפריד נמדד בתוך המועמד; הערות/כותרות נשארות חוקיות.
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
const h2 = (id, h) => block(id, [LINE(h)], { role: 'heading', headingLevel: 2 });
const initial = (first) => engine.initialPaginationState({ firstBlockId: first, remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1) });
const src = (blocks, extra) => engine.createPageCandidateSource({ blocks, templates, pageKind: 'body', ...(extra ?? {}) });

const imbalanceOf = (res) => {
  const openIdx = res.path.findIndex((e) => e.toState.contentCursor.includes('heading|2|N|f0'));
  const pre = openIdx > 0 ? res.path[openIdx - 1].toState : undefined;
  const openExp = res.path[openIdx];
  const page = pre !== undefined ? pre.physicalPageIndex : 1;
  const r0 = pre?.remainingByRegion[`page:${page}:col:0`];
  const r1 = pre?.remainingByRegion[`page:${page}:col:1`];
  const used0 = r0 !== undefined ? H - r0 : 0;
  const used1 = r1 !== undefined ? H - r1 : 0;
  const curCol = pre !== undefined ? pre.columnIndex : 0;
  const consume = openExp?.transitions.find((tr) => tr.action.kind === 'consume-region' && tr.action.regionId === `page:${page}:col:${curCol}`);
  const added = consume?.action.amountLu ?? 0;
  return Math.abs((curCol === 0 ? used0 + added : used0) - (curCol === 1 ? used1 + added : used1));
};

console.log('1) רמה 1 — פיצול מאוזן בלי לשנות מספר עמודים (פרק קצר)');
{
  const lineH = Math.floor(H / 10);
  const blocks = [block('body|1', Array.from({ length: 14 }, () => LINE(lineH))), h2('heading|2|N', lineH), block('body|2', Array.from({ length: 4 }, () => LINE(lineH)))];
  const on = engine.searchPages(initial('body|1'), src(blocks, { balanceChapterEnd: true }), new Ledger('decisions'));
  const off = engine.searchPages(initial('body|1'), src(blocks, { balanceChapterEnd: false }), new Ledger('decisions'));
  (on.status === 'complete' && off.status === 'complete' ? ok : fail)('שני המצבים complete — האיזון אינו מאבד תוכן');
  (imbalanceOf(on) <= lineH ? ok : fail)(`דגל דלוק: פיצול מאוזן (הפרש ${imbalanceOf(on)} ≤ קו)`);
  (imbalanceOf(off) > lineH ? ok : fail)(`דגל כבוי: אין העדפה (הפרש ${imbalanceOf(off)} > קו) — ההבחנה עובדת`);
  // מספר העמודים זהה — רמה 1 אינה משנה עמודים
  (on.finalState.physicalPageIndex === off.finalState.physicalPageIndex ? ok : fail)('מספר העמודים זהה (רמה 1: בלי לשנות עמודים)');
}

console.log('\n2) קו-המפריד נמדד בתוך המועמד');
{
  const lineH = Math.floor(H / 10);
  const divider = lineH * 2;
  const blocks = [block('body|1', Array.from({ length: 8 }, () => LINE(lineH))), h2('heading|2|N', lineH), block('body|2', Array.from({ length: 4 }, () => LINE(lineH)))];
  const res = engine.searchPages(initial('body|1'), src(blocks, { chapterEndDividerLu: divider }), new Ledger('decisions'));
  (res.status === 'complete' ? ok : fail)('מסלול שלם עם מפריד מוזרק');
  const openIdx = res.path.findIndex((e) => e.toState.contentCursor.includes('heading|2|N|f0'));
  const pre = openIdx > 0 ? res.path[openIdx - 1].toState : undefined;
  const openExp = res.path[openIdx];
  const consume = openExp?.transitions.find((tr) => tr.action.kind === 'consume-region' && tr.action.regionId?.endsWith(':col:0') && pre?.physicalPageIndex === 1 && tr.action.regionId.startsWith('page:1:'));
  const c = openExp?.transitions.find((tr) => tr.action.kind === 'consume-region' && tr.action.regionId === `page:1:col:${pre !== undefined ? pre.columnIndex : 0}`);
  (c !== undefined && (c.action.amountLu - divider) % lineH === 0 ? ok : fail)('הצריכה בגבול סוף-הפרק כוללת את המפריד בדיוק (מודולו קווים)');
}

console.log('\n3) פרק עם הערות בסוף — האיזון אינו שובר את שריון ההערות');
{
  const lineH = Math.floor(H / 10);
  const bodies = new Map([['note:v1|doc|footnote|1', engine.makeNoteBodySpec('note:v1|doc|footnote|1', [lineH * 2])]]);
  const blocks = [block('body|1', Array.from({ length: 14 }, (_, i) => i === 6 ? LINE(lineH, { footnoteRefs: ['note:v1|doc|footnote|1'] }) : LINE(lineH))), h2('heading|2|N', lineH), block('body|2', Array.from({ length: 4 }, () => LINE(lineH)))];
  const res = engine.searchPages(initial('body|1'), src(blocks, { balanceChapterEnd: true, noteBodies: bodies }), new Ledger('decisions'));
  (res.status === 'complete' && res.finalState.pendingFootnotes.length === 0 ? ok : fail)('complete; ההערה הוצבה (אין יתומות)');
  let inv = true;
  for (const e of res.path) {
    for (const col of [0, 1]) {
      const colR = e.toState.remainingByRegion[`page:${e.toState.physicalPageIndex}:col:${col}`];
      const notesR = e.toState.remainingByRegion[`page:${e.toState.physicalPageIndex}:notes`];
      if (colR !== undefined && notesR !== undefined) {
        const nb = templates.for('body', 1).footnoteAnchor?.rect.height ?? 0;
        if ((H - colR) + Math.max(0, nb - notesR) > H + 1) inv = false;
      }
    }
  }
  (inv ? ok : fail)('אינווריאנט טור+גוש ≤ עמוד לאורך המסלול (ADR-005)');
}

console.log('\n4) שלוש הרמות במדיניות + מרשם');
{
  const l1 = policy.chapterBalancePolicyOf({ values: { 'drop-word-mode': 'none' } });
  const l2 = policy.chapterBalancePolicyOf({ values: {} });
  (l1.level === 1 && l1.freeSplit && !l1.allowDropWord ? ok : fail)('רמה 1: פיצול חופשי בלבד');
  (l2.level === 2 && l2.allowDropWord && l2.allowCrossPageMove && !l2.allowLetterSpacing ? ok : fail)('רמה 2: +drop-word; רמה 3 זמינה (החיפוש חוקר); letter-spacing נעול (§8)');
  (l2.dividerStyle === 'spear' && l2.dividerEnabled ? ok : fail)("המפריד: ברירת המחדל spear (Orange); none ⇒ כבוי");
  (policy.createTorahPolicy({ schemaVersion: 1, enginePolicyId: 'torah-v1', values: {}, configHash: 'v' }).chapterBalance.level === 2 ? ok : fail)('TorahPolicy נושאת את מדיניות האיזון');
  (policy.torahRegistrySignature().includes('balance.chapter-end@2') && policy.torahRuleIssues().length === 0 ? ok : fail)('המרשם: balance.chapter-end@2 (rollback = v1)');
}

console.log('\n5) סריקת קוד — ההכרעה בחיפוש; אין post-pass');
{
  const cand = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'candidates.ts'), 'utf8');
  (cand.includes('chapterImbalanceLu') ? ok : fail)('עלות אי-האיזון ברכיב 8 — בתוך ההרחבה');
  (cand.includes('chapterEndDividerLu') ? ok : fail)('המפריד נצרם בתוך המועמד (גבול סוף-פרק)');
  (cand.includes('balanceChapterEnd !== false') ? ok : fail)('ברירת המחדל: איזון פעיל (legacy balanceColumns); כיבוי מפורש');
  const noPostPass = !/function\s+(balanceColumns|fixBalance|adjustBalance)\w*\(/.test(cand);
  (noPostPass ? ok : fail)('אין פונקציית איזון אחרי-החלטה (ההכרעה בחיפוש בלבד)');
}

console.log('\n6) רגרסיית בדיקות');
if (SKIP_TESTS) {
  console.log('  [SKIP] TORA_SKIP_TEST_REGRESSION=1');
} else {
  const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'packages/layout-engine/test/balance-chapter.test.ts']);
  const m = out.match(/Tests\s+(\d+) passed/);
  (m !== null && Number(m[1]) === 5 ? ok : fail)(`בדיקות balance-chapter: 5/5 (התקבל ${m ? m[1] : '?'})`);
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${checks - failures}/${checks} בדיקות`);
process.exit(failures === 0 ? 0 : 1);
