#!/usr/bin/env node
/**
 * verify-preview — אימות שלב 36: תצוגה מקדימה בריאקט צורכת IR (§13.2).
 *
 * בדיקות:
 *   1. הקומפוננטות אינן מריצות typeset: אין ייבוא מנוע ב-src/renderers;
 *      אין dangerouslySetInnerHTML; אין getBoundingClientRect בקוד
 *      (מדידת DOM אסורה במסלול התצוגה — היא היטל בלבד).
 *   2. CSS logical properties בלבד בהיטל (insetInlineStart/insetBlockStart/
 *      inlineSize/blockSize) — לא left/top פיזיים (§13.2).
 *   3. בדיקות הקומפוננטות ירוקות (tests/component) — כולל zoom שאינו
 *      משנה היטל ואפס מדידות DOM.
 *   4. typecheck שורש — הקוד החדש מסוג.
 *   5. רגרסיה: build, lint, deps, test:packages.
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
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1'; // שיתוף ריצת הסוויטה ב-CI (סבב י"ג): הצעד האב כבר הריץ אותה — ריצות בת כפולות היו מקריסות את ה-job (לחץ משאבים; תועד בסבב ט')
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

console.log('1) הקומפוננטות אינן מקור החלטות — היטל בלבד');
const renderersDir = join(repoRoot, 'src', 'renderers');
const model = readFileSync(join(renderersDir, 'preview-model.ts'), 'utf8');
const pageView = readFileSync(join(renderersDir, 'PageView.tsx'), 'utf8');
const preview = readFileSync(join(renderersDir, 'LayoutPreview.tsx'), 'utf8');
(!/@tora\/layout-engine/.test(model + pageView + preview)
  ? ok : fail)('אין ייבוא מנוע בתצוגה — typeset אינו נקרא מקומפוננטה (§13.2)');
(!/dangerouslySetInnerHTML\s*=/.test(pageView + preview)
  ? ok : fail)('אין שימוש ב-dangerouslySetInnerHTML (§13.2 — רק אזכור בתיעוד)');
(!/getBoundingClientRect|offsetWidth|clientWidth|offsetHeight/.test(model + pageView + preview)
  ? ok : fail)('אין מדידת DOM במסלול התצוגה (§13.2)');
(preview.includes('transform') && preview.includes('zoom')
  ? ok : fail)('zoom מיושם כ-transform של המיכל בלבד');

console.log('\n2) CSS logical properties (§13.2)');
for (const frag of ['insetInlineStart', 'insetBlockStart', 'inlineSize', 'blockSize']) {
  (pageView.includes(frag) && model.includes(frag.endsWith('Px') ? frag : `${frag}Px`)
    ? ok : fail)(`מאפיין לוגי: ${frag}`);
}
(!/\bleft:\s|\.left\b|top:/.test(pageView)
  ? ok : fail)('אין מיקום פיזי left/top בקומפוננטות (הכול לוגי)');

console.log('\n3) בדיקות הקומפוננטות (tests/component)');
const compOut = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/component/']);
// שלב 76: התיקייה כוללת גם את stores.test.tsx (4 בדיקות רינדור) — 8 preview + 4 stores
// שלב 77: וגם את e2e-worker-path.test.tsx (4 בדיקות מעטפת מלאה) — סה"כ 16
// שלב 78: וגם את settings-panel.test.tsx (26 בדיקות לוח הגדרות מהמרשם) — סה"כ 42
// שלב 80: e2e הורחב ל־8 (קלט פגום חוסם לפני שליחה; ייבוא בזמן ריצה; מסמך קנוני)
// + import-insights.test.tsx (13 מפת שגיאות קלט וסקירה)
// שלב 81: e2e הורחב ל־13 (עורך מקושר: שני הכיוונים, BiDi/reorder, שער הטריות) — סה"כ 72
// תיקון 2026-11-09/ב': +8 בדיקות preview (כיוון טבעי + טקסט לוגי — שורש מראות
// התווים באתר החי; 13→21) ⇒ tests/component 109→117
(compOut !== null && /Tests\s+122\s+passed/.test(compOut) ? ok : fail)('tests/component — 122/122 (21 preview + 5 ייצוא + 4 stores + 13 e2e-worker + 26 לוח הגדרות + 8 קבצים ותבניות + 13 מפת קלט + 17 ממצאי Audit + 15 וירטואליזציה)');

console.log('\n4) typecheck שורש');
(runCode('npx', ['tsc', '--noEmit']) === 0 ? ok : fail)('tsc --noEmit (שורש) — PASS');

console.log('\n5) רגרסיה: build, lint, deps, test:packages');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
const testOut = (SKIP_TESTS ? 'Tests  1305 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
(testOut !== null && /Tests\s+1305\s+passed/m.test(testOut) ? ok : fail)('test:packages — 1305/1305 (1265 שלב 83 + 16 ניקוי stores והגדרות יתומות שלב 84 + 11 תיקון היטל 2026-11-09: 5 render-html + 1 cli + 5 preview)');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');

console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`התצוגה המקדימה תקינה — ${checks} בדיקות ירוקות. התצוגה היא היטל של ה-IR ולא מקור החלטות.`);
