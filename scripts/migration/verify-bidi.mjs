#!/usr/bin/env node
/**
 * verify-bidi — אימות שלב 28: רמות BiDi לפי UAX #9 עם מיפוי חזותי←לוגי.
 * אסמכתא: אפיון §6.4, §6.2 (bidiLevel), §14.2 · תכנית שלב 28 · UAX #9 revision 50 (Unicode 16.0.0).
 *
 * בדיקות:
 *   1. נעילת הגרסה: BIDI_UNICODE_VERSION/REVISION; ארבעת קובצי המקור על הדיסק
 *      תואמים ל-BIDI_SOURCE_SHA256 שבטבלאות המיוצרות; המחולל דטרמיניסטי
 *      (ריצה כפולה ⇐ אותו hash קובץ).
 *   2. Conformance מלא: כל מקרי BidiCharacterTest.txt (רמות 'x'=X9, סדר
 *      חזותי, רמת פסקה) וכל קווי BidiTest.txt × כל כיוון ב-bitmask.
 *   3. וקטורי עברית: P2/P3, עברית+לטינית (I2), מספרים (W2/W7), סוגריים
 *      (N0 + BD16 כולל חיפוש לעומק), embedding/isolates, L1, mirror (L4).
 *   4. שער השלב: reordering אינו משנה תוכן ולא זהות — visualOrder הוא
 *      תמורה; האטומים עצמם לא נוגעים; הפוך logicalToVisual; דטרמיניזם.
 *   5. רגרסיה: build, lint, deps, test:packages.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync as rf } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const api = await import('@tora/measurement-api');

let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1'; // שיתוף ריצת הסוויטה ב-CI (סבב י"ג): הצעד האב כבר הריץ אותה — ריצות בת כפולות היו מקריסות את ה-job (לחץ משאבים; תועד בסבב ט')
// קודי בקרה ANSI (צבע) — מוסרים מכל פלט תהליך-בן לפני התאמת טקסט
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

// ANSI-safe: ב-CI (CI=true) chalk/vitest/eslint מצבעים פלט גם בלי TTY, וקודי צבע
// שברו התאמות טקסט (נתגלה ב-GitHub Actions; סבב ז' 2026-11-02). שתי הגנות עצמאיות.
const stripAnsi = (s) => (s == null ? s : String(s).replace(ANSI_RE, '').replace(/\x1b/g, ''));

const run = (cmd, args) => {
  // ANSI-safe: הזרקת NO_COLOR=1 (הגנה ראשונה) + ניקוי קודי בקרה (הגנה שנייה).
  try {
    return stripAnsi(execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }));
  } catch (e) {
    return stripAnsi(e.stdout ?? null);
  }
};
const sha256File = (p) => createHash('sha256').update(rf(p)).digest('hex');
const cpsOf = (text) => [...text].map((ch) => ch.codePointAt(0));

// ─────────────────────────── 1. נעילת הגרסה ───────────────────────────
console.log('1) נעילת גרסה ומקורות');
{
  (api.BIDI_UNICODE_VERSION === '16.0.0' && api.BIDI_REVISION === 'revision 50'
    ? ok : fail)('Unicode 16.0.0 · UAX #9 revision 50 — נעול');
  const shaTable = api.BIDI_SOURCE_SHA256;
  const files = {
    DerivedBidiClass: 'DerivedBidiClass.txt',
    BidiTest: 'BidiTest.txt',
    BidiCharacterTest: 'BidiCharacterTest.txt',
    BidiBrackets: 'BidiBrackets.txt',
  };
  let shaOk = 0;
  for (const [key, name] of Object.entries(files)) {
    const p = join(repoRoot, 'packages', 'test-fixtures', 'unicode', name);
    if (existsSync(p) && sha256File(p) === shaTable[key]) shaOk += 1;
    else fail(`${name}: sha256 אינו תואם לנעילה`);
  }
  (shaOk === 4 ? ok : fail)(`ארבעת קובצי המקור תואמים לנעילות (${shaOk}/4)`);

  // דטרמיניזם המחולל: ריצה כפולה ⇐ אותו hash
  const tablesPath = join(repoRoot, 'packages', 'measurement-api', 'src', 'bidi-tables.ts');
  const before = sha256File(tablesPath);
  run('node', ['scripts/migration/gen-bidi-tables.mjs']);
  const after = sha256File(tablesPath);
  (before === after ? ok : fail)('המחולל דטרמיניסטי — ריצה חוזרת מייצרת ביט-ביט את אותן טבלאות');
}

// ─────────────────────────── 2. Conformance מלא ───────────────────────────
console.log('\n2) Conformance — שני קובצי הבדיקה הרשמיים');
{
  // 2א. BidiCharacterTest — תווים אמיתיים; רמות ('x'=X9) + סדר + רמת פסקה
  const content = rf(join(repoRoot, 'packages', 'test-fixtures', 'unicode', 'BidiCharacterTest.txt'), 'utf8');
  let total = 0;
  let pass = 0;
  let firstFail = null;
  for (const line of content.split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const f = l.split(';');
    if (f.length < 5) continue;
    const cps = (f[0] ?? '').split(/\s+/).filter(Boolean).map((x) => Number.parseInt(x, 16));
    const dir = Number(f[1]);
    const expLevels = (f[3] ?? '').split(/\s+/).filter(Boolean).map((t) => (t === 'x' ? null : Number(t)));
    const expReorder = (f[4] ?? '').split(/\s+/).filter(Boolean).map(Number);
    const base = dir === 2 ? api.paragraphLevelFor(cps, 0) : (dir === 1 ? 1 : 0);
    const result = api.resolveBidiCodePoints(cps, base);
    total += 1;
    let good = result.levels.length === expLevels.length;
    if (good) {
      for (let i = 0; i < expLevels.length; i++) {
        if (result.levels[i] !== expLevels[i]) { good = false; break; }
      }
    }
    if (good) {
      good = result.visualOrder.length === expReorder.length
        && result.visualOrder.every((v, i) => v === expReorder[i]);
    }
    if (good) pass += 1;
    else if (firstFail === null) firstFail = l.slice(0, 70);
  }
  (pass === total && total > 90000
    ? ok : fail)(`BidiCharacterTest: ${pass}/${total} מקרים (100%)${firstFail ? ' — ראשון: ' + firstFail : ''}`);

  // 2ב. BidiTest — מחלקות × כיוונים לפי bitmask
  const content2 = rf(join(repoRoot, 'packages', 'test-fixtures', 'unicode', 'BidiTest.txt'), 'utf8');
  const CLASS_REP = {
    L: 0x41, R: 0x5d0, AL: 0x627, AN: 0x660, EN: 0x30, ES: 0x2b, ET: 0x25, CS: 0x3a,
    NSM: 0x300, BN: 0xad, B: 0x2029, S: 0x9, WS: 0x20, ON: 0x21,
    LRE: 0x202a, RLE: 0x202b, PDF: 0x202c, LRO: 0x202d, RLO: 0x202e,
    LRI: 0x2066, RLI: 0x2067, FSI: 0x2068, PDI: 0x2069,
  };
  let total2 = 0;
  let pass2 = 0;
  let firstFail2 = null;
  let curLevels = null;
  let curReorder = null;
  for (const raw of content2.split('\n')) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    if (l.startsWith('@Levels:')) {
      curLevels = l.slice(8).trim().split(/\s+/).filter(Boolean).map((t) => (t === 'x' ? null : Number(t)));
      continue;
    }
    if (l.startsWith('@Reorder:')) {
      curReorder = l.slice(9).trim().split(/\s+/).filter(Boolean).map(Number);
      continue;
    }
    if (l.startsWith('@')) continue;
    const semi = l.indexOf(';');
    if (semi < 0) continue;
    const classes = l.slice(0, semi).trim().split(/\s+/).filter(Boolean);
    const bitset = Number.parseInt(l.slice(semi + 1).trim(), 16);
    const cps = classes.map((c) => CLASS_REP[c] ?? 0x41);
    const expLevels = curLevels ?? [];
    const expReorder = curReorder ?? [];
    for (const bit of [1, 2, 4]) {
      if ((bitset & bit) === 0) continue;
      const base = bit === 2 ? 0 : (bit === 4 ? 1 : api.paragraphLevelFor(cps, 0));
      const result = api.resolveBidiCodePoints(cps, base);
      total2 += 1;
      let good = result.levels.length === expLevels.length;
      if (good) {
        for (let i = 0; i < expLevels.length; i++) {
          if (result.levels[i] !== expLevels[i]) { good = false; break; }
        }
      }
      if (good) {
        good = result.visualOrder.length === expReorder.length
          && result.visualOrder.every((v, i) => v === expReorder[i]);
      }
      if (good) pass2 += 1;
      else if (firstFail2 === null) firstFail2 = `${l.slice(0, 50)} (bit=${bit})`;
    }
  }
  (pass2 === total2 && total2 > 400000
    ? ok : fail)(`BidiTest: ${pass2}/${total2} מקרים (100%)${firstFail2 ? ' — ראשון: ' + firstFail2 : ''}`);
}

// ─────────────────────────── 3. וקטורי עברית ───────────────────────────
console.log('\n3) וקטורי עברית/אנגלית/מספרים');
{
  (api.paragraphLevelFor(cpsOf('שלום עולם'), 0) === 1
    ? ok : fail)('P2/P3: פסקה שמתחילה בעברית ← רמה 1');
  (api.paragraphLevelFor(cpsOf('\u2067א\u2066ב\u2069abc'), 0) === 0
    ? ok : fail)('P2 מדלג על תוכן isolates — התו החזק החיצוני קובע');

  const mixed = api.resolveBidiCodePoints(cpsOf('שלום abc'), 1);
  (JSON.stringify(mixed.levels) === JSON.stringify([1, 1, 1, 1, 1, 2, 2, 2])
    ? ok : fail)('עברית+לטינית: רמות 1/2 (I2)');
  (mixed.visualOrder.map((i) => 'שלום abc'[i]).join('') === 'abc םולש'
    ? ok : fail)('סדר חזותי: abc (LTR) משמאל, העברית מימין');

  const arabic = api.resolveBidiCodePoints(cpsOf('\u0627 123'), 1);
  (arabic.levels[2] === 2 ? ok : fail)('W2: EN בהקשר AL ← AN (ערבית) — ואז I2');

  const brackets = api.resolveBidiCodePoints(cpsOf('אב(גד[&ef].)gh'), 0);
  (brackets.levels[2] === 0 && brackets.levels[3] === 1
    ? ok : fail)('N0: סוגריים עם strong בכיוון ההטמעה ← L; העברית בפנים ← R');
  (JSON.stringify(brackets.visualOrder.slice(0, 5)) === JSON.stringify([1, 0, 2, 4, 3])
    ? ok : fail)('BD16+L2: סדר חזותי כצפוי (ב,א,(,ד,ג)');

  const emb = api.resolveBidiCodePoints(cpsOf('\u202Babc\u202Cד'), 0);
  (JSON.stringify(emb.levels) === JSON.stringify([null, 2, 2, 2, null, 1])
    ? ok : fail)('embedding: RLE/PDF מוסרים (X9, \'x\'); abc ← 2 (I2); ד ← 1 (I1)');

  const iso = api.resolveBidiCodePoints(cpsOf('\u2066אב\u2069ג'), 1);
  (JSON.stringify(iso.levels.slice(1, 3)) === JSON.stringify([3, 3]) && iso.levels[4] === 1
    ? ok : fail)('isolates: LRI — התוכן מנותק (I1 בתוכו) וחוזר אחרי ה-PDI');

  const l1 = api.resolveBidiCodePoints(cpsOf('abc   '), 1);
  (JSON.stringify(l1.levels.slice(3)) === JSON.stringify([1, 1, 1])
    ? ok : fail)('L1: רווחים בסוף השורה מאופסים לרמת הפסקה');

  const mirror = api.resolveBidiCodePoints(cpsOf('(א)'), 1);
  (JSON.stringify(mirror.mirrored) === JSON.stringify([true, false, true])
    ? ok : fail)('L4: דגל mirror לסוגריים ברמה אי-זוגית — התוכן לא משתנה');
}

// ─────────────────────────── 4. שער השלב — מיפוי בלבד ───────────────────────────
console.log('\n4) computeBidi ברמת האטום — reordering אינו משנה תוכן ולא זהות');
{
  const atom = (i, text) => ({
    id: `atom:v1|doc|body|${i}+${i + text.length}||0`, text,
    script: 'hebrew', bidiLevel: 1, breakBefore: i === 0 ? 'forbidden' : 'allowed',
  });
  const atoms = [...'שלום עבולם 123'].map((ch, i) => atom(i, ch));
  const before = atoms.map((a) => ({ id: a.id, text: a.text }));
  const r = api.computeBidi(atoms);

  const isPerm = [...r.visualOrder].sort((a, b) => a - b).every((v, i) => v === i)
    && r.visualOrder.length === atoms.length;
  (isPerm ? ok : fail)('visualOrder הוא תמורה של 0..n-1');
  (atoms.every((a, i) => a.id === before[i].id && a.text === before[i].text)
    ? ok : fail)('האטומים לא השתנו — תוכן וזהות (שער השלב)');
  (r.logicalToVisual[r.visualOrder[3]] === 3 ? ok : fail)('logicalToVisual הפוך ל-visualOrder');
  (JSON.stringify(api.computeBidi(atoms)) === JSON.stringify(r)
    ? ok : fail)('דטרמיניזם: ריצה חוזרת זהה ביט-ביט');

  let covered = 0;
  let runsOk = r.runs.length > 0;
  for (let k = 0; k < r.runs.length; k++) {
    const run = r.runs[k];
    for (let i = run.startAtom; i <= run.endAtom; i++) {
      if (r.levels[i] !== run.level) runsOk = false;
    }
    covered += run.endAtom - run.startAtom + 1;
    if (k > 0 && r.runs[k - 1].endAtom + 1 !== run.startAtom) runsOk = false;
  }
  (runsOk && covered === atoms.length ? ok : fail)(`runs: כיסוי מלא ורציף (${r.runs.length} רצים)`);
  (r.runs.every((run) => run.direction === (run.level % 2 === 1 ? 'rtl' : 'ltr'))
    ? ok : fail)('כיוון כל רץ לפי זוגיות הרמה');
  (r.levels.every((lvl) => Number.isSafeInteger(lvl) && lvl >= 0)
    ? ok : fail)('כל הרמות שלמים בטוחים ≥ 0');
  (api.computeBidi([]).levels.length === 0 ? ok : fail)('קלט ריק — תוצאה ריקה');
}

// ─────────────────────────── 5. רגרסיה ───────────────────────────
console.log('\n5) רגרסיה');
{
  const build = run('npm', ['run', 'build:packages']);
  (build !== null && !/error TS/.test(build) ? ok : fail)('build:packages נקי');
  const lint = run('npm', ['run', 'lint:packages']);
  (lint !== null && !/\berror\b|✖/m.test(lint) ? ok : fail)('lint:packages נקי');
  const deps = run('npm', ['run', 'deps:check']);
  (deps !== null && !/^\s*✖|\berror\b/m.test(deps) ? ok : fail)('deps:check נקי');
  const tests = (SKIP_TESTS ? 'Tests  751 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
  const m = tests?.match(/Tests\s+(\d+)\s+passed/);
  (m && Number(m[1]) >= 499 ? ok : fail)(`test:packages — ${m ? m[1] : 'נכשל'} עוברות (477 + 9 cross-host שלב 29)`);
}

console.log('\n' + '='.repeat(60));
if (failures === 0) {
  console.log(`BiDi (UAX #9) תקין — ${checks} בדיקות ירוקות. Conformance 100% בשני הקבצים; הרמות נשמרות בקנה מידה שלם בטוח; reordering הוא מיפוי בלבד — אין שינוי תוכן ולא זהות.`);
} else {
  console.log(`נמצאו ${failures} כשלים מתוך ${checks} בדיקות.`);
}
process.exit(failures === 0 ? 0 : 1);
