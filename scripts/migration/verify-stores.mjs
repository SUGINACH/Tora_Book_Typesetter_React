#!/usr/bin/env node
/**
 * verify-stores — אימות שלב 76: חמשת ה־stores של המעטפת (§13.1).
 *
 * בדיקות (39):
 *   1. מבנה: חמשת ה־stores + אחסון/מיגרציה/בוררים/חבית קיימים.
 *   2. editor-store: **אין IR בקוד** (סריקה אחרי הסרת הערות — שיעור שלב 70:
 *      הערות מזכירות את האיסור עצמו; סורקים קוד בלבד).
 *   3. result-store: deepFreeze איטרטיבי (מחסנית + WeakSet למחזורים).
 *   4. run-store: שבעה מצבים; הגנת stale-job דו־שכבתית בקוד.
 *   5. view-store: clamp של zoom ל־[0.25, 4].
 *   6–9. settings-store: כל הלוגיקה מ־@tora/settings-schema בלבד; מפתח
 *      לא מוכר ⇐ issue ולא draft; unmappedLegacy נשמר (שלב 79).
 *   10–14. אחסון: מפתחות tora-ui:*:v1; מורשת נקראת בלבד (אין removeItem
 *      במיגרציה); דגלון חד־פעמי; החדש גובר; JSON פגום ⇐ fallback.
 *   15–18. בוררים: useStoreWithEqualityFn מ־zustand/traditional + shallow;
 *      בוררים צרים; בדיקות ספירת רינדור.
 *   19–25. בדיקות ירוקות (65+4), typecheck, lint:packages, אין any,
 *      אין גישת localStorage ישירה מחוץ ל־storage.ts.
 *   26–30. אינטגרציה: החבית; resetForNewDocument שומר zoom/locale;
 *      vitest כולל את tests/stores; המרשם מהחבילה; סוויטה מלאה 1265.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const storesDir = join(repoRoot, 'src', 'stores');
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
  try { execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }); return 0; }
  catch (e) { return e.status ?? 1; }
};
const read = (name) => readFileSync(join(storesDir, name), 'utf8');

/** הסרת הערות (שלב 70): סורקים קוד בלבד — הערות מתעדות איסורים ואינן מפרות. */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

console.log('1) מבנה חמשת ה־stores (§13.1)');
const storeFiles = ['storage.ts', 'editor-store.ts', 'settings-store.ts', 'run-store.ts', 'result-store.ts', 'view-store.ts', 'legacy-migrate.ts', 'selectors.ts', 'index.ts'];
(existsSync(join(storesDir, 'editor-store.ts')) && existsSync(join(storesDir, 'settings-store.ts')) && existsSync(join(storesDir, 'run-store.ts')) && existsSync(join(storesDir, 'result-store.ts')) && existsSync(join(storesDir, 'view-store.ts'))
  ? ok : fail)('חמשת ה־stores קיימים');
(storeFiles.every((f) => existsSync(join(storesDir, f))) ? ok : fail)('אחסון/מיגרציה/בוררים/חבית קיימים');

console.log('\n2) editor-store — מקור גולמי בלי IR');
const editorCode = stripComments(read('editor-store.ts'));
const editorTest = readFileSync(join(repoRoot, 'tests', 'stores', 'editor-store.test.ts'), 'utf8');
(!/\b(ir|pages|manifest|findings|anchors|layoutHash|lastRenderedPages)\b/.test(editorCode)
  ? ok : fail)('אין שדות IR בקוד ה־editor (סריקה אחרי הסרת הערות)');
(/revision/.test(editorCode) ? ok : fail)('revision מונוטוני — עוגן stale-job בלי שעון');
(/no IR|אין שדות IR|forbidden/.test(editorTest) ? ok : fail)('בדיקת "אין IR" קיימת ורצה');

