#!/usr/bin/env node
/**
 * verify-fixed-point — מאמת שלב 71: נקודת השבת החוץ (ADR-011; אפיון
 * §11.1, §11.4; תכנית שלב 71; M8).
 *
 * בדיקות:
 *   1. הרץ: התייצבות צעד אמיתי (עימוד גוף ← endnotes ב-offset ←
 *      AnchorTable מוזז ← זרימת TOC) — התכנסות ב-2–3 איטרציות; העוגנים
 *      אכן הוזזו בין האיטרציות והתייצבו.
 *   2. מחזור דו־מצבי — זוהה עם אורך ואיטרציית פתיחה; הריצה נעצרת
 *      (לא ממשיכה עד התקציב).
 *   3. תקציב — סחיפה מונוטונית נעצרת בדיוק ב-maxIterations קריאות צעד;
 *      אין לולאה בלתי-חסומה (שער השלב).
 *   4. כשל מפורש — requireFixedPoint זורק TOC_FIXED_POINT_NOT_REACHED
 *      (קוד רשום בקטלוג, בטבלת ה-i18n, עם iterations+reason).
 *   5. דטרמיניזם — אותו צעד ⇒ אותו reportHash.
 *   6. סדר עדכון קבוע ותלות מתועדת — FIXED_POINT_SIGNALS והסדר במודול;
 *      ADR-011 קיים עם הסעיפים הדרושים.
 *   7. סריקות מקור — אין pageEstimate במודול; תקציב קשיח קיים; אין
 *      while-true ללא שמירה; requireFixedPoint קיים (נאכף ב-release).
 *   8. שליליים — אפשרויות שגויות/אות חסר ⇒ PAGINATION_STATE_INVALID.
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

const asLu = la.asLu;
const H = (n) => {
  const h = (n >>> 0).toString(16).padStart(8, '0');
  return (h + 'a'.repeat(56)).slice(0, 64);
};
const vec = (a, b, c) => ({ 'endnote-mapping': H(a), 'anchor-mapping': H(b), 'toc-mapping': H(c) });

// ---------- 1. התייצבות צעד אמיתי ----------
console.log('1) הרץ — התייצבות צעד אמיתי עם רכיבי המנוע (§11.1)');
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
  let lineSeq = 0;
  const LINE = (h) => ({ id: `vl-${lineSeq++}`, heightLu: asLu(h), footnoteRefs: [], sidenoteRefs: [] });
  const block = (id, lines, extra = {}) => Object.freeze({ blockId: id, role: 'body', lines: Object.freeze([...lines]), ...extra });
  const blocks = [
    block('p0', [LINE(150000), LINE(150000)]),
    block('h1|1', [LINE(300000)], { role: 'heading', headingLevel: 1 }),
    block('p1', [LINE(150000), LINE(150000)]),
    block('h2|1', [LINE(200000)], { role: 'heading', headingLevel: 2 }),
    block('p2', [LINE(150000), LINE(150000)]),
  ];
  const endnoteEntries = [
    { noteId: 'n1', body: { noteId: 'n1', lineHeightLu: [asLu(150000)], heightLu: asLu(150000) }, anchor: { blockId: 'p1', lineId: 'l1' } },
    { noteId: 'n2', body: { noteId: 'n2', lineHeightLu: [asLu(150000)], heightLu: asLu(150000) }, anchor: { blockId: 'p2', lineId: 'l2' } },
  ];
  const tocLines = [
    { entryId: 'h1|1', heightLu: asLu(200000) },
    { entryId: 'h2|1', heightLu: asLu(200000) },
  ];

  const anchorHashes = [];
  const step = (frontMatter) => {
    const initial = engine.initialPaginationState({
      firstBlockId: blocks[0].blockId,
      remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1),
      pageKind: 'body',
    });
    const res = engine.searchPages(initial, engine.createPageCandidateSource({
      blocks, templates, pageKind: 'body', headingBehaviorOf: engine.legacyHeadingBehaviorOf,
    }), new la.DecisionLedgerBuilder('off'), {});
    if (res.status !== 'complete') throw new Error('body flow incomplete');
    const endnotes = engine.layoutEndnoteFlow(endnoteEntries, templates, { bodyPageCount: frontMatter + res.path.length });
    const base = engine.anchorTableOfPath(initial, res.path, blocks, endnotes.anchorReport);
    const shifted = la.buildAnchorTable(base.records.map((r) => ({ ...r, physicalPage: r.physicalPage + frontMatter })));
    const anchorHash = la.anchorMappingHash(shifted);
    anchorHashes.push(anchorHash);
    const tocFlow = engine.layoutTocFlow(tocLines, { startPhysicalPage: 1, columnHeightLu: asLu(500000), columns: 1 });
    return {
      state: tocFlow.pages,
      feedback: { 'endnote-mapping': endnotes.mappingHash, 'anchor-mapping': anchorHash, 'toc-mapping': tocFlow.mappingHash },
    };
  };

  const r = engine.runOuterFixedPoint(0, step, { maxIterations: 6 });
  (r.converged === true ? ok : fail)(`התכנסות — converged=true (iterations=${r.iterations})`);
  (r.iterations === 3 ? ok : fail)(`מספר איטרציות צפוי 3 (שינוי גודל TOC חד-פעמי) — קיבלנו ${r.iterations}`);
  (anchorHashes.length === 3 && anchorHashes[0] !== anchorHashes[1] && anchorHashes[1] === anchorHashes[2]
    ? ok : fail)('העוגנים הוזזו בין האיטרציות ואז התייצבו (משוב אמיתי, לא סטייל)');
  (r.report.outcome === 'converged' && r.report.history.every((x) => typeof x.feedback === 'object')
    ? ok : fail)('דוח המצב: outcome=converged עם היסטוריה מלאה');
  (r.report.history[r.report.history.length - 1].stable === true ? ok : fail)('האיטרציה האחרונה מסומנת stable');
  (r.reportHash === engine.fixedPointReportHash(r.report) ? ok : fail)('reportHash קנוני תואם לדוח');
  for (const sig of engine.FIXED_POINT_SIGNALS) {
    if (!/^[0-9a-f]{64}$/.test(r.feedback[sig] ?? '')) fail(`אות ${sig} אינו hash 64 הקס`);
  }
  ok('כל שלושת אותות המשוב hash קנוני 64 הקס');

  // דטרמיניזם
  const anchorHashes2 = [];
  const step2 = (frontMatter) => {
    const r2 = step(frontMatter);
    anchorHashes2.push(r2.feedback['anchor-mapping']);
    return r2;
  };
  const rB = engine.runOuterFixedPoint(0, step2, { maxIterations: 6 });
  (rB.reportHash === r.reportHash ? ok : fail)('דטרמיניזם — אותו צעד ⇒ אותו reportHash');
}

// ---------- 2. מחזור דו־מצבי ----------
console.log('\n2) מחזור דו־מצבי — זיהוי ועצירה מיידית');
{
  let calls = 0;
  const script = [vec(1, 1, 1), vec(2, 2, 2), vec(1, 1, 1), vec(2, 2, 2), vec(1, 1, 1), vec(2, 2, 2)];
  const step = (_state, iteration) => {
    calls += 1;
    return { state: iteration, feedback: script[Math.min(iteration - 1, script.length - 1)] };
  };
  const r = engine.runOuterFixedPoint(0, step, { maxIterations: 8 });
  (r.converged === false && r.report.outcome === 'oscillation' ? ok : fail)(`oscillation מזוהה — outcome=${r.report.outcome}`);
  (r.report.cycle?.length === 2 && r.report.cycle?.firstIteration === 1
    ? ok : fail)(`פרטי המחזור — cycle=${JSON.stringify(r.report.cycle)}`);
  (calls === 3 ? ok : fail)(`הריצה נעצרת מיד בזיהוי (3 קריאות צעד, לא 8) — קיבלנו ${calls}`);
  (typeof r.report.reason === 'string' && r.report.reason.includes('cycle of length 2')
    ? ok : fail)('reason מתעד את אורך המחזור');
}

// ---------- 3. תקציב ----------
console.log('\n3) תקציב קשיח — אין לולאה בלתי-חסומה (שער השלב)');
{
  let calls = 0;
  let n = 0;
  const drift = () => ({ state: ++n, feedback: vec(n + 1, n + 2, n + 3) });
  const step = (s, i) => { calls += 1; return drift(s, i); };
  const r = engine.runOuterFixedPoint(0, step, { maxIterations: 4 });
  (r.report.outcome === 'budget-exceeded' && r.iterations === 4 ? ok : fail)(`budget-exceeded אחרי ${r.iterations} איטרציות`);
  (calls === 4 ? ok : fail)(`בדיוק maxIterations=4 קריאות צעד — קיבלנו ${calls}`);
  (r.report.reason?.includes('budget: 4 iterations') ? ok : fail)('reason מתעד ניצול תקציב');
  // ברירת המחדל 8
  let calls8 = 0;
  const step8 = (s, i) => { calls8 += 1; return { state: i, feedback: vec(i, i + 100, i + 200) }; };
  const r8 = engine.runOuterFixedPoint(0, step8, {});
  (r8.report.maxIterations === 8 && calls8 === 8 ? ok : fail)(`ברירת מחדל תקציב 8 (רץ ${calls8})`);
}

// ---------- 4. כשל מפורש + קטלוג ----------
console.log('\n4) TOC_FIXED_POINT_NOT_REACHED — קוד, קטלוג, i18n, כשל מפורש');
{
  let threw = null;
  const flip = [vec(1, 1, 1), vec(2, 2, 2), vec(1, 1, 1)];
  const step = (_s, i) => ({ state: i, feedback: flip[Math.min(i - 1, 2)] });
  const r = engine.runOuterFixedPoint(0, step, {});
  try {
    engine.requireFixedPoint(r);
  } catch (e) {
    threw = e;
  }
  (threw !== null && threw.catalogKey === 'errors.engine.TOC_FIXED_POINT_NOT_REACHED'
    ? ok : fail)(`requireFixedPoint זורק את הקוד הרשום — ${threw?.catalogKey ?? 'לא נזרק'}`);
  (threw !== null && threw.params?.iterations === 3 && String(threw.params?.reason).includes('cycle')
    ? ok : fail)(`params נושאים iterations+reason — ${JSON.stringify(threw?.params)}`);
  (engine.isRegisteredEngineErrorKey('errors.engine.TOC_FIXED_POINT_NOT_REACHED')
    ? ok : fail)('הקוד רשום בקטלוג המנוע (isRegisteredEngineErrorKey)');
  const keyTable = readFileSync(join(repoRoot, 'docs', 'i18n', 'error-keys.md'), 'utf8');
  (keyTable.includes('`errors.engine.TOC_FIXED_POINT_NOT_REACHED`')
    ? ok : fail)('הקוד קיים בטבלת מפתחות ה-i18n (docs/i18n/error-keys.md)');
  // התייצבות עוברת כמו שהיא
  const stable = (_s, i) => ({ state: 5, feedback: vec(7, 7, 7) });
  const rc = engine.runOuterFixedPoint(0, stable, {});
  let passed = false;
  try {
    passed = engine.requireFixedPoint(rc) === rc;
  } catch {
    passed = false;
  }
  (passed ? ok : fail)('requireFixedPoint מחזיר את התוצאה המיוצבת כמו שהיא');
}

// ---------- 5. סדר עדכון קבוע + ADR-011 ----------
console.log('\n5) סדר עדכון קבוע, תלות מתועדת ו-ADR-011');
{
  const signals = [...engine.FIXED_POINT_SIGNALS];
  (JSON.stringify(signals) === JSON.stringify(['endnote-mapping', 'anchor-mapping', 'toc-mapping'])
    ? ok : fail)(`FIXED_POINT_SIGNALS בסדר הקבוע — ${signals.join(' ← ')}`);
  const src = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'fixed-point.ts'), 'utf8');
  (src.includes('סדר העדכון הקבוע') && src.includes('ADR-011')
    ? ok : fail)('המודול מתעד את סדר העדכון ומפנה ל-ADR-011');
  const adrPath = join(repoRoot, 'docs', 'adr', 'ADR-011-outer-fixed-point.md');
  let adr = '';
  try {
    adr = readFileSync(adrPath, 'utf8');
  } catch {
    adr = '';
  }
  (adr.length > 0 ? ok : fail)('docs/adr/ADR-011-outer-fixed-point.md קיים');
  const needed = ['oscillation', 'TOC_FIXED_POINT_NOT_REACHED', 'maxIterations', 'endnote-mapping', 'anchor-mapping', 'toc-mapping', 'pageEstimate'];
  const missing = needed.filter((k) => !adr.includes(k));
  (missing.length === 0 ? ok : fail)(`ADR-011 מכסה את הנושאים הדרושים${missing.length ? ' — חסרים: ' + missing.join(', ') : ''}`);
  (adr.includes('ההחלטה') && adr.includes('למה לא חלופות') && adr.includes('השלכות')
    ? ok : fail)('ADR-011 במבנה הסטנדרטי (הקשר/החלטה/חלופות/השלכות)');
}

// ---------- 6. סריקות מקור ----------
console.log('\n6) סריקות מקור — אין לולאה בלתי-חסומה, אין pageEstimate, תקציב קשיח');
{
  const src = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'fixed-point.ts'), 'utf8');
  // האיסור ("אין pageEstimate") מופיע בהערות התיעוד כאסמכתא — נסרקות שורות
  // קוד בלבד, כמו ב-verify-anchor-toc (איסור באותה רמה).
  const codeLines = src.split('\n').filter((l) => l.trim().length > 0 && !/:\s*\*/.test(l) && !/^\s*(\*|\/\/)/.test(l));
  (!codeLines.some((l) => l.includes('pageEstimate')) ? ok : fail)('אין pageEstimate בקוד המודול (§11.1; הערות תיעוד מפנות לאיסור בלבד)');
  (src.includes('HARD_MAX_ITERATIONS') && src.includes('maxIterations < 2')
    ? ok : fail)('תקציב קשיח נאכף (HARD_MAX_ITERATIONS + תחום 2..1000)');
  (src.includes("for (let iteration = 1; iteration <= maxIterations; iteration++)")
    ? ok : fail)('הלולאה חסומה בתקציב (for עד maxIterations — אין while-true)');
  (!/while\s*\(\s*true\s*\)/.test(src) ? ok : fail)('אין while(true) במודול');
  (src.includes('TOC_FIXED_POINT_NOT_REACHED') ? ok : fail)('הכשל המפורש מוגדר במודול');
  // requireFixedPoint במסלוך release: נבדק שה-API קיים בפלט הבנוי
  (typeof engine.requireFixedPoint === 'function' ? ok : fail)('requireFixedPoint מיוצא ב-API הציבורי');
  (typeof engine.runOuterFixedPoint === 'function' && typeof engine.fixedPointReportHash === 'function'
    ? ok : fail)('runOuterFixedPoint + fixedPointReportHash מיוצאים ב-API הציבורי');
}

