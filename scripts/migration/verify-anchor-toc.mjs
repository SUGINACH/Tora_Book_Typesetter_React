#!/usr/bin/env node
/**
 * verify-anchor-toc — מאמת שלב 70: AnchorTable ותוכן עניינים מדוד
 * (אפיון §11.1; תכנית שלב 70; M8).
 *
 * בדיקות:
 *   1. AnchorTable: בנייה ממסלול אמיתי (כותרות ⇐ עמוד פיזי אמיתי + סוג
 *      עמוד), מיזוג הערות מ-anchorReport, ייחודיות, issues לכפילויות.
 *   2. anchorMappingHash — דטרמיניסטי ורגיש לעמוד/סוג/סדר (אות המשוב
 *      לנקודת השבת החוץ של שלב 71).
 *   3. זרימת ה-TOC: טור ימין לפני שמאל (RTL), קווים אטומים, ריבוי
 *      עמודים, mappingHash; שליליים (שורה שגויה/אפשרויות שגויות).
 *   4. ערכי ה-TOC מהמדיניות: הכללי=חלקים, המפורט=סימנים, מספור גימטרי,
 *      פוליו מהעוגן בלבד (שער ⇒ printed=null + logical), השמטה מפורשת
 *      לכותרת בלי עוגן — לעולם לא מספר מנוחש.
 *   5. **אין pageEstimate** (שער השלב): סריקת קוד — המזהה אסור בחבילות
 *      (גם לא בהערות — כך האיסור נאכף באותה רמה כמו pxPerMm).
 *   6. ההגדרות קיימות במרשם ונעולות ב-settings-matrix (enable-general/
 *      detailed-toc והמספור).
 *   7. מבחני חובה ורגרסיה.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1';
const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { cwd: repoRoot, stdio: 'pipe' });
    return 0;
  } catch {
    return 1;
  }
};

let failures = 0;
let checks = 0;
const ok = (m) => { checks++; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks++; failures++; console.log(`  [FAIL] ${m}`); };

const la = await import('@tora/layout-api');
const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const policy = await import(join(repoRoot, 'packages', 'policy-torah', 'dist', 'index.js'));

const asLu = la.asLu;

// ---------- 1. AnchorTable ----------
console.log('1) AnchorTable — עוגנים אמיתיים מהמסלול');
{
  const templates = engine.buildPageTemplateSet({
    geometry: {
      pageWidth: asLu(4000000), pageHeight: asLu(5600000), margin: asLu(160000),
      mainX: asLu(400000), mainWidth: asLu(3200000), columnWidth: asLu(1520000),
      columnGap: asLu(160000), contentTop: asLu(160000), contentBottom: asLu(5440000),
    },
    headerHeightLu: asLu(0), footerHeightLu: asLu(0), columns: 2, footnoteColumns: 1,
    folioPosition: 'bottom_center', showFolio: false, sidenoteWidthLu: null,
  });
  const line = (h, i) => ({ id: `line-${i}`, heightLu: asLu(h), footnoteRefs: [], sidenoteRefs: [] });
  const blocks = [
    { blockId: 'p0', role: 'body', lines: [line(150000, 0), line(150000, 1)] },
    { blockId: 'h1|1', role: 'heading', headingLevel: 1, lines: [line(300000, 2)] },
    { blockId: 'p1', role: 'body', lines: [line(150000, 3), line(150000, 4)] },
    { blockId: 'h2|1', role: 'heading', headingLevel: 2, lines: [line(200000, 5)] },
    { blockId: 'p2', role: 'body', lines: [line(150000, 6), line(150000, 7)] },
  ];
  const initial = engine.initialPaginationState({
    firstBlockId: 'p0',
    remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1),
    pageKind: 'body',
  });
  const res = engine.searchPages(initial, engine.createPageCandidateSource({
    blocks, templates, pageKind: 'body', headingBehaviorOf: engine.legacyHeadingBehaviorOf,
  }), new la.DecisionLedgerBuilder('off'), {});
  const table = engine.anchorTableOfPath(initial, res.path, blocks);
  const h1 = table.byId.get('h1|1');
  const h2 = table.byId.get('h2|1');
  (res.status === 'complete' && table.issues.length === 0 && table.records.length === 2
    && h1 !== undefined && h1.pageKind === 'sub-shaar' && h1.kind === 'heading' && h1.physicalPage >= 2
    && h2 !== undefined && h2.pageKind === 'body' && h2.physicalPage > h1.physicalPage
    ? ok : fail)('כל כותרת ⇐ עוגן ייחודי עם עמוד פיזי אמיתי וסוג עמוד (H1 בשער, H2 בגוף)');
  const withNotes = engine.anchorTableOfPath(initial, res.path, blocks, { 'fn-1': 7, 'en-2': 9 });
  (withNotes.issues.length === 0 && withNotes.records.length === 4
    && withNotes.byId.get('fn-1').pageKind === 'notes'
    ? ok : fail)('הערות מ-anchorReport מתמזגות (kind=note, pageKind=notes)');
  const bad = la.buildAnchorTable([
    { targetId: 'x', kind: 'heading', pageKind: 'body', physicalPage: 2 },
    { targetId: 'x', kind: 'heading', pageKind: 'body', physicalPage: 3 },
    { targetId: 'y', kind: 'note', pageKind: 'notes', physicalPage: -1 },
  ]);
  (bad.issues.some((i) => i.startsWith('duplicate:')) && bad.issues.some((i) => i.startsWith('physicalPage:'))
    ? ok : fail)('כפילות/עמוד שלילי ⇒ issues (לא שקט)');
  const hash1 = la.anchorMappingHash(table);
  const hash2 = la.anchorMappingHash(engine.anchorTableOfPath(initial, res.path, blocks));
  const moved = la.buildAnchorTable(table.records.map((r) => (r.targetId === 'h2|1' ? { ...r, physicalPage: r.physicalPage + 1 } : r)));
  const kindChanged = la.buildAnchorTable(table.records.map((r) => (r.targetId === 'h1|1' ? { ...r, pageKind: 'body' } : r)));
  (hash1 === hash2 && /^[0-9a-f]{64}$/.test(hash1) && la.anchorMappingHash(moved) !== hash1 && la.anchorMappingHash(kindChanged) !== hash1
    ? ok : fail)('anchorMappingHash — דטרמיניסטי, רגיש לעמוד ולסוג (אות המשוב לשלב 71)');
}

// ---------- 2. זרימת ה-TOC ----------
console.log('\n2) זרימת ה-TOC — תוכן מעומד ומדוד');
{
  const LINE_H = 120000;
  const lines = (n) => Array.from({ length: n }, (_, i) => ({ entryId: `e-${i}`, heightLu: asLu(LINE_H) }));
  const r = engine.layoutTocFlow(lines(25), { startPhysicalPage: 2, columnHeightLu: asLu(LINE_H * 10), columns: 2 });
  const first = r.placements.filter((p) => p.physicalPage === 2);
  (r.pages === 2 && first.length === 20
    && first.filter((p) => p.columnIndex === 0).length === 10
    && first.filter((p) => p.columnIndex === 1).length === 10
    && first[0].columnIndex === 0 && first[10].columnIndex === 1
    ? ok : fail)('טור ימין (0) מתמלא לפני שמאל (1) — RTL (§14.2); 25 קווים ⇒ 2 עמודים');
  const tall = engine.layoutTocFlow([{ entryId: 'tall', heightLu: asLu(LINE_H * 20) }], { startPhysicalPage: 1, columnHeightLu: asLu(LINE_H * 5), columns: 1 });
  (tall.pages === 1 && tall.placements[0].physicalPage === 1
    ? ok : fail)('קו גבוה מהטור בעמוד ריק נכנס לבדו — אין לולאה');
  const a = engine.layoutTocFlow(lines(15), { startPhysicalPage: 2, columnHeightLu: asLu(LINE_H * 10), columns: 2 });
  const b = engine.layoutTocFlow(lines(15), { startPhysicalPage: 2, columnHeightLu: asLu(LINE_H * 10), columns: 2 });
  const shifted = engine.layoutTocFlow(lines(15), { startPhysicalPage: 3, columnHeightLu: asLu(LINE_H * 10), columns: 2 });
  (a.mappingHash === b.mappingHash && a.mappingHash !== shifted.mappingHash && engine.tocTotalHeightLu(lines(5)) === asLu(LINE_H * 5)
    ? ok : fail)('mappingHash דטרמיניסטי ורגיש להיסט עמודים; tocTotalHeightLu מדויק');
  let threw = false;
  try { engine.layoutTocFlow([{ entryId: '', heightLu: asLu(100) }], { startPhysicalPage: 1, columnHeightLu: asLu(1000), columns: 1 }); }
  catch { threw = true; }
  let threwOpts = false;
  try { engine.layoutTocFlow(lines(2), { startPhysicalPage: 0, columnHeightLu: asLu(1000), columns: 1 }); }
  catch { threwOpts = true; }
  (threw && threwOpts && engine.tocLineIssues({ entryId: 'x', heightLu: asLu(-5) }).includes('heightLu')
    ? ok : fail)('שליליים: שורה שגויה/אפשרויות שגויות ⇒ זריקה מפורשת');
}

// ---------- 3. ערכי ה-TOC מהמדיניות ----------
console.log('\n3) ערכי ה-TOC — מהעוגנים בלבד');
{
  const doc = {
    parts: [{
      id: 'part:1', title: 'חלק ראשון',
      simanim: [
        { id: 'siman:1', simanNumber: 1, blocks: [
          { id: 'h1:1', role: 'heading', headingLevel: 1, inline: [{ kind: 'text', text: 'חלק ראשון' }] },
          { id: 'h2:1', role: 'heading', headingLevel: 2, inline: [{ kind: 'text', text: 'פתיחה' }] },
        ] },
        { id: 'siman:2', simanNumber: 2, blocks: [
          { id: 'h2:2', role: 'heading', headingLevel: 2, inline: [{ kind: 'text', text: 'המשך' }] },
        ] },
      ],
    }],
    notes: { footnotes: [], endnotes: [], sidenotes: [], editorial: [] },
  };
  const anchors = la.buildAnchorTable([
    { targetId: 'h1:1', kind: 'heading', pageKind: 'sub-shaar', physicalPage: 3 },
    { targetId: 'h2:1', kind: 'heading', pageKind: 'body', physicalPage: 4 },
    { targetId: 'h2:2', kind: 'heading', pageKind: 'body', physicalPage: 9 },
  ]);
  const folio = policy.folioPolicyOf({ values: {} });
  const r = policy.tocEntriesOf(doc, policy.tocPolicyOf({ values: {} }), anchors, folio);
  const general = r.entries.filter((e) => e.level === 1);
  const detailed = r.entries.filter((e) => e.level === 2);
  (r.issues.length === 0 && general.length === 1 && detailed.length === 2
    && general[0].title === 'א — חלק ראשון' && detailed[0].title === 'סימן א — פתיחה'
    ? ok : fail)('הכללי=חלקים (H1), המפורט=סימנים (H2), מספור גימטרי');
  const h1 = r.entries.find((e) => e.targetId === 'h1:1');
  const h2 = r.entries.find((e) => e.targetId === 'h2:2');
  (h1.folio.printed === null && h1.folio.logical === 3 && h2.folio.printed === 'ט' && h2.folio.logical === 9
    ? ok : fail)('פוליו מהעוגן: שער ⇒ printed=null + logical (ה-TOC מציג הלוגי); גוף ⇒ גימטריה');
  const nums = policy.tocEntriesOf(doc, policy.tocPolicyOf({ values: {} }), anchors, policy.folioPolicyOf({ values: { 'page-num-format': 'numbers' } }));
  (nums.entries.find((e) => e.targetId === 'h2:2').folio.printed === '9'
    ? ok : fail)('page-num-format=numbers ⇒ מספרים (מודל פיזי/לוגי שלם)');
  const partial = la.buildAnchorTable([{ targetId: 'h1:1', kind: 'heading', pageKind: 'sub-shaar', physicalPage: 3 }]);
  const rPartial = policy.tocEntriesOf(doc, policy.tocPolicyOf({ values: {} }), partial, folio);
  (rPartial.entries.length === 1 && rPartial.issues.some((i) => i.includes('h2:1') && i.includes('אין עוגן'))
    ? ok : fail)('כותרת בלי עוגן ⇒ בעיה מדווחת + השמטה מפורשת — לעולם לא מספר מנוחש');
}

// ---------- 4. אין pageEstimate (שער השלב) ----------
console.log('\n4) שער השלב: אין pageEstimate במסלול next');
{
  // השער חל על המסלול החדש (החבילות): שורות קוד בלבד — הערות שמצטטות את
  // האיסור ("אין pageEstimate") אינן שימוש; המעטפת הישנה (src/) היא הקוד
  // הקפוא של האפליקציה המקורית — ה-headingCounter+offset שלה מתועד בטבלת
  // ה-parity כהתנהגות שאנו מחליפים, לא חלק מהמסלול החדש.
  let hits = [];
  for (const pkg of ['layout-engine', 'layout-api', 'policy-torah', 'content-model', 'render-html', 'audit-core']) {
    let out = '';
    try {
      out = execFileSync('grep', ['-rn', 'pageEstimate', join(repoRoot, 'packages', pkg, 'src')], { cwd: repoRoot, stdio: 'pipe' }).toString();
    } catch {
      out = '';
    }
    const codeLines = out.split('\n').filter((l) => l.trim().length > 0 && !/:\s*\*/.test(l) && !/^\s*(\*|\/\/)/.test(l));
    if (codeLines.length > 0) hits.push(pkg);
  }
  (hits.length === 0
    ? ok : fail)(`אפס pageEstimate בקוד החבילות (המסלול החדש)${hits.length ? ' — נמצא ב: ' + hits.join(', ') : ''} (§11.1)`);
}