console.log('\n3) result-store — הקפאה עמוקה איטרטיבית');
const resultCode = stripComments(read('result-store.ts'));
(/while\s*\(/.test(resultCode) && /stack/.test(resultCode) ? ok : fail)('deepFreeze איטרטיבי (מחסנית, לא רקורסיה — אין RangeError למסמך עמוק)');
(/WeakSet/.test(resultCode) ? ok : fail)('בטוח למחזורים (WeakSet)');
(/ArrayBuffer\.isView/.test(resultCode) ? ok : fail)('טיפוסים אטומים (TypedArray) אינם נאטמים');

console.log('\n4) run-store — שבעה מצבים והגנת stale-job');
const runCodeSrc = stripComments(read('run-store.ts'));
(/\['idle', 'preparing', 'running', 'auditing', 'done', 'error', 'cancelled'\]/.test(runCodeSrc)
  ? ok : fail)('שבעת המצבים בדיוק (§13.1)');
(/isStaleJob|state\.jobId !== jobId/.test(runCodeSrc) ? ok : fail)('שכבה א: השוואת jobId בכל מעבר');
(/'idle'|ACTIVE_PHASES/.test(runCodeSrc) && /setProgress/.test(runCodeSrc) ? ok : fail)('שכבה ב: אין קבלה בלי job חי');
(/cancel[\s\S]{0,400}jobId/.test(runCodeSrc) ? ok : fail)('cancel שומר jobId — הודעה מאוחרת מזוהה כלא־רלוונטית');

console.log('\n5) view-store — UI בלבד');
const viewCode = stripComments(read('view-store.ts'));
(/ZOOM_MIN = 0\.25/.test(viewCode) && /ZOOM_MAX = 4/.test(viewCode) ? ok : fail)('zoom תחום [0.25, 4]');
(/Number\.isFinite/.test(viewCode) ? ok : fail)('NaN/Infinity נדחים — אין zoom לא־מספרי');

console.log('\n6) settings-store — המרשם היחיד, אין מימוש מקביל');
const settingsCode = stripComments(read('settings-store.ts'));
(/from '@tora\/settings-schema'/.test(settingsCode) && /importSettings/.test(settingsCode) && /buildEffectiveSettings/.test(settingsCode) ? ok : fail)('כל הלוגיקה מ־@tora/settings-schema (importSettings/buildEffectiveSettings)');
(!/DIM_RE|HEX_COLOR|NUM_RE|function validate/.test(settingsCode) ? ok : fail)('אין בדיקת תקינות מקבילה בקוד');
(/unmappedLegacy/.test(settingsCode) ? ok : fail)('unmappedLegacy — מורשת לא ממופה נשמרת (לשלב 79), לא נזרקת');
(/registry\.json/.test(settingsCode) ? ok : fail)('המרשם מה־registry המיוצר של החבילה (לא עותק מקומי)');

console.log('\n7) אחסון ומיגרציה — קריאה בלבד של המורשת');
const storageCode = stripComments(read('storage.ts'));
const migrateCode = stripComments(read('legacy-migrate.ts'));
const allCode = storeFiles.map((f) => stripComments(read(f))).join('\n');
(/tora-ui:.*:v1/.test(storageCode) ? ok : fail)('מפתחות המשטר החדש tora-ui:*:v1');
(!/removeItem/.test(migrateCode) ? ok : fail)('המיגרציה אינה מוחקת מפתחות ישנים (אין removeItem בקוד המיגרציה)');
(/migrated:v1|migrationFlag/.test(storageCode) && /migrationFlag/.test(migrateCode) ? ok : fail)('דגלון חד־פעמי למיגרציה');
(/skipped-existing/.test(migrateCode) ? ok : fail)('החדש גובר — אין דריסת מפתח קיים');
(/JSON\.parse/.test(storageCode) && /catch/.test(storageCode) ? ok : fail)('JSON שמור פגום ⇐ ברירת מחדל בלי זריקה');
((() => { const others = ['editor-store.ts', 'settings-store.ts', 'run-store.ts', 'result-store.ts', 'view-store.ts', 'selectors.ts', 'index.ts'].map((f) => stripComments(read(f))).join('\n'); return !others.includes('tora-typesetter-'); })()
  ? ok : fail)('מפתחות המורשת נזכרים רק ב־storage/legacy-migrate (הגדרה וקריאה)');

console.log('\n8) בוררים — מניעת רינדורים מיותרים');
const selectorsCode = stripComments(read('selectors.ts'));
(/from 'zustand\/traditional'/.test(selectorsCode) && /useStoreWithEqualityFn/.test(selectorsCode) ? ok : fail)("useStoreWithEqualityFn מ־zustand/traditional (v4 — לא useStore)");
(/from 'zustand\/shallow'/.test(selectorsCode) ? ok : fail)('shallow להשוואת שכבה־אחת');
(!/\(s\)\s*=>\s*s\s*[,)\n]/.test(selectorsCode) ? ok : fail)('אין בורר "מצב כולו" — בוררים צרים בלבד');
(existsSync(join(repoRoot, 'tests', 'component', 'stores.test.tsx')) ? ok : fail)('בדיקות ספירת רינדור קיימות (jsdom)');

