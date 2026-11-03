#!/usr/bin/env node
/**
 * verify-policy-torah — אימות שלב 58: חבילת policy-torah וממשק ה־hooks
 * (אפיון §10, §4.1; פרק ח/M7).
 *
 * שער השלב: **אין כלל תורני בתוך layout-engine** — הכל דרך hooks מוזרקים;
 * הליבה אינה "יודעת" מהו H2. המאמת בודק את החבילה (dist), את ההזרקה
 * במנוע בפועל, שקילות ברירות המחדל, את המרשם (rollback = גרסה קודמת)
 * וסריקת קוד לרמות קשיחות.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0; let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1';
const run = (cmd, args) => { try { return execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], env: { ...process.env, NO_COLOR: '1' } }); } catch (e) { return (e.stdout ?? '').toString(); } };

const policy = await import(join(repoRoot, 'packages', 'policy-torah', 'dist', 'index.js'));
const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));
const Ledger = la.DecisionLedgerBuilder;

const mkSettings = (values = {}) => ({ schemaVersion: 1, enginePolicyId: 'torah-v1', values, configHash: 'verify-hash' });

// ─────────────────── תשתית מנוע לבדיקות הזרקה ───────────────────
const templates = engine.buildPageTemplateSet({
  geometry: { pageWidth: 4000000, pageHeight: 5600000, margin: 160000, mainX: 400000, mainWidth: 3200000, columnWidth: 1520000, columnGap: 160000, contentTop: 160000, contentBottom: 5440000 },
  headerHeightLu: 0, footerHeightLu: 0, columns: 2, footnoteColumns: 1, folioPosition: 'bottom_center', showFolio: false, sidenoteWidthLu: null,
});
const H = templates.for('body', 1).regions.find((r) => r.role === 'body-column' && r.columnIndex === 0).rect.height;
let seq = 0;
const LINE = (h) => ({ id: `l-${seq++}`, heightLu: h, footnoteRefs: [], sidenoteRefs: [] });
const block = (id, lines, extra = {}) => ({ blockId: id, role: 'body', lines, ...extra });
const initial = (first) => engine.initialPaginationState({ firstBlockId: first, remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1) });

console.log('1) מדיניות מלאה נטענת בהזרקה — createTorahPolicy');
{
  const p = policy.createTorahPolicy(mkSettings());
  (p.policyId === 'tora-legacy-v1' && p.version === 1 && policy.TORAH_POLICY_ID === 'tora-legacy-v1' && policy.TORAH_POLICY_VERSION === 1 ? ok : fail)('זהות וגרסה: tora-legacy-v1, גרסה 1');
  const roles = [0, 1, 2].map((l) => p.headingBehaviorOf(l).flowRole === 'page-opener' && p.headingBehaviorOf(l).forcePageBreak === true).every(Boolean)
    && p.headingBehaviorOf(3).flowRole === 'full-width-barrier' && p.headingBehaviorOf(3).forcePageBreak === false
    && [4, 5, 6].every((l) => p.headingBehaviorOf(l).flowRole === 'inline')
    && p.headingBehaviorOf(7).flowRole === 'sidenote-stream';
  (roles ? ok : fail)('מיפוי התפקידים H0–H7 לפי legacy (§10.1)');
  const escort = [0, 1, 2, 3, 4, 5, 6].every((l) => p.headingBehaviorOf(l).escortLines === 2) && p.headingBehaviorOf(7).escortLines === 0;
  (escort ? ok : fail)('ליווי ברירת מחדל: 2 ל־H0–H6, 0 ל־H7');
  (p.pagination.allowIntraParagraphBreaks === true && p.pagination.headingEscortLines === 2 && p.pagination.atomicNoteBodies === true && p.pagination.boundaryStride === 1 ? ok : fail)('מדיניות עימוד: תוך-פסקאי/ליווי/אטומיות/stride');
  const notesOk = JSON.stringify(p.notes) === JSON.stringify({ separatorHeightLu: 0, allowLongNoteSplit: false })
    && JSON.stringify(policy.createTorahPolicy(mkSettings({ 'fn-separator-height': 50000, 'fn-allow-split': true })).notes) === JSON.stringify({ separatorHeightLu: 50000, allowLongNoteSplit: true })
    && JSON.stringify(policy.createTorahPolicy(mkSettings({ 'fn-separator-height': -3, 'fn-allow-split': 'yes' })).notes) === JSON.stringify({ separatorHeightLu: 0, allowLongNoteSplit: false });
  (notesOk ? ok : fail)('מדיניות הערות מההגדרות; ערכים פסולים ⇒ ברירות נעולות');
  (p.layout.policyId === 'tora-legacy-v1'
    && JSON.stringify(p.layout.pageTemplate({ parity: 'recto' })) === JSON.stringify({ templateId: 'tpl:body:recto' })
    && JSON.stringify(p.layout.pageTemplate({ parity: 'verso' })) === JSON.stringify({ templateId: 'tpl:body:verso' })
    && p.layout.legalBreaks({}).allow === true && p.layout.hardConstraints({}).violated === false ? ok : fail)('חלק LayoutPolicy: hooks כלליים (§12) + pageTemplate לפי parity');
  (p.rulesSignature === policy.torahRegistrySignature() && p.headingIds === policy.headingBehaviorIds() ? ok : fail)('חתימות: rulesSignature ו-headingIds תואמות למרשם');
  (policy.torahPolicyIssues(p).length === 0 ? ok : fail)('torahPolicyIssues ריק למדיניות תקינה');
  (Object.isFrozen(p) && Object.isFrozen(p.pagination) && Object.isFrozen(p.notes) ? ok : fail)('קפוא: המדיניות, העימוד וההערות');
  const b = policy.createTorahPolicy(mkSettings({ 'fn-separator-height': 999 }));
  (p.rulesSignature === b.rulesSignature && p.headingIds === b.headingIds ? ok : fail)('דטרמיניזם: חתימות זהות בין יצירות (בסיס rollback)');
  const ov = policy.createTorahPolicy(mkSettings(), { 5: { flowRole: 'full-width-barrier', forcePageBreak: false } });
  (ov.headingBehaviorOf(5).flowRole === 'full-width-barrier' && ov.headingBehaviorOf(5).escortLines === 2 && ov.headingBehaviorOf(4).flowRole === 'inline' && policy.torahPolicyIssues(ov).length === 0 ? ok : fail)('overrides: רמה ספציפית מוחלפת, השאר legacy');
}

console.log('\n2) מדיניות מינימלית לא מפיקה כללים — על אותו מנוע');
{
  const p = policy.createMinimalPolicy(mkSettings());
  const allInline = [0, 1, 2, 3, 4, 5, 6, 7].every((l) => p.headingBehaviorOf(l).flowRole === 'inline' && p.headingBehaviorOf(l).forcePageBreak === false && p.headingBehaviorOf(l).escortLines === 0);
  (p.policyId === 'tora-minimal-v1' && allInline && p.pagination.headingEscortLines === 0 ? ok : fail)('הכל inline/בלי-כוח/בלי-ליווי; policyId נפרד');
  (policy.torahPolicyIssues(p).length === 0 && Object.isFrozen(p) ? ok : fail)('מאומתת וקפואה');
}

console.log('\n3) המרשם — מזהים, גרסאות, חתימות (rollback)');
{
  (policy.torahRuleIssues().length === 0 ? ok : fail)('torahRuleIssues ריק');
  const ids = policy.TORAH_RULE_REGISTRY.map((r) => r.ruleId);
  (new Set(ids).size === ids.length && ids.length === policy.torahRuleCount() && policy.TORAH_RULE_REGISTRY.every((r) => r.version >= 1) ? ok : fail)(`מזהים ייחודיים וגרסאות ≥1 (${ids.length} כללים)`);
  const hooks = new Set(policy.TORAH_RULE_REGISTRY.map((r) => r.hook));
  const need = ['heading-behavior', 'legal-breaks', 'note-reservation', 'first-word', 'dibbur', 'drop-word', 'bracket-display', 'chapter-balance', 'running-header', 'folio', 'gematria'];
  (need.every((h) => hooks.has(h)) ? ok : fail)('כיסוי כל ווי M7 במרשם (11 hooks)');
  (policy.torahRegistrySignature() === policy.torahRegistrySignature() && policy.torahRegistrySignature().includes('heading.h0.opener@2') ? ok : fail)('חתימת המרשם דטרמיניסטית וכוללת גרסאות (h0/h1 @2 — שלב 60; rollback = v1)');
  const hid = policy.headingBehaviorIds();
  ([0, 1, 2, 3, 4, 5, 6, 7].every((l) => hid.includes(`${l}:heading:v1|L${l}|`)) && hid === policy.headingBehaviorIds() ? ok : fail)('headingBehaviorIds: 8 רמות, יציב');
}

console.log('\n4) שקילות: ברירות המנוע = ברירות policy-torah (העתק מוחזק זהה)');
{
  let same = true;
  for (let level = 0; level <= 7; level++) {
    const e = engine.legacyHeadingBehaviorOf(level);
    const p = policy.legacyHeadingBehaviorOf(level);
    if (e.flowRole !== p.flowRole || e.forcePageBreak !== p.forcePageBreak || e.escortLines !== p.escortLines) same = false;
  }
  const e9 = engine.legacyHeadingBehaviorOf(42); const p9 = policy.legacyHeadingBehaviorOf(42);
  if (e9.flowRole !== p9.flowRole || e9.escortLines !== p9.escortLines) same = false;
  (same ? ok : fail)('כל רמה 0–7 + רמה לא-מוכרת: זהות מלאה בין המנוע למדיניות');
}

console.log('\n5) הזרקה במחולל המועמדים — ההתנהגות מנצחת את הרמה');
{
  const lineH = Math.floor(H / 10);
  const blocks = [
    block('body|1', [LINE(lineH), LINE(lineH), LINE(lineH)]),
    block('heading|5|X', [LINE(lineH)], { role: 'heading', headingLevel: 5 }),
    block('body|2', [LINE(lineH), LINE(lineH)]),
  ];
  const pol = policy.createTorahPolicy(mkSettings(), { 5: { flowRole: 'full-width-barrier', forcePageBreak: false } });
  const src = engine.createPageCandidateSource({ blocks, templates, pageKind: 'body', headingBehaviorOf: pol.headingBehaviorOf });
  const exps = src.expansions(initial('body|1'));
  const barrier = exps.find((e) => e.candidateId.includes(':H3'));
  (barrier !== undefined ? ok : fail)('H5 שהוזרקה כ-barrier מקבלת מועמד barrier (מסומן :H3)');
  (barrier && barrier.toState.remainingByRegion['page:1:col:0'] === H - 4 * lineH && barrier.toState.remainingByRegion['page:1:col:1'] === H - 4 * lineH ? ok : fail)('שני הטורים מסונכרנים עד תחתית הכותרת');
  (barrier && barrier.toState.physicalPageIndex === 1 && barrier.closesRegion === true ? ok : fail)('נשארת באותו עמוד + סוגרת אזור (§9.2)');
  const srcDefault = engine.createPageCandidateSource({ blocks, templates, pageKind: 'body' });
  (srcDefault.expansions(initial('body|1')).find((e) => e.candidateId.includes(':H3')) === undefined ? ok : fail)('בלי הזרקה: H5 אינה barrier (legacy inline)');

  // H2: legacy סוגרת אזור; מינימלית — לא (אותו מנוע, מדיניות שונה)
  const blocks2 = [
    block('body|1', [LINE(lineH), LINE(lineH), LINE(lineH)]),
    block('heading|2|C', [LINE(lineH)], { role: 'heading', headingLevel: 2 }),
    block('body|2', Array.from({ length: 10 }, () => LINE(lineH))),
  ];
  const legacyExps = engine.createPageCandidateSource({ blocks: blocks2, templates, pageKind: 'body', headingBehaviorOf: policy.legacyHeadingBehaviorOf }).expansions(initial('body|1'));
  const before = legacyExps.find((e) => e.candidateId.includes('→heading|2|C@'));
  (before !== undefined && before.closesRegion === true ? ok : fail)('H2 legacy: הגבול שלפניה סוגר אזור');
  const minExps = engine.createPageCandidateSource({ blocks: blocks2, templates, pageKind: 'body', headingBehaviorOf: policy.createMinimalPolicy(mkSettings()).headingBehaviorOf }).expansions(initial('body|1'));
  const minBefore = minExps.find((e) => e.candidateId.includes('→heading|2|C@'));
  (minBefore !== undefined && (minBefore.closesRegion ?? false) === false ? ok : fail)('H2 מינימלית: אותו גבול אינו סוגר — inline');

  // מסלול שלם עם המדיניות המלאה המוזרקת
  const blocks3 = [
    block('heading|2|C', [LINE(lineH)], { role: 'heading', headingLevel: 2 }),
    block('body|1', Array.from({ length: 12 }, () => LINE(lineH))),
    block('heading|3|S', [LINE(lineH)], { role: 'heading', headingLevel: 3 }),
    block('body|2', Array.from({ length: 8 }, () => LINE(lineH))),
  ];
  const full = policy.createTorahPolicy(mkSettings());
  const runOnce = () => engine.searchPages(initial('heading|2|C'), engine.createPageCandidateSource({ blocks: blocks3, templates, pageKind: 'body', headingBehaviorOf: full.headingBehaviorOf }), new Ledger('decisions'));
  const r1 = runOnce(); const r2 = runOnce();
  (r1.status === 'complete' ? ok : fail)('מסלול שלם עם המדיניות המוזרקת: complete');
  (r1.path.some((e) => e.candidateId.includes(':H3')) && r1.path.some((e) => e.closesRegion) ? ok : fail)('המסלול כולל barrier של H3 וסגירת אזור של H2 — הכל דרך ההתנהגות');
  (JSON.stringify(r1.path.map((e) => e.candidateId)) === JSON.stringify(r2.path.map((e) => e.candidateId)) ? ok : fail)('דטרמיניזם: שתי ריצות — מזהים זהים');
}

console.log('\n6) אימות מבני תופס זיוף');
{
  const badRole = policy.headingBehaviorIssues({ level: 2, flowRole: 'banana', forcePageBreak: false, escortLines: 2, spaceBeforeLu: 0, spaceAfterLu: 0 });
  const openerNoForce = policy.headingBehaviorIssues({ level: 0, flowRole: 'page-opener', forcePageBreak: false, escortLines: 2, spaceBeforeLu: 0, spaceAfterLu: 0 });
  const barrierForce = policy.headingBehaviorIssues({ level: 3, flowRole: 'full-width-barrier', forcePageBreak: true, escortLines: 2, spaceBeforeLu: 0, spaceAfterLu: 0 });
  (badRole.includes('flowRole') && openerNoForce.includes('forcePageBreak:opener-must-force') && barrierForce.includes('forcePageBreak:barrier-must-not-force') ? ok : fail)('headingBehaviorIssues: flowRole/פותח-בלי-כוח/מחסום-עם-כוח');
  (JSON.stringify(policy.headingBehaviorIssues(null)) === JSON.stringify(['not-an-object']) ? ok : fail)('not-an-object');
  const broken = { policyId: 'x', version: 1, layout: { policyId: 'y' }, headingBehaviorOf: (l) => ({ level: l, flowRole: 'inline', forcePageBreak: false, escortLines: 0, spaceBeforeLu: 0, spaceAfterLu: 0 }), rulesSignature: 's', headingIds: 'i' };
  (policy.torahPolicyIssues({}).includes('policyId') && policy.torahPolicyIssues(broken).length === 0 ? ok : fail)('torahPolicyIssues: שדות חסרים/מדיניות מינימלית-תקינה');
}

console.log('\n7) שער השלב: אין כלל תורני בתוך layout-engine (סריקת קוד)');
{
  const engineSrc = join(repoRoot, 'packages', 'layout-engine', 'src');
  const files = [];
  const walk = (dir) => { for (const f of readdirSync(dir, { withFileTypes: true })) { if (f.isDirectory()) walk(join(dir, f.name)); else if (f.name.endsWith('.ts')) files.push(join(dir, f.name)); } };
  walk(engineSrc);
  const offenders = files.filter((f) => /headingLevel\s*===?\s*\d/.test(readFileSync(f, 'utf8')));
  (offenders.length === 0 ? ok : fail)(`אף קובץ מנוע אינו משווה headingLevel למספר קשיח (${files.length} קבצים נסרקו)`);
  const cand = readFileSync(join(engineSrc, 'pagination', 'candidates.ts'), 'utf8');
  (cand.includes('input.headingBehaviorOf ?? legacyHeadingBehaviorOf') ? ok : fail)('הזרקה במחולל: headingBehaviorOf ?? ברירת מחדל מקומית');
  const importsPolicy = files.filter((f) => /from\s+['"]@tora\/policy-torah/.test(readFileSync(f, 'utf8')));
  (importsPolicy.length === 0 ? ok : fail)('המנוע אינו מייבא policy-torah (הזרקה בלבד; גרף §5)');
  const hd = readFileSync(join(engineSrc, 'pagination', 'heading-defaults.ts'), 'utf8');
  (hd.includes('הבעלים האמיתי') ? ok : fail)('heading-defaults מתועד כ-fallback בלבד — policy-torah הוא הבעלים');
}

console.log('\n8) רגרסיית בדיקות החבילה');
if (SKIP_TESTS) {
  console.log('  [SKIP] TORA_SKIP_TEST_REGRESSION=1 (הסוויטה רצה במלואה בצעד ה-vitest של ה-CI)');
} else {
  const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'packages/policy-torah/test/policy-torah.test.ts']);
  const m = out.match(/Tests\s+(\d+) passed/);
  (m !== null && Number(m[1]) === 27 ? ok : fail)(`בדיקות policy-torah: 27/27 (התקבל ${m ? m[1] : '?'})`);
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${checks - failures}/${checks} בדיקות`);
process.exit(failures === 0 ? 0 : 1);
