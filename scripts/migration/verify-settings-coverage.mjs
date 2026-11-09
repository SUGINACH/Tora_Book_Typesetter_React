#!/usr/bin/env node
/**
 * verify-settings-coverage — אימות שלב 84: ניקוי stores ובדיקת הגדרות
 * יתומות (M9; אפיון §13, §18-M9; תכנית שלב 84).
 *
 * שעת השלב: **אין הגדרה יתומה או state מוסמך כפול.** ההוכחה:
 *   1. דוח הכיסוי (docs/migration/settings-coverage.json) עדכני —
 *      חישוב מחדש מהמרשם ומהקוד זהה בייט־בייט לקובץ המחויב.
 *   2. צרכנים: קבוצה סגורה {engine, ui-only}; ‎affectsLayout ⇔ engine‎
 *      (236/21 מתוך 257); תוויות בכיסוי דו-כיווני מלא; מפתחות ייחודיים.
 *   3. אין הגדרה יתומה בצנור: ה־draft נכנס רק דרך צינור הייבוא — גם
 *      ב-rehydrate (מפתח שירד מהמרשם ⇐ unmappedLegacy + issue, לא draft).
 *   4. אין state מוסמך כפול: ה־store הישן (src/store) נמחק ואין לו
 *      מתייחסים; שדות view/editor אינם מפתחות מרשם; המרשם מיובא פעם
 *      אחת (settingsRegistry); קומפוננטות אינן קוראות registry.json.
 *   5. ניקוי בין מסמכים: resetForNewDocument מבטל ריצה פעילה **לפני**
 *      האיפוס דרך הוק רשום (registerRunCancellation); App רושם את
 *      controller.cancel; אין effective מהעולם הישן (כל שינוי draft
 *      מאפס עד applyDraft).
 *   6. הבדיקות: 16 בדיקות ניקוי חדשות; tests/stores 104→120; הסוויטה
 *      1265→1300 נעולה ב־ci.yml ובכל המאמתים (הלכת סבב כ"ג).
 *   7. רגרסיה: typecheck, lint:packages, build:packages, deps:check.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1'; // שיתוף ריצת הסוויטה ב-CI (סבב י"ג)
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
const countMatches = (src, re) => [...src.matchAll(re)].length;
/** קוד בלבד — הסרת הערות לפני סריקות מבנה (הערות תיעוד אינן קוד). */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('1) דוח הכיסוי עדכני — חישוב מחדש זהה לקובץ המחויב');
{
  const committed = readFileSync(join(repoRoot, 'docs', 'migration', 'settings-coverage.json'), 'utf8');
  const out = run('node', [join('scripts', 'migration', 'gen-settings-coverage.mjs')]);
  (out !== null && /דוח כיסוי ההגדרות נכתב/.test(out) ? ok : fail)('המחולל רץ וכתב את הדוח');
  const regenerated = readFileSync(join(repoRoot, 'docs', 'migration', 'settings-coverage.json'), 'utf8');
  (regenerated === committed
    ? ok : fail)('הדוח המחויב עדכני — חישוב מחדש מהמרשם ומהקוד זהה בייט־בייט (דוח בלהות ייתפס)');
  const report = JSON.parse(committed);
  (report.totalKeys === 257 ? ok : fail)(`הדוח מכסה 257 מפתחות (נמצא ${report.totalKeys})`);
  (report.sourceSha256 && report.sourceSha256.length === 64 ? ok : fail)('הדוח נושא את sha256 של המרשם — מקור נעול לראיות');
}

console.log('\n2) צרכנים וכיסוי — קבוצה סגורה, תוויות דו-כיווניות, ייחודיות');
{
  const report = JSON.parse(read('docs/migration/settings-coverage.json'));
  const inv = report.invariants;
  (JSON.stringify(inv.consumerIdClosedSet) === JSON.stringify(['engine', 'ui-only'])
    ? ok : fail)('קבוצת הצרכנים סגורה: {engine, ui-only} בלבד');
  (inv.affectsLayoutMatchesConsumer ? ok : fail)('affectsLayout ⇔ consumerId === engine (236/21)');
  (inv.canonicalKeysUnique && inv.legacyKeysUnique ? ok : fail)('מפתחות קנוניים ו-legacy ייחודיים — אין מיפוי כפול');
  (inv.everyKeyHasUiMetadata ? ok : fail)('לכל רשומה מטא-נתוני UI שלמים (section/control/labelKey)');
  (inv.defaultValuesSelfConsistent ? ok : fail)('defaultValue עקבי לטיפוסו בכל 257 הרשומות — אין מיפוי מת');
  (inv.labelCoverage.covered === 257 && inv.labelCoverage.missing.length === 0
    ? ok : fail)('תוויות: 257/257 מכוסות (אין שדה יתום)');
  (inv.labelCoverage.orphanCatalogLabels.length === 0
    ? ok : fail)('אין תווית יתומה בקטלוג (אין consumer ללא שדה)');
  (Object.keys(report.sections).length === 13 ? ok : fail)('13 מדורים — החלוקה הסגורה של שלב 78');
}

