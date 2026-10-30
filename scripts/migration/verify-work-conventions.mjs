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
 *   4. הקוד הישן לא נערך (כלל 8): קבצים ישנים זהים להם, למעט חיווט workspaces
 *      ב־package.json (הוספות בלבד, נבדק שדה-שדה) והמסמכים החיים; קבצים חדשים —
 *      רק בנתיבים המאושרים של התכנית.
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

// ---------- 4. הקוד הישן לא נערך (כלל 8; אינווריאנט מתפתח משלב 7) ----------
console.log('\n4) הקוד הישן לא נערך — שינויים מותרים: artifacts חדשים + חיווט workspaces בלבד');
const PRE_PLAN_COMMIT = 'eba2c63'; // "הוספת תכנית עבודה מפורטת לסוכן AI" — הקומיט שלפני שלב 1
const run = (args) => execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
  cwd: repoRoot, encoding: 'utf8',
}).trim();
let changed = [];
try {
  changed = run(['diff', '--name-only', `${PRE_PLAN_COMMIT}..HEAD`])
    .split('\n').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
} catch (e) {
  fail(`לא ניתן לקרוא את היסטוריית ה־git: ${e.message}`);
}
// קבצים שהתקיימו לפני התכנית ורשאים להשתנות: חיווט workspaces + מסמכים חיים
const LIVING_FILES = new Set(['package.json', 'package-lock.json', 'CHECKLIST.md', 'WORKLOG.md', 'GLOSSARY.md']);
const modifiedOld = [];
for (const f of changed) {
  let existed = true;
  try {
    execFileSync('git', ['cat-file', '-e', `${PRE_PLAN_COMMIT}:${f}`], { cwd: repoRoot, stdio: 'ignore' });
  } catch {
    existed = false;
  }
  if (existed && !LIVING_FILES.has(f)) modifiedOld.push(f);
}
(modifiedOld.length === 0
  ? ok : fail)(`${changed.length} קבצים השתנו; אף קובץ ישן (קוד/נכסים/תצורה) לא נערך או נמחק${modifiedOld.length ? ' — חריגות: ' + modifiedOld.slice(0, 5).join(', ') : ''}`);

// package.json: הוספות בלבד (workspaces + סקריפטים חדשים) — כל השדות הישנים זהים
const oldPkg = JSON.parse(execFileSync('git', ['show', `${PRE_PLAN_COMMIT}:package.json`], { cwd: repoRoot, encoding: 'utf8' }));
const newPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
let pkgDiffOk = true;
for (const key of ['name', 'version', 'description', 'private', 'type', 'engines', 'dependencies', 'devDependencies']) {
  if (JSON.stringify(oldPkg[key]) !== JSON.stringify(newPkg[key])) {
    pkgDiffOk = false;
    fail(`package.json: השדה הישן "${key}" השתנה — אסור (כלל 8)`);
  }
}
for (const [k, v] of Object.entries(oldPkg.scripts ?? {})) {
  if (newPkg.scripts?.[k] !== v) {
    pkgDiffOk = false;
    fail(`package.json: הסקריפט הישן "${k}" השתנה`);
  }
}
(JSON.stringify(newPkg.workspaces) === JSON.stringify(['packages/*']) ? ok : fail)('package.json: workspaces = ["packages/*"] (הוספה מתועדת של שלב 7)');
(pkgDiffOk ? ok : fail)('package.json: כל השדות והסקריפטים הישנים זהים; רק הוספות');

// קבצים חדשים: רק בנתיבים המאושרים
const NEW_ALLOWED = [
  /^docs\//, /^assets\//, /^packages\//, /^scripts\/migration\//, /^tests\/\w+\//,
  /^src\/(stores|worker-host|renderers)\//, /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
  /^\.nvmrc$/,
];
const badNew = changed.filter((f) => {
  let existed = true;
  try {
    execFileSync('git', ['cat-file', '-e', `${PRE_PLAN_COMMIT}:${f}`], { cwd: repoRoot, stdio: 'ignore' });
  } catch {
    existed = false;
  }
  return !existed && !NEW_ALLOWED.some((re) => re.test(f));
});
(badNew.length === 0
  ? ok : fail)(`כל הקבצים החדשים בנתיבים המאושרים (docs/, assets/, packages/, scripts/migration/, tests/, src shell, תבניות)${badNew.length ? ' — חריגות: ' + badNew.slice(0, 5).join(', ') : ''}`);

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
