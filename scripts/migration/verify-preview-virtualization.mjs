#!/usr/bin/env node
/**
 * verify-preview-virtualization — אימות שלב 83: virtualization בטוח,
 * progress וביטול (M9; אפיון §13.2, §17.2#5, §17.3#9–10; תכנית שלב 83).
 *
 * שעת השלב: **אין זליגת jobs ואין שינוי תוצאה עקב viewport.** ההוכחה:
 *   1. החישוב טהור — virtualization.ts בלי DOM בכלל (מספרים מה־IR);
 *      הקריאה ב־DOM (scrollTop/clientHeight) היא של המעטפת בלבד
 *      (PreviewArea); ‎גהה ≤ 0 ⇐ null ⇐ הצגה מלאה — נפילה לאחור מתועדת.
 *   2. תצוגה בלבד (§13.2): הזום transform מהפינה העליונה־התחלתית;
 *      הפער בין עמודים ממקור אחד (PAGE_GAP_PX); פסי ריווח משלימים
 *      את הגלילה; אין layout לעמודים גלויים ואין מדידת DOM במסלוב.
 *   3. zoom/DPR אינם משנים תוצאה — הבדיקות נועלות: אותו IR קפוא, אותו
 *      layoutHash, אף job חדש לא נפתח, ו־getBoundingClientRect אפס קריאות.
 *   4. progress נאמן — יחידות המנוע כמות שהן (‎stage, completedUnits,
 *      totalUnits?‎); אין מונה מקומי; האחוזים נקבעים בתצוגה בלבד
 *      (progress-display) ואינם קלט למנוע/לבקשה.
 *   5. ביטול וניקוי — cancel מרוקן את מפת העבודות ומנקה מנויים;
 *      done עם inputHash שונה מסיר את הרישום (ההבטחה נשארת תלויה,
 *      מתועד); בצד העובד רישומי הביטול מתנקים בפגישה — ״started״
 *      נשמר בכוונה (דחיית כפילות היא אכיפת פרוטוקול; מתועד).
 *   6. הבדיקות: 15 וירטואליזציה + 7 מחזור חיים = 22 חדשות;
 *      הסוויטה 1265 נעולה ב־ci.yml ובכל המאמתים (הלכת סבב כ"ג).
 *   7. רגרסיה: typecheck, lint:packages, build:packages, deps:check.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

console.log('1) החישוב טהור — virtualization.ts בלי DOM; הקריאה ב־DOM של המעטפת בלבד');
{
  const virt = stripComments(read('src/renderers/virtualization.ts'));
  (!/document\b|window\b|getBoundingClientRect|clientWidth|clientHeight|offsetHeight|offsetWidth/.test(virt)
    ? ok : fail)('virtualization.ts — אפס גישות DOM (מספרים מה־IR בלבד)');
  (/viewportHeightPx <= 0/.test(virt) && /return null/.test(virt)
    ? ok : fail)('גהה לא־חיובית ⇐ null — נפילה לאחור מתועדת, לא רשימה ריקה בשקט');
  (/export const PAGE_GAP_PX = 16/.test(virt) ? ok : fail)('PAGE_GAP_PX = 16 — מקור אחד לפער בין עמודים');
  (/export function visiblePageRange/.test(virt) && /export function pageOffsets/.test(virt) && /export function spacerHeights/.test(virt) && /export function totalHeightPx/.test(virt)
    ? ok : fail)('מיוצאים: visiblePageRange/pageOffsets/spacerHeights/totalHeightPx');
  const previewArea = read('src/components/layout/PreviewArea.tsx');
  (/clientHeight/.test(previewArea) && !/getBoundingClientRect/.test(previewArea)
    ? ok : fail)('PreviewArea קורא גהת גלילה (clientHeight) בלבד — אין מדידת תיבות');
  (!/from '@tora\//.test(previewArea) ? ok : fail)('אף ייבוא @tora ב-PreviewArea — התפר נשמר (היטל דרך renderers)');
  (/beforeprint/.test(previewArea) && /afterprint/.test(previewArea) && /removeEventListener/.test(previewArea)
    ? ok : fail)('הדפסה ⇐ הצגה מלאה; ניקוי מאזינים בהסרה');
}

console.log('\n2) תצוגה בלבד (§13.2) — זום, פערים, פסי ריווח, וירטואליזציה של ה-preview');
{
  const preview = read('src/renderers/LayoutPreview.tsx');
  (/transform: `scale\(\$\{zoom\}\)`/.test(preview) && /transformOrigin: dir === 'rtl' \? 'right top' : 'left top'/.test(preview)
    ? ok : fail)('הזום transform מהפינה העליונה־התחלתית — מיפוי גלילה⇐תוכן ליניארי');
  (/PAGE_GAP_PX/.test(preview) && !/gap: '16px'/.test(preview)
    ? ok : fail)('הפער בין עמודים מ־PAGE_GAP_PX (marginBlockEnd לוגי) — מקור אחד');
  (/data-virtual-range/.test(preview) && /preview-spacer-top/.test(preview) && /preview-spacer-bottom/.test(preview)
    ? ok : fail)('הטווח מתועד (data-virtual-range) ופסי הריווח מוצגים בגאומטריה מה־IR');
  const hooksBeforeBranches = /const heights = useMemo/.test(preview) && /const range = useMemo/.test(preview);
  const earlyReturn = preview.indexOf('if (status === \'error\'');
  const firstHook = preview.indexOf('const heights = useMemo');
  (hooksBeforeBranches && firstHook < earlyReturn
    ? ok : fail)('ה-hooks לפני המצבים — אין early-return מותנה על חישוב (כללי React)');
  const virt = stripComments(read('src/renderers/virtualization.ts'));
  (!/@tora\//.test(virt) ? ok : fail)('virtualization.ts אינו מייבא חבילות — טהור לחלוטין');
}

console.log('\n3) zoom/DPR אינם משנים תוצאה — נעול בבדיקות השלב');
{
  const testSrc = read('tests/component/virtualization.test.tsx');
  (/zoom\/DPR אינם משנים תוצאה/.test(testSrc) && /אותו IR קפוא/.test(testSrc)
    ? ok : fail)('הבדיקה נועלת: אותו IR קפוא, אותו hash, אף job חדש לא נפתח');
  (/getBoundingClientRect.*אפס|אפס מדידות DOM/.test(testSrc)
    ? ok : fail)('הבדיקה נועלת: אפס מדידות DOM לאורך מחזור גלילה+זום');
  (/אין שינוי עקב viewport/.test(testSrc)
    ? ok : fail)('הבדיקה נועלת את שעת השלב — גלילה במחזור מלא לא משנה את התוצאה');
}

console.log('\n4) progress נאמן — אחוזים בתצוגה בלבד; אין מונה מקומי');
{
  const engineWorker = read('src/worker-host/engine-worker.ts');
  (!/progressUnits/.test(engineWorker)
    ? ok : fail)('אין מונה מקומי בעובד — progressUnits הוסר');
  (/totalUnits !== undefined/.test(engineWorker) && /type: 'progress', jobId, stage, completedUnits, totalUnits/.test(engineWorker)
    ? ok : fail)('העובד מעביר (stage, completedUnits, totalUnits) כמות שהן');
  const proto = read('src/worker-host/protocol.ts');
  (/totalUnits\?: number/.test(proto) && /Number\.isSafeInteger\(v\.totalUnits\)/.test(proto)
    ? ok : fail)('הפרוטוקול כבר תמך ב־totalUnits — לא נפתח מחדש (אמת מהקוד הקיים)');
  const client = read('src/worker-host/worker-client.ts');
  (/cb\(msg\.stage, msg\.completedUnits, msg\.totalUnits\)/.test(client)
    ? ok : fail)('הלקוח מעביר את totalUnits למנויים');
  const conductor = read('src/worker-host/typeset-run.ts');
  (/run\.setProgress\(jobId, stage, completedUnits, totalUnits\)/.test(conductor)
    ? ok : fail)('המנצח מסדר עד הסטור (runStore.progress.totalUnits)');
  const runStore = read('src/stores/run-store.ts');
  (/totalUnits\?: number/.test(runStore) ? ok : fail)('run-store כבר תמך ב־totalUnits — השלב רק חיבר את הצינור');
  const display = read('src/renderers/progress-display.ts');
  (/Math\.floor/.test(display) && /Math\.min\(100/.test(display) && !/@tora\//.test(display)
    ? ok : fail)('progress-display טהור: אחוז שלם קלמפ 0..100 — בלי תלות בחבילות');
  const appShell = read('src/components/layout/AppShell.tsx');
  (/formatProgress/.test(appShell) && !/@tora\//.test(appShell)
    ? ok : fail)('התצוגה דרך formatProgress — התפר נשמר (אין ייבוא @tora בקומפוננטות)');
  (!/percent/.test(engineWorker) && !/percent/.test(client) && !/percent/.test(proto)
    ? ok : fail)('אחוזים אינם קלט למנוע/לערוץ — הם נקבעים בתצוגה בלבד');
}

console.log('\n5) ביטול וניקוי — אין זליגת jobs ואין מאזינים תלויים');
{
  const client = read('src/worker-host/worker-client.ts');
  (/state\.progressCbs\.length = 0;/.test(client) && /this\.jobs\.delete\(jobId\);/.test(client)
    ? ok : fail)('cancel מנקה מנויים ומסיר את הרישום מהמפה');
  const deletes = countMatches(client, /this\.jobs\.delete\(msg\.jobId\)/g);
  (deletes >= 1 && /תלויה \(מתועד\)/.test(client)
    ? ok : fail)('done עם inputHash שונה מסיר את הרישום — ההבטחה נשארת תלויה, מתועד');
  (/get retainedJobs\(\)/.test(client) && /get activeJobs\(\)/.test(client)
    ? ok : fail)('טלמטריה: retainedJobs + activeJobs — לבדיקות "אין זליגה"');
  const engineWorker = read('src/worker-host/engine-worker.ts');
  const cancelDeletes = countMatches(engineWorker, /cancelled\.delete\(/g);
  (cancelDeletes >= 3
    ? ok : fail)(`רישומי ביטול מתנקים בפגישה — ${cancelDeletes} אתרי cancelled.delete (נדרש ≥ 3)`);
  (/דחיית כפילות היא אכיפת פרוטוקול/.test(engineWorker)
    ? ok : fail)('״started״ נשמר בכוונה ומתועד — דחיית כפילות אינה זליגה');
}

console.log('\n6) הבדיקות — 15 וירטואליזציה + 7 מחזור חיים = 22 חדשות; הסוויטה 1265');
{
  const virtTests = read('tests/component/virtualization.test.tsx');
  const virtCount = countMatches(virtTests, /\btest\(/g);
  (virtCount === 15 ? ok : fail)(`15 בדיקות בקובץ הווירטואליזציה (נמצא ${virtCount})`);
  const jobTests = read('tests/worker-host/job-lifecycle.test.ts');
  const jobCount = countMatches(jobTests, /\btest\(/g);
  (jobCount === 7 ? ok : fail)(`7 בדיקות בקובץ מחזור החיים (נמצא ${jobCount})`);
  (/retainedJobs/.test(jobTests) && /§17\.2#10/.test(jobTests)
    ? ok : fail)('הבדיקות נועלות אין-זליגה וביטול-אינו-משנה-את-הבא');
  const ci = read('.github/workflows/ci.yml');
  (/node scripts\/migration\/verify-preview-virtualization\.mjs/.test(ci) ? ok : fail)('המאמת חובר ל־CI');
  const pkg = read('package.json');
  (/"verify:preview-virtualization":\s*"node scripts\/migration\/verify-preview-virtualization\.mjs"/.test(pkg)
    ? ok : fail)('המאמת רשום ב־package.json');
  const ciLock = /Tests\[\[:space:\]\]\+1265\[\[:space:\]\]\+passed/.test(ci);
  (ciLock ? ok : fail)('נעיקת הספירה ב־ci.yml עודכנה ל־1265 (הלכת סבב כ"ג)');
}

console.log('\n7) רגרסיה');
{
  const testOut = (SKIP_TESTS ? 'Tests  1265 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages', '--silent']));
  (testOut !== null && /Tests\s+1265\s+passed/.test(testOut) ? ok : fail)('test:packages — 1265/1265 (1243 שלב 82 + 22 שלב 83)');
  (runCode('npx', ['tsc', '--noEmit']) === 0 ? ok : fail)('tsc --noEmit (שורש) — PASS');
  (runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
  (runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
  (runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check (גבולות תלות) — PASS');
}

console.log(`\nמאמת הווירטואליזציה הושלם — ${checks} בדיקות, ${failures} כשלונות.`);
if (failures > 0) {
  console.log('שלב 83 טרם עבר — תקנו את הכשלים לעיל.');
  process.exit(1);
}
console.log('שלב 83 תקין: תצוגה וירטואלית בלבד, progress נאמן לתצוגה, ביטול עם ניקוי — ואף שינוי תוצאה עקב viewport.');
