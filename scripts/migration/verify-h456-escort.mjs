#!/usr/bin/env node
/**
 * verify-h456-escort — אימות שלב 63: H4–H6 — כותרות inline וליווי (escort)
 * (אפיון §10.1, §14.2; פרק ח/M7).
 *
 * שער השלב: **אין כותרת תלויה בכל ה-fixtures** — מבקר hangingHeadingsOf
 * ריק על כל שילובי הליווי; הליווי לפי רמה מההתנהגות המוזרקת; חריג
 * קץ-מסמך; סגנון inline במדיניות.
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
const heading = (id, hs, level) => block(id, hs.map((h) => LINE(h)), { role: 'heading', headingLevel: level });
const initial = (first) => engine.initialPaginationState({ firstBlockId: first, remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1) });
const src = (blocks, behaviorOf) => engine.createPageCandidateSource({ blocks, templates, pageKind: 'body', ...(behaviorOf ? { headingBehaviorOf: behaviorOf } : {}) });
const mkSettings = (values = {}) => ({ schemaVersion: 1, enginePolicyId: 'torah-v1', values, configHash: 'v' });
const fullPolicy = policy.createTorahPolicy(mkSettings());

console.log('1) ליווי לפי רמה — מההתנהגות המוזרקת');
{
  const lineH = Math.floor(H / 10);
  const blocks = [block('body|0', [LINE(lineH)]), heading('heading|4|A', [lineH], 4), block('body|1', Array.from({ length: 6 }, () => LINE(lineH)))];
  const custom = (level) => (level === 4 ? { flowRole: 'inline', forcePageBreak: false, escortLines: 3 } : policy.legacyHeadingBehaviorOf(level));
  const exps = src(blocks, custom).expansions(initial('body|0'));
  const bad = exps.filter((e) => /body\|1@[012]$/.test(e.candidateId));
  const good = exps.some((e) => e.candidateId.endsWith('body|1@3'));
  (bad.length === 0 && good ? ok : fail)('H4 עם escort 3: גבולות @0/@1/@2 אסורים; @3 חוקי — לפי רמה');
  const dflt = src(blocks, fullPolicy.headingBehaviorOf).expansions(initial('body|0'));
  (dflt.some((e) => e.candidateId.endsWith('body|1@2')) && !dflt.some((e) => e.candidateId.endsWith('body|1@1')) ? ok : fail)('ברירת המחדל H4: escort 2');
  // H7 — זרם צד, escort 0, אינה בלוק גוף
  (fullPolicy.headingBehaviorOf(7).escortLines === 0 && fullPolicy.headingBehaviorOf(7).flowRole === 'sidenote-stream' ? ok : fail)('H7: זרם צד — escort 0, לא בלוק גוף');
}

console.log('\n2) שער השלב: אין כותרת תלויה — מבקר ריק על כל שילובי הליווי');
{
  const lineH = Math.floor(H / 10);
  const cases = [
    ['אמצע זרימה', [block('body|1', Array.from({ length: 8 }, () => LINE(lineH))), heading('heading|4|B', [lineH], 4), block('body|2', Array.from({ length: 8 }, () => LINE(lineH)))]],
    ['סוף טור', [block('body|1', Array.from({ length: 9 }, () => LINE(lineH))), heading('heading|4|C', [lineH], 4), block('body|2', Array.from({ length: 9 }, () => LINE(lineH)))]],
    ['H5+H6 רצופות (קבוצה)', [block('body|1', Array.from({ length: 5 }, () => LINE(lineH))), heading('heading|5|D', [lineH], 5), heading('heading|6|E', [lineH], 6), block('body|2', Array.from({ length: 5 }, () => LINE(lineH)))]],
    ['לפני פותחת (חריג)', [block('body|1', Array.from({ length: 4 }, () => LINE(lineH))), heading('heading|4|F', [lineH], 4), heading('heading|2|G', [lineH], 2), block('body|2', Array.from({ length: 4 }, () => LINE(lineH)))]],
    ['מסתיים בכותרת', [block('body|1', Array.from({ length: 4 }, () => LINE(lineH))), heading('heading|4|LAST', [lineH], 4)]],
    ['עם הערות', (function () { const b = [block('body|1', Array.from({ length: 6 }, (i) => i === 2 ? LINE(lineH, { footnoteRefs: ['note:v1|doc|footnote|1'] }) : LINE(lineH))), heading('heading|5|N', [lineH], 5), block('body|2', Array.from({ length: 6 }, () => LINE(lineH)))]; return { blocks: b, bodies: new Map([['note:v1|doc|footnote|1', engine.makeNoteBodySpec('note:v1|doc|footnote|1', [lineH])]]) }; })()],
  ];
  let allOk = true;
  for (const [name, spec] of cases) {
    const blocks = Array.isArray(spec) ? spec : spec.blocks;
    const bodies = Array.isArray(spec) ? undefined : spec.bodies;
    const s = engine.createPageCandidateSource({ blocks, templates, pageKind: 'body', headingBehaviorOf: fullPolicy.headingBehaviorOf, ...(bodies ? { noteBodies: bodies } : {}) });
    const res = engine.searchPages(initial(blocks[0].blockId), s, new Ledger('decisions'));
    const hanging = engine.hangingHeadingsOf(initial(blocks[0].blockId), res.path, blocks, (l) => fullPolicy.headingBehaviorOf(l).escortLines);
    if (res.status !== 'complete' || hanging.length > 0) { allOk = false; fail(`${name}: ${res.status}, תלויות=${hanging.length}`); }
    else ok(`${name}: complete, אין כותרת תלויה`);
  }
  // המבקר תופס זיוף: מסלול עם escortOf=0 מדווח על כותרת עם 0 ליווי בסוף טור? — המנוע אוסר זאת ממילא;
  // בדיקת החריגים: escortOf גבוה מדי במבקר בלבד (לא במנוע) תופסת תלייה אמיתית לכאורה — המבקר עקבי למנוע
  void allOk;
}

console.log('\n3) חריג קץ-מסמך + סגנון inline במדיניות');
{
  const lineH = Math.floor(H / 10);
  const blocks = [block('body|1', Array.from({ length: 4 }, () => LINE(lineH))), heading('heading|5|END', [lineH], 5)];
  const res = engine.searchPages(initial('body|1'), src(blocks, fullPolicy.headingBehaviorOf), new Ledger('decisions'));
  (res.status === 'complete' && res.finalState.contentCursor.includes('heading|5|END|f1') ? ok : fail)('מסמך המסתיים בכותרת: complete (חריג קץ-מסמך — בלי זאת נתקע)');
  (engine.hangingHeadingsOf(initial('body|1'), res.path, blocks, (l) => fullPolicy.headingBehaviorOf(l).escortLines).length === 0 ? ok : fail)('המבקר: כותרת בקצה המסמך אינה תלויה');
  const p = policy.createTorahPolicy(mkSettings());
  (p.headingBehaviorOf(4).inlineStyle?.font.includes('Alpha') && p.headingBehaviorOf(6).inlineStyle?.size === '10.5' ? ok : fail)('ברירות הסגנון מ-Orange (f-h*/s-h*): Alpha/12.5 … Noto/10.5');
  const pCustom = policy.createTorahPolicy(mkSettings({ 'f-h4': 'David', 's-h4': '14' }));
  (pCustom.headingBehaviorOf(4).inlineStyle?.font === 'David' && pCustom.headingBehaviorOf(4).inlineStyle?.size === '14' ? ok : fail)('ההגדרות דורסות את הסגנון (rollback להגדרה)');
  (policy.torahRegistrySignature().includes('heading.h456.inline@2') ? ok : fail)('המרשם: heading.h456.inline@2 (rollback = v1)');
  (policy.torahRuleIssues().length === 0 ? ok : fail)('המרשם תקין');
}

