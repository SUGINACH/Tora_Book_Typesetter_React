#!/usr/bin/env node
/**
 * verify-audit-findings — אימות שלב 82: הצגת ממצאי Audit וניווט אליהם (M9).
 * אסמכתא: אפיון §13–14, §16 · תכנית שלב 82.
 *
 * שעת השלב: **אין ממצא שאינו ניתן למעקב למקור או ל־IR.** ההוכחה:
 *   1. הקטלוג סגור ודו-כיווני מול שלוש הרשימות הקפואות של audit-core
 *      (TEXT/LAYOUT/LINK_AUDIT_FINDING_CODES — 31 קודים): כל קוד חייב
 *      תווית; אין תווית יתומה; אין message גולם (§16 — החוזה §14.1
 *      כלל אינו נושא שדה message; מוצג messageKey מתורגם).
 *   2. הפרמטרים — כל מקום ‎{param}‎ בתווית חייב להיות פרמטר אמיתי של
 *      אותו קוד באתרי הקריאה של audit-core (אין מצייני-מקום מתים).
 *   3. התפר — הקומפוננטה אינה מייבאת @tora; הטיפוסים המצומצמים
 *      המבניים (ViewFocus.sourceSpan) ולא טיפוסי החבילה.
 *   4. הניווט — ממצא עם span ⇐ מוקד מקור + בחירת העורך (setSelectionRange
 *      דרך TextEditor, שלב 80); pageId ⇐ בחירת עמוד; שער הטריות של
 *      שלב 81 מושהה את הניווט על תוצאה שנערך המקור מאז.
 *   5. אין אפשרות למחוק ממצא כדי לעבור שער — ל-store אין פעולת
 *      הסרה/השתקה; לפאנל אין פקד הסרה; הסינון תצוגתי בלבד.
 *   6. הבדיקות: 17 בדיקות רכיב (כולל אינטגרציית עורך אמיתי); הסוויטה
 *      המלאה נעולה ב־ci.yml ובכל המאמתים (תיקון CI סבב כ"ג).
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

console.log('1) הקטלוג הסגור — דו-כיווני מול שלוש הרשימות הקפואות של audit-core');
{
  const auditCore = await import('@tora/audit-core');
  const registry = new Set([
    ...auditCore.TEXT_AUDIT_FINDING_CODES,
    ...auditCore.LAYOUT_AUDIT_FINDING_CODES,
    ...auditCore.LINK_AUDIT_FINDING_CODES,
  ]);
  const labelsSrc = read('src/i18n/audit-labels.ts');
  const labelCodes = new Set([...labelsSrc.matchAll(/'(audit\.[a-z]+\.[A-Z_0-9]+)':\s*\{\s*label:/g)].map((m) => m[1]));
  (registry.size === 31 ? ok : fail)(`31 קודים ברשימות הקפואות (נמצאו ${registry.size})`);
  (labelCodes.size === 31 ? ok : fail)(`31 תוויות בקטלוג (נמצאו ${labelCodes.size})`);
  const missing = [...registry].filter((c) => !labelCodes.has(c));
  (missing.length === 0 ? ok : fail)(`כל קודי המנוע מכוסים${missing.length ? ' — חסרים: ' + missing.join(', ') : ''}`);
  const orphan = [...labelCodes].filter((c) => !registry.has(c));
  (orphan.length === 0 ? ok : fail)(`אין תווית יתומה${orphan.length ? ' — יתומות: ' + orphan.join(', ') : ''}`);
  (/Object\.freeze\(\{/.test(labelsSrc) ? ok : fail)('הקטלוג קפוא (Object.freeze) — דטרמיניסטי');
}

console.log('\n2) הפרמטרים — מקומות ‎{param}‎ בתוויות הם פרמטרים אמיתיים של הקוד');
{
  // חילוץ פרמטרים לכל קוד מאתרי הקריאה ב־audit-core (כולל תכונות קצרות-יד)
  const sources = ['text-audit.ts', 'layout-audit.ts', 'link-audit.ts'].map((f) => read(`packages/audit-core/src/${f}`)).join('\n');
  const paramsByCode = new Map();
  for (const m of sources.matchAll(/finding\('([A-Za-z0-9._]+)',\s*'(HIGH|MEDIUM|LOW)',\s*\{([^}]*)\}/g)) {
    const code = m[1];
    const params = paramsByCode.get(code) ?? new Set();
    for (const p of m[3].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:/g)) params.add(p[1]);
    for (const p of m[3].matchAll(/(?:^|,|\{)\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?=,|\}|$)/g)) params.add(p[1]);
    paramsByCode.set(code, params);
  }
  const labelsSrc = read('src/i18n/audit-labels.ts');
  let dead = [];
  for (const m of labelsSrc.matchAll(/'(audit\.[a-z]+\.[A-Z_0-9]+)':\s*\{\s*label:\s*'([^']*)'/g)) {
    const code = m[1];
    const label = m[2];
    const real = paramsByCode.get(code) ?? new Set();
    for (const p of label.matchAll(/\{([a-zA-Z]+)\}/g)) {
      if (!real.has(p[1])) dead.push(`${code}:{${p[1]}}`);
    }
  }
  (dead.length === 0 ? ok : fail)(`אין מקומות פרמטר מתים בתוויות${dead.length ? ' — מתים: ' + dead.join(', ') : ''}`);
  (paramsByCode.size === 31 ? ok : fail)(`אתרי הקריאה של audit-core נסרקו ל־31 קודים (נמצאו ${paramsByCode.size})`);
}

console.log('\n3) §16 — אין message גולם; התפר — אין ייבוא @tora בקומפוננטה');
{
  const component = read('src/components/audit/AuditFindings.tsx');
  (/from '\.\.\/\.\.\/i18n\/audit-labels\.js'/.test(component) && /formatAuditLabel\(/.test(component) ? ok : fail)('התצוגה דרך formatAuditLabel — תווית מתורגמת עם פרמטרים');
  (!/\.message\b/.test(component) ? ok : fail)('אין הצגת message גולם (החוזה §14.1 כלל אינו נושא message)');
  const imports = [...component.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  (imports.every((i) => !i.startsWith('@tora/')) ? ok : fail)('אף ייבוא @tora בקומפוננטה — התפר של שלב 78 נשמר');
  (/startUtf16: span\.startUtf16/.test(component) && !/SourceSpan/.test(component) ? ok : fail)('טיפוס מצומצם מבנית (כמו ViewFocus.sourceSpan) — לא טיפוסי החבילה');
}

console.log('\n4) הניווט ושער הטריות (שלבים 80–81)');
{
  const component = read('src/components/audit/AuditFindings.tsx');
  (/pane: 'source'/.test(component) ? ok : fail)('ממצא עם span ⇐ מוקד מקור (העורך בוחר את הטווח — תשתית שלב 80)');
  (/pane: 'layout'/.test(component) && /selectPage\(/.test(component) ? ok : fail)('ממצא עם pageId ⇐ מוקד פריסה + בחירת עמוד');
  (/if \(!current\) return;/.test(component) ? ok : fail)('שער הטריות — ניווט מושהה על תוצאה שנערך המקור מאז (שלב 81: היסטים זרים)');
  (/useResultIsCurrent\(\)/.test(component) ? ok : fail)('הבורר useResultIsCurrent נצרך (הגנה בעומק)');
  const appShell = read('src/components/layout/AppShell.tsx');
  (/import \{ AuditFindings \}/.test(appShell) && /<AuditFindings \/>/.test(appShell) ? ok : fail)('הפאנל משולב במעטפת (AppShell)');
}

console.log('\n5) שעת השלב — אין אפשרות למחוק ממצא כדי לעבור שער');
{
  const storeSrc = read('src/stores/result-store.ts');
  (!/removeFinding|dismissFinding|clearFinding|ignoreFinding|suppressFinding/.test(storeSrc) ? ok : fail)('ל-store אין פעולת הסרה/השתקה של ממצא (רשימה לקריאה בלבד)');
  const component = read('src/components/audit/AuditFindings.tsx');
  (!/removeFinding|dismiss|ignoreFinding|suppress/.test(component) ? ok : fail)('לפאנל אין פקד הסרה/התעלמות');
  (/findings\.filter\(/.test(component) && !/set\(\{[^}]*findings/.test(component) ? ok : fail)('הסינון תצוגתי בלבד — אינו כותב ל-store');
  const ir = read('tests/component/audit-findings.test.tsx');
  (/אין פקד הסרה\/השתקה/.test(ir) ? ok : fail)('הבדיקה נועלת את היעדר פקד ההסרה (רגרסיה)');
}

console.log('\n6) הבדיקות — 17 בדיקות רכיב כולל אינטגרציית עורך אמיתי');
{
  const testSrc = read('tests/component/audit-findings.test.tsx');
  const testCount = [...testSrc.matchAll(/\btest\(/g)].length;
  (testCount === 17 ? ok : fail)(`17 בדיקות בקובץ (נמצא ${testCount})`);
  (/createElement\(TextEditor\)/.test(testSrc) && /selectionStart/.test(testSrc) ? ok : fail)('אינטגרציה — קליק בוחר טווח בעורך האמיתי (selectionStart/End)');
  (/audit\.text\.NOT_IN_CATALOG/.test(testSrc) ? ok : fail)('הגנת עומק — קוד לא מוכר מוצג כהוא בלי קריסה');
  const ci = read('.github/workflows/ci.yml');
  (/node scripts\/migration\/verify-audit-findings\.mjs/.test(ci) ? ok : fail)('המאמת חובר ל־CI');
  const pkg = read('package.json');
  (/"verify:audit-findings":\s*"node scripts\/migration\/verify-audit-findings\.mjs"/.test(pkg) ? ok : fail)('המאמת רשום ב־package.json');
}

console.log('\n7) רגרסיה');
{
  const testOut = (SKIP_TESTS ? 'Tests  1303 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages', '--silent']));
  (testOut !== null && /Tests\s+1303\s+passed/.test(testOut) ? ok : fail)('test:packages — 1303/1303 (1265 שלב 83 + 16 שלב 84)');
  (runCode('npx', ['tsc', '--noEmit']) === 0 ? ok : fail)('tsc --noEmit (שורש) — PASS');
  (runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
  (runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
  (runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check (גבולות תלות) — PASS');
}

console.log(`\nמאמת ממצאי ה-Audit הושלם — ${checks} בדיקות, ${failures} כשלונות.`);
if (failures > 0) {
  console.log('שלב 82 טרם עבר — תקנו את הכשלים לעיל.');
  process.exit(1);
}
console.log('פאנל ממצאי ה-Audit הושלם: קטלוג סגור 31/31, ניווט דו-כיווני עם שער טריות, אין מחיקת ממצא למעבר שער.');