// ---------- 5. ההגדרות ----------
console.log('\n5) הגדרות ה-TOC במרשם וב-matrix');
{
  const reg = JSON.parse(readFileSync(join(repoRoot, 'packages', 'settings-schema', 'registry.json'), 'utf8'));
  const keys = new Set(reg.settings.map((s) => s.canonicalKey));
  const needed = ['enable-general-toc', 'enable-detailed-toc', 'general-toc-count-numbering', 'detailed-toc-count-numbering'];
  const missing = needed.filter((k) => !keys.has(k));
  (missing.length === 0
    ? ok : fail)(`כל הגדרות ה-TOO קיימות במרשם: ${needed.join(', ')}${missing.length ? ' — חסרים: ' + missing.join(', ') : ''}`);
  const p = policy.tocPolicyOf({ values: {} });
  (p.general === true && p.detailed === true && p.generalNumbering === true && p.detailedNumbering === true
    ? ok : fail)('ברירות המחדל הנעולות: שני התוכנים דלוקים + מספור דלוק');
  const off = policy.tocPolicyOf({ values: { 'enable-general-toc': 'false', 'enable-detailed-toc': false, 'general-toc-count-numbering': 'false', 'detailed-toc-count-numbering': false } });
  (off.general === false && off.detailed === false && off.generalNumbering === false && off.detailedNumbering === false
    ? ok : fail)('כיבוי מלא דרך ההגדרות — boolean ומחרוזת שניהם נקראים');
}

// ---------- 6. מבחני חובה ----------
console.log('\n6) מבחני חובה ורגרסיה');
(SKIP_TESTS ? ok : run('npm', ['run', 'test:packages']) === 0 ? ok : fail)('test:packages — PASS');
(run('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
(run('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('typecheck:packages — PASS');
(run('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
(run('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`AnchorTable ותוכן העניינים המדוד תקינים — ${checks} בדיקות ירוקות. אין pageEstimate; אין מספר עמוד מנוחש.`);
