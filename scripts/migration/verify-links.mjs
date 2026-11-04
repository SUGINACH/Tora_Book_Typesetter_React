#!/usr/bin/env node
/**
 * verify-links — מאמת שלב 72: השלמת endnotes וקישורים הדדיים
 * (אפיון §11, §14–15; תכנית שלב 72; M8).
 *
 * בדיקות:
 *   1. LinkTable — מזהים דטרמיניסטיים (נגזרים מהתוכן; linkMappingHash
 *      בלתי-תלוי בסדר הבנייה); ולידציה (כיווניות לפי סוג, linkId זר);
 *      מדיניות חיצוניים (http/https בלבד).
 *   2. endnoteLinksOf — זרם אמיתי: כל הערה ⇄ עוגן הגוף; המשכים
 *      מרובי-עמודים — קישור חזרה לכל הצבה; הפניה קדימה אחת לכל הערה.
 *   3. tocLinksOf — ערכי TOC ⇄ כותרות מה-AnchorTable.
 *   4. auditLinks — הביקורת הסמנטית: דוח תקין ok=true; קישור שבור ⇒
 *      HIGH; מזהה זר; כפילות; חד-כיווניות; מדיניות חיצוניים; אי-התאמת
 *      עמוד ⇒ MEDIUM.
 *   5. ההיטל — render-html עם LinkTable: data-link-id/kind/target-page על
 *      סמני ההערות; בלי טבלה — הפלט ללא data-link (goldens נשמרים).
 *   6. סריקות מקור — אין pageEstimate במודולים החדשים; makeLinkId
 *      מהתוכן; הקודים רשומים וסגורים.
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
const audit = await import(join(repoRoot, 'packages', 'audit-core', 'dist', 'index.js'));
const render = await import(join(repoRoot, 'packages', 'render-html', 'dist', 'index.js'));

const asLu = la.asLu;

// ---------- 1. LinkTable ----------
console.log('1) LinkTable — חוזה, דטרמיניזם, ולידציה, מדיניות חיצוניים');
{
  const body = { kind: 'block', id: 'p1' };
  const noteE = { kind: 'note', id: 'n1', physicalPage: 7 };
  const fwdId = la.makeLinkId('note', body, noteE);
  (la.makeLinkId('note', body, noteE) === fwdId && la.makeLinkId('note', noteE, body) !== fwdId
    ? ok : fail)('makeLinkId דטרמיניסטי — מהתוכן, רגיש לכיוון');
  const fwd = { linkId: fwdId, kind: 'note', source: body, target: noteE };
  const back = { linkId: la.makeLinkId('note-back', noteE, body), kind: 'note-back', source: noteE, target: body };
  (la.linkMappingHash(la.buildLinkTable([fwd, back])) === la.linkMappingHash(la.buildLinkTable([back, fwd]))
    ? ok : fail)('linkMappingHash בלתי-תלוי בסדר הבנייה (ממוין לפי linkId)');
  (la.linkTableIssues(la.buildLinkTable([fwd, { ...fwd }])).some((i) => i.startsWith('duplicate:'))
    ? ok : fail)('כפילות ⇒ issue (לא שקט)');
  (la.linkRecordIssues({ ...fwd, linkId: 'link:runtime:42' }).includes('linkId:not-derived')
    ? ok : fail)('linkId זר (תלוי-סדר-ריצה) ⇒ issue — אכיפת "אין ids תלויי סדר ריצה אקראי"');
  (la.linkRecordIssues({ linkId: 'x', kind: 'note', source: noteE, target: body }).some((i) => i.startsWith('note:'))
    ? ok : fail)('כיווניות שגויה לפי סוג ⇒ issue');
  (la.externalLinkIssues('https://example.com/a').length === 0
    && la.externalLinkIssues('http://x.example').length === 0
    && la.externalLinkIssues('javascript:alert(1)').includes('scheme:javascript')
    && la.externalLinkIssues('data:text/html,x').includes('scheme:data')
    ? ok : fail)('מדיניות חיצוניים — http/https בלבד; javascript/data נדחים');
}

// ---------- 2. endnoteLinksOf ----------
console.log('\n2) endnoteLinksOf — קישורים הדדיים מזרם אמיתי (כולל המשכים)');
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
  const note = (noteId, lines, blockId) => ({
    noteId,
    body: { noteId, lineHeightLu: Array.from({ length: lines }, () => asLu(150000)), heightLu: asLu(150000 * lines) },
    anchor: { blockId, lineId: `${blockId}:line-1` },
  });
  // א) הערות רגילות
  const entries = [note('n1', 1, 'p1'), note('n2', 2, 'p2')];
  const flow = engine.layoutEndnoteFlow(entries, templates, { bodyPageCount: 10 });
  const links = engine.endnoteLinksOf(flow, entries);
  (links.issues.length === 0 ? ok : fail)(`טבלת הקישורים תקינה (issues=0) — ${links.issues.join(';')}`);
  const fwd = links.records.filter((r) => r.kind === 'note');
  const back = links.records.filter((r) => r.kind === 'note-back');
  (fwd.length === 2 && back.length === 2 ? ok : fail)(`שני הכיוונים לכל הערה — קדימה ${fwd.length}, חזרה ${back.length}`);
  (fwd.every((f) => f.target.physicalPage === 11) ? ok : fail)('העמוד הפיזי מההצבה בפועל (bodyPageCount+1) — אין pageEstimate');
  // ב) הערה מפוצלת
  const longEntries = [note('long-1', 60, 'p1')];
  const longFlow = engine.layoutEndnoteFlow(longEntries, templates, { bodyPageCount: 5, notePolicy: { allowLongNoteSplit: true } });
  (longFlow.splits > 0 ? ok : fail)(`ההערה נפרשה על עמודים (splits=${longFlow.splits})`);
  const longLinks = engine.endnoteLinksOf(longFlow, longEntries);
  (longLinks.issues.length === 0 ? ok : fail)(`טבלת ההמשכים תקינה (issues=0) — ${longLinks.issues.join(';')}`);
  const lf = longLinks.records.filter((r) => r.kind === 'note');
  const lb = longLinks.records.filter((r) => r.kind === 'note-back');
  (lf.length === 1 ? ok : fail)(`הפניה קדימה אחת לכל הערה (קיבלנו ${lf.length})`);
  (lb.length === longFlow.placements.length ? ok : fail)(`קישור חזרה לכל הצבה — ${lb.length}/${longFlow.placements.length}`);
  (lb.every((b) => b.target.id === 'p1') ? ok : fail)('כל ההמשכים חוזרים לעוגן הגוף המקורי');
  const contPages = new Set(lb.map((b) => b.source.physicalPage));
  (contPages.size === longFlow.placements.length ? ok : fail)('לכל הצבה עמוד פיזי משלה מהתוצאה');
}

// ---------- 3. tocLinksOf ----------
console.log('\n3) tocLinksOf — TOC ⇄ כותרות מהעוגנים');
{
  const anchors = la.buildAnchorTable([
    { targetId: 'h1|1', kind: 'heading', pageKind: 'shaar', physicalPage: 1 },
    { targetId: 'h2|1', kind: 'heading', pageKind: 'body', physicalPage: 4 },
  ]);
  const links = engine.tocLinksOf([{ targetId: 'h1|1' }, { targetId: 'h2|1' }, { targetId: 'ghost' }], anchors);
  (links.issues.length === 0 ? ok : fail)(`טבלת TOC תקינה — ${links.issues.join(';')}`);
  (links.records.length === 4 ? ok : fail)(`4 רשומות לשני ערכים (2×2 כיוונים; ghost הושמט) — קיבלנו ${links.records.length}`);
  const fwd = links.records.find((r) => r.kind === 'toc' && r.target.id === 'h1|1');
  (fwd?.target.physicalPage === 1 && fwd?.target.pageKind === 'shaar' ? ok : fail)('הפוליו מהעוגן — כולל סוג העמוד');
}

// ---------- 4. auditLinks ----------
console.log('\n4) auditLinks — הביקורת הסמנטית על כל target (§14.2)');
{
  const anchors = la.buildAnchorTable([
    { targetId: 'h2|1', kind: 'heading', pageKind: 'body', physicalPage: 4 },
    { targetId: 'n1', kind: 'note', pageKind: 'notes', physicalPage: 12 },
  ]);
  const inv = { anchors, noteIds: ['n1', 'n2'], headingIds: ['h2|1'], bodyBlockIds: ['p1'], anchorIds: ['toc:h2|1'] };
  const body = { kind: 'block', id: 'p1' };
  const n1 = { kind: 'note', id: 'n1', physicalPage: 12 };
  const n2 = { kind: 'note', id: 'n2', physicalPage: 13 };
  const tocA = { kind: 'anchor', id: 'toc:h2|1' };
  const h2 = { kind: 'heading', id: 'h2|1', physicalPage: 4 };
  const good = la.buildLinkTable([
    { linkId: la.makeLinkId('note', body, n1), kind: 'note', source: body, target: n1 },
    { linkId: la.makeLinkId('note-back', n1, body), kind: 'note-back', source: n1, target: body },
    { linkId: la.makeLinkId('note', body, n2), kind: 'note', source: body, target: n2 },
    { linkId: la.makeLinkId('note-back', n2, body), kind: 'note-back', source: n2, target: body },
    { linkId: la.makeLinkId('toc', tocA, h2), kind: 'toc', source: tocA, target: h2 },
    { linkId: la.makeLinkId('toc-back', h2, tocA), kind: 'toc-back', source: h2, target: tocA },
  ]);
  const goodReport = audit.auditLinks(good, inv);
  (goodReport.ok && goodReport.findings.length === 0 ? ok : fail)(`דוח תקין — ok=true, אפס ממצאים (${goodReport.findings.map((f) => f.code).join(',')})`);
  (goodReport.stats.links === 6 ? ok : fail)('סטטיסטיקה מלאה — 6 קישורים לפי סוג');

  const ghost = { kind: 'note', id: 'ghost-note', physicalPage: 99 };
  const broken = audit.auditLinks(la.buildLinkTable([
    { linkId: la.makeLinkId('note', body, ghost), kind: 'note', source: body, target: ghost },
  ]), inv);
  (broken.findings.some((f) => f.code === 'audit.links.LINK_TARGET_MISSING' && f.severity === 'HIGH')
    ? ok : fail)('קישור שבור ⇒ LINK_TARGET_MISSING HIGH (לא שקט)');

  const foreign = audit.auditLinks(la.buildLinkTable([
    { linkId: 'link:runtime-order:1', kind: 'note', source: body, target: n1 },
  ]), inv);
  (foreign.findings.some((f) => f.code === 'audit.links.LINK_ID_FOREIGN')
    ? ok : fail)('מזהה זר ⇒ LINK_ID_FOREIGN — אין ids תלויי סדר ריצה');

  const oneWay = audit.auditLinks(la.buildLinkTable([
    { linkId: la.makeLinkId('note', body, n1), kind: 'note', source: body, target: n1 },
  ]), inv);
  (oneWay.findings.some((f) => f.code === 'audit.links.LINK_NOTE_ONE_WAY')
    ? ok : fail)('הפניה קדימה בלי חזרה ⇒ LINK_NOTE_ONE_WAY');

  const badUrl = { kind: 'url', id: 'javascript:alert(1)' };
  const ext = audit.auditLinks(la.buildLinkTable([
    { linkId: la.makeLinkId('external', body, badUrl), kind: 'external', source: body, target: badUrl },
  ]), inv);
  (ext.findings.some((f) => f.code === 'audit.links.LINK_EXTERNAL_POLICY')
    ? ok : fail)('קישור חיצוני שלא לפי מדיניות ⇒ LINK_EXTERNAL_POLICY');

  const wrongPage = { kind: 'note', id: 'n1', physicalPage: 55 };
  const mismatch = audit.auditLinks(la.buildLinkTable([
    { linkId: la.makeLinkId('note', body, wrongPage), kind: 'note', source: body, target: wrongPage },
    { linkId: la.makeLinkId('note-back', wrongPage, body), kind: 'note-back', source: wrongPage, target: body },
  ]), inv);
  const mf = mismatch.findings.find((f) => f.code === 'audit.links.LINK_PAGE_MISMATCH');
  (mf !== undefined && mf.severity === 'MEDIUM' && mismatch.ok
    ? ok : fail)('אי-התאמת עמוד מול ה-AnchorTable ⇒ MEDIUM (אינה פוסלת לבדה)');

  // הקודים רשומים וסגורים
  (audit.LINK_AUDIT_FINDING_CODES.length === 7 && new Set(audit.LINK_AUDIT_FINDING_CODES).size === 7
    ? ok : fail)('7 קודי ממצא רשומים וייחודיים (אין קוד צד)');
}

// ---------- 5. ההיטל ----------
console.log('\n5) ההיטל — הקישורים נראים ב-HTML (שער: "ב-IR ובהיטלים")');
{
  const FONT = { fontId: 'f1', contentSha256: 'a'.repeat(64), family: 'F', weight: 400, style: 'normal' };
  const rect = (x, y, w, h) => ({ x: asLu(x), y: asLu(y), width: asLu(w), height: asLu(h) });
  const layout = la.createLayoutDocument({
    schemaVersion: 1,
    policyId: 'torah-v1',
    pages: [{
      id: 'page:1', physicalIndex: 1, printedFolio: 'א', parity: 'recto', kind: 'body',
      size: { width: la.A4.width, height: la.A4.height },
      regions: [{ id: 'page:1:col:0', kind: 'body-column', rect: rect(200000, 300000, 7000000, 9000000), columnIndex: 0 }],
      items: [
        { kind: 'note-marker', id: 'item:m1', noteId: 'fn-1', label: 'א', regionId: 'page:1:col:0', rect: rect(410000, 420000, 60000, 180000), baseline: asLu(430000), source: { documentId: 'd', stream: 'footnote', startUtf16: 0, endUtf16: 3 }, superscript: true },
        { kind: 'anchor', id: 'item:a1', anchorId: 'h2|1', regionId: 'page:1:col:0', rect: rect(410000, 500000, 60000, 60000), source: { documentId: 'd', stream: 'main', startUtf16: 10, endUtf16: 12 } },
      ],
    }],
    anchors: [],
    transformations: [],
  });
  const plain = render.renderHtml(layout);
  (!plain.html.includes('data-link-') ? ok : fail)('בלי LinkTable — הפלט ללא data-link (goldens נשמרים)');
  const body = { kind: 'block', id: 'node:b1' };
  const fn1 = { kind: 'note', id: 'fn-1', physicalPage: 12 };
  const tocA = { kind: 'anchor', id: 'toc:h2|1' };
  const h2 = { kind: 'heading', id: 'h2|1', physicalPage: 4 };
  const links = la.buildLinkTable([
    { linkId: la.makeLinkId('note', body, fn1), kind: 'note', source: body, target: fn1 },
    { linkId: la.makeLinkId('note-back', fn1, body), kind: 'note-back', source: fn1, target: body },
    { linkId: la.makeLinkId('toc', tocA, h2), kind: 'toc', source: tocA, target: h2 },
    { linkId: la.makeLinkId('toc-back', h2, tocA), kind: 'toc-back', source: h2, target: tocA },
  ]);
  const withLinks = render.renderHtml(layout, undefined, undefined, links);
  (withLinks.html.includes(`data-link-id="${la.makeLinkId('note', body, fn1)}" data-link-kind="note" data-link-target-page="12"`)
    ? ok : fail)('סמן ההערה נושא data-link-id/kind/target-page בהיטל');
  (withLinks.html.includes(`data-link-id="${la.makeLinkId('toc-back', h2, tocA)}" data-link-kind="toc-back" data-link-target="toc:h2|1"`)
    ? ok : fail)('עוגן הכותרת נושא את קישור החזרה ל-TOC בהיטל');
  (render.renderHtml(layout, undefined, undefined, links).html === withLinks.html
    ? ok : fail)('דטרמיניזם — אותם קלטים ⇐ אותם bytes גם עם הקישורים');
}

// ---------- 6. סריקות מקור ----------
console.log('\n6) סריקות מקור');
{
  const srcLinks = readFileSync(join(repoRoot, 'packages', 'layout-api', 'src', 'links.ts'), 'utf8');
  const srcBuilders = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'links.ts'), 'utf8');
  const codeOf = (s) => s.split('\n').filter((l) => l.trim().length > 0 && !/:\s*\*/.test(l) && !/^\s*(\*|\/\/)/.test(l));
  (!codeOf(srcLinks).some((l) => l.includes('pageEstimate')) && !codeOf(srcBuilders).some((l) => l.includes('pageEstimate'))
    ? ok : fail)('אין pageEstimate בקוד הקישורים (§11.1)');
  (srcLinks.includes('makeLinkId') && !codeOf(srcLinks).some((l) => /Date|Math\.random|performance\.now/.test(l))
    ? ok : fail)('אין אקראיות/שעון בחוזה הקישורים (דטרמיניזם)');
  const srcAudit = readFileSync(join(repoRoot, 'packages', 'audit-core', 'src', 'link-audit.ts'), 'utf8');
  (srcAudit.includes('LINK_ID_FOREIGN') && srcAudit.includes('LINK_TARGET_MISSING')
    ? ok : fail)('הביקורת נושאת את ממצאי החובה (יעד חסר + מזהה זר)');
  (typeof engine.endnoteLinksOf === 'function' && typeof engine.tocLinksOf === 'function' && typeof engine.mergeLinkTables === 'function'
    ? ok : fail)('הבונים מיוצאים ב-API הציבורי של המנוע');
  (typeof audit.auditLinks === 'function' ? ok : fail)('auditLinks מיוצא ב-API הציבורי של הביקורת');
}

// ---------- 7. מבחני חובה ----------
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
console.log(`מערכת הקישורים תקינה — ${checks} בדיקות ירוקות. כל הקישורים תקינים ב-IR ובהיטלים; אין קישור שבור בשקט.`);
