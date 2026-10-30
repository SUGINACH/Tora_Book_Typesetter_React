#!/usr/bin/env node
/**
 * verify-dependency-rules — אכיפת חוקי התלות + בדיקה שלילית (שלב 8 בתכנית 100 השלבים).
 * אסמכתא: אפיון §5 (כללי תלות), §19 · תכנית 100 השלבים, שלב 8.
 *
 * בדיקות:
 *   1. קובצי התצורה קיימים: eslint.config.js (איסור DOM/Node בליבה), .dependency-cruiser.cjs.
 *   2. מצב נקי: eslint + depcruise מועברים על הקוד הנוכחי (0 הפרות).
 *   3. בדיקה שלילית (השער): מוזרק קובץ הפרה זמני ב־layout-engine הכולל:
 *      יבוא @tora/policy-torah (הפרת גרף), יבוא node:fs (Node בליבה) ושימוש ב־document (DOM).
 *      depcruise חייב לדווח על הפרת הגרף; eslint חייב להיכשל. הקובץ נמחק לאחר מכן.
 *   4. שלב ה־CI קיים וכולל את הבדיקות.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let failures = 0;
let checks = 0;
const ok = (m) => { checks++; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks++; failures++; console.log(`  [FAIL] ${m}`); };

const run = (cmd, args, opts = {}) => {
  try {
    const stdout = execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', ...opts });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status ?? 1, stdout: (e.stdout ?? '') + (e.stderr ?? '') };
  }
};

// ---------- 1. תצורות ----------
console.log('1) קובצי התצורה');
for (const f of ['eslint.config.js', '.dependency-cruiser.cjs']) {
  (existsSync(join(repoRoot, f)) ? ok : fail)(`${f} קיים`);
}
const eslintCfg = readFileSync(join(repoRoot, 'eslint.config.js'), 'utf8');
(eslintCfg.includes('no-restricted-globals') && eslintCfg.includes("'document'")
  ? ok : fail)('ESLint: no-restricted-globals כולל גלובלים של דפדפן');
(eslintCfg.includes('node:*') ? ok : fail)('ESLint: איסור יבוא node:* בחבילות הליבה');
(eslintCfg.includes('render-html') ? ok : fail)('ESLint: render-html — איסור יבוא measurement (אין מדידה מחדש)');
const depCfg = readFileSync(join(repoRoot, '.dependency-cruiser.cjs'), 'utf8');
(depCfg.includes('core-no-node-builtins') && depCfg.includes('GRAPH') && depCfg.includes('graphRules')
  ? ok : fail)('depcruise: כללי גרף + איסור Node בליבה');

// ---------- 2. מצב נקי ----------
console.log('\n2) מצב נקי — אין הפרות בקוד הנוכחי');
const eslintClean = run('npx', ['eslint', 'packages']);
(eslintClean.code === 0 ? ok : fail)(`eslint packages — PASS${eslintClean.code ? '\n' + eslintClean.stdout.slice(-500) : ''}`);
const depClean = run('npx', ['depcruise', 'packages', '--config', '.dependency-cruiser.cjs']);
(depClean.code === 0 ? ok : fail)(`depcruise packages — PASS${depClean.code ? '\n' + depClean.stdout.slice(-500) : ''}`);

// ---------- 3. בדיקה שלילית ----------
console.log('\n3) בדיקה שלילית — הפרת גבול נתפסת אוטומטית');
const VIOLATION_PATH = join(repoRoot, 'packages', 'layout-engine', 'src', '__negative_test__.ts');
const VIOLATION = `// קובץ בדיקה שלילית זמני — נמחק מיד לאחר הבדיקה (שלב 8)
import { PACKAGE_NAME as POLICY } from '@tora/policy-torah'; // הפרת גרף: layout-engine אינו מייבא policy-torah
import * as fs from 'node:fs'; // הפרה: Node בליבה
export const domProbe = typeof document; // הפרה: גלובל דפדפן
export const policyProbe = POLICY;
export const fsProbe = typeof fs;
`;
try {
  writeFileSync(VIOLATION_PATH, VIOLATION, 'utf8');

  const depViolated = run('npx', ['depcruise', 'packages', '--config', '.dependency-cruiser.cjs']);
  const graphCaught = depViolated.code !== 0
    && /graph-layout-engine|core-no-node-builtins/.test(depViolated.stdout);
  (depViolated.code !== 0
    ? ok : fail)('depcruise נכשל כנדרש בנוכחות קובץ מפר');
  (graphCaught
    ? ok : fail)(`depcruise דיווח על הפרות הגרף/Node הצפויות${graphCaught ? '' : ' — פלט: ' + depViolated.stdout.slice(0, 300)}`);

  const eslintViolated = run('npx', ['eslint', 'packages']);
  const domCaught = eslintViolated.code !== 0 && /document/.test(eslintViolated.stdout);
  (eslintViolated.code !== 0
    ? ok : fail)('eslint נכשל כנדרש בנוכחות גלובל דפדפן');
  (domCaught
    ? ok : fail)('eslint דיווח על הגלובל האסור (document)');
} finally {
  if (existsSync(VIOLATION_PATH)) unlinkSync(VIOLATION_PATH);
  ok('קובץ הבדיקה השלילית נמחק');
}

// אימות שאחרי הניקוי שוב ירוק
const eslintAfter = run('npx', ['eslint', 'packages']);
(eslintAfter.code === 0 ? ok : fail)('לאחר ניקוי — eslint שוב PASS');

// ---------- 4. שלב CI ----------
console.log('\n4) שלב ה־CI');
const ciPath = join(repoRoot, '.github', 'workflows', 'ci.yml');
(existsSync(ciPath) ? ok : fail)('.github/workflows/ci.yml קיים');
if (existsSync(ciPath)) {
  const ci = readFileSync(ciPath, 'utf8');
  for (const step of ['build:packages', 'typecheck:packages', 'lint:packages', 'deps:check', 'verify-dependency-rules.mjs']) {
    (ci.includes(step) ? ok : fail)(`CI כולל: ${step}`);
  }
  (ci.includes('node-version-file: .nvmrc') ? ok : fail)('CI נעול ל־Node מתוך .nvmrc');
  (ci.includes('npm ci') ? ok : fail)('CI מתקין מה־lockfile בלבד');
}

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`חוקי התלות נאכפים — ${checks} בדיקות ירוקות. הפרת גבול נתפסת אוטומטית (הוכח בבדיקה שלילית).`);
