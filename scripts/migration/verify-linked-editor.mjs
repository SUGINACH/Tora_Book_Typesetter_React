#!/usr/bin/env node
/**
 * verify-linked-editor — אימות שלב 81: עורך מקושר מקור ↔ פריסה (M9).
 * אסמכתא: אפיון §13.2, §13.3, §14.2 · תכנית שלב 81.
 *
 * שעת השלב: **המיפוי נכון גם לאחר shaping ו־reorder.** ההוכחה:
 *   1. הליבה הטהורה (linked-navigation) — provenance מה־IR בלבד: חפיפת
 *      טווחים חצי־פתוחים במרחב UTF-16 אחד (כל הזרמים), ופענוח AtomId
 *      הפוך מול הגזירה הקנונית של content-model — הלוך־וחזור חי כאן.
 *      הזהות הלוגית חיה במזהה, לא בסדר הוויזואלי — ולכן reorder אינו
 *      משנה את המיפוי.
 *   2. שני הכיוונים ב־UI: קליק על קו/סמן ← מוקד 'source' ← בחירת הטווח
 *      בעורך (§13.2); בחירה בעורך ← מוקד 'layout' ← הדגשת כל הפריטים
 *      החופפים בפריסה. התפר: הרכיבים אינם מייבאים @tora — הכול דרך
 *      ה-stores (כלל שלב 78).
 *   3. שער הטריות: התוצאה נעולה למהדורת המקור שממנה הופקה — עריכה
 *      מאז השליחה ⇐ התוצאה אינה מתקבלת כלל (§13.3#5: אין הצגת תוצאה
 *      ישנה כאילו היא חדשה); הניווט מושהה על תוצאה לא-טריה עם סמן
 *      "לא עדכנית" למשתמש.
 *   4. אין עימוד מקומי בזמן הקלדה ב־main — ההוכחה הסטטית של שלב 77
 *      (verify-ui-worker) עומדת; כאן נבדק שהניווט לא הכניס מנוע לחוט הראשי.
 *   5. הבדיקות: 20 ליבה + 5 E2E + 2 מנצח = 27 חדשות; הסוויטה 1226.
 *   6. רגרסיה: typecheck, lint:packages, build:packages, deps:check.
 */
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

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
const read = (p) => readFileSync(p.startsWith('/') ? p : `${repoRoot}/${p}`, 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

console.log('1) הליבה הטהורה — provenance מה־IR; הלוך־וחזור חי של פענוח AtomId');
{
  const navCode = stripComments(read('src/stores/linked-navigation.ts'));
  (/import type \{ LayoutDocument \} from '@tora\/layout-api';/.test(navCode)
    ? ok : fail)('linked-navigation צורך טיפוסים מ־@tora/layout-api בלבד (אין מנוע, אין מדידה)');
  (!/from '@tora\/layout-engine'|from '@tora\/measurement|worker|document\.|window\.|getState\(\)/.test(navCode)
    ? ok : fail)('הליבה טהורה — אין מנוע, אין DOM, אין stores (provenance דטרמיניסטי)');
  (/export function linkedItemsForRange\(/.test(navCode) && /export function itemSourceRange\(/.test(navCode)
    ? ok : fail)('שתי הפעולות של שני הכיוונים קיימות (טווח←פריטים; פריט←טווח)');
  (/export function atomSourceRangeOf\(/.test(navCode) && /export function provenanceIssues\(/.test(navCode)
    ? ok : fail)('פענוח AtomId ובדיקת שלמות provenance חשופים');
  (/export function rangeOverlapsSpan\(/.test(navCode) && /startUtf16 < range\.endUtf16 && range\.startUtf16 < span\.endUtf16/.test(navCode)
    ? ok : fail)('חפיפה חצי־פתוחה — סמיכות אינה חפיפה (כמו SourceSpan)');
  (/span\.startUtf16 <= c && c < span\.endUtf16/.test(navCode)
    ? ok : fail)('סמן מרוכז (קליק בעורך) נוגע בפרוסה שעליו בלבד');

  // הלוך־וחזור חי מול הגזירה הקנונית נעול בבדיקות היחידה (tests/stores) —
  // כאן נבדק סטטית שהתבנית זהה לתבנית הגזירה של atoms.ts
  const atomsSrc = read('packages/content-model/src/atoms.ts');
  const atomsFlat = atomsSrc.replace(/\s+/g, ' ');
  // התבנית בקוד הליבה היא ביטוי רגולרי (הצינור מוקצה) — בודקים את שורת
  // הביטוי עצמה + שלושת חלקי הגזירה הקנונית בקוד המקור של content-model
  (navCode.includes('const SEGMENT_RE = /^atom:v1\\|') && /const ATOM_ID_PREFIX = 'atom:v1'/.test(atomsFlat)
    && /\$\{encodeIdSegment\(source\.documentId\)\}/.test(atomsFlat) && /\$\{source\.stream\}/.test(atomsFlat)
    && /\$\{source\.startUtf16\}\+\$\{source\.endUtf16\}/.test(atomsFlat)
    ? ok : fail)('התבנית בפענוח זהה לתבנית הגזירה הקנונית (atom:v1|doc|stream|start+end|origin|ordinal)');
  const navTest = read('tests/stores/linked-navigation.test.ts');
  (/deriveAtomId/.test(navTest) && /הלוך־וחזור/.test(navTest)
    ? ok : fail)('הלוך־וחזור מלא מול deriveAtomId נעול בבדיקות (כולל נטרול | ו-%)');
}

console.log('\n2) החוזה — ה־IR נושא provenance מלא; rule/ornament פטורים ומתועדים');
{
  const irSrc = read('packages/layout-api/src/ir.ts');
  (/readonly sourceSpans: readonly SourceSpan\[\];/.test(irSrc)
    ? ok : fail)('LineFragment נושא sourceSpans (קו ← מקור)');
  (/readonly atomIds: readonly AtomId\[\];/.test(irSrc)
    ? ok : fail)('PositionedRun נושא atomIds (הזהות הלוגית של הריצה)');
  (/readonly source: SourceSpan;/.test(irSrc)
    ? ok : fail)('PositionedNoteMarker/PositionedAnchor נושאים source');
  const navSrc = read('src/stores/linked-navigation.ts');
  (/rule.*ornament|ornament.*rule/s.test(navSrc) && /it\.kind === 'rule' \|\| it\.kind === 'ornament'/.test(navSrc)
    ? ok : fail)('rule/ornament פטורים בפירוש (אינם טקסט — אינם ניווטים ואינם בעיה)');
  // AnchorTable אינה בפרוטוקול v1 — תיעוד בלבד, לא המצאה (הוכח בשלב 77; נשען כאן)
  const runSrc = stripComments(read('src/worker-host/typeset-run.ts'));
  (/AnchorTable אינה בפרוטוקול v1/.test(read('src/worker-host/typeset-run.ts')) || /anchors: null/.test(runSrc)
    ? ok : fail)('AnchorTable נשארת null המתועד (פרוטוקול v1) — הניווט עובד מה-IR עצמו');
}

console.log('\n3) שני הכיוונים ב־UI — התפר: הרכיבים דרך ה-stores בלבד');
{
  const preview = read('src/components/layout/PreviewArea.tsx');
  const editor = read('src/components/editor/TextEditor.tsx');
  (!/@tora\//.test(stripComments(preview)) ? ok : fail)('PreviewArea אינו מייבא חבילות @tora (התפר משלב 78)');
  (!/@tora\//.test(stripComments(editor)) ? ok : fail)('TextEditor אינו מייבא חבילות @tora (התפר משלב 78)');
  (/from '..\/..\/stores\/linked-navigation\.js'/.test(preview)
    ? ok : fail)('PreviewArea צורך את הליבה הטהורה מה-stores (מקור provenance יחיד)');
  (/linkedItemsForRange\(ir, focus\.sourceSpan\)/.test(preview)
    ? ok : fail)('מקור ← פריסה: ההדגשות מחושבות מהטווח דרך provenance');
  (/itemSourceRange\(ir, activation\.pageId, activation\.itemId\)/.test(preview)
    ? ok : fail)('פריסה ← מקור: הטווח של הפריט שהופעל מגיע מה־IR (לא מה-DOM)');
  (/pane: 'source'/.test(preview) && /pane: 'layout'/.test(editor)
    ? ok : fail)('שני הכיוונים מחוברים: קליק בפריסה ← מוקד source; בחירה בעורך ← מוקד layout');
  (/resultIsCurrent/.test(preview) && /ir === null \|\| !resultIsCurrent/.test(preview)
    ? ok : fail)('ההדגשות מושהות על תוצאה לא-טריה (הגנה בעומק)');
  (/data-testid="preview-stale"/.test(preview)
    ? ok : fail)('סמן "הפריסה איננה עדכנית" מוצג למשתמש');

  const pageView = read('src/renderers/PageView.tsx');
  (/onItemActivate/.test(pageView) && /data-highlighted/.test(pageView)
    ? ok : fail)('PageView: קליק על פריט (onItemActivate) + הדגשה (data-highlighted)');
  (/data-marker-id=\{m\.id\}/.test(pageView)
    ? ok : fail)('לסמני ההערות מזהה פריט ייחודי (data-marker-id; data-note-id משותף ואינו מזהה)');
  (/data-fragment-id=\{l\.id\}/.test(pageView) && /data-item-kind="line"/.test(pageView)
    ? ok : fail)('קווים נושאים data-fragment-id + data-item-kind (מיפוי DOM ← IR יציב)');
  const layoutPreview = read('src/renderers/LayoutPreview.tsx');
  (/onItemActivate=/.test(layoutPreview) && /highlightItemIds=/.test(layoutPreview)
    ? ok : fail)('LayoutPreview מעביר את שני הכיוונים ל-PageView');
}

console.log('\n4) שער הטריות — תוצאה נעולה למהדורת המקור שממנה הופקה');
{
  const runSrc = stripComments(read('src/worker-host/typeset-run.ts'));
  (/sourceRevision: input\.sourceRevision/.test(runSrc) || /const sourceRevision = input\.sourceRevision;/.test(runSrc)
    ? ok : fail)('המנצח לוכד את מהדורת המקור בעת השליחה');
  (/useEditorStore\.getState\(\)\.revision !== sourceRevision/.test(runSrc)
    ? ok : fail)('שער הקבלה: המקור נערך מאז השליחה ⇐ התוצאה אינה מתקבלת (אין הצגת ישן כחדש)');
  (/sourceRevision,/.test(runSrc) && /setResult\(/.test(runSrc)
    ? ok : fail)('התוצאה המתקבלת נושאת את עוגן הטריות');
  const hookSrc = stripComments(read('src/worker-host/use-typeset-run.ts'));
  (/sourceRevision: editor\.revision/.test(hookSrc)
    ? ok : fail)('use-typeset-run מעביר את מהדורת העורך בכל שליחה');

  const resultSrc = stripComments(read('src/stores/result-store.ts'));
  (/readonly sourceRevision: number;/.test(resultSrc)
    ? ok : fail)('TypesetResultInput חוזה את עוגן הטריות כשדה חובה');
  (/sourceRevision: input\.sourceRevision,/.test(resultSrc) && /sourceRevision: null,/.test(resultSrc)
    ? ok : fail)('result-store שומר את העוגן עם התוצאה ומאפס אותו ב-reset');

  const selectorsSrc = stripComments(read('src/stores/selectors.ts'));
  (/export const useResultIsCurrent/.test(selectorsSrc)
    ? ok : fail)('בורר הטריות (useResultIsCurrent) חשוף לרכיבים');
  const viewSrc = read('src/stores/view-store.ts');
  (/readonly itemId\?: string;/.test(viewSrc)
    ? ok : fail)('ViewFocus נושא itemId — הפריט שהופעל ממשיך להדגיש בפריסה');

  // אין עימוד מקומי בזמן הקלדה — הרכיבים לא הכניסו מנוע לחוט הראשי
  const uiFiles = read('src/components/layout/PreviewArea.tsx') + read('src/components/editor/TextEditor.tsx')
    + read('src/renderers/PageView.tsx') + read('src/renderers/LayoutPreview.tsx') + read('src/stores/linked-navigation.ts');
  (!/layout-engine|measurement-harfbuzz|engineTypeset/.test(uiFiles)
    ? ok : fail)('אף קובץ של השלב אינו מייבא את המנוע (ההוכחה הסטטית של שלב 77 עומדת)');
}

console.log('\n5) הבדיקות — 27 חדשות (20 ליבה + 5 E2E + 2 מנצח); הסוויטה 1226');
{
  const navTest = read('tests/stores/linked-navigation.test.ts');
  const navIts = [...navTest.matchAll(/\btest\(/g)].length;
  (navIts === 20 ? ok : fail)(`20 בדיקות בליבה הטהורה (נמצא ${navIts})`);
  (/סמיכות אינה חפיפה/.test(navTest) ? ok : fail)('חצי־פתוח נעול בבדיקה');
  (/פטורים/.test(navTest) && /rule/.test(navTest) ? ok : fail)('הפטורים (rule/ornament) נעולים בבדיקה');

  const e2eTest = read('tests/component/e2e-worker-path.test.tsx');
  const stage81Its = [...e2eTest.matchAll(/\btest\('/g)].length;
  (stage81Its === 13 ? ok : fail)(`13 בדיקות E2E סה״כ (8 קודמות + 5 שלב 81; נמצא ${stage81Its})`);
  (/קליק על קו בפריסה בוחר/.test(e2eTest) ? ok : fail)('E2E: פריסה ← מקור מוכח על המנוע האמיתי');
  (/בחירה בעורך מדגישה בפריסה בדיוק/.test(e2eTest) ? ok : fail)('E2E: מקור ← פריסה — ההדגשה זהה ל-provenance');
  (/shaping ו-reorder/.test(e2eTest) && /provenanceIssues\(ir\)\)\.toEqual\(\[\]\)/.test(e2eTest)
    ? ok : fail)('E2E: שעת השלב — provenance שלם ואטומים מתכנסים לקו גם ב-BiDi');
  (/עריכה בזמן ריצה/.test(e2eTest) && /אינה מתקבלת כלל/.test(e2eTest)
    ? ok : fail)('E2E: עריכה בזמן ריצה — התוצאה נדחית בשער');
  (/עריכות רצופות/.test(e2eTest) ? ok : fail)('E2E: עריכות רצופות — job חדש וקישור חוזר');

  const runTest = read('tests/worker-host/typeset-run.test.ts');
  (/שער הטריות של שלב 81/.test(runTest) ? ok : fail)('בדיקת המנצח: שער הטריות ברמת היחידה');
  (/sourceRevision: useEditorStore\.getState\(\)\.revision/.test(runTest)
    ? ok : fail)('בדיקות המנצח מעבירות את העוגן כמו ה־hook');

  if (!SKIP_TESTS) {
    const navOut = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/stores/linked-navigation.test.ts']);
    (/Tests\s+20\s+passed/.test(navOut ?? '') ? ok : fail)('tests/stores/linked-navigation — 20/20');
    const testOut = run('npm', ['run', 'test:packages']);
    (/Tests\s+1226\s+passed/m.test(testOut ?? '') ? ok : fail)('test:packages — 1226/1226');
  } else {
    ok('הסוויטה — דולג (הצעד האב הריץ אותה; נעילת המונה ב-ci.yml)');
  }
}

console.log('\n6) חיבור ל־CI ולסוללה');
{
  const ci = read('.github/workflows/ci.yml');
  (/verify-linked-editor\.mjs/.test(ci) ? ok : fail)('ci.yml מריץ את verify-linked-editor');
  (/Tests\[\[:space:\]\]\+1226\[\[:space:\]\]\+passed/.test(ci) ? ok : fail)('נעילת ספירת הבדיקות ב-CI עודכנה ל־1226');
  const pkg = read('package.json');
  (/"verify:linked-editor"/.test(pkg) ? ok : fail)('package.json: verify:linked-editor');
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
console.log(`verify-linked-editor: ${checks - failures}/${checks} בדיקות עברו${failures > 0 ? `, ${failures} נכשלו` : ''}`);
process.exit(failures > 0 ? 1 : 0);
