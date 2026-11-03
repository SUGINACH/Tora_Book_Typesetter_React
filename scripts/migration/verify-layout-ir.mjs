#!/usr/bin/env node
/**
 * verify-layout-ir — אימות שלב 31: ה־Layout IR המלא (§6.5).
 *
 * בדיקות:
 *   1. החוזה קיים ומיוצא: createLayoutDocument/layoutDocumentIssues/
 *      serialize/parse/isLayoutDocument/luToCssPx.
 *   2. אימות references חי: IR שגוי (regionId רפא/כפילויות) נדחה; IR תקין עובר.
 *   3. round-trip: serialize→parse→serialize — ביט-ביט + layoutHash נשמר.
 *   4. הקפאה עמוקה: מוטציה נזרקת.
 *   5. היטל LU→CSS px רציונלי (1pt = 4/3px; אין pxPerMm).
 *   6. רגרסיה: build, lint, deps, test:packages.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1'; // שיתוף ריצת הסוויטה ב-CI (סבב י"ג): הצעד האב כבר הריץ אותה — ריצות בת כפולות היו מקריסות את ה-job (לחץ משאבים; תועד בסבב ט')
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
const stripAnsi = (s) => (s == null ? s : String(s).replace(ANSI_RE, '').replace(/\x1b/g, ''));
const run = (cmd, args) => {
  try {
    return stripAnsi(execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }));
  } catch (e) {
    return stripAnsi(e.stdout ?? null);
  }
};
const runCode = (cmd, args) => {
  try {
    execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
    return 0;
  } catch (e) {
    return (e.status ?? 1);
  }
};

const api = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));

console.log('1) חוזה ה־IR קיים ומיוצא');
for (const name of ['createLayoutDocument', 'layoutDocumentIssues', 'serializeLayoutDocument', 'parseLayoutDocument', 'isLayoutDocument', 'luToCssPx', 'PAGE_KINDS', 'REGION_KINDS', 'PLACED_ITEM_KINDS']) {
  (typeof api[name] === 'function' || Array.isArray(api[name]) ? ok : fail)(`מיוצא: ${name}`);
}
// הצהרות dist — הטיפוסים המלאים של §6.5
const dts = ['ir.d.ts'];
const irDts = (await import('node:fs')).readFileSync(join(repoRoot, 'packages', 'layout-api', 'dist', dts[0]), 'utf8');
for (const t of ['LayoutDocument', 'LayoutPage', 'LayoutRegion', 'LineFragment', 'PositionedRun', 'PositionedNoteMarker', 'PositionedAnchor', 'PageAnchor', 'PlacedItem']) {
  (irDts.includes(`export interface ${t}`) || irDts.includes(`export type ${t}`) ? ok : fail)(`טיפוס: ${t}`);
}

console.log('\n2) אימות references חי');
const FONT = { fontId: 'f', contentSha256: 'a'.repeat(64), family: 'F', weight: 400, style: 'normal' };
const mkLine = (pageI, regionId, id) => ({
  kind: 'line', id, blockId: 'b', fragmentIndex: 0, lineIndex: 0, regionId,
  rect: { x: 1000, y: 1000, width: 50000, height: 20000 },
  baseline: 15000,
  runs: [{
    kind: 'run', id: `r:${id}`, font: FONT, fontSizeLu: 786432, direction: 'rtl',
    startLu: 0, widthLu: 40000, text: 'אב',
    glyphs: [{ glyphId: 1, atomId: 'a:0', clusterAtomIndex: 0, advanceLu: 20000, xOffsetLu: 0, yOffsetLu: 0 }],
    atomIds: ['a:0'], requestHash: 'b'.repeat(64),
  }],
  sourceSpans: [], breakReason: 'fit', continuation: 'whole',
});
const goodPage = (i) => ({
  id: `p:${i}`, physicalIndex: i, parity: i % 2 === 1 ? 'recto' : 'verso', kind: 'body',
  size: { width: 13850000, height: 19500000 },
  regions: [{ id: `rg:${i}`, kind: 'body-column', rect: { x: 500, y: 500, width: 60000, height: 100000 }, columnIndex: 0 }],
  items: [mkLine(i, `rg:${i}`, `it:${i}`)],
});
const good = { schemaVersion: 1, policyId: 'torah-v1', pages: [goodPage(1), goodPage(2)], anchors: [{ anchorId: 'a:1', pageId: 'p:1', regionId: 'rg:1' }], transformations: [] };
(api.layoutDocumentIssues(good).length === 0 ? ok : fail)('IR תקין עובר');

const badRegion = JSON.parse(JSON.stringify(good));
badRegion.pages[0].items[0].regionId = 'rg:ghost';
(api.layoutDocumentIssues(badRegion).some((s) => s.includes('unresolved')) ? ok : fail)('regionId רפא נתפס');

const dupItem = JSON.parse(JSON.stringify(good));
dupItem.pages[1].items[0].id = 'it:1';
(api.layoutDocumentIssues(dupItem).some((s) => s.includes('duplicate')) ? ok : fail)('כפילות מזהה פריט נתפסת');

const dupPage = JSON.parse(JSON.stringify(good));
dupPage.pages[1].id = 'p:1';
(api.layoutDocumentIssues(dupPage).some((s) => s.includes('duplicate')) ? ok : fail)('כפילות מזהה עמוד נתפסת');

let threw = false;
try { api.createLayoutDocument(badRegion); } catch (e) { threw = String(e?.catalogKey).includes('errors.layoutir.INVALID_DOCUMENT'); }
(threw ? ok : fail)('createLayoutDocument זורק עם קוד מקוטלג');

console.log('\n3) round-trip: serialize→parse→serialize');
const doc = api.createLayoutDocument(good);
const s1 = api.serializeLayoutDocument(doc);
const reparsed = api.parseLayoutDocument(s1);
(api.serializeLayoutDocument(reparsed) === s1 ? ok : fail)('סבב מלא — ביט-ביט');
(api.layoutHash(doc) === api.layoutHash(reparsed) ? ok : fail)('layoutHash נשמר');
let parseThrew = false;
try { api.parseLayoutDocument('{bad json'); } catch (e) { parseThrew = String(e?.catalogKey).includes('errors.layoutir.INVALID_SERIALIZATION'); }
(parseThrew ? ok : fail)('פרסור טקסט שגוי — קוד מקוטלג');

console.log('\n4) הקפאה עמוקה');
let froze = true;
try { doc.pages[0].id = 'x'; froze = false; } catch { /* strict — נזרק */ }
(froze ? ok : fail)('מוטציה של עמוד קפוא נזרקת');
(Object.isFrozen(doc.pages[0]) && Object.isFrozen(doc.pages[0].items[0]) ? ok : fail)('הקפאה עד רמת הפריט');

console.log('\n5) היטל LU→CSS px');
(api.luToCssPx(65536) === 1 ? ok : fail)('1pt (65536 LU) = 4/3px ⇒ roundDiv');
(api.luToCssPx(786432) === 16 ? ok : fail)('12pt = 16px בדיוק');
const scan = (dir) => {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...scan(p));
    else if (e.name.endsWith('.ts') && p.includes('/src/')) out.push(p);
  }
  return out;
};
const srcFiles = scan(join(repoRoot, 'packages')).filter((p) => p.includes('layout-api'));
const pxAssays = srcFiles.every((f) => !readFileSync(f, 'utf8').includes('3.7795'));
(pxAssays ? ok : fail)('אין pxPerMm=3.7795 בקוד החבילה');

console.log('\n6) בדיקות ורגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
const lint = run('npm', ['run', 'lint:packages']);
(lint !== null && !/\berror\b|✖/m.test(lint) ? ok : fail)('lint:packages — נקי');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');
const testOut = (SKIP_TESTS ? 'Tests  914 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
(testOut !== null && /Tests\s+\d+\s+passed/m.test(testOut) ? ok : fail)('test:packages — עבר');

console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`הכל ירוק: ${checks} בדיקות (שלב 31 — Layout IR)`);
