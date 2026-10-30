#!/usr/bin/env node
/**
 * verify-spans — אימות מודול ה־SourceSpan והמזהים הממותגים (שלב 14).
 * אסמכתא: אפיון §6.2 · תכנית 100 השלבים, שלב 14.
 *
 * בדיקות:
 *   1. מבנה: ה־API הציבורי של content-model חשוף דרך ה־index בלבד.
 *   2. זמן ריצה: גבולות טווחים (ריק, תו בודד, חצי־פתוח), דחיות
 *      מאומתות בזמן יצירה עם מפתח קטלוגי, מזהים ממותגים.
 *   3. סריקות אכיפה: אין אקראיות/UUID/counter גלובלי ב־content-model;
 *      כל מפתח קטלוגי המופיע בקוד רשום; טוהר ייבוא (אין תלויות חוץ).
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
  'CONTENT_STREAMS', 'compareSpans', 'contentStreamRank', 'isEmptySpan', 'isContentStream',
  'isSourceSpan', 'isValidIdValue', 'makeAnchorId', 'makeAtomId', 'makeNodeId',
  'makeSourceSpan', 'sameStream', 'sliceSpan', 'spanCovers', 'spanLength', 'spansOverlap',
  'CONTENT_MODEL_ERROR_CATALOG', 'ContentModelError', 'contentModelErrorCatalogSize',
  'isRegisteredContentModelErrorKey',
];
for (const name of REQUIRED_EXPORTS) {
  (name in cm ? ok : fail)(`ייצוא: ${name}`);
}
(cm.PACKAGE_NAME === '@tora/content-model' ? ok : fail)('PACKAGE_NAME תקין');

// ---------- 2. זמן ריצה ----------
console.log('\n2) זמן ריצה: גבולות, דחיות ומזהים');
(cm.makeSourceSpan('doc', 'body', 10, 11).endUtf16 === 11 && cm.spanLength(cm.makeSourceSpan('doc', 'body', 10, 11)) === 1
  ? ok : fail)('תו בודד: [10, 11) באורך 1');
(cm.isEmptySpan(cm.makeSourceSpan('doc', 'body', 7, 7)) ? ok : fail)('פרוסה ריקה [7, 7) חוקית');
{
  const s = cm.makeSourceSpan('doc', 'footnote', 0, 5);
  const next = cm.makeSourceSpan('doc', 'footnote', 5, 6);
  (cm.spansOverlap(s, next) === false && cm.spansOverlap(s, cm.makeSourceSpan('doc', 'footnote', 4, 5)) === true
    ? ok : fail)('חצי־פתוח: [0,5) אינה חופפת את [5,6)');
}
{
  const big = cm.makeSourceSpan('doc', 'body', 10, 20);
  (cm.spanCovers(big, cm.makeSourceSpan('doc', 'body', 20, 20)) && !cm.spanCovers(big, cm.makeSourceSpan('doc', 'body', 10, 21))
    ? ok : fail)('spanCovers: ריקה בגבול כלולה; חריגה בסוף אינה');
}
{
  const parent = cm.makeSourceSpan('doc', 'endnote', 100, 110, 'src.xml#p/3');
  const child = cm.sliceSpan(parent, 2, 5);
  (child.startUtf16 === 102 && child.endUtf16 === 105 && child.importerPath === 'src.xml#p/3'
    ? ok : fail)('sliceSpan: היסט יחסי עם ירושת importerPath');
}
const expectThrow = (key, fn) => {
  try { fn(); fail(`היה צפוי ${key}`); }
  catch (e) {
    (e instanceof cm.ContentModelError && e.catalogKey === key && cm.isRegisteredContentModelErrorKey(key)
      ? ok : fail)(`דחייה בזמן יצירה: ${key}`);
  }
};
expectThrow('errors.span.INVALID_DOCUMENT_ID', () => cm.makeSourceSpan('', 'body', 0, 1));
expectThrow('errors.span.INVALID_STREAM', () => cm.makeSourceSpan('doc', 'margin', 0, 1));
expectThrow('errors.span.INVALID_RANGE', () => cm.makeSourceSpan('doc', 'body', 5, 4));
expectThrow('errors.span.INVALID_RANGE', () => cm.makeSourceSpan('doc', 'body', -1, 0));
expectThrow('errors.span.NON_INTEGER_OFFSET', () => cm.makeSourceSpan('doc', 'body', 1.5, 2));
expectThrow('errors.span.SLICE_OUT_OF_RANGE', () => cm.sliceSpan(cm.makeSourceSpan('doc', 'body', 4, 8), 0, 5));
expectThrow('errors.span.INVALID_ID', () => cm.makeNodeId(''));
(cm.makeNodeId('blk-1') === 'blk-1' && cm.makeAtomId('a1') === 'a1' && cm.makeAnchorId('x') === 'x'
  ? ok : fail)('בנאי מזהים ממותגים עובדים');
(cm.isSourceSpan(cm.makeSourceSpan('doc', 'sidenote', 2, 9)) && !cm.isSourceSpan({ bad: 1 })
  ? ok : fail)('isSourceSpan: בדיקה מבנית');
(cm.contentModelErrorCatalogSize() >= 8 ? ok : fail)(`קטלוג content-model: ${cm.contentModelErrorCatalogSize()} קודים (≥ 8)`);

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
/** הסרת מחרוזות ותגובות לפני סריקת אסורים — מונע חיובי-שקר כמו 'word/document.xml'. */
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
(violations === 0 ? ok : fail)('content-model: אין אקראיות, אין זמן, אין DOM; כל מפתח רשום');
let importImpure = 0;
for (const f of srcFiles) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/from\s+'([^']+)'/g)) {
    const spec = m[1];
    if (spec.startsWith('node:') || spec.startsWith('@tora/') && spec !== '@tora/content-model') importImpure++;
  }
}
(importImpure === 0 ? ok : fail)('content-model/src: אין ייבוא node: או @tora/* אחר (חבילת שורש בגרף)');

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
console.log(`מודול ה-spans תקין — ${checks} בדיקות ירוקות. כל פריט תוכן יכול לשאת span; גבולות חצי־פתוחים נאכפים.`);
