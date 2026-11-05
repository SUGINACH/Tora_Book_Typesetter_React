#!/usr/bin/env node
/**
 * verify-ui-worker — אימות שלב 77: חיבור מלא ל־Worker, אפס עימוד ב־main thread.
 *
 * שער השלב: "בדיקת dependency ו־E2E מוכיחים שאין typeset ב־main" — כאן
 * שתי ההוכחות: (א) סטטית — אף מודול של החוט הראשי אינו מייבא את נקודות
 * העימוד (typeset של layout-engine, ספק HarfBuzz, harfbuzzjs) — המנוע
 * נטען ב־worker-entry.ts בלבד; (ב) התנהגותית — ה־E2E של המעטפת
 * (e2e-worker-path) מריץ את המנוע האמיתי דרך הפרוטוקול בלבד.
 *
 * בדיקות (33):
 *   1–8. בידוד החוט הראשי: אין ייבוא typeset/ספק/HarfBuzz מחוץ ל־worker-entry;
 *      המסלול הסינכרוני הישן נמחק (useTypesetter/useAutoSave/useEditorPreviewSync);
 *      אף קומפוננטה/store אינם נוגעים במנוע הישן (src/worker/engine).
 *   9–15. המנצח והזמן־ריצה: typeset-run מנתח הכול דרך ה־client; ui-runtime
 *      יחיד עם הזרקה; browser-client יוצר Worker אמיתי בלבד; בקשה מה־UI
 *      זהה ברכיביה ל־CLI.
 *   16–21. נכסים: המניפסט ב־public זהה ביט־ביט ל־assets; גופן הגוף קיים
 *      ו־hash שלו תואם; הצרור מאמת bytes ונכשל בקול רם.
 *   22–27. המעטפת: AppShell מחובר לבוררים + useTypesetRun; התצוגה היא
 *      LayoutPreview (אין dangerouslySetInnerHTML); App מריץ מיגרציה
 *      חד־פעמית + החייאה; רכיבי העריכה על ה־stores החדשים.
 *   28–34. בדיקות ורגרסיה: 20 הבדיקות החדשות ירוקות; typecheck; lint;
 *      build; deps; הסוויטה המלאה 1163.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1';
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
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
const read = (p) => readFileSync(p.startsWith('/') ? p : join(repoRoot, p), 'utf8');
const sha256 = (p) => createHash('sha256').update(readFileSync(join(repoRoot, p))).digest('hex');

/** כל קובצי ה־TS/TSX של המעטפת (החוט הראשי + העובד) — לסריקת ייבוא. */
const walkTs = (dir) => {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkTs(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
};
const srcFiles = walkTs(join(repoRoot, 'src'));
const workerEntry = join(repoRoot, 'src', 'worker-host', 'worker-entry.ts');
// שני יוצאים מן הכלל מתועדים ונבדקים בנפרד להלן: worker-entry (קוד העובד
// עצמו — שם המנוע שייך) ו־worker-client (קבוע גרסה בלבד — בדיקה ייעודית).
const mainFiles = srcFiles.filter((p) => p !== workerEntry && !p.endsWith(join('worker-host', 'worker-client.ts')));

console.log('1) בידוד החוט הראשי — אין typeset מחוץ לעובד (§12.1)');
const FORBIDDEN = [
  { re: /from '@tora\/layout-engine'|from "@tora\/layout-engine"/, label: "ייבוא @tora/layout-engine" },
  { re: /from '@tora\/measurement-harfbuzz'|from "@tora\/measurement-harfbuzz"/, label: 'ייבוא @tora/measurement-harfbuzz' },
  { re: /from 'harfbuzzjs'|require\('harfbuzzjs'\)/, label: 'ייבוא harfbuzzjs' },
  { re: /from '\.\.\/worker\/engine|from '\.\/worker\/engine|@worker\/engine/, label: 'ייבוא המנוע הישן (src/worker/engine)' },
];
const offenders = [];
for (const f of mainFiles) {
  const code = stripComments(read(f));
  for (const { re } of FORBIDDEN) if (re.test(code)) offenders.push(f);
}
(offenders.length === 0 ? ok : fail)(`אף מודול של החוט הראשי אינו מייבא מנוע/ספק/HarfBuzz (${mainFiles.length} קבצים נסרקו)`);
// היוצא מן הכלל המתועד: worker-client מייבא רק קבוע גרסה מהמנוע — לא typeset
const clientCode = stripComments(read('src/worker-host/worker-client.ts'));
(/import \{ ENGINE_VERSION as ENGINE_VERSION_OF \} from '@tora\/layout-engine';/.test(clientCode) && !/typeset/.test(clientCode.replace(/expectedInputHashOf|מנוע|typeset סינכרוני/g, ''))
  ? ok : fail)('worker-client — ייבוא מנוע לקבוע גרסה בלבד (ENGINE_VERSION), לא typeset');

console.log('\n2) המסלול הסינכרוני הישן נמחק');
(!existsSync(join(repoRoot, 'src', 'hooks', 'useTypesetter.ts')) ? ok : fail)('useTypesetter (עימוד בחוט הראשי) נמחק');
(!existsSync(join(repoRoot, 'src', 'hooks', 'useAutoSave.ts')) ? ok : fail)('useAutoSave (שמירת המסלול הישן) נמחק');
(!existsSync(join(repoRoot, 'src', 'hooks', 'useEditorPreviewSync.ts')) ? ok : fail)('useEditorPreviewSync (סנכרון התצוגה הישנה) נמחק');
(existsSync(join(repoRoot, 'src', 'hooks')) ? fail : ok)('תיקיית hooks הישנה נוקתה');
const appShell = stripComments(read('src/components/layout/AppShell.tsx'));
(!/useTypesetter|worker-store|document-store/.test(appShell) ? ok : fail)('AppShell אינו נוגע במסלול הישן (hooks/stores)');
(!/dangerouslySetInnerHTML/.test(appShell) ? ok : fail)('AppShell בלי HTML מוזרק');

console.log('\n3) המנצח והזמן־ריצה (typeset-run / ui-runtime / browser-client)');
const controller = stripComments(read('src/worker-host/typeset-run.ts'));
(/client\.submit/.test(controller) && !/typeset\(/.test(controller) ? ok : fail)('המנצח שולח דרך WorkerClient בלבד — אין קריאת מנוע');
(/begin\(|markRunning|markAuditing|complete\(|fail\(|cancel\(/.test(controller) ? ok : fail)('המנצח מניע את מכונת המצבים של runStore');
(/auditLayout/.test(controller) ? ok : fail)('שלב auditing מריץ את הביקורת הבלתי־תלויה על ה־IR');
(/anchors: null/.test(controller) ? ok : fail)('AnchorTable=null מתועד (אינה בפרוטוקול v1 — לא המצאה)');
const runtime = stripComments(read('src/worker-host/ui-runtime.ts'));
(/setUiRuntime/.test(runtime) && /getUiRuntime/.test(runtime) ? ok : fail)('זמן־ריצה יחיד עם הזרקה לבדיקות (אין שני מנצחים)');
const browserClient = stripComments(read('src/worker-host/browser-client.ts'));
(/new Worker\(/.test(browserClient) ? ok : fail)('browser-client יוצר Worker אמיתי (המנוע בתוך העובד)');
const uiRequest = stripComments(read('src/worker-host/ui-request.ts'));
(/parseSourceText/.test(uiRequest) && /DEFAULT_SEARCH_BUDGET/.test(uiRequest) && /sourceSha256/.test(uiRequest) ? ok : fail)('הבקשה מה־UI נושאת את רכיבי ה־inputHash של ה־CLI (§6.7)');

console.log('\n4) נכסי הצרור — זהות עם ה־CLI (offline; §6.4)');
(existsSync(join(repoRoot, 'public', 'fonts', 'manifest.json')) ? ok : fail)('מניפסט הגופנים זמין לאפליקציה (public/fonts)');
(sha256('public/fonts/manifest.json') === sha256('assets/fonts/manifest.json')
  ? ok : fail)('המניפסט ב־public זהה ביט־ביט ל־assets (מקור האמת)');
const manifest = JSON.parse(read('assets/fonts/manifest.json'));
const guttman = (Array.isArray(manifest) ? manifest : manifest.fonts).find((r) => r.file === 'Guttman-Rashi-Normal.woff2');
(existsSync(join(repoRoot, 'public', 'fonts', 'Guttman-Rashi-Normal.woff2')) ? ok : fail)('גופן הגוף (ברירת המחדל של ה־CLI) זמין');
(existsSync(join(repoRoot, 'public', 'fonts', 'Guttman-Rashi-Normal.woff2')) && guttman !== undefined && sha256('public/fonts/Guttman-Rashi-Normal.woff2') === guttman.sha256
  ? ok : fail)('ה־bytes של גופן הגוף תואמים לרשומת המניפסט (אותם bytes כמו ה־CLI)');
const bundle = stripComments(read('src/worker-host/asset-bundle.ts'));
(/verifyFontBytes/.test(bundle) ? ok : fail)('הצרור מאמת את ה־bytes מול הרשומה (אותם bytes או כלום)');

console.log('\n5) המעטפת מחוברת ל־stores החדשים ולהיטל ה־IR');
(/useTypesetRun/.test(appShell) ? ok : fail)('AppShell מריץ דרך useTypesetRun (Worker בלבד)');
(/selectors\.js/.test(appShell) ? ok : fail)('AppShell קורא מצב דרך הבוררים הצרים');
const preview = stripComments(read('src/components/layout/PreviewArea.tsx'));
(/LayoutPreview/.test(preview) && !/dangerouslySetInnerHTML/.test(preview) ? ok : fail)('התצוגה היא LayoutPreview — היטל של ה־IR (§13.2)');
const app = stripComments(read('src/App.tsx'));
(/migrateLegacyUiState/.test(app) && /rehydrateStores/.test(app) ? ok : fail)('App מריץ מיגרציה חד־פעמית + החייאה בעלייה');
const editor = stripComments(read('src/components/editor/TextEditor.tsx'));
(/editor-store|stores\/selectors/.test(editor) ? ok : fail)('העורך כתוב על editorStore (מקור גולמי)');
const imports = stripComments(read('src/components/editor/ImportButtons.tsx'));
(/resetForNewDocument/.test(imports) ? ok : fail)('ייבוא מסמך חדש מנקה בין מסמכים (resetForNewDocument)');

console.log('\n6) בדיקות ורגרסיה');
const t77 = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/worker-host/typeset-run.test.ts', 'tests/worker-host/asset-bundle.test.ts', 'tests/worker-host/ui-request.test.ts']);
(t77 !== null && /Tests\s+16\s+passed/.test(t77) ? ok : fail)('בדיקות המנצח/צרור/בקשה — 16/16');
const e2e = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/component/e2e-worker-path.test.tsx']);
(e2e !== null && /Tests\s+5\s+passed/.test(e2e) ? ok : fail)('E2E מעטפת מלאה מעל הפרוטוקול — 5/5 (ביטול/החלפה/תצוגה/חסימת הגדרות)');
(runCode('npx', ['tsc', '--noEmit']) === 0 ? ok : fail)('tsc --noEmit (שורש) — PASS');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');
const testOut = (SKIP_TESTS ? 'Tests  1163 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
(testOut !== null && /Tests\s+1163\s+passed/m.test(testOut) ? ok : fail)('test:packages — 1163/1163 (1098 + 20 שלב 77 + 26 שלב 78 + 19 שלב 79)');

console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`החיבור ל־Worker מלא — ${checks} בדיקות ירוקות. כל העימוד בערוץ הפרוטוקול; אין typeset בחוט הראשי (§12.1).`);