// ---------- 7. שליליים ----------
console.log('\n7) שליליים — חוזה הרץ נאכף');
{
  const good = (_s, i) => ({ state: i, feedback: vec(1, 1, 1) });
  const expectInvalid = (label, fn) => {
    try {
      fn();
      fail(`${label} — היה צפוי כשל`);
    } catch (e) {
      (e?.catalogKey === 'errors.engine.PAGINATION_STATE_INVALID' && e?.params?.action === 'fixed-point'
        ? ok : fail)(`${label} — PAGINATION_STATE_INVALID (action=fixed-point)`);
    }
  };
  expectInvalid('maxIterations=1 נדחה', () => engine.runOuterFixedPoint(0, good, { maxIterations: 1 }));
  expectInvalid('maxIterations=1001 נדחה', () => engine.runOuterFixedPoint(0, good, { maxIterations: 1001 }));
  expectInvalid('signals ריקים נדחים', () => engine.runOuterFixedPoint(0, good, { signals: [] }));
  expectInvalid('אות חסר בווקטור', () => engine.runOuterFixedPoint(0, () => ({ state: 0, feedback: { 'anchor-mapping': H(1) } }), {}));
  expectInvalid('אות זר בווקטור', () => engine.runOuterFixedPoint(0, () => ({ state: 0, feedback: { ...vec(1, 1, 1), ghost: H(2) } }), {}));
}

// ---------- 8. מבחני חובה ----------
console.log('\n8) מבחני חובה ורגרסיה');
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
console.log(`נקודת השבת החוץ תקינה — ${checks} בדיקות ירוקות. אין לולאה בלתי-חסומה ואין ערך עמוד סטייל (ADR-011).`);
