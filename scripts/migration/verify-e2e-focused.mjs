#!/usr/bin/env node
/**
 * verify-e2e-focused — אימות שלב 85: בדיקות E2E ממוקדות (שער M9; §17.1, §18-M9).
 *
 * מה המאמת מוכיח:
 *   1. הסוויטה (tests/e2e — 27 בדיקות) ירוקה: ייבוא, עריכה, הגדרות, ביטול,
 *      ניווט audit, תצוגה וייצוא — עם ה־CLI כאורקל סמנטי (layoutHash מלא).
 *   2. הסביבה נעולה (תכנית השלב: "browser/font env נעולים"): דפדפן, ויוטפורט,
 *      DPR, locale, אזור זמן; גופנים מקומיים בלבד (אפס רשת חיצונית — §19).
 *   3. אין קביעת נכונות שבירה לפי screenshot בלבד — צילומים רק במפרט 05
 *      ורק להוכחת דטרמיניזם תצוגתי ורגישות זום; הנכונות מהמודל (hash/IR).
 *   4. שני תיקוני שורש שנתגלו ב־E2E נשמרים: פריקת WOFF2 בדפדפן (עותק
 *      הפעלה מתוקן של wawoff2 — זהות ביט-ביט מול המקור + פאץ' מתועד)
 *      והסרת Google Fonts מ־index.html (§19).
 *
 * רגרסיה: הרצת הסוויטה בפועל רק מקומית; ב־CI הצעד האב כבר הריץ אותה
 * (TORA_SKIP_TEST_REGRESSION=1 — סבב י"ג; ריצות בת כפולות מקריסות את ה-job).
 * דגלים: TORA_SKIP_TEST_REGRESSION=1 מדלג על סעיף 1 בלבד.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_SUITE = process.env.TORA_SKIP_TEST_REGRESSION === '1';
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');
const has = (p, needle) => read(p).includes(needle);
const ansi = (s) => (s == null ? s : String(s).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g, '').replace(/\x1b/g, ''));

/** נעיכת הסוויטה — E2E_COUNT בדיוק; אין דילוגים ואין flaky.
 * 2026-11-09/ב': 29→30 — בדיקת סדר קריאה במדידת מיקומי תווים (02). */
const E2E_COUNT = 30;
const run = (cmd, args) => {
  try {
    return ansi(execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }));
  } catch (e) {
    return ansi(e.stdout ?? null);
  }
};

console.log('1) הסוויטה — Playwright על האפליקציה הבנויה (vite preview)');
if (SKIP_SUITE) {
  console.log('  (דלוג — TORA_SKIP_TEST_REGRESSION=1; הצעד האב הריץ את הסוויטה)');
} else {
  const out = run('npx', ['playwright', 'test', '--reporter=line']);
  const passed = new RegExp(`\\s${E2E_COUNT}\\s+passed`).test(out ?? '');
  const noBad = !/failed|flaky|skipped/.test((out ?? '').split('passed').pop() ?? 'x');
  (out !== null && passed && noBad ? ok : fail)(`tests/e2e — ${E2E_COUNT}/${E2E_COUNT} (אין failed/flaky/skipped)`);
  (run('npx', ['tsc', '--noEmit']) === '' ? ok : fail)('typecheck שורש (src+tests+playwright.config) — PASS');
}

console.log('\n2) הסביבה נעולה — playwright.config.ts');
const cfg = read('playwright.config.ts');
([
  ["workers: 1 — אין מקביליות", /workers:\s*1/],
  ['fullyParallel: false', /fullyParallel:\s*false/],
  ['retries: 0 — אין ניסיונות חוזרים', /retries:\s*0/],
  ['viewport 1440×900 קבוע', /viewport:\s*\{\s*width:\s*1440,\s*height:\s*900\s*\}/],
  ['deviceScaleFactor: 1', /deviceScaleFactor:\s*1/],
  ["locale: 'he-IL'", /locale:\s*'he-IL'/],
  ["timezoneId: 'Asia/Jerusalem'", /timezoneId:\s*'Asia\/Jerusalem'/],
  ['webServer: vite preview ביציאה 4173 (strictPort)', /vite preview --port 4173 --strictPort/],
  ["testDir: 'tests/e2e'", /testDir:\s*'tests\/e2e'/],
]).forEach(([label, re]) => ((re.test(cfg)) ? ok : fail)(label));

