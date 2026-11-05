#!/usr/bin/env node
/**
 * verify-m6-gate — שלב 57 + **שער M6 המלא** (אפיון §18-M6, §17.3; פרק ז).
 *
 * שער M6 (מהאפיון): כל fixtures של notes/H3/headings ללא HIGH; אין pass
 * מאוחר שמשנה עמוד נבחר בלי חישוב מחדש של כל התלויות; Node/Worker זהים;
 * rollback = לפי policy flags קטנים, כאשר כל פלט מכיל policy/config hash.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0; let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1';
const run = (cmd, args) => { try { return execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], env: { ...process.env, NO_COLOR: '1' } }); } catch (e) { return (e.stdout ?? '').toString(); } };
const runCode = (cmd, args) => { try { execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], env: { ...process.env, NO_COLOR: '1' } }); return 0; } catch { return 1; } };

const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));
const Ledger = la.DecisionLedgerBuilder;
const canonicalJson = la.canonicalJson;

const mkTemplates = (side = null, cols = 2) => engine.buildPageTemplateSet({
  geometry: { pageWidth: 4000000, pageHeight: 5600000, margin: 160000, mainX: 400000, mainWidth: 3200000, columnWidth: 1520000, columnGap: 160000, contentTop: 160000, contentBottom: 5440000 },
  headerHeightLu: 0, footerHeightLu: 0, columns: cols, footnoteColumns: 1, folioPosition: 'bottom_center', showFolio: false, sidenoteWidthLu: side,
});
const templates = mkTemplates();
const H = templates.for('body', 1).regions.find((r) => r.role === 'body-column' && r.columnIndex === 0).rect.height;
let seq = 0;
const LINE = (h, extra = {}) => ({ id: `l-${seq++}`, heightLu: h, footnoteRefs: [], sidenoteRefs: [], ...extra });
const block = (id, lines, extra = {}) => ({ blockId: id, role: 'body', lines, ...extra });
const h3 = (id, h) => block(id, [LINE(h)], { role: 'heading', headingLevel: 3 });
const initial = (first, t = templates) => engine.initialPaginationState({ firstBlockId: first, remainingByRegion: engine.initialRemainingByRegion(t.for('body', 1), 1) });

console.log('1) fixtures של notes/H3/headings — כל המסלולים ללא HIGH (שער M6)');
{
  const lineH = Math.floor(H / 25);
  let allNoHigh = true; let scenarios = 0; let allCovered = true; let noPending = true;
  const scenariosSpecs = [
    { name: 'notes+H3+sidenotes', tpl: mkTemplates(300000) },
    { name: 'notes בלבד', tpl: mkTemplates() },
    { name: 'חד-טורי', tpl: mkTemplates(null, 1) },
  ];
  for (const spec of scenariosSpecs) {
    const t = spec.tpl;
    const bodies = new Map([
      ['note:v1|doc|footnote|1', engine.makeNoteBodySpec('note:v1|doc|footnote|1', [lineH * 3])],
      ['note:v1|doc|footnote|2', engine.makeNoteBodySpec('note:v1|doc|footnote|2', [lineH])],
      ['note:v1|doc|sidenote|1', engine.makeNoteBodySpec('note:v1|doc|sidenote|1', [lineH * 2])],
    ]);
    const blocks = [];
    for (let i = 1; i <= 5; i++) {
      const lines = [];
      for (let j = 0; j < 10; j++) lines.push(LINE(lineH, j === 3 ? { footnoteRefs: [`note:v1|doc|footnote|${(i % 2) + 1}`] } : j === 7 && t.for('body', 1).regions.some((r) => r.role === 'outer-notes') ? { sidenoteRefs: ['note:v1|doc|sidenote|1'] } : {}));
      blocks.push(block(`body|${i}`, lines));
    }
    blocks.splice(2, 0, h3('heading|1|H3', lineH));
    const src = engine.createPageCandidateSource({ blocks, templates: t, pageKind: 'body', noteBodies: bodies });
    const res = engine.searchPages(initial('body|1', t), src, new Ledger('decisions'));
    scenarios += 1;
    if (res.status !== 'complete') allNoHigh = false;
    if (res.path.some((e) => e.fallbackCode === 'EMERGENCY_LINE')) allNoHigh = false;
    const lastBlock = blocks[blocks.length - 1];
    if (!res.finalState.contentCursor.includes(`${lastBlock.blockId}|f${lastBlock.lines.length}`)) allCovered = false;
    if (res.finalState.pendingFootnotes.length > 0 || res.finalState.pendingSidenotes.length > 0) noPending = false;
  }
  (allNoHigh ? ok : fail)(`${scenarios} תרחישי ייחוס — הכל complete בלי EMERGENCY (אין HIGH)`);
  (allCovered ? ok : fail)('כיסוי מלא — הסמן בקץ בכל התרחישים');
  (noPending ? ok : fail)('אין הערות ממתינות בסוף (אין יתומות)');
}

console.log('\n2) אינווריאנט עמוד: כל טור + גוש ההערות ≤ גובה (באג הכריכה הרטרואקטיבית — תוקן)');
{
  const lineH = Math.floor(H / 40);
  const bodies = new Map();
  const blocks = [];
  for (let i = 1; i <= 6; i++) {
    const id = `note:v1|doc|footnote|${i}`;
    bodies.set(id, engine.makeNoteBodySpec(id, i === 1 ? [Math.floor(H * 0.9)] : [lineH * 2, lineH]));
    const lines = [];
    for (let j = 0; j < 10; j++) lines.push(LINE(lineH, j === 4 ? [id] ? { footnoteRefs: [id] } : {} : {}));
    blocks.push(block(`body|${i}`, lines));
  }
  const src = engine.createPageCandidateSource({ blocks, templates, pageKind: 'body', noteBodies: bodies });
  const res = engine.searchPages(initial('body|1'), src, new Ledger('decisions'));
  const perRegion = new Map();
  for (const t of res.path.flatMap((e) => e.transitions)) {
    if (t.action.kind === 'consume-region') { const a = t.action; perRegion.set(a.regionId, (perRegion.get(a.regionId) ?? 0) + a.amountLu); }
  }
  let invariantOk = true;
  for (const [regionId, used] of perRegion) {
    if (regionId.endsWith(':col:0') || regionId.endsWith(':col:1')) {
      const page = Number(/page:(\d+):/.exec(regionId)[1]);
      const notes = perRegion.get(`page:${page}:notes`) ?? 0;
      if (used + notes > H) invariantOk = false;
    }
  }
  (res.status === 'complete' && invariantOk ? ok : fail)('לכל עמוד וטור: קווים + הערות ≤ גובה התוכן');
}

console.log('\n3) אין pass מאוחר — סריקת קוד');
{
  const files = ['candidates.ts', 'search.ts', 'notes.ts', 'endnotes.ts', 'templates.ts', 'state.ts'];
  let clean = true;
  for (const f of files) {
    const src = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', f), 'utf8');
    if (/function\s+(apply|run|do)\w*(Balance|PostProcess|AfterLayout)\w*\s*\(/.test(src) || /function\s+rebalance\w*\s*\(/.test(src)) clean = false;
  }
  (clean ? ok : fail)('אין פונקציית איזון/תיקון אחרי-החלטה בכל מודולי העימוד');
}

console.log('\n4) Node == Worker — ביט-ביט (שער M6)');
{
  const lineH = Math.floor(H / 30);
  const bodies = new Map([
    ['note:v1|doc|footnote|1', engine.makeNoteBodySpec('note:v1|doc|footnote|1', [lineH * 2])],
    ['note:v1|doc|sidenote|1', engine.makeNoteBodySpec('note:v1|doc|sidenote|1', [lineH * 3])],
  ]);
  const t = mkTemplates(300000);
  const blocks = [];
  for (let i = 1; i <= 6; i++) {
    const lines = [];
    for (let j = 0; j < 10; j++) lines.push(LINE(lineH, j === 2 ? { footnoteRefs: ['note:v1|doc|footnote|1'] } : j === 7 ? { sidenoteRefs: ['note:v1|doc|sidenote|1'] } : {}));
    blocks.push(block(`body|${i}`, lines));
  }
  blocks.splice(3, 0, h3('heading|1|H3', lineH));
  const mainSig = (() => {
    const src = engine.createPageCandidateSource({ blocks, templates: t, pageKind: 'body', noteBodies: bodies });
    const res = engine.searchPages(initial('body|1', t), src, new Ledger('decisions'));
    return canonicalJson([res.path.map((e) => e.candidateId), res.quality, res.finalState.stateHash]);
  })();
  const tmp = mkdtempSync(join(tmpdir(), 'tora-m6-'));
  const workerScript = `
import { workerData, parentPort } from 'node:worker_threads';
const engine = await import(workerData.engineUrl);
const la = await import(workerData.laUrl);
const templates = engine.buildPageTemplateSet({
  geometry: { pageWidth: 4000000, pageHeight: 5600000, margin: 160000, mainX: 400000, mainWidth: 3200000, columnWidth: 1520000, columnGap: 160000, contentTop: 160000, contentBottom: 5440000 },
  headerHeightLu: 0, footerHeightLu: 0, columns: 2, footnoteColumns: 1, folioPosition: 'bottom_center', showFolio: false, sidenoteWidthLu: 300000,
});
const H = templates.for('body', 1).regions.find((r) => r.role === 'body-column' && r.columnIndex === 0).rect.height;
const lineH = Math.floor(H / 30);
const bodies = new Map([
  ['note:v1|doc|footnote|1', engine.makeNoteBodySpec('note:v1|doc|footnote|1', [lineH * 2])],
  ['note:v1|doc|sidenote|1', engine.makeNoteBodySpec('note:v1|doc|sidenote|1', [lineH * 3])],
]);
const blocks = [];
for (let i = 1; i <= 6; i++) {
  const lines = [];
  for (let j = 0; j < 10; j++) lines.push({ id: 'l' + i + '-' + j, heightLu: lineH, footnoteRefs: j === 2 ? ['note:v1|doc|footnote|1'] : [], sidenoteRefs: j === 7 ? ['note:v1|doc|sidenote|1'] : [] });
  blocks.push({ blockId: 'body|' + i, role: 'body', lines });
}
blocks.splice(3, 0, { blockId: 'heading|1|H3', role: 'heading', headingLevel: 3, lines: [{ id: 'h3l', heightLu: lineH, footnoteRefs: [], sidenoteRefs: [] }] });
const src = engine.createPageCandidateSource({ blocks, templates, pageKind: 'body', noteBodies: bodies });
const init = engine.initialPaginationState({ firstBlockId: 'body|1', remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1) });
const res = engine.searchPages(init, src, new la.DecisionLedgerBuilder('decisions'));
parentPort.postMessage(la.canonicalJson([res.path.map((e) => e.candidateId), res.quality, res.finalState.stateHash]));
`;
  const workerFile = join(tmp, 'm6-worker.mjs');
  writeFileSync(workerFile, workerScript);
  const engineUrl = new URL('file://' + join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js')).href;
  const laUrl = new URL('file://' + join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js')).href;
  const workerSig = await new Promise((resolve, reject) => {
    const w = new Worker(new URL(`file://${workerFile}`), { workerData: { engineUrl, laUrl } });
    w.on('message', resolve);
    w.on('error', reject);
    w.on('exit', (c) => { if (c !== 0) reject(new Error(`worker exit ${c}`)); });
  });
  rmSync(tmp, { recursive: true, force: true });
  (workerSig === mainSig ? ok : fail)('Node == Worker: אותו מסלול/איכות/מצב סופי ביט-ביט');
}

console.log('\n5) trace אינו משנה; ‏10 ריצות דטרמיניזם; policy flags הפיכים');
{
  const lineH = Math.floor(H / 30);
  const bodies = new Map([['note:v1|doc|footnote|1', engine.makeNoteBodySpec('note:v1|doc|footnote|1', [lineH * 2])]]);
  const blocks = [];
  for (let i = 1; i <= 5; i++) {
    const lines = [];
    for (let j = 0; j < 10; j++) lines.push(LINE(lineH, j === 5 ? { footnoteRefs: ['note:v1|doc|footnote|1'] } : {}));
    blocks.push(block(`body|${i}`, lines));
  }
  blocks.splice(2, 0, h3('heading|1|H3', lineH));
  const src = engine.createPageCandidateSource({ blocks, templates, pageKind: 'body', noteBodies: bodies });
  const sig = (trace) => {
    const res = engine.searchPages(initial('body|1'), src, new Ledger(trace));
    return canonicalJson([res.path.map((e) => e.candidateId), res.quality, res.finalState.stateHash]);
  };
  (sig('off') === sig('decisions') && sig('decisions') === sig('full') ? ok : fail)('trace off/decisions/full ⇐ אותה תוצאה');
  const s = sig('decisions');
  (new Set(Array.from({ length: 10 }, () => sig('decisions'))).size === 1 ? ok : fail)('10 ריצות ⇐ אותה חתימה');
  // rollback: policy flags קטנים — שינוי דגל משנה מסלול באופן דטרמיניסטי
  const srcStrict = engine.createPageCandidateSource({ blocks, templates, pageKind: 'body', noteBodies: bodies, policy: { allowIntraParagraphBreaks: false } });
  const rStrict = engine.searchPages(initial('body|1'), srcStrict, new Ledger('decisions'));
  (rStrict.status === 'complete' ? ok : fail)('rollback flag (allowIntraParagraphBreaks=false) — מסלול חוקי מלא');
  const rStrict2 = engine.searchPages(initial('body|1'), srcStrict, new Ledger('decisions'));
  (canonicalJson(rStrict.path.map((e) => e.candidateId)) === canonicalJson(rStrict2.path.map((e) => e.candidateId)) ? ok : fail)('הדגל דטרמיניסטי — אותו מסלול בין ריצות');
  // הפלט נושא hashes: השרשרת עוברת אימות stateHash (קנוני; §9.2)
  let chainOk = true;
  try { engine.verifyTransitionChain(initial('body|1'), rStrict.path.flatMap((e) => e.transitions)); } catch { chainOk = false; }
  (chainOk ? ok : fail)('שרשרת המעברים נושאת stateHash-ים קנוניים ועוברת אימות');
}

console.log('\n6) משוב endnotes — mappingHash עם offset אמיתי');
{
  const lineH = Math.floor(H / 20);
  const blocks = [block('body|1', Array.from({ length: 30 }, () => LINE(lineH)))];
  const src = engine.createPageCandidateSource({ blocks, templates, pageKind: 'body' });
  const res = engine.searchPages(initial('body|1'), src, new Ledger('decisions'));
  const flow = engine.layoutEndnoteFlow([
    { noteId: 'note:v1|doc|endnote|1', body: engine.makeNoteBodySpec('note:v1|doc|endnote|1', [lineH, lineH]), anchor: { blockId: 'body|1', lineId: 'line-0' } },
  ], templates, { bodyPageCount: res.finalState.physicalPageIndex });
  (flow.firstPhysicalPage === res.finalState.physicalPageIndex + 1 ? ok : fail)('ה-endnotes מתחילים אחרי העמודים האמיתיים (§11.1 — אין pageEstimate)');
  (typeof flow.mappingHash === 'string' && /^[0-9a-f]{64}$/.test(flow.mappingHash) ? ok : fail)('הפלט נושא mappingHash קנוני (אות האיטרציה)');
}

console.log('\n7) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages');
(runCode('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('typecheck:packages');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check');
if (!SKIP_TESTS) {
  const t = run('npm', ['run', 'test:packages']);
  (/Tests\s+1265\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 1265/1265');
} else {
  ok('test:packages — [skipped-in-CI: parent step already ran the suite]');
}

console.log('\n' + '='.repeat(60));
if (failures > 0) { console.error(`נכשל: ${failures} מתוך ${checks} בדיקות`); process.exit(1); }
console.log(`הכל ירוק: ${checks}/${checks} — שלב 57 + שער M6 המלא עבר`);
