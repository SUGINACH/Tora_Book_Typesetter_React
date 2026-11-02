#!/usr/bin/env node
/**
 * verify-pagination-state — אימות שלב 49: PaginationState מלא ומעברי מצב
 * טהורים (אפיון §9.1, §9.2, §10.3, §10.4; פרק ז/M6).
 *
 * בדיקות:
 *   1. חוזה: כל שדות §9.1 קיימים בטיפוס המיוצא; הקטלוג כולל את שני
 *      הקודים החדשים (PAGINATION_STATE_INVALID, CURSOR_INVALID); השערים
 *      ב-error-keys.md מכסים אותם.
 *   2. ריצה חיה מה־dist: המצב ההתחלתי תקין וקפוא; דטרמיניזם ה־hash
 *      (ריצה כפולה); סדר מפתחות remainingByRegion אינו משנה.
 *   3. כל שדה מכסה משנה hash (9 שדות); שני מצבים בעלי hash זהה כוללים
 *      notes/brackets/parity — נבדק על ידי כך שאף זוג מכסה אינו מתנגש.
 *   4. תלות בין עמודים: openPage נושא pending/brackets/headings; אינדקס
 *      רציף; clone ⇐ אותו hash; restore עם hash תואם עובד וזיוף נדחה.
 *   5. שרשרת מעברים: verifyTransitionChain עוברת על 9 מעברים אמיתיים
 *      (כולל סוגריים, הערה ממתינה, פרק) — וזיוף חוליה נתפס; לכל מעבר
 *      explanation קנוני (שעת השער: "כל candidate מסביר את המצב").
 *   6. דחיות: מעבר לא חוקי (צריכה מעבר לנותר, סגירת לא-עליון, הצבה
 *      שלא בתור) ⇒ PAGINATION_STATE_INVALID מקוטלג — אין שקט.
 *   7. אין state גלובלי: המודול אינו מחזיק שום משתנה module-level mutable.
 *   8. רגרסיה: build, typecheck, lint, deps, test:packages (מונה מדויק).
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

console.log('1) חוזה — שדות §9.1 וקטלוג שגיאות');
{
  const src = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'state.ts'), 'utf8');
  for (const field of ['contentCursor', 'physicalPageIndex', 'columnIndex', 'remainingByRegion', 'pendingFootnotes', 'pendingSidenotes', 'openBracketStack', 'activeHeadingContext', 'chapterState', 'stateHash']) {
    (src.includes(`readonly ${field}`) ? ok : fail)(`שדה §9.1: ${field}`);
  }
  for (const fn of ['initialPaginationState', 'clonePaginationState', 'restorePaginationState', 'advanceCursor', 'openPage', 'switchColumn', 'consumeRegion', 'pendFootnote', 'placeFootnotes', 'pendSidenote', 'placeSidenotes', 'bracketOpen', 'bracketClose', 'headingEnter', 'headingExit', 'chapterEnter', 'verifyTransitionChain', 'verifyPaginationState', 'stateHashOf', 'parseCursor', 'formatCursor']) {
    (typeof engine[fn] === 'function' ? ok : fail)(`מיוצא: ${fn}`);
  }
  (engine.LAYOUT_ENGINE_ERROR_CATALOG['errors.engine.PAGINATION_STATE_INVALID'] !== undefined ? ok : fail)('קטלוג: PAGINATION_STATE_INVALID רשום');
  (engine.LAYOUT_ENGINE_ERROR_CATALOG['errors.engine.CURSOR_INVALID'] !== undefined ? ok : fail)('קטלוג: CURSOR_INVALID רשום');
  const keysTable = readFileSync(join(repoRoot, 'docs', 'i18n', 'error-keys.md'), 'utf8');
  for (const k of ['errors.engine.PAGINATION_STATE_INVALID', 'errors.engine.CURSOR_INVALID', 'errors.engine.NO_LEGAL_LINE_BREAK']) {
    (keysTable.includes(`\`${k}\``) ? ok : fail)(`error-keys.md מכסה: ${k}`);
  }
}

console.log('\n2) ריצה חיה מה־dist — המצב ההתחלתי, דטרמיניזם, סדר מפתחות');
const REGIONS = { 'page:1:col:0': 600000, 'page:1:col:1': 600000, 'page:1:notes': 80000 };
const REGIONS_REORDERED = { 'page:1:notes': 80000, 'page:1:col:1': 600000, 'page:1:col:0': 600000 };
{
  const s1 = engine.initialPaginationState({ firstBlockId: 'body|1|para', remainingByRegion: REGIONS });
  const s2 = engine.initialPaginationState({ firstBlockId: 'body|1|para', remainingByRegion: REGIONS });
  (s1.stateHash === s2.stateHash ? ok : fail)('דטרמיניזם: אותו קלט ⇐ אותו hash (ריצה כפולה)');
  const s3 = engine.initialPaginationState({ firstBlockId: 'body|1|para', remainingByRegion: REGIONS_REORDERED });
  (s3.stateHash === s1.stateHash ? ok : fail)('סדר מפתחות remainingByRegion אינו משנה את ה־hash');
  (s1.physicalPageIndex === 1 && s1.columnIndex === 0 ? ok : fail)('עמוד 1, טור 0');
  (Object.isFrozen(s1) && Object.isFrozen(s1.remainingByRegion) ? ok : fail)('המצב קפוא-עומק');
  (engine.verifyPaginationState(s1) === undefined ? ok : fail)('verifyPaginationState עובר (hash תואם לשדות)');
  // זיוף hash נתפס
  let caught = false;
  try { engine.verifyPaginationState({ ...s1, stateHash: '0'.repeat(64) }); } catch { caught = true; }
  (caught ? ok : fail)('verifyPaginationState תופס hash מזויף');
}

console.log('\n3) כל שדה מכסה משנה hash (§9.2 — hash זהה ⇔ זהות מלאה)');
{
  const base = engine.initialPaginationState({ firstBlockId: 'body|1|para', remainingByRegion: REGIONS });
  const variants = [
    engine.advanceCursor(base, { blockId: 'body|1|para', fragmentIndex: 1, atomIndex: 0 }).state,
    engine.openPage(base, REGIONS).state,
    engine.switchColumn(base, 1).state,
    engine.consumeRegion(base, 'page:1:col:0', 1000).state,
    engine.pendFootnote(base, 'note:v1|doc|footnote|1').state,
    engine.pendSidenote(base, 'note:v1|doc|sidenote|1').state,
    engine.bracketOpen(base, 'bracket:v1|doc|body|round|1|2', 'round').state,
    engine.headingEnter(base, 'heading|1|H2').state,
    engine.chapterEnter(base, { partId: 'part|1', partOrdinal: 1, simanId: 'siman|1', simanNumber: 1, noteScope: 'siman' }).state,
  ];
  const hashes = new Set([base.stateHash, ...variants.map((v) => v.stateHash)]);
  (hashes.size === 10 ? ok : fail)(`9 שדות מכסה + בסיס ⇐ 10 hashes שונים (קיבלנו ${hashes.size})`);
}

console.log('\n4) תלות בין עמודים; clone/restore');
{
  let s = engine.initialPaginationState({ firstBlockId: 'body|1|para', remainingByRegion: REGIONS });
  s = engine.pendFootnote(s, 'note:v1|doc|footnote|1').state;
  s = engine.bracketOpen(s, 'bracket:v1|doc|body|round|5|99', 'round').state;
  s = engine.headingEnter(s, 'heading|1|H2').state;
  s = engine.switchColumn(s, 1).state;
  const p2 = engine.openPage(s, REGIONS).state;
  (p2.physicalPageIndex === 2 && p2.columnIndex === 0 ? ok : fail)('openPage: אינדקס רציף +1, טור חוזר ל־0');
  (p2.pendingFootnotes.length === 1 && p2.openBracketStack.length === 1 && p2.activeHeadingContext.length === 1
    ? ok : fail)('openPage נושא הערה ממתינה + סוגריים + הקשר כותרת קדימה');
  const clone = engine.clonePaginationState(p2);
  (clone.stateHash === p2.stateHash ? ok : fail)('clonePaginationState ⇐ אותו hash');
  (clone !== p2 && clone.openBracketStack[0] !== p2.openBracketStack[0] ? ok : fail)('העתק עצמאי — אין שיתוף מבנים');
  const core = { ...p2 };
  delete core.stateHash;
  const restored = engine.restorePaginationState(core, p2.stateHash);
  (restored.stateHash === p2.stateHash ? ok : fail)('restorePaginationState עם hash תואם');
  let caught = false;
  try { engine.restorePaginationState(core, 'f'.repeat(64)); } catch { caught = true; }
  (caught ? ok : fail)('restore עם hash צפוי שגוי נדחה');
}

console.log('\n5) שרשרת מעברים — שער השלב: כל מעבר מוסבר');
{
  let s = engine.initialPaginationState({ firstBlockId: 'body|1|para', remainingByRegion: REGIONS });
  const transitions = [];
  const push = (step) => { transitions.push(step.transition); s = step.state; };
  push(engine.advanceCursor(s, { blockId: 'body|1|para', fragmentIndex: 0, atomIndex: 4 }));
  push(engine.pendFootnote(s, 'note:v1|doc|footnote|1'));
  push(engine.bracketOpen(s, 'bracket:v1|doc|body|round|1|2', 'round'));
  push(engine.consumeRegion(s, 'page:1:col:0', 65536));
  push(engine.headingEnter(s, 'heading|2|H3'));
  push(engine.switchColumn(s, 1));
  push(engine.openPage(s, REGIONS));
  push(engine.placeFootnotes(s, ['note:v1|doc|footnote|1']));
  push(engine.bracketClose(s, 'bracket:v1|doc|body|round|1|2'));
  let chainOk = true;
  let prev = engine.initialPaginationState({ firstBlockId: 'body|1|para', remainingByRegion: REGIONS }).stateHash;
  for (const t of transitions) {
    if (t.fromStateHash !== prev || !/^[0-9a-f]{64}$/.test(t.toStateHash) || typeof t.explanation !== 'string' || t.explanation.length < 3) chainOk = false;
    prev = t.toStateHash;
  }
  (chainOk ? ok : fail)('9 מעברים: from==prev.to, hashes תקינים, explanation לכל אחד');
  (engine.verifyTransitionChain(engine.initialPaginationState({ firstBlockId: 'body|1|para', remainingByRegion: REGIONS }), transitions) === s.stateHash
    ? ok : fail)('verifyTransitionChain מחזיר את ה־hash הסופי');
  let caught = false;
  const forged = transitions.map((t, i) => (i === 3 ? { ...t, fromStateHash: 'f'.repeat(64) } : t));
  try { engine.verifyTransitionChain(engine.initialPaginationState({ firstBlockId: 'body|1|para', remainingByRegion: REGIONS }), forged); } catch { caught = true; }
  (caught ? ok : fail)('זיוף חוליה בשרשרת נתפס');
}

console.log('\n6) דחיות — אין שקט');
{
  const base = engine.initialPaginationState({ firstBlockId: 'body|1|para', remainingByRegion: REGIONS });
  const expectReject = (label, fn) => {
    try { fn(); fail(`${label} — לא נדחה`); }
    catch (e) { (String(e?.message ?? '').includes('PAGINATION_STATE_INVALID') || String(e?.message ?? '').includes('CURSOR_INVALID') ? ok : fail)(`${label} — נדחה במקוטלג`); }
  };
  expectReject('צריכה מעבר לנותר', () => engine.consumeRegion(base, 'page:1:col:0', 600001));
  expectReject('אזור לא קיים', () => engine.consumeRegion(base, 'page:9:col:0', 1));
  expectReject('סמן לא מתקדם', () => engine.advanceCursor(base, { blockId: 'body|1|para', fragmentIndex: 0, atomIndex: 0 }));
  const withNote = engine.pendFootnote(base, 'note:v1|doc|footnote|1').state;
  expectReject('הצבה שלא בתור', () => engine.placeFootnotes(base, ['note:v1|doc|footnote|1']));
  expectReject('הערה כפולה', () => engine.pendFootnote(withNote, 'note:v1|doc|footnote|1'));
  const b1 = engine.bracketOpen(base, 'bracket:v1|doc|body|round|1|2', 'round').state;
  const b2 = engine.bracketOpen(b1, 'bracket:v1|doc|body|square|3|4', 'square').state;
  expectReject('סגירת לא-עליון', () => engine.bracketClose(b2, 'bracket:v1|doc|body|round|1|2'));
  expectReject('סמן שגוי', () => engine.parseCursor('nonsense'));
  // chapterEnter: איפוס לפי scope
  const siman1 = engine.chapterEnter(base, { partId: 'part|1', partOrdinal: 1, simanId: 'siman|1', simanNumber: 1, noteScope: 'siman' }).state;
  (siman1.chapterState.footnoteOrdinal === 1 ? ok : fail)('chapterEnter(siman) מאפס מונה');
}

console.log('\n7) אין state גלובלי מוסתר');
{
  const src = readFileSync(join(repoRoot, 'packages', 'layout-engine', 'src', 'pagination', 'state.ts'), 'utf8');
  // module-level mutable: הצהרת let/var ברמת המודול (עמודה 0 — מחוץ
  // לפונקציות). משתני let מקומיים בתוך פונקציות חוקיים (טהורים — לא
  // ניתנים לצפייה מבחוץ); הקבועים const בלבד ברמת המודול.
  const hasMutableModuleLevel = /(^|\n)(let|var)\s/.test(src);
  (!hasMutableModuleLevel ? ok : fail)('אין let/var ברמת המודול — אין state גלובלי מוסתר');
}

console.log('\n8) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages');
(runCode('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('typecheck:packages');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check');
if (!SKIP_TESTS) {
  const t = run('npm', ['run', 'test:packages']);
  (/Tests\s+765\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 765/765');
} else {
  ok('test:packages — [skipped-in-CI: parent step already ran the suite]');
}

// ─────────────────────────── סיכום ───────────────────────────
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`הכל ירוק: ${checks}/${checks} — שלב 49 (PaginationState) עבר`);
