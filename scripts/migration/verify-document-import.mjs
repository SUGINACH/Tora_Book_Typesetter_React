#!/usr/bin/env node
/**
 * verify-document-import — אימות שלב 80: ייבוא מסמכים ומפת שגיאות קלט (M9).
 * אסמכתא: אפיון §3.3, §13–14, §16 · תכנית שלב 80.
 *
 * שעת השלב: **כל קובץ תקף נטען; כל דחייה מוצגת במיקום הנכון.** ההוכחה:
 *   1. הפרסר הנעול הוא מקור היחיד לניתוח (content-model; אין מימוש מקביל
 *      במעטפת — כלל 8); מפת השגיאות נבנית מהדיאגנוסטיקה ומהשגיאות
 *      הנזרקות שלו, במיקום SourceSpan/שורה:עמודה.
 *   2. התוויות — קטלוג i18n סגור ודו-כיווני: כל קוד שהפרסר יכול להוציא
 *      (דיאגנוסטיקה + נזרקות) וכל קוד ייבוא חייבים תווית; אין תווית
 *      יתומה; אין הצגת message גולם (§16).
 *   3. הריצה נחסמת לפני שליחת job כשהפרסור נכשל — המשך חסימת שלב 79;
 *      פרסור יחיד (התוצאה מוזרקת למנצח; הקנוני 3.4MB ≈ 3 שניות).
 *   4. הקורפוס — כל קובצי ה-txt נפרסים בהצלחה (ריצה חיה כאן); הקנוני
 *      נטען עם 10 metadata, ‎>1000 הערות צד ו־1989 אזהרות מתועדות.
 *   5. ההדגשה במקור — לחיצה על בעיה בוחרת את הטווח בעורך
 *      (viewStore.focus.sourceSpan → setSelectionRange).
 *   6. הבדיקות: 19 ניתוח + 13 רכיב + 3 E2E + 1 הזרקה; הסוויטה 1226.
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

console.log('1) הפרסר הנעול — מקור היחיד לניתוח; אין מימוש מקביל');
{
  const analysisCode = read('src/stores/source-analysis.ts');
  const analysisNoComments = stripComments(analysisCode);
  (/import \{[^}]*parseSourceText[^}]*\} from '@tora\/content-model';/s.test(analysisCode)
    ? ok : fail)('source-analysis מייבא את parseSourceText מ־@tora/content-model (הפרסר הנעול של שלב 17)');
  (!/regex|RegExp\(|match\(|\.exec\(/.test(analysisNoComments.replace(/computeLineStarts[\s\S]{0,200}/, ''))
    ? ok : fail)('אין תחביר פרסור מקומי — מיפוי שורות בלבד (אין מימוש מקביל של הפרסר)');
  (/parseSourceText\(/.test(analysisNoComments) && (analysisNoComments.match(/parseSourceText\(/g) ?? []).length === 1
    ? ok : fail)('קריאת פרסור יחידה בניתוח (פרסור יחיד — הקנוני 3.4MB ≈ 3 שניות)');

  const hookCode = stripComments(read('src/worker-host/use-typeset-run.ts'));
  (/analyzeSource\(/.test(hookCode) ? ok : fail)('use-typeset-run מנתח את הקלט לפני השליחה');
  (hookCode.indexOf('analyzeSource(') < hookCode.indexOf('controller.run(')
    ? ok : fail)('הניתוח מקדים את controller.run — חסימה לפני שליחת job');
  (/if \(parsed === null\) return/.test(hookCode) ? ok : fail)('כשל פרסור ⇐ return לפני השליחה — שום job לא נשלח (המשך חסימת שלב 79)');
  (/parsed,/.test(hookCode) ? ok : fail)('תוצאת הפרסור מוזרקת למנצח (פרסור יחיד — לא פעמיים)');

  const requestCode = stripComments(read('src/worker-host/ui-request.ts'));
  (/readonly parsed\?: ParseResult;/.test(requestCode) ? ok : fail)('ui-request מקבל parsed אופציונלי (הזרקה מניתוח הקלט)');
  (/input\.parsed \?\? parseSourceText/.test(requestCode) ? ok : fail)('בלי הזרקה — הפרסור המקומי נשמר (אותה זהות)');
  (/sourceLength !== input\.source\.length/.test(requestCode) ? ok : fail)('אי-התאמת parsed/מקור נדחית בקול רם (חוזה, לא ניחוש)');

  const controllerCode = stripComments(read('src/worker-host/typeset-run.ts'));
  (/parsed: input\.parsed/.test(controllerCode) ? ok : fail)('המנצח מעביר את parsed לבקשה');
}

console.log('\n2) קטלוג התוויות — סגור ודו-כיווני מול הקודים שהפרסר יכול להוציא');
{
  const parseSrc = read('packages/content-model/src/parser/parse.ts');
  const parseNoComments = stripComments(parseSrc);
  // קודי דיאגנוסטיקה (מדווחים; כל ה-WARN_*) + קודים נזרקים — מהמקור, לא מרשימה כתובה-ביד.
  // הסוגריים נבנים בטרנרי — לכן כל ליטרל WARN_ מוכר כקוד דיאגנוסטיקה (H7 מכיל ספרה).
  const diagCodes = new Set([...parseNoComments.matchAll(/'(errors\.parser\.WARN[A-Z0-9_]+)'/g)].map((m) => m[1]));
  const thrownCodes = new Set([...parseNoComments.matchAll(/throw new ContentModelError\('(errors\.parser\.[A-Z0-9_]+)'/g)].map((m) => m[1]));
  (diagCodes.size === 10 ? ok : fail)(`10 קודי דיאגנוסטיקה בפרסר (נמצא ${diagCodes.size})`);
  (thrownCodes.size === 7 ? ok : fail)(`7 קודי שגיאה נזרקים בפרסר (נמצא ${thrownCodes.size})`);

  const labelsSrc = read('src/i18n/import-labels.ts');
  const labelsNoComments = stripComments(labelsSrc);
  const labelCodes = new Set([...labelsNoComments.matchAll(/'(errors\.(?:parser|import)\.[A-Z0-9_]+)':\s*\{/g)].map((m) => m[1]));
  const analysisSrc = read('src/stores/source-analysis.ts');
  const importCatalogCodes = new Set([...stripComments(analysisSrc).matchAll(/'(errors\.import\.[A-Z0-9_]+)':/g)].map((m) => m[1]));

  // (א) כל קוד שהפרסר מוציא — דיאגנוסטיקה ונזרק — חייב תווית
  const missingFromParser = [...diagCodes, ...thrownCodes].filter((c) => !labelCodes.has(c));
  (missingFromParser.length === 0 ? ok : fail)(`כל קודי הפרסר מכוסים בתוויות${missingFromParser.length ? ' — חסרים: ' + missingFromParser.join(', ') : ''}`);
  // (ב) כל קוד ייבוא מהקטלוג — חייב תווית
  const missingImport = [...importCatalogCodes].filter((c) => !labelCodes.has(c));
  (missingImport.length === 0 ? ok : fail)(`כל קודי קטלוג הייבוא מכוסים${missingImport.length ? ' — חסרים: ' + missingImport.join(', ') : ''}`);
  // (ג) אין תווית יתומה — מחוץ לקבוצה הסגורה
  const expected = new Set([...diagCodes, ...thrownCodes, ...importCatalogCodes]);
  const orphans = [...labelCodes].filter((c) => !expected.has(c));
  (orphans.length === 0 ? ok : fail)(`אין תווית יתומה מחוץ לקבוצה הסגורה${orphans.length ? ': ' + orphans.join(', ') : ''}`);
  // (ד) פרמטרי הקטלוג מופיעים בתווית (סימון {name})
  const labelEntries = [...labelsNoComments.matchAll(/'(errors\.import\.[A-Z0-9_]+)':\s*\{\s*label:\s*'([^']*)'/g)];
  const catalogParams = [...stripComments(analysisSrc).matchAll(/'(errors\.import\.[A-Z0-9_]+)':\s*\{\s*params:\s*\[([^\]]*)\]/g)]
    .map((m) => [m[1], [...m[2].matchAll(/'([a-zA-Z]+)'/g)].map((p) => p[1])]);
  let paramsOk = true;
  for (const [code, params] of catalogParams) {
    const entry = labelEntries.find((e) => e[1] === code);
    if (entry === undefined) continue;
    for (const p of params) {
      if (!entry[2].includes(`{${p}}`)) { paramsOk = false; fail(`התווית של ${code} אינה משתמשת בפרמטר {${p}}`); }
    }
  }
  if (paramsOk) ok('כל פרמטר קטלוג מופיע בתווית בסימון {name}');
  // (ה) הקטלוג קפוא
  (/Object\.freeze\(\{/.test(labelsNoComments) ? ok : fail)('קטלוג התוויות קפוא (Object.freeze)');
  (/formatIssueLabel/.test(labelsNoComments) ? ok : fail)('פונקציית הפורמט קיימת — החלפת {param} בערכים');

  // (ו) לכל דיאגנוסטיקה יש מיקום — מקטעים בין דחיפות (עמיד לתבניות-מחרוזת שמכילות ‎});‎)
  const pushPositions = [...parseNoComments.matchAll(/diagnostics\.push\(\{/g)].map((m) => m.index);
  const pushesWithoutSpan = [];
  for (let i = 0; i < pushPositions.length; i = i + 1) {
    const from = pushPositions[i];
    const to = i + 1 < pushPositions.length ? pushPositions[i + 1] : Math.min(from + 900, parseNoComments.length);
    const segment = parseNoComments.slice(from, to);
    if (segment.includes('errors.parser.WARN') && !segment.includes('start:')) pushesWithoutSpan.push(from);
  }
  (pushesWithoutSpan.length === 0 ? ok : fail)(`כל דיאגנוסטיקת אזהרה נושאת מיקום start${pushesWithoutSpan.length ? ` — חסר ב-${pushesWithoutSpan.length} דחיפות` : ''}`);
}

console.log('\n3) הרכיבים — התפר המוסכם: אין @tora בקומפוננטות; הכול דרך ה-stores');
{
  const insights = read('src/components/editor/ImportInsights.tsx');
  const editor = read('src/components/editor/TextEditor.tsx');
  const buttons = read('src/components/editor/ImportButtons.tsx');
  for (const [name, src] of [['ImportInsights', insights], ['TextEditor', editor], ['ImportButtons', buttons]]) {
    (!/@tora\//.test(stripComments(src)) ? ok : fail)(`${name} אינו מייבא חבילות @tora (התפר משלב 78)`);
  }
  (/formatIssueLabel/.test(insights) ? ok : fail)('ImportInsights מציג תוויות מתורגמות (לא message גולם — §16)');
  (/data-testid=\{`insight-issue-/.test(insights) && /data-testid="insights-parse-error"/.test(insights) ? ok : fail)('מפת השגיאות מרונדרת עם מזהי בדיקה יציבים');
  (/data-testid="insights-overview"/.test(insights) && /data-testid="insights-notes"/.test(insights) ? ok : fail)('סקירת המסמך (metadata + זרמי הערות) מוצגת');
  (/insights-stale/.test(insights) ? ok : fail)('סמן "איננה עדכנית" מוצג לאחר עריכה (עוגן analyzedRevision)');

  const viewCode = read('src/stores/view-store.ts');
  (/sourceSpan\?:/.test(viewCode) ? ok : fail)('ViewFocus נושא sourceSpan (טווח UTF-16 — UI בלבד)');
  (/setSelectionRange/.test(editor) && /focus\.pane !== 'source'/.test(editor)
    ? ok : fail)('TextEditor בוחר את הטווח בעורך לפי המוקד — ההדגשה במקור');
  (/setFocus\(\{\s*pane: 'source'/.test(insights.replace(/pane: 'source',/m, 'pane: \'source\',')) || /pane: 'source'/.test(insights)
    ? ok : fail)('לחיצה על בעיה קובעת מוקד מקור ב-viewStore');

  // אין תיקון שקט בייבוא: שום console.warn שבולע כישלון
  (!/console\.warn|console\.error/.test(stripComments(buttons)) ? ok : fail)('ImportButtons אינו בולע כישלונות ב-console (אין תיקון שקט)');
  (/reportImportFailure\(/.test(stripComments(buttons)) ? ok : fail)('כל כישלון מתאם מדווח בקוד קטלוגי (reportImportFailure)');
  (/importDocumentText\(/.test(stripComments(buttons)) ? ok : fail)('קבלת המסמך דרך פעולת הייבוא היחידה (import-document)');

  const importDoc = stripComments(read('src/stores/import-document.ts'));
  (/peekUiRuntime\(\)/.test(importDoc) && /controller\.cancel\(\)/.test(importDoc)
    ? ok : fail)('ייבוא מסמך חדש מבטל ריצה פעילה — אין job יתום בעובד');
  (/resetForNewDocument\(\)/.test(importDoc) ? ok : fail)('ניקוי בין מסמכים לפני הכתיבה (שלב 76/77)');
  (/setImportAnalysis\(/.test(importDoc) ? ok : fail)('הניתוח מפורסם ב-editor store בסוף הייבוא');
}

console.log('\n4) editor-store — חוזה ההשמירה והניתוח (נגזרת, לא מסמך)');
{
  const storeSrc = stripComments(read('src/stores/editor-store.ts'));
  (/analysis: SourceAnalysis \| null/.test(storeSrc) ? ok : fail)('שדה analysis במרחב המסמך (אינו IR — §13.1)');
  const persistBody = storeSrc.match(/const persist[\s\S]{0,220}?\};/);
  (persistBody !== null && !/analysis|importIssue/.test(persistBody[0])
    ? ok : fail)('ההשמירה נותרת rawText+documentName בלבד — הניתוח אינו נכתב לדיסק');
  (/analysis: null,/.test(storeSrc) && /importIssue: null,/.test(storeSrc) ? ok : fail)('reset מנקה ניתוח וכישלון ייבוא בין מסמכים');
  (/Object\.freeze\(analysis\)/.test(storeSrc) ? ok : fail)('הניתוח קפוא בפרסום');
  const testSrc = read('tests/stores/editor-store.test.ts');
  (/'analysis', 'dirty', 'documentName', 'importIssue'/.test(testSrc) ? ok : fail)('בדיקת החוזה של שלב 76 נעולה גם על שדות שלב 80');
}

console.log('\n5) הקורפוס — כל קובץ תקף נטען (ריצה חיה); הקנוני במספריו הנעולים');
{
  const corpusRoot = join(repoRoot, 'packages/test-fixtures/corpus');
  const allTxt = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.txt')) allTxt.push(p);
    }
  };
  walk(corpusRoot);
  (allTxt.length === 72 ? ok : fail)(`72 קובצי txt בקורפוס (נמצא ${allTxt.length})`);

  const runner = `
    const { parseSourceText } = require('${join(repoRoot, 'packages/content-model/dist/index.js')}');
    const fs = require('node:fs');
    const path = require('node:path');
    const corpusRoot = ${JSON.stringify(corpusRoot)};
    const allTxt = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p); else if (e.name.endsWith('.txt')) allTxt.push(p);
      }
    };
    walk(corpusRoot);
    let threw = 0; let totalDiag = 0; const threwFiles = [];
    for (const p of allTxt) {
      const src = fs.readFileSync(p, 'utf8');
      try { const r = parseSourceText(src, { documentId: 'verify' }); totalDiag += r.diagnostics.length; }
      catch (e) { threw += 1; threwFiles.push(p + ' :: ' + (e.catalogKey ?? e.message)); }
    }
    const canon = parseSourceText(fs.readFileSync(path.join(corpusRoot, 'canonical/very_long_test_text.txt'), 'utf8'), { documentId: 'canon' });
    const release = parseSourceText(fs.readFileSync(path.join(corpusRoot, 'release/release-reference-document.txt'), 'utf8'), { documentId: 'release' });
    const out = {
      total: allTxt.length, threw, threwFiles: threwFiles.slice(0, 3),
      totalDiag,
      canonMeta: canon.doc.metadata.length,
      canonSidenotes: canon.doc.notes.sidenotes.length,
      canonDiag: canon.diagnostics.length,
      releaseFn: release.doc.notes.footnotes.length,
      releaseSn: release.doc.notes.sidenotes.length,
    };
    console.log(JSON.stringify(out));
  `;
  const out = run(process.execPath, ['-e', runner]);
  let parsed = null;
  try { parsed = JSON.parse((out ?? '').trim().split('\n').pop() ?? ''); } catch { parsed = null; }
  if (parsed !== null) {
    (parsed.total === 72 ? ok : fail)(`הקורפוס נסרק במלואו (${parsed.total} קבצים)`);
    (parsed.threw === 0 ? ok : fail)(`אף קובץ קורפוס אינו נדחה בפרסור${parsed.threw ? ' — ' + parsed.threwFiles.join(' | ') : ''}`);
    (parsed.totalDiag > 9000 ? ok : fail)(`הדיאגנוסטיקה של הקורפוס מוצגת במלואה (${parsed.totalDiag} בעיות — כולן מגיעות למפה)`);
    (parsed.canonMeta === 10 && parsed.canonSidenotes === 2046 && parsed.canonDiag === 1989
      ? ok : fail)(`הקנוני נטען במספריו הנעולים: 10 metadata, ${parsed.canonSidenotes} הערות צד, ${parsed.canonDiag} אזהרות`);
    (parsed.releaseFn === 16 && parsed.releaseSn === 3
      ? ok : fail)(`מסמך הייחוס של ה-release: ${parsed.releaseFn} הערות שוליים, ${parsed.releaseSn} הערות צד`);
  } else {
    fail('סריקת הקורפוס החיה נכשלה בפענוח הפלט');
  }
}

console.log('\n6) הבדיקות — 19 ניתוח + 13 רכיב + 3 E2E + 1 הזרקת parsed; הסוויטה 1226');
{
  const analysisTest = read('tests/stores/source-analysis.test.ts');
  const analysisIts = [...analysisTest.matchAll(/\btest\(/g)].length;
  (analysisIts === 19 ? ok : fail)(`19 בדיקות בקובץ הניתוח (נמצא ${analysisIts})`);
  (/אף קובץ קורפוס אינו נזרק/.test(analysisTest) ? ok : fail)('שעת הקורפוס נעולה בבדיקת הניתוח');
  (/SENTINEL_IN_INPUT/.test(analysisTest) && /line\)\.toBe\(4\)/.test(analysisTest) ? ok : fail)('קלט פגום ממוקד בבדיקה (sentinel — שורה:עמודה)');

  const insightsTest = read('tests/component/import-insights.test.tsx');
  const insightsIts = [...insightsTest.matchAll(/\btest\(/g)].length;
  (insightsIts === 13 ? ok : fail)(`13 בדיקות בקובץ הרכיב (נמצא ${insightsIts})`);
  (/setSelectionRange|selectionStart/.test(insightsTest) ? ok : fail)('הדגשה בעורך נבדקת (בחירת הטווח)');
  (/איננה עדכנית|insights-stale/.test(insightsTest) ? ok : fail)("טריות המפה נבדקת");

  const e2eTest = read('tests/component/e2e-worker-path.test.tsx');
  (/קלט פגום \(sentinel\)/.test(e2eTest) && /channel\.posted\)\.toBe\(0\)/.test(e2eTest)
    ? ok : fail)('E2E: קלט פגום חוסם לפני השליחה — מוכח ששום הודעה לא נשלחה');
  (/ייבוא בזמן ריצה/.test(e2eTest) ? ok : fail)('E2E: ייבוא בזמן ריצה מבטל את ה-job');
  (/release-reference-document/.test(e2eTest) ? ok : fail)('E2E: המסמך הקנוני דרך האפליקציה המלאה');
  const e2eIts = [...e2eTest.matchAll(/\btest\(/g)].length;
  (e2eIts === 13 ? ok : fail)(`13 בדיקות E2E (5 שלב 79 + 3 שלב 80 + 5 שלב 81; נמצא ${e2eIts})`);

  const requestTest = read('tests/worker-host/ui-request.test.ts');
  (/הזרקת parsed/.test(requestTest) ? ok : fail)('בדיקת הזרקת parsed — זהות בקשה ו-inputHash');
  if (!SKIP_TESTS) {
    const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/stores/source-analysis.test.ts']);
    (/Tests\s+19\s+passed/.test(out ?? '') ? ok : fail)('tests/stores/source-analysis — 19/19');
    const compOut = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/component/import-insights.test.tsx']);
    (/Tests\s+13\s+passed/.test(compOut ?? '') ? ok : fail)('tests/component/import-insights — 13/13');
    const testOut = run('npm', ['run', 'test:packages']);
    (/Tests\s+1226\s+passed/m.test(testOut ?? '') ? ok : fail)('test:packages — 1226/1226');
  } else {
    ok('בדיקות הניתוח/הרכיב והסוויטה — דולג (הצעד האב הריץ את הסוויטה)');
  }
}

console.log('\n7) חיבור ל־CI ולסוללה');
{
  const ci = read('.github/workflows/ci.yml');
  (/verify-document-import\.mjs/.test(ci) ? ok : fail)('ci.yml מריץ את verify-document-import');
  const pkg = read('package.json');
  (/"verify:document-import"/.test(pkg) ? ok : fail)('package.json: verify:document-import');
  (/"verify:presets-migrations"/.test(pkg) ? ok : fail)('package.json: verify:presets-migrations (תוקן החסר משלב 79)');
  const conventions = read('scripts/migration/verify-work-conventions.mjs');
  (/import-labels/.test(conventions) && /ImportInsights/.test(conventions)
    ? ok : fail)('הרשימה הסגורה NEW_ALLOWED כוללת את שני הקבצים החדשים של השלב');
}

console.log('\n8) רגרסיה — typecheck/lint/build/deps');
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
console.log(`verify-document-import: ${checks - failures}/${checks} בדיקות עברו${failures > 0 ? `, ${failures} נכשלו` : ''}`);
process.exit(failures > 0 ? 1 : 0);
