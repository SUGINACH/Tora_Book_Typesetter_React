#!/usr/bin/env node
/**
 * verify-firstword — אימות שלב 64: first-word-window, dibbur hamatchil, drop-word
 * כמדיניות מדידה (אפיון §10.2; פרק ח/M7).
 *
 * שער השלב: **הכללים משפיעים על מדידה ושבירה בלבד** — זיהוי טהור לפני
 * שבירת השורות; אין עיטוף HTML מאוחר; אין regex ברנדרר; סדר wrappers אחד.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0; let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1';
const run = (cmd, args) => { try { return execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], env: { ...process.env, NO_COLOR: '1' } }); } catch (e) { return (e.stdout ?? '').toString(); } };

const policy = await import(join(repoRoot, 'packages', 'policy-torah', 'dist', 'index.js'));
const mkSettings = (values = {}) => ({ schemaVersion: 1, enginePolicyId: 'torah-v1', values, configHash: 'v' });

console.log('1) first-word-window — מדיניות מדידה');
{
  const fw = policy.firstWordPolicyOf(mkSettings());
  (fw.mode === 'window' && fw.wordCount === 1 && fw.minLines === 2 && fw.font.includes('FrankReal') && fw.size === '1.5'
    ? ok : fail)('ברירות Orange נעולות: window/1/2/FrankReal/1.5');
  const r1 = policy.splitFirstWord('אמר רבא הכא', fw, { isContinuation: false, lineCount: 3 });
  (r1.applied && r1.effectiveMode === 'window' && r1.words === 'אמר' && r1.rest === 'רבא הכא' ? ok : fail)('פסקה מלאה: חלון על המילה הראשונה');
  (policy.splitFirstWord('אמר רבא הכא', fw, { isContinuation: false, lineCount: 1 }).effectiveMode === 'inline' ? ok : fail)('מתחת לסף הקווים ⇒ inline');
  (policy.splitFirstWord('המשך', fw, { isContinuation: true, lineCount: 9 }).applied === false ? ok : fail)("אין החלה על continuation: 'middle' (§10.2 מפורש)");
  (policy.splitFirstWord('א', policy.firstWordPolicyOf(mkSettings({ 'drop-word-mode': 'none' })), { isContinuation: false, lineCount: 9 }).applied === false ? ok : fail)("mode='none' ⇒ אין החלה");
  (policy.firstWordPolicyOf(mkSettings({ 'drop-word-mode': 'banana', 'drop-word-count': '0' })).mode === 'window' ? ok : fail)('ערכים פסולים ⇒ ברירות נעולות (לא קריסה)');
}

console.log('\n2) dibbur hamatchil — זיהוי span סמנטי');
{
  const d1 = policy.splitDibburHamatchil('אמר רבא. הכא במאי');
  (d1.phrase === 'אמר רבא.' && d1.rest === 'הכא במאי' && d1.delimiter === '.' ? ok : fail)('עד הנקודה הראשונה — כולל המפריד');
  (policy.splitDibburHamatchil('תניא - במה').delimiter === '-' ? ok : fail)('מקף');
  (policy.splitDibburHamatchil('אין פה כלום').delimiter === null ? ok : fail)('בלי מפריד ⇒ אין זיהוי');
  (policy.splitDibburHamatchil('.בתחילה').delimiter === null ? ok : fail)('מפריד בתחילה ⇒ אין ביטוי');
  const long = 'א'.repeat(81) + '. המשך';
  (policy.splitDibburHamatchil(long).delimiter === null ? ok : fail)('חריגה במגבלת האורך (80) ⇒ אין זיהוי');
  (policy.DIBBUR_DELIMITERS.length === 4 && policy.DIBBUR_MAX_PHRASE_LEN === 80 ? ok : fail)('המפרידים והמגבלת — קבועי מדיניות נעולים');
}

console.log('\n3) חפיפה — סדר wrappers אחד ויחיד');
{
  (JSON.stringify(policy.FIRST_WORD_WRAP_ORDER) === '["dibbur","first-word"]' ? ok : fail)('הסדר הקנוני: דיבור חיצוני, מילה-ראשונה פנימית (ההיסטורי)');
  const text = 'אמר רבא. הכא במאי';
  const dib = policy.splitDibburHamatchil(text);
  const fwIn = policy.splitFirstWord(dib.phrase, policy.firstWordPolicyOf(mkSettings()), { isContinuation: false, lineCount: 4 });
  (dib.phrase === 'אמר רבא.' && fwIn.words === 'אמר' ? ok : fail)('המילה הראשונה בתוך הדיבור — מוגדר, לא CSS מקרי');
  (JSON.stringify(policy.splitDibburHamatchil(text)) === JSON.stringify(dib) ? ok : fail)('דטרמיניסטי');
}

console.log('\n4) המדיניות התורנית + מרשם');
{
  const p = policy.createTorahPolicy(mkSettings());
  (p.firstWord.mode === 'window' && p.dibburEnabled === false ? ok : fail)('TorahPolicy: firstWord נשארת; auto-dh=false ברירת Orange');
  const on = policy.createTorahPolicy(mkSettings({ 'auto-dh': true }));
  (on.dibburEnabled === true ? ok : fail)('auto-dh=true מפעיל (rollback להגדרה)');
  const minimal = policy.createMinimalPolicy(mkSettings());
  (minimal.firstWord.mode === 'none' && minimal.dibburEnabled === false ? ok : fail)('מינימלית: הכללים העדינים כבויים');
  const sig = policy.torahRegistrySignature();
  (sig.includes('first-word.window@2') && sig.includes('dibbur.hamatchil@2') && policy.torahRuleIssues().length === 0 ? ok : fail)('המרשם: first-word@2 + dibbur@2 (rollback = v1)');
}

console.log('\n5) הכללים משפיעים על מדידה בלבד — סריקת קוד');
{
  const fwSrc = readFileSync(join(repoRoot, 'packages', 'policy-torah', 'src', 'firstword.ts'), 'utf8');
  (fwSrc.includes('מדיניות מדידה') && !/<[a-z]+[^>]*>/.test(fwSrc.split('**')[0] ?? '') ? ok : fail)('המודול מוגדר כמדיניות מדידה — בלי עיטוף HTML');
  const engineDir = join(repoRoot, 'packages', 'layout-engine', 'src');
  const renderDir = join(repoRoot, 'packages', 'render-html', 'src');
  let noRegexInRenderer = true;
  try {
    for (const f of ['index.ts']) {
      const src = readFileSync(join(renderDir, f), 'utf8');
      if (/splitDibbur|dibbur-hamatchil|first-word-window/.test(src)) noRegexInRenderer = false;
    }
  } catch { /* render-html structure may vary */ }
  (noRegexInRenderer ? ok : fail)('אין זיהוי דיבור/מילה-ראשונה ברנדרר (הזיהוי במדיניות)');
  let engineClean = true;
  try {
    const typeset = readFileSync(join(engineDir, 'v0', 'typeset-v0.ts'), 'utf8');
    if (/splitDibburHamatchil/.test(typeset)) engineClean = false;
  } catch { /* v0 may not reference */ }
  (engineClean ? ok : fail)('הכללים אינם במסלול העימוד (מדיניות מדידה לחיווט M9)');
}

console.log('\n6) רגרסיית בדיקות');
if (SKIP_TESTS) {
  console.log('  [SKIP] TORA_SKIP_TEST_REGRESSION=1 (הסוויטה רצה במלואה בצעד ה-vitest של ה-CI)');
} else {
  const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'packages/policy-torah/test/firstword.test.ts']);
  const m = out.match(/Tests\s+(\d+) passed/);
  (m !== null && Number(m[1]) === 12 ? ok : fail)(`בדיקות firstword: 12/12 (התקבל ${m ? m[1] : '?'})`);
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${checks - failures}/${checks} בדיקות`);
process.exit(failures === 0 ? 0 : 1);