console.log('\n3) מבנה הסוויטה — שישה מפרטים; אין sleeps; צילומים רק ב־05');
const specs = ['01-import-edit-run.spec.ts', '02-cli-oracle.spec.ts', '03-cancel-responsive.spec.ts', '04-audit-navigation.spec.ts', '05-export-visual.spec.ts', '06-deploy-subpath.spec.ts'];
specs.forEach((s) => ((existsSync(join(repoRoot, 'tests/e2e', s))) ? ok : fail)(`קיים: tests/e2e/${s}`));
(existsSync(join(repoRoot, 'tests/e2e/helpers.ts')) ? ok : fail)('קיים: tests/e2e/helpers.ts (עזרים משותפים — אין בו בדיקות)');
(!/waitForTimeout/.test(read('tests/e2e/helpers.ts')) ? ok : fail)('helpers.ts — אין waitForTimeout (אין sleeps)');
for (const s of specs) {
  (!/waitForTimeout/.test(read(join('tests/e2e', s))) ? ok : fail)(`${s} — אין waitForTimeout`);
}
for (const s of specs.filter((x) => !x.startsWith('05-'))) {
  (!/\.screenshot\(/.test(read(join('tests/e2e', s))) ? ok : fail)(`${s} — אין צילומי מסך (ויזואלי רק ב־05)`);
}
(/\.screenshot\(/.test(read('tests/e2e/05-export-visual.spec.ts')) ? ok : fail)('05-export-visual.spec.ts — צילומים להיטל בלבד (דטרמיניזם/זום; לא נכונות)');
(has('tests/e2e/helpers.ts', "join(REPO_ROOT, 'packages', 'cli', 'dist', 'main.js')") ? ok : fail)('האורקל — ה־CLI הרשמי (packages/cli/dist/main.js)');
(has('tests/e2e/helpers.ts', "ORACLE_DOCUMENT_ID = 'cli-reference'") ? ok : fail)("האורקל — documentId 'cli-reference' (כמו שלד 39; זהות itemIds)");
(has('tests/e2e/02-cli-oracle.spec.ts', 'cliLayoutRun') && has('tests/e2e/03-cancel-responsive.spec.ts', 'cliLayoutRun') && has('tests/e2e/04-audit-navigation.spec.ts', 'cliLayoutRun') ? ok : fail)('השוואת hash מול CLI במפרטים 02/03/04');
(has('tests/e2e/helpers.ts', "waitForEvent('filechooser')") && has('tests/e2e/helpers.ts', 'setFiles') ? ok : fail)('ייבוא דרך ה־filechooser של האפליקציה (לא הזרקה)');
(has('tests/e2e/03-cancel-responsive.spec.ts', 'longtask') ? ok : fail)('תגובתיות — Longtask Observer בחלון העימוד (שעת M9)');
(has('tests/e2e/05-export-visual.spec.ts', 'window.print') ? ok : fail)('ייצוא — window.print נעול (המסלול הסמכותי עד שלב 86)');

console.log('\n4) ערוצי ה־UI — הממשק האמיתי, לא חיווט בדיקה');
const shell = read('src/components/layout/AppShell.tsx');
([['data-layout-hash (ה־hash המלא)', /data-layout-hash=\{layoutHash\}/], ['data-run-phase (הפאזה)', /data-run-phase=\{phase\}/], ['print-export testid', /data-testid="print-export"/]]).forEach(([label, re]) => ((re.test(shell)) ? ok : fail)(`AppShell.tsx — ${label}`));
const zoom = read('src/components/view/ZoomControls.tsx');
(['zoom-in', 'zoom-out', 'zoom-reset']).forEach((t) => ((zoom.includes(`data-testid="${t}"`)) ? ok : fail)(`ZoomControls.tsx — ${t}`));

console.log('\n5) תיקוני השורש שנתגלו ב־E2E — פריקת WOFF2 ואפס רשת');
const vendorPath = 'src/worker-host/vendor/decompress-binding.js';
const origPath = 'node_modules/wawoff2/build/decompress_binding.js';
if (existsSync(join(repoRoot, vendorPath)) && existsSync(join(repoRoot, origPath))) {
  const vendor = read(vendorPath);
  const orig = read(origPath);
  const patch = '\n;export default Module;\n';
  (vendor === orig + patch ? ok : fail)('vendor/decompress-binding.js === המקור + הפאץ\' המתועד בלבד (";export default Module;") — זהות ביט-ביט, ה־wasm לא נגע');
} else {
  fail(`חסר ${vendorPath} או ${origPath}`);
}
(has('src/worker-host/worker-entry.ts', "from './woff2-browser.js'") ? ok : fail)('worker-entry.ts — פריקת WOFF2 דרך woff2-browser (לא המודול השבור של wawoff2)');
(!/import\('wawoff2'\)/.test(read('src/worker-host/worker-entry.ts')) ? ok : fail)("worker-entry.ts — אין יותר import('wawoff2') (היה תולה את הריצה הראשונה לנצח ב-preparing)");
(has('src/worker-host/woff2-browser.ts', 'onRuntimeInitialized') ? ok : fail)('woff2-browser.ts — רישום onRuntimeInitialized לפני הפריקה (זהות האובייקט — שורש התליה)');
(!/fonts\.googleapis\.com/.test(read('index.html')) ? ok : fail)('index.html — אפס Google Fonts (§19: אין CDN/רשת; הגופנים ב־public/fonts)');
(has('src/i18n/settings-labels.ts', 'SETTINGS_ERROR_LABELS') ? ok : fail)('settings-labels.ts — תרגום הודעות השגיאה של המרשם (שעת M9: שגיאות מתורגמות)');
(has('src/components/settings/SettingRow.tsx', 'SETTINGS_ERROR_LABELS') ? ok : fail)('SettingRow.tsx — הסוגיות מוצגות מתורגמות, לא כקוד גולם');

console.log('\n6) חיווט CI ומנע׳ זליגה ל־vitest');
const ci = read('.github/workflows/ci.yml');
([
  [`נעיכת ספירת ה־E2E ב־CI (${E2E_COUNT})`, new RegExp(`\\[\\[:space:\\]\\]${E2E_COUNT}\\[\\[:space:\\]\\]\\+passed`)],
  ['התקנת הדפדפן ב־CI', /playwright install --with-deps chromium/],
  ['בניית האפליקציה לפני ה־E2E', /npm run build/],
  ['הרצת ה־E2E (test:e2e)', /npm run test:e2e/],
  ['המאמת ברשימת ה־CI', /verify-e2e-focused\.mjs/],
]).forEach(([label, re]) => ((re.test(ci)) ? ok : fail)(`ci.yml — ${label}`));
const pkg = JSON.parse(read('package.json'));
((pkg.scripts?.['test:e2e'] === 'playwright test') ? ok : fail)('package.json — test:e2e = playwright test');
((typeof pkg.scripts?.['verify:e2e-focused'] === 'string' && pkg.scripts['verify:e2e-focused'].includes('verify-e2e-focused.mjs')) ? ok : fail)('package.json — verify:e2e-focused');
((pkg.devDependencies?.['@playwright/test'] !== undefined) ? ok : fail)('package.json — @playwright/test ב-devDependencies (גרסה נעולה ב-lockfile)');
(!/tests\/e2e\//.test(read('vitest.packages.config.ts')) ? ok : fail)('vitest.packages.config.ts — tests/e2e אינו בהכללה (אין ריצה כפולה; e2e-skeleton נשאר)');
(ci.includes('Tests[[:space:]]+1305[[:space:]]+passed') ? ok : fail)('ci.yml — נעיכת סוויטת vitest 1305 נותרה ללא שינוי (לא נוספו בדיקות vitest בשלב זה)');

console.log('\n7) תיקוני השורש של כישלון האתר החי (תת-נתיב Pages; מפרט 06)');
// התקלה החיה: "ניסיתי לעמד באתר החי של פייג'ס, ולא הצלחתי" — הצרור נטען
// מנתיב שורש מוחלט, בתת-הנתיב של Pages זה 404, והשגיאה נבלעה בהבטחה
// נטושה (הכפתור "לא עשה כלום"). כל תיקון ננעל כאן בהוכחת-נפל.
(has('src/worker-host/asset-bundle.ts', "options.baseUrl ?? '.'") ? ok : fail)("asset-bundle — בסיס נכסים יחסי למסמך ('.'), לא נתיב שורש מוחלט");
(has('src/worker-host/asset-bundle.ts', '${base}/fonts/manifest.json') && has('src/worker-host/asset-bundle.ts', '${base}/fonts/${record.file}') ? ok : fail)("asset-bundle — תבנית ה-URL על הבסיס המוזרק (זהה לבדיקות היחידה)");
(!/url\('\/fonts\//.test(read('public/fonts/fonts.css')) ? ok : fail)("fonts.css — אפס נתיבי גופנים אבסולוטיים (יחסיים לקובץ ה-CSS; תת-נתיב)");
// 2026-11-09/ד': favicon אמיתי ויחסי (הבקשה האוטומטית של הדפדפן ל-/favicon.ico
// משורש הדומיין החזירה 404 בקונסולה בכל אינטראקציה ראשונה — נתפס באתר החי)
(existsSync(join(repoRoot, 'public', 'favicon.svg')) && /rel="icon" type="image\/svg\+xml" href="\.\/favicon\.svg"/.test(read('index.html')) ? ok : fail)('index.html — favicon קיים בפועל וההפניה יחסית (בלי 404 משורש הדומיין)');
(!/external:\s*\[/.test(read('vite.config.ts')) ? ok : fail)("vite.config — אין external ל-mammoth (bare specifier אינו פתיר בדפדפן)");
(!/@vite-ignore/.test(read('src/lib/text-importers.ts')) ? ok : fail)("text-importers — ייבוא Word מבונדל (בלי @vite-ignore שהשאיר את הייבוא שבור בייצור)");
(has('src/worker-host/use-typeset-run.ts', 'PREPARE_FAILURE_JOB_ID') && /store\.fail\(PREPARE_FAILURE_JOB_ID/.test(read('src/worker-host/use-typeset-run.ts')) ? ok : fail)("use-typeset-run — כישלון הכנה מוצג בפאזת error עם קוד קטלוגי (לא כפתור אילם)");
(has('src/worker-host/ui-runtime.ts', 'realRuntime = null;') && has('src/worker-host/ui-runtime.ts', 'await loadBrowserAssetBundle();') ? ok : fail)("ui-runtime — הבטחה דחויה אינה נשמרת במטמון; הצרור נטען לפני יצירת העובד");
(/subpath-server\.mjs/.test(cfg) && /4174/.test(cfg) ? ok : fail)("playwright.config — שרת תת-הנתיב (4174) ב-webServer — סביבת Pages לרגרסיה");
(existsSync(join(repoRoot, 'tests', 'e2e', 'subpath-server.mjs')) ? ok : fail)("קיים: tests/e2e/subpath-server.mjs (מגיש את dist מתחת לקידומת)");
(has('tests/e2e/06-deploy-subpath.spec.ts', 'fonts/manifest.json') && /document\.fonts\.check/.test(read('tests/e2e/06-deploy-subpath.spec.ts')) ? ok : fail)("מפרט 06 — חסימת מניפסט לשגיאה גלויה + טעינת גופן אמיתית דרך ה-CSS");

console.log(`\nתוצאה: ${checks - failures}/${checks}`);
if (failures > 0) {
  console.error(`נכשל: ${failures}`);
  process.exit(1);
}
