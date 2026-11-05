#!/usr/bin/env node
/**
 * verify-endnotes — אימות שלב 55: הערות סיום כזרם מדוד ומשוב לנקודת השבת
 * (אפיון §10.3 Endnotes, §11.1; פרק ז/M6).
 *
 * בדיקות:
 *   1. חוזה: הייצואים; זרם מדוד על עמודי notes; קישורים הדדיים.
 *   2. ריצה חיה: מילוי רציף + אטומיות; anchorReport; מספור.
 *   3. ארוכה מעמוד: כשל מפורש (בלי פיצול/שורה בודדת) או פיצול עם #cont.
 *   4. משוב לנקודת השבת: mappingHash מושפע מעמודי הגוף ומהפריסה;
 *      דטרמיניזם (אותו קלט ⇐ אותו hash).
 *   5. אין יתומות: כל ערך מוקם; כפילויות/קלט פסול ⇒ דחייה מקוטלגת.
 *   6. רגרסיה: build, typecheck, lint, deps, test:packages (מונה מדויק).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1';
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
const stripAnsi = (s) => (s == null ? s : String(s).replace(ANSI_RE, '').replace(/\x1b/g, ''));
const run = (cmd, args) => {
  try {
    return stripAnsi(execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }));
  } catch (e) { return stripAnsi(e.stdout ?? null); }
};
const runCode = (cmd, args) => {
  try {
    execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
    return 0;
  } catch { return 1; }
};

const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));

console.log('1) חוזה');
for (const fn of ['layoutEndnoteFlow', 'endnoteEntryIssues']) {
  (typeof engine[fn] === 'function' ? ok : fail)(`מיוצא: ${fn}`);
}
{
  const src = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'endnotes.ts'), 'utf8');
  (src.includes('anchorReport') && src.includes('mappingHash') && src.includes('firstPhysicalPage') ? ok : fail)('משוב לנקודת השבת: anchorReport + mappingHash + offset (§11.1)');
  (src.includes('ADR-005') && src.includes('גבולות קווים') ? ok : fail)('מדיניות פיצול בהטלת ADR-005 מתועדת');
}

const templates = engine.buildPageTemplateSet({
  geometry: { pageWidth: 4000000, pageHeight: 5600000, margin: 160000, mainX: 400000, mainWidth: 3200000, columnWidth: 1520000, columnGap: 160000, contentTop: 160000, contentBottom: 5440000 },
  headerHeightLu: 0, footerHeightLu: 0, columns: 2, footnoteColumns: 1, folioPosition: 'bottom_center', showFolio: false, sidenoteWidthLu: null,
});
const H = templates.for('notes', 1).regions.find((r) => r.role === 'body-column').rect.height;
const entry = (id, lines, block = 'body|1', line = 'line-1') => ({ noteId: id, body: engine.makeNoteBodySpec(id, lines), anchor: { blockId: block, lineId: line } });

console.log('\n2) זרם מדוד + קישורים');
{
  const unit = Math.floor(H / 4);
  const entries = [
    entry('n1', [unit, unit], 'body|3', 'line-7'),
    entry('n2', [unit, unit], 'body|5', 'line-2'),
    entry('n3', [unit, unit], 'body|9', 'line-1'),
  ];
  const res = engine.layoutEndnoteFlow(entries, templates, { bodyPageCount: 10 });
  (res.pages === 2 && res.firstPhysicalPage === 11 ? ok : fail)(`מילוי רציף — 2 עמודי זרם מתחילים בעמוד פיזי 11 (קיבלנו ${res.pages}/${res.firstPhysicalPage})`);
  (res.anchorReport['n1'] === 11 && res.anchorReport['n3'] === 12 ? ok : fail)('anchorReport ממפה לעמודים הפיזיים הנכונים');
  (res.placements.every((p) => p.split === false) && res.placements.every((p) => p.linesPlaced === 2) ? ok : fail)('אטומיות — הערות בשלמותן, אין יתומות');
  (res.placements[0].anchor.blockId === 'body|3' && res.placements[0].ordinal === 1 ? ok : fail)('קישור הדדי + מספור לפי סדר המקור');
}

console.log('\n3) ארוכה מעמוד');
{
  let threw = false;
  try { engine.layoutEndnoteFlow([entry('n1', [H + 5000])], templates, { bodyPageCount: 1 }); } catch { threw = true; }
  (threw ? ok : fail)('שורה בודדת גבוהה מעמוד ⇒ כשל מפורש (בלתי-ניתנת לפיצול)');
  threw = false;
  try { engine.layoutEndnoteFlow([entry('n1', [H + 5000])], templates, { bodyPageCount: 1, notePolicy: { allowLongNoteSplit: true } }); } catch { threw = true; }
  (threw ? ok : fail)('גם עם דגל פיצול — שורה בודדת ⇒ כשל (לולאת הדחייה נחסמה)');
  const unit = Math.floor(H / 3);
  threw = false;
  try { engine.layoutEndnoteFlow([entry('n1', [unit, unit, unit, unit])], templates, { bodyPageCount: 1 }); } catch { threw = true; }
  (threw ? ok : fail)('ריבוי שורות > עמוד בלי פיצול ⇒ כשל מפורש');
  const res = engine.layoutEndnoteFlow([entry('n1', [unit, unit, unit, unit])], templates, { bodyPageCount: 1, notePolicy: { allowLongNoteSplit: true } });
  (res.splits === 1 && res.placements[1].noteId === 'n1#cont' && res.placements[1].anchor.blockId === 'body|1' ? ok : fail)('עם פיצול: המשך #cont עם אותו עוגן (קישור הדדי נשמר)');
}

console.log('\n4) משוב לנקודת השבת (§11.1)');
{
  const entries = [entry('n1', [1000, 1000]), entry('n2', [1000])];
  const a = engine.layoutEndnoteFlow(entries, templates, { bodyPageCount: 10 });
  const b = engine.layoutEndnoteFlow(entries, templates, { bodyPageCount: 10 });
  const c = engine.layoutEndnoteFlow(entries, templates, { bodyPageCount: 12 });
  (a.mappingHash === b.mappingHash ? ok : fail)('דטרמיניזם: אותו קלט ⇐ אותו hash');
  (a.mappingHash !== c.mappingHash ? ok : fail)('שינוי עמודי גוף משנה את החתימה — אות האיטרציה ל-fixed-point');
  const more = engine.layoutEndnoteFlow([...entries, entry('n3', [1000])], templates, { bodyPageCount: 10 });
  (more.mappingHash !== a.mappingHash ? ok : fail)('שינוי בפריסת הזרם משנה את החתימה');
}

console.log('\n5) קלט פסול');
{
  let threw = false;
  try { engine.layoutEndnoteFlow([entry('n1', [100]), entry('n1', [100])], templates, { bodyPageCount: 1 }); } catch { threw = true; }
  (threw ? ok : fail)('noteId כפול ⇒ דחייה מקוטלגת');
  threw = false;
  try { engine.layoutEndnoteFlow([entry('n1', [100])], templates, { bodyPageCount: -3 }); } catch { threw = true; }
  (threw ? ok : fail)('bodyPageCount שלילי ⇒ דחייה מקוטלגת');
  const empty = engine.layoutEndnoteFlow([], templates, { bodyPageCount: 7 });
  (empty.pages === 1 && empty.placements.length === 0 ? ok : fail)('זרם ריק ⇒ עמוד אחד ריק');
}

console.log('\n6) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages');
(runCode('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('typecheck:packages');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check');
if (!SKIP_TESTS) {
  const t = run('npm', ['run', 'test:packages']);
  (/Tests\s+1243\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 1243/1243');
} else {
  ok('test:packages — [skipped-in-CI: parent step already ran the suite]');
}

// ─────────────────────────── סיכום ───────────────────────────
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`הכל ירוק: ${checks}/${checks} — שלב 55 (הערות סיום) עבר`);