console.log('\n4) letter-spacing — תחום מועמדי-הקו (§8); סריקת קוד');
{
  const cand = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'candidates.ts'), 'utf8');
  (cand.includes('escortAfterHeading = Math.max(policy.headingEscortLines') ? ok : fail)('הליווי: מקסימום(מדיניות שטוחה, התנהגות לפי רמה) — בתוך ההליכה');
  (cand.includes('!atEndOfDoc') ? ok : fail)('חריג קץ-מסמך בכלל הליווי (בלי זאת מסמך המסתיים בכותרת נתקע)');
  (cand.includes('export function hangingHeadingsOf') ? ok : fail)('מבקר hangingHeadingsOf מיוצא (שער ה-fixtures)');
  const noLetterSpacingInEngine = !/letter[-_]?spacing/i.test(cand);
  (noLetterSpacingInEngine ? ok : fail)('letter-spacing אינו במנוע העימוד — תחום מועמדי-הקו עם fingerprint נפרד (§8)');
}

console.log('\n5) רגרסיית בדיקות');
if (SKIP_TESTS) {
  console.log('  [SKIP] TORA_SKIP_TEST_REGRESSION=1 (הסוויטה רצה במלואה בצעד ה-vitest של ה-CI)');
} else {
  const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'packages/layout-engine/test/h456-escort.test.ts']);
  const m = out.match(/Tests\s+(\d+) passed/);
  (m !== null && Number(m[1]) === 6 ? ok : fail)(`בדיקות h456-escort: 6/6 (התקבל ${m ? m[1] : '?'})`);
  const out2 = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'packages/layout-engine/test/page-candidates.test.ts']);
  const m2 = out2.match(/Tests\s+(\d+) passed/);
  (m2 !== null ? ok : fail)(`רגרסיית page-candidates (מנגנון הליווי משלב 52): ${m2 ? m2[1] : '?'} ירוקות`);
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${checks - failures}/${checks} בדיקות`);
process.exit(failures === 0 ? 0 : 1);
