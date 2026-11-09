#!/usr/bin/env node
/**
 * verify-export-pure — אימות שלב 86: מחליף הייצוא — renderer טהור במקום
 * live-CSS (תכנית 86; אפיון §15.1). שעת השלב: "אין דרך לייצא תוצאה
 * שאינה באה מ־IR" + "ייצוא ללא דפדפן; אין query/measurement של DOM".
 *
 * החלק הפונקציונלי (buildExportHtml על IR אמיתי, דטרמיניזם ביט-ביט,
 * טקסט לוגי, בלי רשת) נבדק ב-vitest (tests/component/export-button,
 * שרץ בסוויטה 1320); כאן — מבנה, טוהר וחיווט.
 */
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');

console.log('1) איסור window.print — ההדפסה אינה מסלול ייצוא');
for (const f of ['src/components/layout/AppShell.tsx', 'src/components/layout/ExportButton.tsx']) {
  const src = read(f);
  if (/window\.print\(/.test(src)) fail(`${f} — window.print נמצא`);
  else ok(`${f} — נקי מ-window.print`);
}
const allSrc = ['src'];
// סריקה כוללת: grep -r "window.print" src/
let found = '';
try {
  const { execFileSync } = await import('node:child_process');
  found = execFileSync('grep', ['-rl', 'window.print(', ...allSrc], { cwd: repoRoot, encoding: 'utf8' }).trim();
} catch { /* grep exit 1 = no matches */ }
found === '' ? ok('src/ (כל המעטפת) — אפס מופעי window.print')
  : fail(`window.print נותר: ${found.split('\n').join(', ')}`);

console.log('\n2) הייצוא נבנה רק מה־IR — שרשרת אחת, טהורה');
const exportMod = read('src/worker-host/export-html.ts');
/from '@tora\/render-html'/.test(exportMod) ? ok('export-html.ts מייבא @tora/render-html (היטל טהור)') : fail('חסר ייבוא render-html');
/renderHtml\(/.test(exportMod) ? ok('הבונה קורא ל-renderHtml') : fail('אין קריאה ל-renderHtml');
/input\.ir/.test(exportMod) ? ok('הקלט — ir מה־resultStore בלבד') : fail('אין ir בקלט');
/URL\.createObjectURL/.test(exportMod) && /revokeObjectURL/.test(exportMod)
  ? ok('התעבורה (Blob) מבודדת ומשוחררת')
  : fail('התעבורה חסרה או דולפת');
const btn = read('src/components/layout/ExportButton.tsx');
/buildExportHtml/.test(btn) ? ok('ExportButton → buildExportHtml (אין היטל DOM חי)') : fail('ExportButton אינו קורא לבונה');
/peekUiRuntime/.test(btn) ? ok('הגופנים מהצרור החי (אין טעינה חדשה)') : fail('אין צרור גופנים');

console.log('\n3) render-html — טוהר החבילה (אין DOM/רשת בהיטל)');
const renderSrc = read('packages/render-html/src/render.ts');
!/document\.|getComputedStyle|XMLHttpRequest|[^a-zA-Z]fetch\(/.test(renderSrc)
  ? ok('render.ts — אפס גישות DOM/רשת')
  : fail('render.ts — גישה אסורה');
const cliRunner = read('packages/cli/src/runner.ts');
/renderHtml\(/.test(cliRunner) && !/window\.print\(/.test(cliRunner)
  ? ok('CLI — הייצוא דרך renderHtml בלבד (Node טהור)')
  : fail('CLI — מסלול ייצוא לא טהור');

console.log('\n4) חיווט CI וספירות');
const ci = read('.github/workflows/ci.yml');
/Tests\[\[:space:\]\]\+1320\[\[:space:\]\]\+passed/.test(ci) ? ok('ci.yml — נעיכת הסוויטה 1320 (כולל 3 ייצוא)') : fail('ci.yml — 1320');
/verify-export-pure/.test(ci) ? ok('ci.yml — verify-export-pure מחובר') : fail('ci.yml — המאמת אינו מחובר');
const pkg = read('package.json');
/"verify:export-pure"/.test(pkg) ? ok('package.json — סקריפט verify:export-pure') : fail('package.json — חסר סקריפט');

console.log(`\nתוצאה: ${checks - failures}/${checks}`);
process.exit(failures === 0 ? 0 : 1);
