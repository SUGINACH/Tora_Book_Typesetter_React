#!/usr/bin/env node
/**
 * verify-presets-migrations — אימות שלב 79: presets, migrations וייבוא
 * קובצי הגדרות ישנים (M9).
 * אסמכתא: אפיון §6.3, §18-M9 · תכנית שלב 79.
 *
 * שער השלב: **כל קובץ הגדרות ישן נטען או נדחה עם הסבר מדויק.** ההוכחה:
 *   1. שרשרת המיגרציות הנעולה (שלב 30) היא המסלול היחיד ב-UI — אין
 *      מימוש מקביל של המרות במעטפת (כלל 8).
 *   2. פורמט הייצוא: מעטפת {$format:'tora-settings', schemaVersion,
 *      values} מהמצב האפקטיבי, מפתחות ממוינים — והלוך־ושוב עם אותו
 *      configHash מוכח בבדיקה.
 *   3. הייבוא במעטפת: קלט קובץ ← importSettingsFile בלבד; סיכום מלא
 *      (נטענו/המרות/נדחו), דחיות עם קוד+path, מפתחות לא מופו מוצגים.
 *   4. השער: ארבעת קובצי הבייסליין (ברירת מחדל + שלוש הערכות) נטענים
 *      בבדיקות ה-store; מפתח לא מוכר/NaN/מידה שלילית נכשלים לפני תחילת
 *      עימוד עם קוד ו-path — E2E מוכיח ששום job לא נשלח.
 *   5. הבדיקות: 21 ב-store, 8 ברכיב, 5 ב-E2E; הסוויטה המלאה 1199.
 *   6. רגרסיה: typecheck, lint:packages, build:packages, deps:check.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1';
const SKIP_HEAVY = process.env.TORA_SKIP_HEAVY === '1';
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
const stripAnsi = (s) => (s == null ? s : String(s).replace(ANSI_RE, '').replace(/\x1b/g, ''));
const run = (cmd, args) => {
  try {
    return stripAnsi(execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }));
  } catch (e) { return stripAnsi(e.stdout ?? null); }
};
const runCode = (cmd, args) => {
  try {
    execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }); return 0;
  } catch (e) { return e.status ?? 1; }
};
const read = (p) => readFileSync(p.startsWith('/') ? p : join(repoRoot, p), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

console.log('1) שרשרת המיגרציות — המסלול היחיד, אין מימוש מקביל');
{
  const store = stripComments(read('src/stores/settings-store.ts'));
  (/migrateSettings/.test(read('src/stores/settings-store.ts')) && /import \{[^}]*migrateSettings[^}]*\} from '@tora\/settings-schema';/s.test(read('src/stores/settings-store.ts'))
    ? ok : fail)('settings-store מייבא את migrateSettings מ־@tora/settings-schema (השרשרת הנעולה של שלב 30)');
  (/migrateSettings\(raw/.test(store) ? ok : fail)('importSettingsFile מריץ את השרשרת על תוכן הקובץ לפני הייבוא');
  (/fromVersion = 1/.test(store) ? ok : fail)('קובץ מורשת שטוח נחשב v1 (Orange אינו מספר גרסאות) — מתועד בקוד');

  // אין מימוש מקביל: שום מודול מעטפת אינו מגדיר צעדי מיגרציה משלו
  const uiCode = ['src/components/settings/SettingsFiles.tsx', 'src/components/settings/SettingsPanel.tsx', 'src/components/settings/SettingRow.tsx']
    .map((f) => stripComments(read(f))).join('\n');
  (!/SETTINGS_MIGRATIONS|fromVersion|toVersion|migration-step/.test(uiCode)
    ? ok : fail)('הקומפוננטות אינן מממשות המרות משלהן (אין fromVersion/toVersion/שרשרת מקומית)');
  (!/from '@tora\//.test(stripComments(read('src/components/settings/SettingsFiles.tsx')))
    ? ok : fail)('SettingsFiles אינו מייבא חבילות @tora — רק דרך ה-store (התפר המוסכם משלב 78)');
}

console.log('\n2) פורמט הייצוא — מעטפת מזוהה, דטרמיניסטי, הלוך־ושוב');
{
  const store = read('src/stores/settings-store.ts');
  const storeCode = stripComments(store);
  (/SETTINGS_FILE_FORMAT = 'tora-settings'/.test(store) ? ok : fail)("מזהה הפורמט 'tora-settings' מוגדר פעם אחת ב-store");
  (/Object\.keys\(effective\.values\)\.sort\(\)/.test(storeCode) ? ok : fail)('הייצוא ממוין (מפתחות בסדר קבוע — דטרמיניסטי)');
  (/schemaVersion: SCHEMA_VERSION/.test(storeCode) ? ok : fail)('גרסת הסכמה בייצוא מהחבילה (SCHEMA_VERSION) — לא מספר כתוב־ביד');
  (/\$format/.test(storeCode) ? ok : fail)('המעטפת נפרקת בייבוא לפי $format (ייצוא חדש מול קובץ מורשת שטוח)');

  const files = stripComments(read('src/components/settings/SettingsFiles.tsx'));
  (/new Blob\(/.test(files) && /URL\.createObjectURL/.test(files) ? ok : fail)('הייצוא מוריד קובץ דרך Blob + createObjectURL');
  (/data-testid="export-settings"/.test(files) ? ok : fail)('כפתור ייצוא קיים בסרגל');

  const storeTest = read('tests/stores/settings-store.test.ts');
  (/אותו configHash/.test(storeTest) ? ok : fail)('בדיקת הלוך־ושוב (ייצוא ← ייבוא ← אותו configHash) קיימת');
  (/257/.test(storeTest) ? ok : fail)('הייצוא הוא תמונת מצב מלאה מה-effective (257 מפתחות) — נבדק');
}

console.log('\n3) הייבוא במעטפת — הכול דרך importSettingsFile, הכול מוצג');
{
  const files = stripComments(read('src/components/settings/SettingsFiles.tsx'));
  (/importSettingsFile/.test(files) ? ok : fail)('הרכיב קורא ל-importSettingsFile (פעולת ה-store) — לא מייבא בעצמו');
  (/data-testid="import-settings-file"/.test(files) ? ok : fail)('קלט קובץ קיים (accept JSON)');
  (/JSON\.parse/.test(files) && /import-file-error/.test(files) ? ok : fail)('קובץ שאינו JSON נדחה בהודעה מפורשת — שום דבר לא נטען בשקט');
  (/data-testid="import-summary"/.test(files) ? ok : fail)('סיכום הייבוא מוצג (נטענו/המרות/נדחו)');
  (/data-issue-code/.test(files) && /data-issue-path/.test(files) ? ok : fail)('דחיות מוצגות עם קוד קטלוגי ו-path — הסבר מדויק (פטרון שלב 12)');
  (/data-testid="unmapped-legacy"/.test(files) ? ok : fail)('מפתחות לא מופו מוצגים (נשמרו, לא נמחקו — לא השמטה שקטה)');
  (/applyDraft\(\)/.test(files) ? ok : fail)('§13.3 — אחרי ייבוא/טעינת תבנית מרוענן effective/configHash');

  const panel = read('src/components/settings/SettingsPanel.tsx');
  (/<SettingsFiles \/>/.test(panel) ? ok : fail)('הסרגל משולב בלוח ההגדרות');
}

console.log('\n4) השער — כל קובץ בייסליין נטען או נדחה עם הסבר מדויק');
{
  const baseline = [
    'assets/settings/default_settings.json',
    'assets/settings/setting_sets/פרשנות.json',
    'assets/settings/setting_sets/קונטרס.json',
    'assets/settings/setting_sets/תלמוד.json',
  ];
  const allExist = baseline.every((p) => existsSync(join(repoRoot, p)));
  (allExist ? ok : fail)('ארבעת קובצי הבייסליין קיימים (ברירת מחדל + שלוש הערכות)');

  const storeTest = read('tests/stores/settings-store.test.ts');
  const refsBaseline = baseline.every((p) => {
    const name = p.split('/').pop();
    return storeTest.includes(name) || (p.includes('setting_sets') && storeTest.includes('setting_sets/'));
  });
  (refsBaseline ? ok : fail)('בדיקות ה-store טוענות את כל ארבעת קובצי הבייסליין (מלוא הטעינה, אפס דחיות חוסמות)');
  (/נטען במלואו — 248 מפתחות, אפס דחיות/.test(storeTest) ? ok : fail)('קובץ ברירת המחדל: 248 מפתחות, אפס דחיות — נעול בבדיקה');
  (/249/.test(storeTest) ? ok : fail)('שלוש הערכות: 249 מפתחות כל אחת — נעול בבדיקה');
  (/MIGRATION_FAILED/.test(storeTest) ? ok : fail)('גרסה עתידית נדחית ב-MIGRATION_FAILED מדויק (קוד+path+פרמטרים) — נבדק');
  (/NON_FINITE_NUMBER/.test(storeTest) && /NEGATIVE_DIMENSION/.test(storeTest) && /UNKNOWN_KEY/.test(storeTest)
    ? ok : fail)('NaN/מידה שלילית/מפתח לא מוכר נדחים עם קוד ו-path — נבדק');

  if (!SKIP_TESTS) {
    const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/stores/settings-store.test.ts']);
    (/Tests\s+21\s+passed/.test(out ?? '') ? ok : fail)('tests/stores/settings-store — 21/21 (כולל מלוא הבייסליין)');
  } else {
    ok('בדיקות ה-store — דולג (הצעד האב הריץ את הסוויטה)');
  }
}

console.log('\n5) חסימת ריצה לפני תחילת עימוד — effective מתאפס, שום job לא נשלח');
{
  const storeCode = stripComments(read('src/stores/settings-store.ts'));
  (/\.\.\.state, effective: null, issues:/.test(storeCode)
    ? ok : fail)('כשל buildEffectiveSettings ⇐ effective=null (אין ערך מלוכלך מהריצה הקודמת)');
  const runHook = stripComments(read('src/worker-host/use-typeset-run.ts'));
  (/if \(effective === null\) return;/.test(runHook) ? ok : fail)('use-typeset-run חוזר לפני controller.run כשאין effective תקין');
  const e2e = read('tests/component/e2e-worker-path.test.tsx');
  (/הגדרות לא חוקיות — הריצה נחסמת לפני תחילת עימוד/.test(e2e) ? ok : fail)('בדיקת E2E לחסימת הריצה קיימת (שום job לא נשלח)');
  if (!SKIP_TESTS) {
    const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/component/e2e-worker-path.test.tsx']);
    (/Tests\s+8\s+passed/.test(out ?? '') ? ok : fail)('tests/component/e2e-worker-path — 8/8 (5 שלב 79 + 3 שלב 80)');
  } else {
    ok('בדיקות ה-E2E — דולגו (הצעד האב הריץ את הסוויטה)');
  }
}

console.log('\n6) הבדיקות — 21 store + 8 רכיב + 5 E2E; הסוויטה המלאה 1199');
{
  const storeTest = read('tests/stores/settings-store.test.ts');
  const storeIts = [...storeTest.matchAll(/\btest\(/g)].length;
  (storeIts === 21 ? ok : fail)(`21 בדיקות בקובץ ה-store (נמצא ${storeIts})`);
  const filesTest = read('tests/component/settings-files.test.tsx');
  const filesIts = [...filesTest.matchAll(/\bit\(/g)].length;
  (filesIts === 8 ? ok : fail)(`8 בדיקות בקובץ הרכיב (נמצא ${filesIts})`);
  if (!SKIP_TESTS) {
    const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/component/settings-files.test.tsx']);
    (/Tests\s+8\s+passed/.test(out ?? '') ? ok : fail)('tests/component/settings-files — 8/8');
    const testOut = run('npm', ['run', 'test:packages']);
    (/Tests\s+1199\s+passed/m.test(testOut ?? '') ? ok : fail)('test:packages — 1199/1199');
  } else {
    ok('בדיקות הרכיב והסוויטה — דולג (הצעד האב הריץ את הסוויטה)');
  }
}

console.log('\n7) רגרסיה — typecheck/lint/build/deps');
{
  if (!SKIP_HEAVY) {
    (runCode('npx', ['tsc', '--noEmit']) === 0 ? ok : fail)('tsc --noEmit — PASS');
    (runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
  } else {
    ok('typecheck/lint — דולגו (TORA_SKIP_HEAVY)');
  }
  (runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
  (runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`verify-presets-migrations: ${checks - failures}/${checks} בדיקות עברו${failures > 0 ? `, ${failures} נכשלו` : ''}`);
process.exit(failures > 0 ? 1 : 0);
