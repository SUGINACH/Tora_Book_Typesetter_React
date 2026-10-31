#!/usr/bin/env node
/**
 * verify-atoms — אימות TextAtom, גזירת ה־AtomId, הפיצול/איחוד, ספר
 * הטרנספורמציות וכיסוי האטומים (שלב 15).
 * אסמכתא: אפיון §6.2, §6.6 · תכנית 100 השלבים, שלב 15.
 *
 * בדיקות:
 *   1. מבנה: ה־API הציבורי של content-model חשוף דרך ה־index בלבד.
 *   2. זמן ריצה: דטרמיניזם מזהים (אותו קלט ← אותם ids, גם בסדר הפוך),
 *      חד־חד־ערכיות, דחיות מאומתות בזמן יצירה, פיצול/איחוד round-trip
 *      עם רישום בספר, וכיסוי אטומים של פסוק עברי מנוקד **בלי רינדור**
 *      (שער השלב).
 *   3. סריקות אכיפה: אין אקראיות/UUID/זמן ב־content-model; כל מפתח
 *      קטלוגי בקוד רשום; טוהר ייבוא.
 *   4. כיסוי טבלת i18n: כל מפתחות content-model ב־docs/i18n/error-keys.md.
 *   5. רגרסיה: test:packages, build, typecheck, lint, deps.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 * תלויות: אפס (Node 22 בלבד).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks++; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks++; failures++; console.log(`  [FAIL] ${m}`); };
const run = (cmd, args) => {
  try { execFileSync(cmd, args, { cwd: repoRoot, stdio: 'pipe' }); return 0; } catch { return 1; }
};

// ---------- 1. מבנה ----------
console.log('1) מבנה: API ציבורי דרך index בלבד');
const cm = await import('@tora/content-model');
const REQUIRED_EXPORTS = [
  'ATOM_SCRIPTS', 'BREAK_BEFORE_KINDS', 'MAX_BIDI_LEVEL', 'TRANSFORM_KINDS',
  'appendTransform', 'classifyScript', 'computeAtomCoverage', 'deriveAtomId',
  'isCombiningMark', 'isTextAtom', 'isTransformRecord', 'ledgerIntegrityIssues',
  'makeTextAtom', 'makeTransformRecord', 'mergeAtoms', 'splitAtom', 'transformsTouching',
];
for (const name of REQUIRED_EXPORTS) {
  (name in cm ? ok : fail)(`ייצוא: ${name}`);
}
(cm.contentModelErrorCatalogSize() >= 27 ? ok : fail)(`קטלוג content-model: ${cm.contentModelErrorCatalogSize()} קודים (≥ 27: 8 span + 19 atom)`);

// ---------- 2. זמן ריצה ----------
console.log('\n2) זמן ריצה: דטרמיניזם, פיצול/איחוד, כיסוי בלי רינדור');
const DOC = 'tora-canonical';
{
  const span = cm.makeSourceSpan(DOC, 'body', 10, 20);
  const a = cm.deriveAtomId(span, 0);
  const b = cm.deriveAtomId(span, 0);
  (a === b && a.startsWith('atom:v1|') ? ok : fail)('אותו קלט ← אותו מזהה; פורמט atom:v1|…');
  (cm.deriveAtomId(span, 1) !== a && cm.deriveAtomId(span, 0, 'insertion:x') !== a
    ? ok : fail)('סידור/מקור משנים את המזהה');
  const esc1 = cm.deriveAtomId(cm.makeSourceSpan('doc|with|pipes', 'body', 0, 1), 0);
  const esc2 = cm.deriveAtomId(cm.makeSourceSpan('doc%7Cwith%7Cpipes', 'body', 0, 1), 0);
  (esc1 !== esc2 ? ok : fail)('קידוד מקטעים: | ו־% אינם מתנגשים');
}
{
  // בניית אטומים לפסוק מנוקד — סדר ריצה הפוך נותן אותם מזהים לכל עמדה
  const verse = 'וַיְדַבֵּר יְהוָה אֶל מֹשֶׁה לֵּאמֹר';
  const pieces = [];
  let i = 0;
  while (i < verse.length) {
    let j = i;
    const isSpace = verse.charCodeAt(i) === 0x20;
    while (j < verse.length && (verse.charCodeAt(j) === 0x20) === isSpace) j++;
    pieces.push({ text: verse.slice(i, j), span: cm.makeSourceSpan(DOC, 'body', i, j) });
    i = j;
  }
  const forward = pieces.map((p) => cm.makeTextAtom(p.text, p.span).id);
  const backward = [...pieces].reverse().map((p) => cm.makeTextAtom(p.text, p.span).id);
  const sameIds = forward.every((id, idx) => id === backward[pieces.length - 1 - idx]);
  (sameIds ? ok : fail)('דטרמיניזם: בנייה בסדר הפוך ← אותם מזהים לכל עמדה');
  // שער השלב: כיסוי אטומים ניתן לחישוב בלי רינדור
  const atoms = pieces.map((p) => cm.makeTextAtom(p.text, p.span));
  const report = cm.computeAtomCoverage(atoms, verse.length, DOC, 'body');
  (report.ok && report.coveredLength === verse.length && report.gaps.length === 0
    ? ok : fail)('שער השלב: כיסוי 100% של פסוק מנוקד — חישוב טהור, בלי רינדור');
  const holed = cm.computeAtomCoverage(atoms.slice(0, -1), verse.length, DOC, 'body');
  (!holed.ok && holed.gaps.length > 0 ? ok : fail)('השמטת אטום ← רווח מדווח (ok=false)');
}
{
  const span = cm.makeSourceSpan(DOC, 'body', 100, 105, 'word/document.xml#run/2');
  const x = cm.makeTextAtom('אָבגד', span, { bidiLevel: 1, breakBefore: 'required', ordinal: 4 });
  const { left, right, record } = cm.splitAtom(x, 3);
  const { merged, record: mergeRec } = cm.mergeAtoms(left, right, { reason: 'docx-run-merge' });
  (merged.id === x.id && merged.text === x.text && merged.source.startUtf16 === 100
    ? ok : fail)('round-trip: merge(split(x)) משחזר את x במדויק — כולל המזהה');
  const ledger = cm.appendTransform(cm.appendTransform([], record), mergeRec);
  (cm.ledgerIntegrityIssues(ledger, [x.id]).length === 0
    ? ok : fail)('ספר טרנספורמציות: split+merge נקי בבדיקת שלמות');
  (cm.transformsTouching(ledger, left.id).length === 2
    ? ok : fail)('transformsTouching: שאילתה לפי מקור ויעד');
  const insertion = cm.makeTextAtom('דף', cm.makeSourceSpan(DOC, 'body', 12, 12), { origin: 'insertion:page' });
  (insertion.id.includes('insertion:page') && insertion.origin === 'insertion:page'
    ? ok : fail)('החדרה: origin מפורש מקודד במזהה ובשדה');
}
{
  // דחיות מאומתות בזמן יצירה עם מפתח קטלוגי
  const span = cm.makeSourceSpan(DOC, 'body', 0, 2);
  const expectThrow = (key, fn) => {
    try { fn(); fail(`היה צפוי ${key}`); }
    catch (e) {
      (e instanceof cm.ContentModelError && e.catalogKey === key && cm.isRegisteredContentModelErrorKey(key)
        ? ok : fail)(`דחייה בזמן יצירה: ${key}`);
    }
  };
  expectThrow('errors.atom.TEXT_SPAN_MISMATCH', () => cm.makeTextAtom('abc', span));
  expectThrow('errors.atom.INVALID_TEXT', () => cm.makeTextAtom('a\u0007b', span));
  expectThrow('errors.atom.INVALID_TEXT', () => cm.makeTextAtom('a\uD800', cm.makeSourceSpan(DOC, 'body', 0, 2)));
  expectThrow('errors.atom.INVALID_BIDI_LEVEL', () =>
    cm.makeTextAtom('a', cm.makeSourceSpan(DOC, 'body', 0, 1), { bidiLevel: 126 }));
  expectThrow('errors.atom.SPLIT_MID_GRAPHEME', () => {
    const a = cm.makeTextAtom('אָב', cm.makeSourceSpan(DOC, 'body', 0, 3));
    return cm.splitAtom(a, 1); // בין א לקמץ
  });
  expectThrow('errors.atom.SPLIT_MID_SURROGATE', () => {
    const a = cm.makeTextAtom('🎉x', cm.makeSourceSpan(DOC, 'body', 0, 3));
    return cm.splitAtom(a, 1);
  });
  expectThrow('errors.atom.MERGE_NOT_ADJACENT', () => {
    const a = cm.makeTextAtom('אב', cm.makeSourceSpan(DOC, 'body', 0, 2));
    const b = cm.makeTextAtom('גד', cm.makeSourceSpan(DOC, 'body', 3, 5));
    return cm.mergeAtoms(a, b);
  });
  expectThrow('errors.atom.MERGE_INCOMPATIBLE_BIDI', () => {
    const a = cm.makeTextAtom('אב', cm.makeSourceSpan(DOC, 'body', 0, 2));
    const b = cm.makeTextAtom('גד', cm.makeSourceSpan(DOC, 'body', 2, 4), { bidiLevel: 2 });
    return cm.mergeAtoms(a, b);
  });
  expectThrow('errors.atom.INVALID_TRANSFORM', () => cm.makeTransformRecord('split', [], [], 'r'));
  expectThrow('errors.atom.COVERAGE_INVALID_LENGTH', () =>
    cm.computeAtomCoverage([], -1, DOC, 'body'));
}
(cm.classifyScript('אָ') === 'hebrew' && cm.classifyScript('A') === 'latin' &&
  cm.classifyScript('5') === 'number' && cm.classifyScript(' ') === 'punctuation' &&
  cm.classifyScript('״') === 'hebrew' && cm.classifyScript('🎉') === 'other'
  ? ok : fail)('classifyScript: עברית+ניקוד/לטינית/ספרה/רווח/גרשיים/אימוג׳י');
(cm.isTextAtom(cm.makeTextAtom('א', cm.makeSourceSpan(DOC, 'body', 0, 1))) &&
  !cm.isTextAtom({ fake: true })
  ? ok : fail)('isTextAtom: אמיתת גזירה כוללת');

// ---------- 3. סריקות אכיפה ----------
console.log('\n3) סריקות אכיפה: דטרמיניזם וטוהר');
const srcDir = join(repoRoot, 'packages', 'content-model', 'src');
const srcFiles = [];
const scan = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else if (e.name.endsWith('.ts')) srcFiles.push(p);
  }
};
scan(srcDir);
const stripLiterals = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ')
  .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
  .replace(/`(?:[^`\\$]|\\.|\$\{[^}]*\})*`/g, '``');
const forbiddenPatterns = [
  [/Math\.random/, 'Math.random'],
  [/crypto\.randomUUID|uuid\/v4/, 'UUID אקראי'],
  [/Date\.now|new Date\s*\(/, 'תלות בזמן'],
  [/\bwindow\b/, 'גלובל window'],
  [/\bdocument\b/, 'גלובל document'],
  [/\+\+ *[a-z]*count|\bcounter\b * *= * *0/, 'מונה גלובלי'],
];
let violations = 0;
for (const f of srcFiles) {
  const text = stripLiterals(readFileSync(f, 'utf8'));
  for (const [re, label] of forbiddenPatterns) {
    if (re.test(text)) { violations++; fail(`${f.split('packages/')[1]}: אסור ${label}`); }
  }
  for (const m of readFileSync(f, 'utf8').matchAll(/'(errors\.[a-z]+\.[A-Z0-9_]+)'/g)) {
    if (!cm.isRegisteredContentModelErrorKey(m[1])) { violations++; fail(`מפתח לא רשום בקטלוג: ${m[1]}`); }
  }
}
(violations === 0 ? ok : fail)('content-model: אין אקראיות, אין זמן, אין DOM, אין מונים; כל מפתח רשום');
let importImpure = 0;
for (const f of srcFiles) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/from\s+'([^']+)'/g)) {
    const spec = m[1];
    if (spec.startsWith('node:') || spec.startsWith('@tora/') && spec !== '@tora/content-model') importImpure++;
  }
}
(importImpure === 0 ? ok : fail)('content-model/src: אין ייבוא node: או @tora/* אחר (חבילת שורש בגרף)');
{
  // אטומים קפואים: אין הרחבה/שינוי אחרי בנייה
  const atom = cm.makeTextAtom('א', cm.makeSourceSpan(DOC, 'body', 0, 1));
  let frozen = true;
  try { atom.text = 'ב'; frozen = atom.text === 'א'; } catch { frozen = true; }
  (frozen ? ok : fail)('TextAtom קפוא — אין שינוי מקור בטעות');
}

// ---------- 4. טבלת i18n ----------
console.log('\n4) טבלת מפתחות התרגום');
const tablePath = join(repoRoot, 'docs', 'i18n', 'error-keys.md');
(existsSync(tablePath) ? ok : fail)('docs/i18n/error-keys.md קיים');
if (existsSync(tablePath)) {
  const table = readFileSync(tablePath, 'utf8');
  const keys = Object.keys(cm.CONTENT_MODEL_ERROR_CATALOG);
  const missing = keys.filter((k) => !table.includes(`\`${k}\``));
  (missing.length === 0
    ? ok : fail)(`הטבלה מכסה את כל ${keys.length} מפתחות content-model${missing.length ? ' — חסרים: ' + missing.join(', ') : ''}`);
  const atomKeys = keys.filter((k) => k.startsWith('errors.atom.'));
  (atomKeys.length >= 19 ? ok : fail)(`מפתחות errors.atom.*: ${atomKeys.length} (≥ 19)`);
}

// ---------- 5. רגרסיה ----------
console.log('\n5) רגרסיה');
(run('npm', ['run', 'test:packages']) === 0 ? ok : fail)('test:packages — PASS');
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
console.log(`מודול ה-atoms תקין — ${checks} בדיקות ירוקות. זהות האטום נגזרת מהמקור בלבד; פיצול/איחוד נרשמים בספר; כיסוי אטומים נחשב בלי רינדור.`);
