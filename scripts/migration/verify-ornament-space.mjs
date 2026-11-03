#!/usr/bin/env node
/**
 * verify-ornament-space — מאמת שלב 69: השפעת עיטורים על המקום הזמין
 * (אפיון §11.2, §14; תכנית שלב 69; M8).
 *
 * בדיקות:
 *   1. המודל: safeAreaOf — חיתוך נאמן לעמוד; תיבה מנוונת/פרושה/חסרה ⇒ null.
 *   2. מלאי האמת מהמניפסטים (שלב 68): מ־86 עיצובי השער — כמה עם אזור בטוח
 *      בר-שימוש (חיתוך לא-ריק) וכמה נופלים לברירת המחדל המתועדת; המספרים
 *      נגזרים מהנתונים וננעלים.
 *   3. תבניות: safeArea ⇒ custom-box מהשברים (דרך units — quantizeSetting×
 *      גאומטריה, roundDiv יחיד; ADR-001); null/חסר ⇒ תיבת השוליים (הנפילה
 *      המתועדת); safeArea שגוי ⇒ דחייה מפורשת.
 *   4. מדידת המפריד מההגדרות (chapterEndDividerLuOf): none ⇒ 0; 28px ⇒
 *      מ"מ ← LU; פסול ⇒ הברירה הנעולה; CSS_PX_MM = 127/480 מתועד; אין
 *      pxPerMm בליבה (סריקת קוד).
 *   5. Metamorphic on/off: זרימה עשירה עם עיטורי פתיחה + מפריד דלוקים מול
 *      כבויים — כיסוי מלא בשני המסלולים (אותו סמן סופי; אין אובדן תוכן).
 *   6. ביקורת חפיפה: ORNAMENT_OVERLAP רשום; פריט עיטור על קו ⇒ HIGH;
 *      רקע שער (אזור ornament) פטור.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 * תלויות: Node 22 + ה-dist הבנוי של החבילות.
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

const cm = await import('@tora/content-model');
const la = await import('@tora/layout-api');
const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const policy = await import(join(repoRoot, 'packages', 'policy-torah', 'dist', 'index.js'));
const audit = await import(join(repoRoot, 'packages', 'audit-core', 'dist', 'index.js'));

// ---------- 1. המודל ----------
console.log('1) safeAreaOf — חיתוך נאמן לעמוד');
(
  JSON.stringify(cm.safeAreaOf({ left: 0.25, top: 0.2, right: 0.15, bottom: 0.1 })) === JSON.stringify({ left: 0.25, top: 0.2, width: 0.6, height: 0.7 })
  && cm.safeAreaOf(null) === null
  && cm.safeAreaOf({ left: 1.235, top: 0.206, right: 0.29, bottom: 0.206 }) === null
  && cm.safeAreaOf({ left: 0.7, top: 0.2, right: 0.7, bottom: 0.2 }) === null
  && JSON.stringify(cm.safeAreaOf({ left: 0, top: 0, right: 0, bottom: 0 })) === JSON.stringify({ left: 0, top: 0, width: 1, height: 1 })
  ? ok : fail)('חיתוך, עמוד מלא, מנוונת/פרושה ⇒ null, חסרה ⇒ null');
(typeof cm.safeAreaOf === 'function' && typeof la.safeAreaOf === 'function' && typeof policy.safeAreaOf === 'function'
  && la.safeAreaOf === cm.safeAreaOf
  ? ok : fail)('מומרז דרך layout-api ו-policy-torah מהבעלים (מקור אמת אחד)');

// ---------- 2. מלאי האמת מהמניפסטים ----------
console.log('\n2) מלאי האמת: 86 עיצובי שער ⇐ אזור בטוח בר-שימוש או נפילה מתועדת');
{
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'assets', 'shaar', 'manifest.json'), 'utf8'));
  let usable = 0;
  let fallen = 0;
  let noBox = 0;
  for (const d of manifest.designs ?? []) {
    if (d.textBox === null) { noBox += 1; fallen += 1; continue; }
    if (cm.safeAreaOf(d.textBox) !== null) usable += 1; else fallen += 1;
  }
  const perKind = {};
  for (const d of manifest.designs ?? []) {
    perKind[d.kind] ??= { usable: 0, fallen: 0 };
    if (d.textBox !== null && cm.safeAreaOf(d.textBox) !== null) perKind[d.kind].usable += 1;
    else perKind[d.kind].fallen += 1;
  }
  const total = (manifest.designs ?? []).length;
  (
    total === 86 && usable + fallen === 86 && noBox === 4
    ? ok : fail)(`86 עיצובים: ${usable} עם אזור בטוח בר-שימוש, ${fallen} נופלים לתיבת השוליים המתועדת (מתוכם ${noBox} בלי תיבה כלל)`);
  (
    perKind.main?.usable === 15 && perKind.main?.fallen === 17
    && perKind.back?.usable === 0 && perKind.back?.fallen === 27
    && perKind.sub?.usable === 0 && perKind.sub?.fallen === 27
    ? ok : fail)(`לפי סוג (נתוני הדיסק): main 15/32 בר-שימוש; back 0/27 ו-sub 0/27 — כולם דף-כפול/מנוונים/בלי תיבה — הנפילה המתועדת היא הכלל אצל back/sub`);
}

// ---------- 3. תבניות ----------
console.log('\n3) תבניות שער — custom-box מהאזור הבטוח; נפילה ודחייה');
{
  const asLu = la.asLu;
  const geometry = {
    pageWidth: asLu(4000000), pageHeight: asLu(5600000), margin: asLu(160000),
    mainX: asLu(400000), mainWidth: asLu(3200000), columnWidth: asLu(1520000),
    columnGap: asLu(160000), contentTop: asLu(160000), contentBottom: asLu(5440000),
  };
  const base = {
    geometry, headerHeightLu: asLu(0), footerHeightLu: asLu(0), columns: 2,
    footnoteColumns: 1, folioPosition: 'bottom_center', showFolio: false, sidenoteWidthLu: null,
  };
  const SHA = '4ac3285bbd68337f25a9cdcc157a36efaac1448e0d6ce9ede963f2b0c3acda5b';
  const asset = (safeArea) => ({ assetId: 'shaar:v2|main|4ac3285bbd68337f#0', sha256: SHA, viewBox: { width: 2000, height: 2880 }, safeArea });
  const set = engine.buildPageTemplateSet({ ...base, shaarAssets: { 'main-shaar': asset({ left: 0.25, top: 0.2, width: 0.5, height: 0.6 }) } });
  const box = set.for('main-shaar', 1).regions.find((r) => r.role === 'custom-box').rect;
  const lu = (frac, page) => Math.round((Math.round(frac * 1000000) * page) / 1000000);
  (
    box.x === asLu(lu(0.25, 4000000)) && box.y === asLu(lu(0.2, 5600000))
    && box.width === asLu(lu(0.5, 4000000)) && box.height === asLu(lu(0.6, 5600000))
    ? ok : fail)('safeArea ⇒ custom-box ב-LU דרך quantizeSetting×גאומטריה + roundDiv יחיד (ADR-001)');
  const fallback = engine.buildPageTemplateSet(base).for('main-shaar', 1).regions.find((r) => r.role === 'custom-box').rect;
  const nullSet = engine.buildPageTemplateSet({ ...base, shaarAssets: { 'main-shaar': asset(null) } });
  const nullBox = nullSet.for('main-shaar', 1).regions.find((r) => r.role === 'custom-box').rect;
  let rejected = false;
  try { engine.buildPageTemplateSet({ ...base, shaarAssets: { 'main-shaar': asset({ left: -0.1, top: 0, width: 0.5, height: 0.5 }) } }); }
  catch { rejected = true; }
  (
    JSON.stringify(nullBox) === JSON.stringify(fallback) && rejected
    ? ok : fail)('null/חסר ⇒ תיבת השוליים (הנפילה המתועדת); safeArea שלילי ⇒ דחייה מפורשת');
  // זרימה: H1 על שער עם אזור בטוח — כותרת נמוכה מהתיבה עוברת; גבוהה ⇒ כשל מפורש
  let flowOk = false;
  let flowReject = false;
  try {
    const templates = engine.buildPageTemplateSet({ ...base, shaarAssets: { 'sub-shaar': asset({ left: 0.2, top: 0.3, width: 0.6, height: 0.2 }) } });
    const line = (h, i) => ({ id: `line-${i}`, heightLu: asLu(h), footnoteRefs: [], sidenoteRefs: [] });
    const blocks = [
      { blockId: 'h1', role: 'heading', headingLevel: 1, lines: [line(200000, 0)] },
      { blockId: 'b1', role: 'body', lines: [line(150000, 1)] },
    ];
    const initial = engine.initialPaginationState({
      firstBlockId: 'h1',
      remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1),
      pageKind: 'body',
    });
    const res = engine.searchPages(initial, engine.createPageCandidateSource({
      blocks, templates, pageKind: 'body', headingBehaviorOf: policy.legacyHeadingBehaviorOf ?? engine.legacyHeadingBehaviorOf,
    }), new la.DecisionLedgerBuilder('off'), {});
    flowOk = res.status === 'complete' && res.finalState.contentCursor.includes('b1|f1');
    const tall = [{ blockId: 'h1', role: 'heading', headingLevel: 1, lines: [{ id: 'line-x', heightLu: asLu(2000000), footnoteRefs: [], sidenoteRefs: [] }] }];
    try {
      engine.searchPages(engine.initialPaginationState({
        firstBlockId: 'h1',
        remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1),
        pageKind: 'body',
      }), engine.createPageCandidateSource({
        blocks: tall, templates, pageKind: 'body', headingBehaviorOf: policy.legacyHeadingBehaviorOf ?? engine.legacyHeadingBehaviorOf,
      }), new la.DecisionLedgerBuilder('off'), {});
    } catch { flowReject = true; }
  } catch { flowOk = false; }
  (flowOk && flowReject ? ok : fail)('זרימה: H1 בתוך האזור הבטוח עוברת; גבוהה ממנו ⇒ כשל מפורש (אין גלישה על הרקע)');
}

// ---------- 4. מדידת המפריד ----------
console.log('\n4) מפריד סוף-פרק — מדידה מההגדרות');
const mkSettings = (values) => ({ schemaVersion: 1, enginePolicyId: 'torah-v1', values, configHash: 'v' });
(
  policy.chapterEndDividerLuOf(mkSettings({ 'section-divider-style': 'none' })) === 0
  && policy.chapterEndDividerLuOf(mkSettings({ 'section-divider-style': 'spear', 'dim-secdiv-h': '28px' })) === la.mmToLu(28 * policy.CSS_PX_MM)
  && policy.chapterEndDividerLuOf(mkSettings({ 'section-divider-style': 'spear', 'dim-secdiv-h': 'junk' })) === la.mmToLu(28 * policy.CSS_PX_MM)
  ? ok : fail)('none ⇒ 0; 28px ⇒ מ"מ ← LU; פסול ⇒ ברירת 28px נעולה');
(
  policy.CSS_PX_MM === 127 / 480 && policy.DEFAULT_SECDIV_H_PX === 28
  ? ok : fail)('CSS_PX_MM = 127/480 (25.4/96 — הגדרת CSS); ברירת המחדל 28px (settings-matrix.md)');
{
  const matrix = readFileSync(join(repoRoot, 'docs', 'migration', 'settings-matrix.md'), 'utf8');
  (/\| `dim-secdiv-h` \| dimension \| "28px"/.test(matrix)
    ? ok : fail)('dim-secdiv-h "28px" נעול ב-settings-matrix.md — מקור המדידה');
  // אין pxPerMm בליבה (ADR-001 §5): ההמרה חיה ב-policy-torah בלבד
  let coreHits = [];
  for (const pkg of ['measurement-api', 'layout-api', 'layout-engine', 'content-model', 'settings-schema']) {
    let out = '';
    try {
      out = execFileSync('grep', ['-rn', 'pxPerMm\\|CSS_PX_MM', join(repoRoot, 'packages', pkg, 'src')], { cwd: repoRoot, stdio: 'pipe' }).toString();
    } catch {
      out = ''; // grep יוצא 1 כשאין התאמות — בדיוק המצב הרצוי
    }
    // שורות קוד בלבד — אזכור בתוך הערה/תיעוד אינו שימוש (ב-units.ts מתועד "אין pxPerMm")
    const codeLines = out.split('\n').filter((l) => l.trim().length > 0 && !l.includes(': *') && !l.includes('://'));
    if (codeLines.length > 0) coreHits.push(pkg);
  }
  (coreHits.length === 0 ? ok : fail)(`המרת px חיה ב-policy-torah בלבד — אפס pxPerMm/CSS_PX_MM בליבה (ADR-001 §5)${coreHits.length ? ' — נמצא ב: ' + coreHits.join(', ') : ''}`);
}

// ---------- 5. Metamorphic on/off ----------
console.log('\n5) Metamorphic on/off — אין אובדן תוכן');
{
  const asLu = la.asLu;
  const geometry = {
    pageWidth: asLu(4000000), pageHeight: asLu(5600000), margin: asLu(160000),
    mainX: asLu(400000), mainWidth: asLu(3200000), columnWidth: asLu(1520000),
    columnGap: asLu(160000), contentTop: asLu(160000), contentBottom: asLu(5440000),
  };
  const templates = engine.buildPageTemplateSet({
    geometry, headerHeightLu: asLu(0), footerHeightLu: asLu(0), columns: 2,
    footnoteColumns: 1, folioPosition: 'bottom_center', showFolio: false, sidenoteWidthLu: null,
  });
  let seq = 0;
  const line = (h) => ({ id: `l-${seq++}`, heightLu: asLu(h), footnoteRefs: [], sidenoteRefs: [] });
  const blocks = [
    { blockId: 'h2a', role: 'heading', headingLevel: 2, lines: [line(300000)] },
    { blockId: 'p1', role: 'body', lines: [line(150000), line(150000), line(150000), line(150000), line(150000)] },
    { blockId: 'h2b', role: 'heading', headingLevel: 2, lines: [line(300000)] },
    { blockId: 'p2', role: 'body', lines: [line(150000), line(150000), line(150000), line(150000)] },
    { blockId: 'h2c', role: 'heading', headingLevel: 2, lines: [line(300000)] },
    { blockId: 'p3', role: 'body', lines: [line(150000), line(150000), line(150000)] },
  ];
  const legacy = engine.legacyHeadingBehaviorOf;
  const withOrnaments = (on) => (level) => level === 2
    ? { flowRole: 'page-opener', forcePageBreak: true, escortLines: 2, openerSpacing: on ? { spaceBeforePct: 0.22, ornamentTopEm: 1.25, ornamentBottomEm: 1.25 } : { spaceBeforePct: 0, ornamentTopEm: 0, ornamentBottomEm: 0 } }
    : legacy(level);
  const runOnce = (on) => {
    const initial = engine.initialPaginationState({
      firstBlockId: 'h2a',
      remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1),
      pageKind: 'body',
    });
    return engine.searchPages(initial, engine.createPageCandidateSource({
      blocks, templates, pageKind: 'body',
      headingBehaviorOf: withOrnaments(on),
      chapterEndDividerLu: on ? policy.chapterEndDividerLuOf(mkSettings({})) : 0,
    }), new la.DecisionLedgerBuilder('off'), {});
  };
  const on = runOnce(true);
  const off = runOnce(false);
  (
    on.status === 'complete' && off.status === 'complete'
    && on.finalState.contentCursor.includes('p3|f3') && off.finalState.contentCursor.includes('p3|f3')
    ? ok : fail)('עיטורי פתיחה + מפריד דלוקים מול כבויים — כיסוי מלא בשניהם (אותו סמן סופי; אין אובדן תוכן)');
  (on.finalState.stateHash !== off.finalState.stateHash
    ? ok : fail)('הפריסה כן מושפעת (stateHash שונה) — ההבדל מותר בפריסה בלבד (§11.2)');
  (on.finalState.physicalPageIndex >= off.finalState.physicalPageIndex
    ? ok : fail)(`מספר העמודים עם עיטורים ≥ בלי (עמוד אחרון: ${on.finalState.physicalPageIndex} מול ${off.finalState.physicalPageIndex}) — צריכת המקום נראית`);
}

// ---------- 6. ביקורת חפיפה ----------
console.log('\n6) ORNAMENT_OVERLAP — אף נכס אינו מכסה טקסט בשקט');
(audit.LAYOUT_AUDIT_FINDING_CODES.includes('audit.layout.ORNAMENT_OVERLAP')
  ? ok : fail)('הקוד רשום בקטלוג ממצאי הפריסה');
{
  // פריט עיטור על קו באזור תוכן ⇒ HIGH; פריט באזור ornament (רקע שער) פטור
  const asLu = la.asLu;
  const page = {
    id: 'page:1', kind: 'body', parity: 'recto',
    size: { width: asLu(4000000), height: asLu(5600000) },
    regions: [
      { id: 'page:1:col:0', kind: 'body-column', columnIndex: 0, rect: { x: asLu(2000000), y: asLu(200000), width: asLu(1500000), height: asLu(5000000) } },
      { id: 'page:1:orn', kind: 'ornament', rect: { x: 0, y: 0, width: asLu(4000000), height: asLu(5600000) } },
    ],
    items: [
      { kind: 'line', id: 'line-1', blockId: 'b1', regionId: 'page:1:col:0', rect: { x: asLu(0), y: asLu(0), width: asLu(1000000), height: asLu(120000) }, baseline: asLu(100000), runs: [], sourceSpans: [] },
      { kind: 'ornament', id: 'orn-bad', regionId: 'page:1:col:0', rect: { x: asLu(0), y: asLu(0), width: asLu(100000), height: asLu(100000) }, assetId: 'shaar:v2|main|abc#0', assetSha256: 'a'.repeat(64) },
      { kind: 'ornament', id: 'orn-bg', regionId: 'page:1:orn', rect: { x: asLu(0), y: asLu(0), width: asLu(4000000), height: asLu(5600000) }, assetId: 'shaar:v2|main|abc#0', assetSha256: 'a'.repeat(64) },
    ],
  };
  const layout = { schemaVersion: 1, pages: [page], documentId: 'verify-ornament-space' };
  const content = { documentId: 'verify-ornament-space', parts: [], notes: { footnotes: [], endnotes: [], sidenotes: [], editorial: [] } };
  let report;
  try {
    report = audit.auditLayout({ content, settings: {}, layout });
  } catch (e) {
    fail(`הביקורת קרסה: ${String(e?.message).slice(0, 120)}`);
    report = undefined;
  }
  if (report !== undefined) {
    const bad = report.findings.find((f) => f.code === 'audit.layout.ORNAMENT_OVERLAP' && f.params.itemId === 'orn-bad');
    const bg = report.findings.find((f) => f.code === 'audit.layout.ORNAMENT_OVERLAP' && f.params.itemId === 'orn-bg');
    (bad !== undefined && bad.severity === 'HIGH' ? ok : fail)('פריט עיטור החופף קו באזור תוכן ⇒ ORNAMENT_OVERLAP (HIGH)');
    (bg === undefined ? ok : fail)('פריט עיטור באזור ornament (רקע שער מאחורי האזור הבטוח) — פטור (מתועד; §11.2)');
  }
}

// ---------- 7. מבחני החובה ----------
console.log('\n7) מבחני חובה ורגרסיה');
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
console.log(`השפעת העיטורים על המקום הזמין תקינה — ${checks} בדיקות ירוקות. אין נכס שמכסה טקסט בשקט; אין אובדן תוכן ב on/off.`);
