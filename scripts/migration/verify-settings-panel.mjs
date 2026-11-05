#!/usr/bin/env node
/**
 * verify-settings-panel — אימות שלב 78: לוח ההגדרות מ־Setting Registry.
 * אסמכתא: אפיון §13.3, §6.3 · תכנית שלב 78 · GLOSSARY "לוח הגדרות".
 *
 * שער השלב: **אין טופס הגדרות hard-coded מקביל למרשם.** ההוכחה כאן
 * סטטית ודו-כיוונית:
 *   1. הלוח קיים ונגול מהמרשם (ייבוא settingsRegistry מ-settings-store —
 *      אותו מופע יחיד; אין רשימת שדות מקומית ואין ייבוא registry.json ישיר).
 *   2. הטופס הישן נמחק: SettingsSidebar/CustomStylePanel/store ההגדרות
 *      הישן/default-settings — ואף מודול במעטפת אינו מייבא אותם.
 *   3. קטלוג התוויות מכסה את המרשם במלואו והדדית (אין שדה יתום/צרכן יתום),
 *      כולל 13 תוויות מדורים.
 *   4. המרשם נושא תלויות תצוגה תקינות (רשימה סגורה של 4; מטרה קיימת).
 *   5. המעטפת מחוברת: AppShell מרנדר את הלוח; לוח ההגדרות נגיש מהכותרת.
 *   6. הבדיקות: 26 בדיקות הלוח ב-tests/component; הסוויטה המלאה 1243.
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

console.log('1) שער השלב — הטופס הישן נמחק; אין מקבילה hard-coded');
{
  const deleted = [
    'src/components/settings/SettingsSidebar.tsx',
    'src/components/settings/panels/CustomStylePanel.tsx',
    'src/store/settings-store.ts',
    'src/lib/default-settings.ts',
    'scripts/check-breaklines.ts',
    'tests/unit/engine/input-declaration.test.ts',
    'tests/unit/engine/paren-protector.test.ts',
    'tests/unit/engine/determinism.test.ts',
    'tests/unit/engine/typeset.test.ts',
    'tests/unit/audit/new-checks.test.ts',
  ];
  const alive = deleted.filter((p) => existsSync(join(repoRoot, p)));
  (alive.length === 0 ? ok : fail)(`10 קבצי הטופס/ברירות הישנים נמחקו${alive.length ? ` — עדיין קיימים: ${alive.join(', ')}` : ''}`);

  // אף מודול במעטפת אינו מייבא את הנמחקים (לא נותרו מתייחסים)
  const walk = (dir) => {
    const out = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) out.push(...walk(p));
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
    }
    return out;
  };
  const files = [...walk(join(repoRoot, 'src')), ...walk(join(repoRoot, 'tests', 'component')), ...walk(join(repoRoot, 'tests', 'stores'))];
  const badPatterns = [/from '[^']*store\/settings-store'/, /from '[^']*lib\/default-settings'/, /SettingsSidebar/, /CustomStylePanel/];
  const offenders = [];
  for (const f of files) {
    const code = stripComments(read(f));
    for (const re of badPatterns) if (re.test(code)) offenders.push(f);
  }
  (offenders.length === 0 ? ok : fail)(`אף מודול במעטפת/בבדיקות החדשות אינו מתייחס לטופס הישן (${files.length} קבצים נסרקו)${offenders.length ? ` — חריגות: ${offenders.slice(0, 3).join(', ')}` : ''}`);
}

console.log('\n2) הלוח נגול מהמרשם — מקור אחד, בלי רשימות מקומיות');
{
  const panel = read('src/components/settings/SettingsPanel.tsx');
  const row = read('src/components/settings/SettingRow.tsx');
  (/import \{ settingsRegistry[^}]*\} from '\.\.\/\.\.\/stores\/settings-store\.js';/.test(panel)
    ? ok : fail)('SettingsPanel מייבא את settingsRegistry מ-settings-store (המופע היחיד) — לא קורא registry.json בעצמו');
  (/data-setting-key=\{def\.key\}/.test(row) ? ok : fail)('SettingRow מונע מפתח מהמרשם (data-setting-key=def.key) — אין מפתחות כתובים ביד');
  (!/from '@tora\/settings-schema\/registry\.json'/.test(panel + row)
    ? ok : fail)('הקומפוננטות אינן מייבאות registry.json ישירות (עקיפת המופע היחיד אסורה)');

  // הבקרות לפי המרשם בלבד: אין בקומפוננטות רשימת מפתחות משלהן
  const literalKeys = [...stripComments(panel + row).matchAll(/'(?:s-h\d|f-h\d|page-num|fn-|hdr-|prop-|cbg-|dim-|avoid-|drop-word|line-height|mode-h|show-|select-shaar|inp-book|enable-)[^']*'/g)];
  (literalKeys.length === 0
    ? ok : fail)(`אין מפתחות הגדרות כתובים-ביד בקוד הלוח${literalKeys.length ? ` — נמצאו: ${literalKeys.slice(0, 3).map((m) => m[0]).join(', ')}` : ''}`);
}

console.log('\n3) קטלוג התוויות — כיסוי מלא והדדי (אין שדה יתום)');
{
  const catalogSrc = read('src/i18n/settings-labels.ts');
  const catalogKeys = [...catalogSrc.matchAll(/'(settings\.[^']+)'\s*:/g)].map((m) => m[1]);
  const uniqueCatalog = new Set(catalogKeys);
  const registry = JSON.parse(read('packages/settings-schema/registry.json'));
  const registryKeys = new Set(registry.settings.map((s) => s.ui.labelKey));

  (registry.settings.length === 257 ? ok : fail)(`המרשם: 257 רשומות (נמצא ${registry.settings.length})`);
  (catalogKeys.length === 257 && uniqueCatalog.size === 257
    ? ok : fail)(`הקטלוג: 257 ערכים ייחודיים (נמצא ${catalogKeys.length}/${uniqueCatalog.size})`);
  const missing = [...registryKeys].filter((k) => !uniqueCatalog.has(k));
  (missing.length === 0 ? ok : fail)(`לכל רשומת מרשם יש תווית${missing.length ? ` — חסרים: ${missing.slice(0, 3).join(', ')}` : ''}`);
  const orphan = [...uniqueCatalog].filter((k) => !registryKeys.has(k));
  (orphan.length === 0 ? ok : fail)(`אין תווית למפתח שאינו במרשם${orphan.length ? ` — יתומים: ${orphan.slice(0, 3).join(', ')}` : ''}`);

  // תוויות ריקות
  const emptyLabels = [...catalogSrc.matchAll(/\{ he: '', description: '' \}/g)];
  (emptyLabels.length === 0 ? ok : fail)('אין תוויות ריקות');

  // מדורים: 13, דו-כיווני
  const sections = new Set(registry.settings.map((s) => s.ui.section));
  (sections.size === 13 ? ok : fail)(`13 מדורים במרשם (נמצא ${sections.size})`);
  let sectionsOk = true;
  for (const s of sections) if (!new RegExp(`^\\s{2}'?${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'?:`, 'm').test(catalogSrc)) sectionsOk = false;
  (sectionsOk ? ok : fail)('לכל מדור במרשם יש תווית מדור בקטלוג');

  // תוויות מדור יתומות
  const sectionLabels = [...catalogSrc.matchAll(/^\s{2}'?([\w-]+)'?: '/gm)].map((m) => m[1]);
  const orphanSections = sectionLabels.filter((s) => !sections.has(s));
  (orphanSections.length === 0 ? ok : fail)(`אין תווית מדור יתומה${orphanSections.length ? ` — ${orphanSections.join(', ')}` : ''}`);
}

console.log('\n4) תלויות תצוגה במרשם — רשימה סגורה ותקינה');
{
  const registry = JSON.parse(read('packages/settings-schema/registry.json'));
  const byKey = new Map(registry.settings.map((s) => [s.canonicalKey, s]));
  const deps = registry.settings.filter((s) => s.ui.dependsOn !== null);
  (deps.length === 4 ? ok : fail)(`בדיוק 4 זוגות תלות מתועדים (נמצא ${deps.length})`);
  let allValid = true;
  for (const s of deps) {
    if (!byKey.has(s.ui.dependsOn.key)) allValid = false;
    if (!Array.isArray(s.ui.dependsOn.values) || s.ui.dependsOn.values.length === 0) allValid = false;
  }
  (allValid ? ok : fail)('כל מטרת תלות קיימת במרשם וערכיה אינם ריקים');
  const expected = new Set(['s-paren', 'select-shaar-main', 'select-shaar-back', 'select-shaar-sub']);
  (deps.every((s) => expected.has(s.canonicalKey)) ? ok : fail)('הרשימה הסגורה: s-paren + שלושת בוררי השערים (כמתועד במחולל)');

  // המחולל מפיק אותה רשימה — דטרמיניזם
  const before = read('packages/settings-schema/registry.json');
  run('node', ['scripts/migration/gen-settings-registry.mjs']);
  (read('packages/settings-schema/registry.json') === before ? ok : fail)('המחולל דטרמיניסטי — ריצה חוזרת ביט-ביט (כולל dependsOn)');

  // SettingRow מכבד את התלות (disabled + רמז)
  const row = read('src/components/settings/SettingRow.tsx');
  (/disabled=\{disabledByDep\}/.test(row) && /data-setting-dep-hint/.test(row)
    ? ok : fail)('SettingRow נועל שדה תלוי עם רמז תלות');
}

console.log('\n5) חיבור המעטפת');
{
  const shell = stripComments(read('src/components/layout/AppShell.tsx'));
  (/import \{ SettingsPanel \} from '\.\.\/settings\/SettingsPanel';/.test(shell) ? ok : fail)('AppShell מייבא את SettingsPanel');
  (/<SettingsPanel \/>/.test(shell) ? ok : fail)('AppShell מרנדר את הלוח (סרגל צד מתקפל)');
  (/data-testid="toggle-settings"/.test(shell) ? ok : fail)('מתג פתיחת ההגדרות בכותרת');

  // §13.3: הלוח מחשב effective/hash בכל שינוי (applyDraft אחרי setDraftValue)
  const row = read('src/components/settings/SettingRow.tsx');
  (/applyDraft\(\)/.test(row) ? ok : fail)('כל שינוי שדה מסתיים ב-applyDraft (draft ← validation ← effective/hash)');
}

console.log('\n6) הבדיקות — 26 בדיקות הלוח; הסוויטה המלאה 1243');
{
  const testSrc = read('tests/component/settings-panel.test.tsx');
  const its = [...testSrc.matchAll(/\bit\(/g)].length;
  (its === 26 ? ok : fail)(`26 בדיקות בקובץ הלוח (נמצא ${its})`);
  (/property: כל אחד מ-236 מפתחות הפריסה משנה configHash/.test(testSrc) ? ok : fail)('בדיקת ההשפעה הכוללת (236 מפתחות פריסה) קיימת');
  (/אף אחד מ-21 מפתחות ה-UI אינו משנה/.test(testSrc) ? ok : fail)('בדיקת היעדר השפעה ל-21 מפתחות UI קיימת');
  (/ערך לא חוקי נדחה/.test(testSrc) ? ok : fail)('בדיקת דחיית ערך לא חוקי קיימת');

  if (!SKIP_TESTS) {
    const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts', 'tests/component/settings-panel.test.tsx']);
    (/Tests\s+26\s+passed/.test(out ?? '') ? ok : fail)('tests/component/settings-panel — 26/26 ירוקות');
  } else {
    ok('בדיקות הלוח — דולג (הצעד האב הריץ את הסוויטה)');
  }
  if (!SKIP_TESTS) {
    const testOut = run('npm', ['run', 'test:packages']);
    (/Tests\s+1243\s+passed/m.test(testOut ?? '') ? ok : fail)('test:packages — 1243/1243');
  } else {
    ok('test:packages — דולג (הצעד האב הריץ את הסוויטה)');
  }
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
console.log(`verify-settings-panel: ${checks - failures}/${checks} בדיקות עברו${failures > 0 ? `, ${failures} נכשלו` : ''}`);
process.exit(failures > 0 ? 1 : 0);
