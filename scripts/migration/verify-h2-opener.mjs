#!/usr/bin/env node
/**
 * verify-h2-opener — אימות שלב 61: H2 — פותח פרק עם ריווח ועיטורים לפי scope
 * (אפיון §10.1 H2, §11.2; פרק ח/M7).
 *
 * שער השלב: **העיטור תופס בדיוק את המקום שנמדד לו** — הריווח העליון
 * (h2-top-distance) והעיטורים (dim-h2-top-h/btm-h) נמדדים מהגאומטריה
 * ומקווי הכותרת בפועל ונצרכים בתוך ההרחבה שמציבה את הכותרת.
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
const heading = (id, heights, level) => block(id, heights.map((h) => LINE(h)), { role: 'heading', headingLevel: level });
const initial = (first) => engine.initialPaginationState({ firstBlockId: first, remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1) });
const src = (blocks, behaviorOf, pol) => engine.createPageCandidateSource({ blocks, templates, pageKind: 'body', ...(behaviorOf ? { headingBehaviorOf: behaviorOf } : {}), ...(pol ? { policy: pol } : {}) });
const mkSettings = (values = {}) => ({ schemaVersion: 1, enginePolicyId: 'torah-v1', values, configHash: 'v' });

console.log('1) measured boxes — העיטור תופס בדיוק את המקום שנמדד לו (שער השלב)');
{
  const lineH = Math.floor(H / 10);
  const BEFORE = Math.round(0.22 * H);
  const TOP = Math.round(1.25 * lineH);
  const BTM = Math.round(1.25 * lineH);
  const blocks = [heading('heading|2|C', [lineH], 2), block('body|1', Array.from({ length: 4 }, () => LINE(lineH)))];
  const exps = src(blocks).expansions(initial('heading|2|C'));
  const at2 = exps.find((e) => e.candidateId.endsWith('body|1@2'));
  (at2 !== undefined ? ok : fail)('גבול אחרי שני קווי ליווי קיים');
  const expected = BEFORE + TOP + lineH + BTM + 2 * lineH;
  (at2 && at2.toState.remainingByRegion['page:1:col:0'] === H - expected
    ? ok : fail)(`הצריכה מדויקת: ריווח ${BEFORE} + עיטור-עליון ${TOP} + כותרת ${lineH} + עיטור-תחתון ${BTM} + 2 קווים`);
  const consume = at2 && at2.transitions.find((tr) => tr.action.kind === 'consume-region' && tr.action.regionId === 'page:1:col:0');
  (consume !== undefined && consume.action.amountLu === expected ? ok : fail)('המעבר מתעד את הצריכה המדויקת (consume-region)');
  // כותרת מרובת קווים — התחתון מהקו האחרון, העליון מהראשון
  const first = Math.floor(H / 20);
  const rest = Math.floor(H / 12);
  const blocksLong = [heading('heading|2|L', [first, rest, rest], 2), block('body|1', Array.from({ length: 6 }, () => LINE(lineH)))];
  const expsL = src(blocksLong).expansions(initial('heading|2|L'));
  const at2L = expsL.find((e) => e.candidateId.endsWith('body|1@2'));
  const expectedL = BEFORE + Math.round(1.25 * first) + first + 2 * rest + Math.round(1.25 * rest) + 2 * lineH;
  (at2L && at2L.toState.remainingByRegion['page:1:col:0'] === H - expectedL ? ok : fail)('מרובת-קווים: העליון מהקו הראשון, התחתון מהאחרון — מדויק');
}

console.log('\n2) ארבעת ה־scopes + הגדרות משנות מדידה');
{
  const lineH = Math.floor(H / 10);
  const blocks = [heading('heading|2|S', [lineH], 2), block('body|1', Array.from({ length: 4 }, () => LINE(lineH)))];
  const mk = (values) => policy.createTorahPolicy(mkSettings(values)).headingBehaviorOf;
  const BEFORE = Math.round(0.22 * H);
  const TOP = Math.round(1.25 * lineH);
  const BTM = Math.round(1.25 * lineH);
  const rem = (behavior) => src(blocks, behavior).expansions(initial('heading|2|S')).find((e) => e.candidateId.endsWith('body|1@2')).toState.remainingByRegion['page:1:col:0'];
  (rem(mk({ 'h2-orn-scope': 'none' })) === H - (BEFORE + lineH + 2 * lineH) ? ok : fail)("scope='none': עיטורים מאופסים; הריווח נשאר (אינו עיטור)");
  const withOrn = H - (BEFORE + TOP + lineH + BTM + 2 * lineH);
  (rem(mk({ 'h2-orn-scope': 'both' })) === withOrn && rem(mk({ 'h2-orn-scope': 'siman_only' })) === withOrn && rem(mk({ 'h2-orn-scope': 'title_only' })) === withOrn
    ? ok : fail)('both/siman_only/title_only: אותם ממדים בדיוק (מיקום התיבות — ל-IR/M8)');
  const custom = mk({ 'h2-top-distance': '10%', 'dim-h2-top-h': '2em', 'dim-h2-btm-h': '0.5em' });
  const expCustom = Math.round(0.1 * H) + Math.round(2 * lineH) + lineH + Math.round(0.5 * lineH) + 2 * lineH;
  (rem(custom) === H - expCustom ? ok : fail)('h2-top-distance/dim-h2-top-h/dim-h2-btm-h נקראים בפועל ומשנים את המדידה');
  const b = policy.createTorahPolicy(mkSettings({ 'h2-orn-scope': 'title_only' })).headingBehaviorOf(2);
  (b.ornaments?.scope === 'title_only' ? ok : fail)('המדיניות מתעדת scope בהתנהגות (לרישום ול-IR)');
}

console.log('\n3) parity + mid-flow + כשל מפורש');
{
  const lineH = Math.floor(H / 10);
  const blocks = [block('body|1', Array.from({ length: 5 }, () => LINE(lineH))), heading('heading|2|R', [lineH], 2), block('body|2', Array.from({ length: 5 }, () => LINE(lineH)))];
  const recto = policy.createTorahPolicy(mkSettings({ 'odd-h2': true }));
  const res = engine.searchPages(initial('body|1'), src(blocks, recto.headingBehaviorOf), new Ledger('decisions'));
  (res.status === 'complete' ? ok : fail)('odd-h2=true: מסלול שלם');
  let h2FromPage = -1;
  for (let i = 0; i < res.path.length; i++) {
    const from = i === 0 ? initial('body|1') : res.path[i - 1].toState;
    if (from.contentCursor.includes('heading|2|R|f0') && res.path[i].toState.contentCursor.includes('body|2')) { h2FromPage = from.physicalPageIndex; break; }
  }
  (h2FromPage > 0 && h2FromPage % 2 === 1 ? ok : fail)(`odd-h2=true: ה-H2 בעמוד recto (${h2FromPage})`);
  // mid-flow: הריווח בעמוד החדש בלבד
  const resMid = engine.searchPages(initial('body|1'), src(blocks), new Ledger('decisions'));
  const openIdx = resMid.path.findIndex((e) => e.candidateId.endsWith('heading|2|R@0:OPEN'));
  (openIdx >= 0 ? ok : fail)('mid-flow: :OPEN פותח את עמוד ה-H2');
  const placed = resMid.path[openIdx + 1];
  const consume = placed && placed.transitions.find((tr) => tr.action.kind === 'consume-region' && tr.action.regionId === 'page:2:col:0');
  (consume !== undefined && consume.action.amountLu >= Math.round(0.22 * H) + Math.round(1.25 * lineH) + lineH + Math.round(1.25 * lineH)
    ? ok : fail)('הריווח והעיטורים נצרכים בעמוד שנפתח עבור ה-H2 (לא בקודם)');
  // כותרת שממלאת את העמוד בלי ליווי (escort=2) ⇒ כשל מפורש
  const big = [heading('heading|2|BIG', Array.from({ length: 5 }, () => LINE(lineH)), 2), block('body|1', Array.from({ length: 4 }, () => LINE(lineH)))];
  let threw = false;
  try { engine.searchPages(initial('heading|2|BIG'), src(big, undefined, { headingEscortLines: 2 }), new Ledger('decisions')); } catch { threw = true; }
  (threw ? ok : fail)('כותרת שממלאת את העמוד בלי ליווי ⇒ כשל מפורש (אין גלישה שקטה)');
}

console.log('\n4) פרוס ממדים + שקילות + מרשם');
{
  (policy.parsePctDimension('22%', 0.5) === 0.22 && policy.parsePctDimension('150%', 0.5) === 0.5 ? ok : fail)("parsePctDimension('22%')=0.22; פסול ⇒ ברירת מחדל");
  (policy.parseEmDimension('1.25em', 2) === 1.25 && policy.parseEmDimension('3x', 2) === 2 ? ok : fail)("parseEmDimension('1.25em')=1.25; פסול ⇒ ברירת מחדל");
  const e = engine.legacyHeadingBehaviorOf(2);
  const p = policy.createTorahPolicy(mkSettings()).headingBehaviorOf(2);
  (JSON.stringify(e.openerSpacing) === JSON.stringify(p.openerSpacing) && e.openerSpacing.spaceBeforePct === 0.22
    ? ok : fail)('שקילות מנוע↔policy: openerSpacing של H2 (22%/1.25em/1.25em — Orange נעול)');
  (policy.headingBehaviorId(p) === 'heading:v1|L2|page-opener|esc2|f1|tbody|s0.22+1.25+1.25' ? ok : fail)('מזהה H2 קנוני כולל את הממדים (נעילת rollback)');
  (policy.torahRegistrySignature().includes('heading.h2.chapter@3') ? ok : fail)('המרשם: heading.h2.chapter@3 (rollback = v2)');
  (policy.torahRuleIssues().length === 0 ? ok : fail)('המרשם תקין');
  // מדיניות מינימלית — אין ריווח
  (policy.createMinimalPolicy(mkSettings()).headingBehaviorOf(2).openerSpacing === undefined ? ok : fail)('מדיניות מינימלית: אין openerSpacing (inline לא פותחת)');
}

console.log('\n5) ההחלטה בתוך ההליכה — אין post-pass (סריקת קוד)');
{
  const cand = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'candidates.ts'), 'utf8');
  (cand.includes('openerBottomPendingLu') && cand.includes('spaceBeforePct * columnHeightLu') ? ok : fail)('הריווח נמדד מגובה הטור; העיטורים מקווי הכותרת — בתוך הליכת הגבולות');
  (cand.includes('ornamentTopEm * firstLineH') && cand.includes('ornamentBottomEm * lastLineH') ? ok : fail)('העליון מהקו הראשון; התחתון מהאחרון');
  const noPostPass = !/function\s+(balance|fix|adjust|postProcess)\w*\(/.test(cand);
  (noPostPass ? ok : fail)('אין פונקציית תיקון אחרי-החלטה');
}

console.log('\n6) רגרסיית בדיקות');
if (SKIP_TESTS) {
  console.log('  [SKIP] TORA_SKIP_TEST_REGRESSION=1 (הסוויטה רצה במלואה בצעד ה-vitest של ה-CI)');
} else {
  const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'packages/layout-engine/test/h2-opener.test.ts']);
  const m = out.match(/Tests\s+(\d+) passed/);
  (m !== null && Number(m[1]) === 10 ? ok : fail)(`בדיקות h2-opener: 10/10 (התקבל ${m ? m[1] : '?'})`);
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${checks - failures}/${checks} בדיקות`);
process.exit(failures === 0 ? 0 : 1);