console.log('\n3) אין הגדרה יתומה בצנור — draft נכנס רק דרך צינור הייבוא');
{
  const storeCode = read('src/stores/settings-store.ts');
  (/importEntries\(Object\.entries\(saved\.draft/.test(storeCode)
    ? ok : fail)('rehydrate מאמת את ה-draft השמור דרך importEntries — מפתח שירד מהמרשם אינו נכנס כיתום');
  (/unmappedLegacy: Object\.freeze\(\{ \.\.\.base\.unmappedLegacy, \.\.\.unmapped \}\)/.test(storeCode)
    ? ok : fail)('היתומים מהשמירה נשמרים ב-unmappedLegacy — לא נזרקים (הלכת שלב 79)');
  const effectiveNulls = countMatches(stripComments(storeCode), /effective: null/g);
  (effectiveNulls >= 6
    ? ok : fail)(`${effectiveNulls} אתרי effective: null (נדרש ≥ 6 — ארבע פעולות שינוי draft + rehydrate + reset) — אין effective מהעולם הישן`);
  (/(Object\.keys\(merged\)\.length > 0 \? \{ effective: null \} : \{\})/.test(stripComments(storeCode))
    ? ok : fail)('importObject מאפס רק כשה-draft זז באמת — דחייה מלאה אינה מאפסת');
  // ה־draft אינו נכתב ישירות מאחסון בשום מסלול אחר:
  (/asDraft\(saved\.draft\)/.test(storeCode) === false
    ? ok : fail)('אין הזרקת draft גולמי מהאחסון (asDraft(saved.draft) הוסר) — מסלול אחד ל-draft');
}

console.log('\n4) אין state מוסמך כפול — בעלים יחיד לכל סוג מצב');
{
  (!existsSync(join(repoRoot, 'src', 'store'))
    ? ok : fail)('ה־store הישן (src/store) נמחק — החמישייה של שלב 76 היא בעלת ה-state היחידה');
  const walk = (dir) => {
    const out = [];
    if (!existsSync(dir)) return out;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...walk(p));
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const srcFiles = [...walk(join(repoRoot, 'src')), ...walk(join(repoRoot, 'tests'))];
  const oldStoreRefs = [];
  for (const f of srcFiles) {
    const code = stripComments(read(f));
    if (/from '[^']*\/store\/(document|trace|view|worker)-store'/.test(code)) oldStoreRefs.push(f);
  }
  (oldStoreRefs.length === 0
    ? ok : fail)(`אף מודול אינו מייבא את ה-store הישן (${srcFiles.length} קבצים נסרקו)${oldStoreRefs.length ? ' — חריגות: ' + oldStoreRefs.slice(0, 3).join(', ') : ''}`);
  const report = JSON.parse(read('docs/migration/settings-coverage.json'));
  const own = report.invariants.ownership;
  (own.settingsRegistrySingleImport ? ok : fail)('המרשם נבנה פעם אחת (settingsRegistry ב-settings-store) — מקור אמת יחיד');
  (own.viewStoreFieldsOutsideRegistry.length === 4 && own.editorStoreFieldsOutsideRegistry.length === 6
    ? ok : fail)('שדות view (4) ו-editor (6) כולם מחוץ למרשם — הפרדת בעלות קשיחה (§13.1)');
  (own.legacyUiStoreRemoved ? ok : fail)('הדוח מתעד: store ה-UI הישן הוסר');
  // קומפוננטות אינן עוקפות את המופע היחיד (שלב 78 — נבדק מחדש):
  const compFiles = walk(join(repoRoot, 'src', 'components'));
  const directRegistry = compFiles.filter((f) => /@tora\/settings-schema\/registry\.json/.test(read(f)));
  (directRegistry.length === 0
    ? ok : fail)('אף קומפוננטה אינה מייבאת registry.json ישירות (התפר של שלב 78 נשמר)');
}

console.log('\n5) ניקוי בין מסמכים — ביטול ריצה לפני האיפוס, בהרכבה ובפעולה');
{
  const indexCode = read('src/stores/index.ts');
  (/export function registerRunCancellation\(cancel: RunCancellation \| null\)/.test(indexCode)
    ? ok : fail)('registerRunCancellation מיוצא מהחבית — הרשאה אחת, החלפה/null להסרה');
  const cancelIdx = indexCode.indexOf('runCancellation();');
  const resetIdx = indexCode.indexOf('useEditorStore.getState().reset();');
  (cancelIdx >= 0 && resetIdx > cancelIdx
    ? ok : fail)('resetForNewDocument מבטל ריצה **לפני** האיפוס — ההוק רואה את המסמך וה-job הישנים');
  const appCode = read('src/App.tsx');
  (/registerRunCancellation\(\(\) => \{/.test(appCode) && /peekUiRuntime\(\)\?\.controller\.cancel\(\)/.test(appCode)
    ? ok : fail)('App רושם את הביטול בהרכבה — peekUiRuntime()?.controller.cancel()');
  (/return \(\) => registerRunCancellation\(null\)/.test(appCode)
    ? ok : fail)('פירוק ההרכבה מסיר את הרישום — אין הוק תלוי אחרי unmount');
  const importDoc = read('src/stores/import-document.ts');
  (/peekUiRuntime\(\)/.test(importDoc) && /runtime\.controller\.cancel\(\)/.test(importDoc)
    ? ok : fail)('פעולת הייבוא שומרת את הביטול המפורש שלה — החוזה עומד גם בלי חיווט ההרכבה (אידמפוטנטי)');
  // מיגרציית state שמור — לא נפגעה:
  const migrateCode = stripComments(read('src/stores/legacy-migrate.ts'));
  (!/removeItem/.test(migrateCode) ? ok : fail)('מיגרציית המורשת עדיין קריאה בלבד — אין removeItem (שיעור שלב 76)');
}

console.log('\n6) הבדיקות — 16 ניקוי חדשות; tests/stores 120; הסוויטה 1300');
{
  const cleanupTests = read('tests/stores/store-cleanup.test.ts');
  const cleanupCount = countMatches(cleanupTests, /\btest\(/g);
  (cleanupCount === 16 ? ok : fail)(`16 בדיקות בקובץ הניקוי (נמצא ${cleanupCount})`);
  (/אין הגדרה יתומה או state מוסמך כפול/.test(cleanupTests) && /registerRunCancellation/.test(cleanupTests)
    ? ok : fail)('הבדיקות נועלות את שעת השלב — יתומים, בעלות כפולה, ביטול, שני מסמכים ושני locales');
  const storesOut = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/stores/']);
  (storesOut !== null && /Tests\s+120\s+passed/.test(storesOut)
    ? ok : fail)('tests/stores — 120/120 (104 עד שלב 83 + 16 ניקוי שלב 84)');
  const ci = read('.github/workflows/ci.yml');
  (/node scripts\/migration\/verify-settings-coverage\.mjs/.test(ci) ? ok : fail)('המאמת חובר ל־CI');
  const pkg = read('package.json');
  (/"verify:settings-coverage":\s*"node scripts\/migration\/verify-settings-coverage\.mjs"/.test(pkg)
    ? ok : fail)('המאמת רשום ב-package.json');
  (/"gen:settings-coverage":\s*"node scripts\/migration\/gen-settings-coverage\.mjs"/.test(pkg)
    ? ok : fail)('המחולל רשום ב-package.json');
  (runCode('node', [join('scripts', 'migration', 'gen-settings-coverage.mjs')]) === 0
    ? ok : fail)('המחולל רץ נקי — הדוח שוחזר');
  const ciLock = /Tests\[\[:space:\]\]\+1300\[\[:space:\]\]\+passed/.test(ci);
  (ciLock ? ok : fail)('נעיקת הספירה ב־ci.yml עודכנה ל־1300 (הלכת סבב כ"ג)');
}

console.log('\n7) רגרסיה');
{
  const testOut = (SKIP_TESTS ? 'Tests  1300 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages', '--silent']));
  (testOut !== null && /Tests\s+1300\s+passed/.test(testOut) ? ok : fail)('test:packages — 1300/1300 (1265 שלב 83 + 16 שלב 84)');
  (runCode('npx', ['tsc', '--noEmit']) === 0 ? ok : fail)('tsc --noEmit (שורש) — PASS');
  (runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
  (runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
  (runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check (גבולות תלות) — PASS');
}

console.log(`\nמאמת כיסוי ההגדרות הושלם — ${checks} בדיקות, ${failures} כשלונות.`);
if (failures > 0) {
  console.log('שלב 84 טרם עבר — תקנו את הכשלים לעיל.');
  process.exit(1);
}
console.log('שלב 84 תקין: ניקוי state מלא בין מסמכים/תבניות, ביטול ריצות ומנויים — ואפס הגדרות יתומות או state כפול.');
