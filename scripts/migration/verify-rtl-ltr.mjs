#!/usr/bin/env node
/**
 * verify-rtl-ltr — אימות שלב 94: RTL/LTR של הממשק והפרדת כיוון הנוסח (§16, §21).
 *
 * נבדק (מול דלתות השלב בתכנית):
 *   1. CSS הממשק בתכונות לוגיות: אין כיוון קשיח ב-body (הכיוון יורד
 *      מה-documentElement לפי הלוקייל); אין מחלקות פיזיות קשיחות
 *      (border-l/border-r/ml-/mr-/pl-/pr-/text-left/text-right) בקומפוננטות
 *      ה-UI — הפאות לוגיות (border-s/border-e/ms-/me-/text-start).
 *   2. dir ברמת ה-shell מתעדכן עם הלוקייל (dirOf) ומסונכרן ל-documentElement
 *      (lang + dir) — קוראי מסך מקבלים את השפה והכיוון האמיתיים.
 *   3. הפרדת כיוון הנוסח: עמודי הספר תמיד rtl (.tora-page ב-CSS של הספר;
 *      LayoutPreview — ברירת מחדל rtl; PageView לא מקבל dir מהלוקייל);
 *      אין dir="rtl" קשיח בלוח ההגדרות (נגרר אחרי ה-shell).
 *   4. הלוקייל אינו חלק מהמודל: אין 'locale' במרשם ההגדרות; הוא חי ב-viewStore
 *      בלבד; בדיקת הריצה (rtl-ltr.test.tsx) מוכיחה שהחלפתו לא נוגעת
 *      ל-draft/effective; ה-E2E (02) מוכיח hash קבוע תחת החלפת שפה.
 *   5. index.html מאותחל לפי ברירת המחדל (he/rtl) — אין מצב ראשוני סותר.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');
const exists = (p) => existsSync(join(repoRoot, p));

console.log('1) CSS — תכונות לוגיות, אין כיוון קשיח ב-body');
{
  const css = read('src/styles/global.css');
  const bodyBlock = css.slice(css.indexOf('body {'), css.indexOf('}', css.indexOf('body {')));
  (/direction/.test(bodyBlock) ? fail : ok)('body בלי direction קשיח (יורד מה-documentElement)');
  (/direction:\s*rtl/.test(css.slice(css.indexOf('.tora-page'))) ? ok : fail)('.tora-page — כיוון הספר תמיד rtl (הפרדת הנוסח)');
}
{
  // מחלקות פיזיות בקומפוננטות ה-UI (לא ברנדררים של הספר — שם פיזי לגיטימי
  // לפי גיאומטריית העמוד)
  const uiFiles = [
    'src/components/layout/AppShell.tsx',
    'src/components/layout/PreviewArea.tsx',
    'src/components/layout/ExportButton.tsx',
    'src/components/view/ZoomControls.tsx',
    'src/components/common/ErrorBoundary.tsx',
    'src/components/settings/SettingsPanel.tsx',
    'src/components/settings/SettingsFiles.tsx',
    'src/components/settings/SettingRow.tsx',
    'src/components/editor/ImportButtons.tsx',
    'src/components/editor/ImportInsights.tsx',
    'src/components/editor/TextEditor.tsx',
    'src/components/audit/AuditFindings.tsx',
  ];
  const physical = /(border-l|border-r)\b|\b(ml|mr|pl|pr)-[0-9]|text-left|text-right/;
  const bad = [];
  for (const f of uiFiles) {
    const src = read(f);
    if (physical.test(src)) bad.push(f);
  }
  (bad.length === 0 ? ok : fail)(`אין מחלקות כיוון פיזיות בקומפוננטות ה-UI${bad.length ? ' — ' + bad.join(', ') : ''}`);
  const shell = read('src/components/layout/AppShell.tsx');
  (/border-e\b/.test(shell) ? ok : fail)('פאנל העורך — border-e (לוגי)');
  const panel = read('src/components/settings/SettingsPanel.tsx');
  (/border-s\b/.test(panel) ? ok : fail)('לוח ההגדרות — border-s (לוגי)');
  (/dir="rtl"/.test(panel) ? fail : ok)('לוח ההגדרות בלי dir קשיח משלו (נגרר אחרי ה-shell)');
  const errB = read('src/components/common/ErrorBoundary.tsx');
  (/dir="ltr"/.test(errB) && /text-start/.test(errB) ? ok : fail)('ErrorBoundary — מסלול מחסנית ltr מפורש + text-start');
}

console.log('\n2) dir מתעדכן עם הלוקייל — shell + documentElement');
{
  const shell = read('src/components/layout/AppShell.tsx');
  (/dir=\{dirOf\(locale\)\}/.test(shell) ? ok : fail)('dir ברמת ה-shell (dirOf(locale))');
  (/documentElement\.dir\s*=\s*dirOf\(locale\)/.test(shell) ? ok : fail)('סנכרון documentElement.dir');
  (/documentElement\.lang/.test(shell) ? ok : fail)('סנכרון documentElement.lang (he-IL/en-US)');
  const index = read('index.html');
  (/lang="he"/.test(index) && /dir="rtl"/.test(index) ? ok : fail)('index.html מאותחל לברירת המחדל (he/rtl)');
}

console.log('\n3) הפרדת כיוון הנוסח — הספר לא מתהפך עם הממשק');
{
  const lp = read('src/renderers/LayoutPreview.tsx');
  (/dir = 'rtl'/.test(lp) ? ok : fail)("LayoutPreview — ברירת מחדל rtl (לפי התוכן, לא הלוקייל)");
  const pa = read('src/components/layout/PreviewArea.tsx');
  (/dir=\{/.test(pa) && /locale/.test(pa) ? fail : ok)('PreviewArea אינו מעביר dir מהלוקייל להיטל (הפרדה)');
  const pv = read('src/renderers/PageView.tsx');
  (/dir=\{r\.direction\}/.test(pv) ? ok : fail)('ריצות — כיוון פר-ריצה מה-IR (r.direction)');
}

console.log('\n4) הלוקייל אינו חלק מהמודל');
{
  const registryFiles = ['src/stores/settings-store.ts', 'packages/settings-schema/src/registry.ts'];
  let regHasLocale = false;
  for (const f of registryFiles) {
    if (!exists(f)) continue;
    const src = read(f);
    if (/'locale'/.test(src)) regHasLocale = true;
  }
  (regHasLocale ? fail : ok)("אין מפתח 'locale' במרשם ההגדרות (אינו יכול להיכנס ל-configHash)");
  const view = read('src/stores/view-store.ts');
  (/locale/.test(view) ? ok : fail)('הלוקייל חי ב-viewStore (מצב UI; נשמר ב-tora-ui:view:v1)');
  const test = read('tests/component/rtl-ltr.test.tsx');
  (/configHash|draft/.test(test) && /setLocale/.test(test) ? ok : fail)('בדיקת ריצה: החלפת לוקייל לא נוגעת להגדרות (rtl-ltr.test.tsx)');
  const e2e = read('tests/e2e/02-cli-oracle.spec.ts');
  (/toggle-locale/.test(e2e) && /hashHe/.test(e2e) ? ok : fail)('E2E: החלפת שפה ⇒ אותו layoutHash (02-cli-oracle)');
}

console.log(`\nתוצאה: ${checks - failures}/${checks}`);
process.exit(failures === 0 ? 0 : 1);