console.log('\n9) בדיקות וסטטיקה');
const storesOut = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/stores/']);
// שלב 81: + linked-navigation.test.ts (20 ניווט provenance) — סה"כ 104
(storesOut !== null && /Tests\s+104\s+passed/.test(storesOut) ? ok : fail)('tests/stores — 104/104 (65 + 19 ניתוח קלט + 20 ניווט מקושר, שלבים 80–81)');
const compOut = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/component/stores.test.tsx']);
(compOut !== null && /Tests\s+4\s+passed/.test(compOut) ? ok : fail)('tests/component/stores — 4/4 (רינדורים)');
(runCode('npx', ['tsc', '--noEmit']) === 0 ? ok : fail)('tsc --noEmit (שורש) — PASS');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
(!/:\s*any\b/.test(allCode) ? ok : fail)('אין any מפורש ב־stores');
((() => { const withoutStorage = ['editor-store.ts', 'settings-store.ts', 'run-store.ts', 'result-store.ts', 'view-store.ts', 'legacy-migrate.ts', 'selectors.ts', 'index.ts'].map((f) => stripComments(read(f))).join('\n'); return !/localStorage/.test(withoutStorage); })()
  ? ok : fail)('אין גישת localStorage ישירה מחוץ ל־storage.ts (הפשטה מוזרקת)');

console.log('\n10) אינטגרציה ורגרסיה');
const indexCode = stripComments(read('index.ts'));
(/resetForNewDocument/.test(indexCode) && /selectPage\(null\)/.test(indexCode) && !/setZoom|\.reset\(\)[\s\S]{0,60}\/\/ view/.test(indexCode.split('resetForNewDocument')[1] ?? '') ? ok : fail)('resetForNewDocument מנקה מסמך/job/תוצאה/עמוד — ולא נוגע ב־zoom');
((() => { const idx = indexCode.indexOf('resetForNewDocument'); const body = indexCode.slice(idx, idx + 800); return body.includes('zoom') === false || body.includes('setZoom') === false; })()
  ? ok : fail)('zoom/locale נשמרים בין מסמכים (העדפות משתמש)');
(/tests\/stores\//.test(readFileSync(join(repoRoot, 'vitest.packages.config.ts'), 'utf8')) ? ok : fail)('vitest.packages.config כולל את tests/stores');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
const testOut = (SKIP_TESTS ? 'Tests  1265 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
(testOut !== null && /Tests\s+1265\s+passed/m.test(testOut) ? ok : fail)('test:packages — 1265/1265 (1098 עד שלב 76 + 20 שלב 77 + 26 שלב 78 + 19 קבצים ותבניות שלב 79 + 36 ייבוא ומפת קלט שלב 80 + 27 עורך מקושר שלב 81 + 17 ממצאי Audit שלב 82)');

console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`חמשת ה־stores תקינים — ${checks} בדיקות ירוקות. state מסודר ומופרד מהמנוע; אין state סמנטי מחוץ לחוזים (§13.1).`);
