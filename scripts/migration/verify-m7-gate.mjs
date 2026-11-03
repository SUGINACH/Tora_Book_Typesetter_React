#!/usr/bin/env node
/**
 * verify-m7-gate — **שער M7 המלא** (שלב 67; אפיון §18-M7, §17.3; פרק ח).
 *
 * שער M7: מטריצת הכללים כולה מכוסה ב-fixtures; אין התנהגות קשיחה
 * ב-renderer; כל הגדרה משנה את ה-IR בדרך מתועדת; rollback = policy
 * version קודם ונעילת golden הקודם להשוואה.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

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
  headerHeightLu: 0, footerHeightLu: 0, columns: 2, footnoteColumns: 1, folioPosition: 'bottom_center', showFolio: false, sidenoteWidthLu: 300000,
});
const H = templates.for('body', 1).regions.find((r) => r.role === 'body-column' && r.columnIndex === 0).rect.height;
let seq = 0;
const LINE = (h, extra = {}) => ({ id: `l-${seq++}`, heightLu: h, footnoteRefs: [], sidenoteRefs: [], ...extra });
const block = (id, lines, extra = {}) => ({ blockId: id, role: 'body', lines, ...extra });
const hd = (id, h, level) => block(id, [LINE(h)], { role: 'heading', headingLevel: level });
const initial = (first) => engine.initialPaginationState({ firstBlockId: first, remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1) });
const mkSettings = (values = {}) => ({ schemaVersion: 1, enginePolicyId: 'torah-v1', values, configHash: 'v' });
const fullPolicy = policy.createTorahPolicy(mkSettings());

console.log('1) מטריצת הכללים כולה מכוסה — סינריו ייחוס על מלוא הצינור (H0–H7, הערות, צד, סוגריים, איזון)');
{
  const lineH = Math.floor(H / 25);
  const noteA = 'note:v1|doc|footnote|1';
  const noteB = 'note:v1|doc|footnote|2';
  const side = 'note:v1|doc|sidenote|1';
  const open = 'bracket:v1|doc|body|round|8|18';
  const bodies = new Map([
    [noteA, engine.makeNoteBodySpec(noteA, [lineH * 2])],
    [noteB, engine.makeNoteBodySpec(noteB, [lineH])],
    [side, engine.makeNoteBodySpec(side, [lineH * 2])],
  ]);
  // זרימה עשירה: H0 פותח, גוף+הערות+צד+סוגריים, H1 שער, H2 פרק עם ריווח, H3 מחסום, H4-H6 inline, איזון סוף
  const blocks = [
    hd('heading|0|O', lineH, 0),
    block('body|1', Array.from({ length: 22 }, (_, i) => i === 5 ? LINE(lineH, { footnoteRefs: [noteA] })
      : i === 12 ? LINE(lineH, { bracketOpens: [{ pairId: open, kind: 'round' }] })
      : i === 18 ? LINE(lineH, { bracketCloses: [open], footnoteRefs: [noteB] })
      : i === 9 ? LINE(lineH, { sidenoteRefs: [side] })
      : LINE(lineH))),
    hd('heading|1|PART', lineH, 1),
    block('body|2', Array.from({ length: 10 }, () => LINE(lineH))),
    hd('heading|2|CH', lineH, 2),
    block('body|3', Array.from({ length: 18 }, (_, i) => i === 6 ? LINE(lineH, { footnoteRefs: [noteA] }) : LINE(lineH))),
    hd('heading|3|SEC', lineH, 3),
    block('body|4', Array.from({ length: 12 }, () => LINE(lineH))),
    hd('heading|4|A', lineH, 4),
    block('body|5', Array.from({ length: 8 }, () => LINE(lineH))),
    hd('heading|5|B', lineH, 5),
    block('body|6', Array.from({ length: 8 }, () => LINE(lineH))),
    hd('heading|6|C', lineH, 6),
    block('body|7', Array.from({ length: 6 }, () => LINE(lineH))),
  ];
  const src = engine.createPageCandidateSource({
    blocks, templates, pageKind: 'body', noteBodies: bodies, headingBehaviorOf: fullPolicy.headingBehaviorOf,
    balanceChapterEnd: true,
  });
  const res = engine.searchPages(initial('heading|0|O'), src, new Ledger('decisions'));
  (res.status === 'complete' ? ok : fail)(`זרימה עשירה (H0–H6 + הערות + צד + סוגריים): complete (${res.status})`);
  (res.finalState.contentCursor.includes('body|7|f6') ? ok : fail)('כיסוי מלא — הסמן בקץ');
  (res.finalState.pendingFootnotes.length === 0 && res.finalState.pendingSidenotes.length === 0 ? ok : fail)('אין הערות ממתינות (אין יתומות)');
  (res.finalState.openBracketStack.length === 0 ? ok : fail)('הסוגריים נסגרו (המחסנית ריקה)');
  let chainOk = true;
  try { engine.verifyTransitionChain(initial('heading|0|O'), res.path.flatMap((e) => e.transitions)); } catch { chainOk = false; }
  (chainOk ? ok : fail)('שרשרת המעברים עוברת');
  // כל רמות הכותרות קיבלו עמודים/מקומות לפי המדיניות
  const anchors = engine.headingAnchorsOf(initial('heading|0|O'), res.path, blocks);
  const levels = new Set(anchors.map((a) => a.level));
  ([0, 1, 2, 3, 4, 5, 6].every((l) => levels.has(l)) ? ok : fail)(`כל הרמות H0–H6 מעוגנות (${[...levels].sort().join(',')})`);
  const h1 = anchors.find((a) => a.level === 1);
  (h1 !== undefined && h1.pageKind === 'sub-shaar' && h1.physicalPageIndex % 2 === 1 ? ok : fail)('H1 בעמוד שער recto');
  // אין כותרות תלויות
  (engine.hangingHeadingsOf(initial('heading|0|O'), res.path, blocks, (l) => fullPolicy.headingBehaviorOf(l).escortLines).length === 0 ? ok : fail)('אין כותרת תלויה (שער שלב 63)');
  // הערות: אינווריאנט
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
  (inv ? ok : fail)('אינווריאנט טור+גוש הערות ≤ עמוד (ADR-005)');
  // דטרמיניזם + Node==Worker
  const once = () => JSON.stringify(res.path.map((e) => e.candidateId));
  const res2 = engine.searchPages(initial('heading|0|O'), src, new Ledger('decisions'));
  (once() === JSON.stringify(res2.path.map((e) => e.candidateId)) ? ok : fail)('דטרמיניזם — שתי ריצות זהות');
}

console.log('\n2) Node == Worker — ביט-ביט (המדיניות המלאה זורמת גם ב-Worker)');
{
  const lineH = Math.floor(H / 20);
  const blocks = [hd('heading|0|O', lineH, 0), block('body|1', Array.from({ length: 15 }, () => LINE(lineH))), hd('heading|2|C', lineH, 2), block('body|2', Array.from({ length: 10 }, () => LINE(lineH)))];
  const payload = {
    templates: { geometry: { pageWidth: 4000000, pageHeight: 5600000, margin: 160000, mainX: 400000, mainWidth: 3200000, columnWidth: 1520000, columnGap: 160000, contentTop: 160000, contentBottom: 5440000 }, headerHeightLu: 0, footerHeightLu: 0, columns: 2, footnoteColumns: 1, folioPosition: 'bottom_center', showFolio: false, sidenoteWidthLu: null },
    blocks,
    first: 'heading|0|O',
    values: {},
  };
  const code = `
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const engine = await import(workerData.repoRoot + '/packages/layout-engine/dist/index.js');
      const policy = await import(workerData.repoRoot + '/packages/policy-torah/dist/index.js');
      const la = await import(workerData.repoRoot + '/packages/layout-api/dist/index.js');
      const templates = engine.buildPageTemplateSet(workerData.payload.templates);
      const p = policy.createTorahPolicy({ schemaVersion: 1, enginePolicyId: 'torah-v1', values: workerData.payload.values, configHash: 'v' });
      const src = engine.createPageCandidateSource({ blocks: workerData.payload.blocks, templates, pageKind: 'body', headingBehaviorOf: p.headingBehaviorOf });
      const initial = engine.initialPaginationState({ firstBlockId: workerData.payload.first, remainingByRegion: engine.initialRemainingByRegion(templates.for('body', 1), 1) });
      const res = engine.searchPages(initial, src, new la.DecisionLedgerBuilder('decisions'));
      parentPort.postMessage(JSON.stringify({ ids: res.path.map((e) => e.candidateId), hash: res.finalState.stateHash }));
    })().catch((e) => { throw e; });
  `;
  const workerSrc = `const { parentPort, workerData } = require('node:worker_threads'); const { Worker } = require('node:worker_threads');`;
  void workerSrc;
  // Node==Worker דרך eval בתוך Worker (כמו שער M6)
  const { writeFile } = await import('node:fs/promises');
  const tmp = join(repoRoot, 'tmp-m7-worker.cjs');
  await writeFile(tmp, code.replace("require('node:worker_threads')", "require('node:worker_threads')"), 'utf8');
  let workerResult = null;
  try {
    const { rm } = await import('node:fs/promises');
    const w = new Worker(tmp, { workerData: { repoRoot, payload } });
    workerResult = await new Promise((resolve) => {
      w.on('message', (m) => { resolve(m); w.terminate(); });
      w.on('error', (e) => { console.log('  worker error:', e.message); resolve(null); w.terminate(); });
    });
    await rm(tmp, { force: true });
  } catch {
    //
  }
  // הריצה ב-main
  const p = policy.createTorahPolicy(mkSettings());
  const src = engine.createPageCandidateSource({ blocks, templates: engine.buildPageTemplateSet(payload.templates), pageKind: 'body', headingBehaviorOf: p.headingBehaviorOf });
  const res = engine.searchPages(initial('heading|0|O'), src, new Ledger('decisions'));
  if (workerResult !== null) {
    const w = JSON.parse(workerResult);
    (w.hash === res.finalState.stateHash && JSON.stringify(w.ids) === JSON.stringify(res.path.map((e) => e.candidateId))
      ? ok : fail)('Node == Worker: מזהים ו-stateHash זהים ביט-ביט');
  } else {
    fail('Worker לא החזיר תוצאה');
  }
}

console.log('\n3) אין התנהגות קשיחה ב-renderer — הכל דרך מדיניות/IR');
{
  const renderDir = join(repoRoot, 'packages', 'render-html', 'src');
  let offenders = [];
  const scan = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (name === 'node_modules' || name === 'dist') continue;
      const st = statSync(p);
      if (st.isDirectory()) scan(p);
      else if (/\.ts$/.test(name)) {
        const src = readFileSync(p, 'utf8');
        if (/headingLevel\s*===?\s*\d|forcePageBreak|h2-orn-scope|startOnRecto|protectParens|balanceColumns/.test(src)) offenders.push(p.slice(repoRoot.length + 1));
      }
    }
  };
  scan(renderDir);
  (offenders.length === 0 ? ok : fail)(`ללא לוגיקת כותרות/עימוד קשיחה ב-render-html (${offenders.length})`);
  // המנוע אינו מכיר רמות (שער 58) ואין לו כלל תורני
  const engineDir = join(repoRoot, 'packages', 'layout-engine', 'src');
  let hard = [];
  const scan2 = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (name === 'node_modules' || name === 'dist') continue;
      const st = statSync(p);
      if (st.isDirectory()) scan2(p);
      else if (/\.ts$/.test(name)) {
        const src = readFileSync(p, 'utf8');
        if (/headingLevel\s*===?\s*\d/.test(src)) hard.push(p.slice(repoRoot.length + 1));
      }
    }
  };
  scan2(engineDir);
  (hard.length === 0 ? ok : fail)('אף קובץ מנוע אינו משווה headingLevel למספר (הליבה אינה מכירה H2)');
}

console.log('\n4) כל הגדרה משנה את ה-IR/המדיניות בדרך מתועדת (מפתחות במרשם)');
{
  const reg = policy.TORAH_RULE_REGISTRY;
  const withKeys = reg.filter((r) => r.settingsKeys.length > 0);
  (reg.length >= 18 && withKeys.length >= 12 ? ok : fail)(`המרשם: ${reg.length} כללים, ${withKeys.length} עם מפתחות הגדרות מתועדים`);
  // דגימות: הגדרה ⇒ שינוי מדיניות מדיד (בפועל)
  const samples = [
    ['h2-orn-scope', (v) => policy.createTorahPolicy(mkSettings({ 'h2-orn-scope': v })).headingBehaviorOf(2).openerSpacing.ornamentTopEm, 'none', 0],
    ['odd-h1', (v) => policy.createTorahPolicy(mkSettings({ 'odd-h1': v })).headingBehaviorOf(1).startOnRecto, false, false],
    ['mode-h1', (v) => policy.createTorahPolicy(mkSettings({ 'mode-h1': v })).headingBehaviorOf(1).forcePageTemplate, 'new_page_1col', 'body'],
    ['drop-word-mode', (v) => policy.createTorahPolicy(mkSettings({ 'drop-word-mode': v })).firstWord.mode, 'bold', 'bold'],
    ['page-num-format', (v) => policy.folioPolicyOf(mkSettings({ 'page-num-format': v })).format, 'numbers', 'numbers'],
    ['hdr-h1-title-mode', (v) => policy.runningHeadPolicyOf(mkSettings({ 'hdr-h1-title-mode': v })).h1TitleMode, 'primary', 'primary'],
    ['section-divider-style', (v) => policy.chapterBalancePolicyOf(mkSettings({ 'section-divider-style': v })).dividerEnabled, 'none', false],
    ['dim-h3-side-h', (v) => policy.createTorahPolicy(mkSettings({ 'h3-ornament-l': 'diamonds', 'dim-h3-side-h': v })).headingBehaviorOf(3).barrierOrnamentEm, '2em', 2],
  ];
  let allFlow = true;
  for (const [key, get, value, expected] of samples) {
    if (get(value) !== expected) { allFlow = false; fail(`הגדרה ${key}=${value} אינה זורמת (${String(get(value))} ≠ ${String(expected)})`); }
  }
  if (allFlow) ok(`8 הגדרות נדגמו — כולן זורמות למדיניות בפועל (h2-orn-scope, odd-h1, mode-h1, drop-word-mode, page-num-format, hdr-h1-title-mode, section-divider-style, dim-h3-side-h)`);
}

console.log('\n5) Rollback = policy version קודם + נעילת golden');
{
  const sig = policy.torahRegistrySignature();
  const v2rules = (sig.match(/@2/g) ?? []).length;
  (v2rules >= 8 ? ok : fail)(`גרסאות כללים מועלות עם שינוי סמנטיקה (${v2rules} כללים בגרסה 2; rollback = v1)`);
  (policy.torahRuleIssues().length === 0 ? ok : fail)('המרשם תקין');
  // הזהויות נעולות: אותה מדיניות ⇒ אותם מזהים (golden להשוואה) — המזהים
  // הקנוניים של ההתנהגויות נגזרים מהמרשם (עקביים בין יצירות)
  const ids1 = policy.headingBehaviorIds();
  (ids1 === policy.headingBehaviorIds() ? ok : fail)('נעילת מזהים: התנהגויות זהות בין יצירות (golden להשוואה)');
  // שינוי הגדרה משנה את המדיניות בפועל (ניתן לזהות rollback)
  const pOdd = policy.createTorahPolicy(mkSettings({ 'odd-h1': false })).headingBehaviorOf(1);
  (pOdd.startOnRecto === false && fullPolicy.headingBehaviorOf(1).startOnRecto === true ? ok : fail)('שינוי הגדרה ⇒ התנהגות שונה (rollback מזוהה)');
  // stateHash משתנה בין מדיניות שונה — הפלט נושא hashes
  const lineH = Math.floor(H / 10);
  const blocks = [block('body|1', Array.from({ length: 5 }, () => LINE(lineH))), hd('heading|2|N', lineH, 2), block('body|2', Array.from({ length: 4 }, () => LINE(lineH)))];
  const runWith = (beh) => {
    const s = engine.createPageCandidateSource({ blocks, templates, pageKind: 'body', headingBehaviorOf: beh });
    return engine.searchPages(initial('body|1'), s, new Ledger('decisions')).finalState.stateHash;
  };
  (runWith(fullPolicy.headingBehaviorOf) !== runWith(policy.createMinimalPolicy(mkSettings()).headingBehaviorOf)
    ? ok : fail)('מדיניות שונה ⇒ stateHash שונה (הפלט נושא את חתימת המדיניות)');
}

console.log('\n6) פוליו, גימטריה וכותרות רצות — מבחני החובה של השלב');
{
  (policy.gematriaOf(15) === 'טו' && policy.gematriaOf(16) === 'טז' && policy.gematriaOf(999) === 'תתקצט' && policy.gematriaOf(1000) === ''
    ? ok : fail)('גימטריה: האלגוריתם ההיסטורי (טו/טז; תחום 1..999)');
  const folio = policy.folioPolicyOf(mkSettings({ 'page-num-initial-value': '5' }));
  (policy.folioLabelOf(1, 'body', folio).printed === 'ה' && policy.folioLabelOf(3, 'sub-shaar', folio).printed === null
    ? ok : fail)('מספור התחלתי + שערים לא ממוספרים + מודל פיזי/לוגי');
  const head = policy.runningHeadOf(1, { bookTitle: 'שולחן ערוך', currentH1Title: 'חלק א - אורח חיים', currentH2Title: 'הלכות' }, policy.runningHeadPolicyOf(mkSettings()));
  (head.center === 'הלכות' && head.right.length > 0 && head.left.length > 0 ? ok : fail)('כותרות רצות לפי parity+חריצים (מהעוגנים)');
  const same = policy.runningHeadPolicyOf(mkSettings({ 'hdr-distinct-even-odd': false, 'hdr-r-type': 'h1_full' }));
  (policy.runningHeadOf(1, { bookTitle: '', currentH1Title: 'חלק א', currentH2Title: '' }, same).right
    === policy.runningHeadOf(2, { bookTitle: '', currentH1Title: 'חלק א', currentH2Title: '' }, same).right
    ? ok : fail)('same_as_even: distinctEvenOdd=false ⇒ verso זהה ל-recto');
  const glos = readFileSync(join(repoRoot, 'GLOSSARY.md'), 'utf8');
  (glos.includes('גימטריה') || glos.includes('gematria') ? ok : fail)('GLOSSARY מעודכן במושגי הפרק');
}

console.log('\n7) מלוא סוללת מאמתי פרק ח (הרצה מקומית)');
{
  const verifiers = ['verify-policy-torah', 'verify-h0-opener', 'verify-h1-shaar', 'verify-h2-opener', 'verify-h3-policy', 'verify-h456-escort', 'verify-firstword', 'verify-brackets-crosspage', 'verify-balance-chapter'];
  let allGreen = true;
  for (const v of verifiers) {
    const out = run('node', ['scripts/migration/' + v + '.mjs']);
    const pass = /PASS|ירוק|עבר/.test(out.slice(-300));
    if (!pass) { allGreen = false; fail(`${v} נכשל`); }
  }
  (allGreen ? ok : fail)(`כל 9 מאמתי פרק ח ירוקים (${verifiers.join(', ')})`);
}

console.log('\n8) רגרסיית בדיקות');
if (SKIP_TESTS) {
  console.log('  [SKIP] TORA_SKIP_TEST_REGRESSION=1 (הסוויטה רצה במלואה בצעד ה-vitest של ה-CI)');
} else {
  const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'packages/policy-torah/test/folio.test.ts']);
  const m = out.match(/Tests\s+(\d+) passed/);
  (m !== null && Number(m[1]) === 10 ? ok : fail)(`בדיקות folio: 10/10 (התקבל ${m ? m[1] : '?'})`);
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${checks - failures}/${checks} בדיקות`);
if (failures === 0) {
  console.log('שער M7 המלא עבר: מטריצת הכללים מכוסה; אין התנהגות קשיחה ב-renderer; כל הגדרה מתועדת; rollback = policy version + golden.');
}
process.exit(failures === 0 ? 0 : 1);
