#!/usr/bin/env node
/**
 * verify-work-conventions — אימות מוסכנות העבודה ושער M0 המלא (שלב 6 בתכנית 100 השלבים).
 * אסמכתא: אפיון §18-M0, §23 · תכנית 100 השלבים, שלב 6.
 *
 * בדיקות:
 *   1. מסמך המוסכנות מכסה את עשרת כללי §23 (23.1–23.10) ואת מבני WORKLOG/CHECKLIST/GLOSSARY.
 *   2. תבנית PR מכילה את הסעיפים המחייבים: fixture קודם לפורט, הפרדת refactor/mדיניות,
 *      layoutHash, GLOSSARY, אי-החלשת בדיקות, בדיקות שרצו.
 *   3. תבנית commit קיימת וכוללת את מבנה ההודעה.
 *   4. טוהר החזרה של פרק א (M0): מהקומיט שלפני התכנית ועד HEAD לא שונה אף קובץ
 *      מנוע/יישום ישן (src/, src-tauri/, index.html, package.json, root assets וכו').
 *   5. שער M0 בפועל: חמשת מאמתי M0 רצים ועוברים (source-manifest, transfer-inventory,
 *      baseline-run, test-fixtures, parity-matrix).
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8');

let failures = 0;
let checks = 0;
const ok = (m) => { checks++; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks++; failures++; console.log(`  [FAIL] ${m}`); };

// ---------- 1. כיסוי §23 במוסכנות ----------
console.log('1) מסמך המוסכנות מול אפיון §23');
const conv = read('docs/conventions/work-conventions.md');
for (let i = 1; i <= 10; i++) {
  (conv.includes(`23.${i}`) ? ok : fail)(`כלל §23.${i} מתועד במוסכנות`);
}
for (const section of ['WORKLOG', 'CHECKLIST', 'GLOSSARY', 'layoutHash']) {
  (conv.includes(section) ? ok : fail)(`מבנה/כלל עבור ${section} קיים`);
}

// ---------- 2. תבנית PR ----------
console.log('\n2) תבנית PR (.github/PULL_REQUEST_TEMPLATE.md)');
const pr = read('.github/PULL_REQUEST_TEMPLATE.md');
const PR_REQUIRED = [
  ['fixture קודם לפורט', /fixture קודם לפורט/],
  ['הפרדת refactor משינוי מדיניות', /הפרדת refactor/],
  ['layoutHash diff לשינוי מנוע', /layoutHash/],
  ['עדכון GLOSSARY', /GLOSSARY/],
  ['אי-החלשת בדיקות', /החלשת בדיקות/],
  ['בדיקות שרצו', /בדיקות שרצו/],
  ['post-pass נסתר', /post-pass/],
  ['tie-break לא-דטרמיניסטי', /tie-break/],
];
for (const [label, re] of PR_REQUIRED) {
  (re.test(pr) ? ok : fail)(`סעיף חובה בתבנית PR: ${label}`);
}
for (let i = 1; i <= 10; i++) {
  (pr.includes(`§23.${i}`) ? ok : fail)(`תבנית PR מפנה לכלל §23.${i}`);
}

// ---------- 3. תבנית commit ----------
console.log('\n3) תבנית commit');
const ct = read('docs/conventions/commit-template.md');
for (const frag of ['שלב <N>/100', 'בדיקות שרצו (ירוק)', 'layoutHash diff']) {
  (ct.includes(frag) ? ok : fail)(`תבנית commit כוללת: ${frag}`);
}

// ---------- 4. טוהר החזרה של פרק א ----------
console.log('\n4) טוהר החזרה של פרק א (M0) — אף קובץ מנוע/יישום לא שונה');
const PRE_PLAN_COMMIT = 'eba2c63'; // "הוספת תכנית עבודה מפורטת לסוכן AI" — הקומיט שלפני שלב 1
let changed = [];
try {
  changed = execFileSync('git', ['-c', 'core.quotepath=false', 'diff', '--name-only', `${PRE_PLAN_COMMIT}..HEAD`], {
    cwd: repoRoot, encoding: 'utf8',
  }).split('\n').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
} catch (e) {
  fail(`לא ניתן לקרוא את היסטוריית ה־git: ${e.message}`);
}
const PROTECTED_PREFIXES = [
  'src/', 'src-tauri/', 'public/', 'tests/', 'fonts/', 'example/',
  'text_files_for_typesetter_tests/',
  'index.html', 'vite.config.ts', 'tailwind.config.js', 'postcss.config.js',
  'tsconfig.json', 'tsconfig.node.json', 'package.json', 'package-lock.json',
  'header_ornaments.json', 'note_rules.json', 'ornaments_left_right.json',
  'ornaments_up_down.json', 'section_dividers.json', 'shaar_back.json',
  'shaar_main.json', 'shaar_sub.json', 'favicon.ico',
  '.github/workflows/deploy.yml',
];
const ALLOWED_ROOT_SCRIPTS = /^scripts\/(?!migration\/)/; // סקריפטים ישנים בשורש scripts/ — לא לגעת
const violations = changed.filter((f) => {
  if (PROTECTED_PREFIXES.some((p) => f === p || f.startsWith(p))) return true;
  if (ALLOWED_ROOT_SCRIPTS.test(f)) return true;
  return false;
});
(violations.length === 0
  ? ok : fail)(`נבדקו ${changed.length} קבצים שהשתנו מאז טרום-התכנית — ${violations.length} פגיעות בקוד ישן`);
if (violations.length > 0) {
  for (const v of violations.slice(0, 10)) console.log(`        - ${v}`);
}
const allowedOnly = changed.every((f) =>
  f.startsWith('docs/') || f.startsWith('assets/') || f.startsWith('packages/') ||
  f.startsWith('scripts/migration/') || f === '.nvmrc' || f === 'CHECKLIST.md' ||
  f === 'WORKLOG.md' || f === 'GLOSSARY.md' || f === '.github/PULL_REQUEST_TEMPLATE.md');
(allowedOnly ? ok : fail)('כל השינויים מוגבלים ל: docs/, assets/, packages/, scripts/migration/, .nvmrc, CHECKLIST, WORKLOG, GLOSSARY, תבנית PR');

// ---------- 5. שער M0 בפועל — חמשת המאמתים ----------
console.log('\n5) שער M0 בפועל — הרצת חמשת המאמתים');
const VERIFIERS = [
  'verify-source-manifest.mjs',
  'verify-transfer-inventory.mjs',
  'verify-baseline-run.mjs',
  'verify-test-fixtures.mjs',
  'verify-parity-matrix.mjs',
];
for (const v of VERIFIERS) {
  try {
    execFileSync('node', [join('scripts', 'migration', v)], { cwd: repoRoot, stdio: 'pipe' });
    ok(`${v} — PASS`);
  } catch (e) {
    fail(`${v} — FAIL`);
  }
}

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`מוסכנות העבודה ושער M0 תקינים — ${checks} בדיקות ירוקות.`);
console.log('שער M0: הבייסליין ניתן לשחזור offline; אין fixture בלי מקור ו־hash; rollback של פרק א = מחיקת artifacts בלבד.');
