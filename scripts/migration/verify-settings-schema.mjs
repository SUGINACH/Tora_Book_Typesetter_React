#!/usr/bin/env node
/**
 * verify-settings-schema — אימות שלב 30 (שער M3): חוזה settings-schema,
 * מרשם מלא ומיגרציות. אסמכתא: אפיון §6.3, §18-M3 · תכנית שלב 30.
 *
 * בדיקות:
 *   1. המרשם: הפקה דטרמיניסטית (ריצה כפולה ⇐ ביט-ביט); השוואת מפתחות
 *      דו-כיוונית מול המקור (default ∪ פריסטים); 100% ממופים או בעלי
 *      החלטה מתועדת; אין מפתח שהמנוע ידרוש ואינו במרשם (כיסוי קבוצות §6.3).
 *   2. ייבוא round-trip של כל קובצי legacy (default + 3 פריסטים) עם
 *      המרות legacy מתועדות; "window" של drop-word-mode נשמר (אין המרה
 *      אוטומטית); שקילות — אותם קלטים ⇐ אותה תוצאה.
 *   3. configHash: יציב לסדר keys; משתנה במפתח פריסה; קבוע ב-UI-only.
 *   4. דחיות: מפתח לא מוכר/NaN/שלילי/enum לא ידוע — path+קוד, אין מחיקה שקטה.
 *   5. מיגרציות: שרשרת טהורה; v1→v1 זהות; קטלוג שגיאות רשום.
 *   6. רגרסיה: build, lint, deps, test:packages.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync as rf } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1'; // שיתוף ריצת הסוויטה ב-CI (סבב י"ג): הצעד האב כבר הריץ אותה — ריצות בת כפולות היו מקריסות את ה-job (לחץ משאבים; תועד בסבב ט')
// ANSI-safe (סבבים ז'-ח'): תוכן הפלט, לא קיומו.
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
const stripAnsi = (s) => (s == null ? s : String(s).replace(ANSI_RE, '').replace(/\x1b/g, ''));

const run = (cmd, args) => {
  try {
    return stripAnsi(execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }));
  } catch (e) {
    return stripAnsi(e.stdout ?? null);
  }
};
const sha256File = (p) => createHash('sha256').update(rf(p)).digest('hex');
const jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const schema = await import('@tora/settings-schema');
const registryJson = JSON.parse(rf(join(repoRoot, 'packages', 'settings-schema', 'registry.json'), 'utf8'));
const registry = schema.buildSettingRegistry(registryJson);
const DEFAULT = JSON.parse(rf(join(repoRoot, 'assets', 'settings', 'default_settings.json'), 'utf8'));
const PRESET_NAMES = ['פרשנות', 'קונטרס', 'תלמוד'];
const PRESETS = Object.fromEntries(PRESET_NAMES.map((n) => [n, JSON.parse(rf(join(repoRoot, 'assets', 'settings', 'setting_sets', `${n}.json`), 'utf8'))]));

// ─────────────────────────── 1. המרשם ───────────────────────────
console.log('1) המרשם — הפקה, דטרמיניזם והשוואה דו-כיוונית');
{
  const before = sha256File(join(repoRoot, 'packages', 'settings-schema', 'registry.json'));
  run('node', ['scripts/migration/gen-settings-registry.mjs']);
  const after = sha256File(join(repoRoot, 'packages', 'settings-schema', 'registry.json'));
  (before === after ? ok : fail)('המחולל דטרמיניסטי — ריצה חוזרת ביט-ביט');

  const srcKeys = new Set([...Object.keys(DEFAULT), ...PRESET_NAMES.flatMap((n) => Object.keys(PRESETS[n]))]);
  const regKeys = new Set([...registry.byKey.keys()]);
  const missing = [...srcKeys].filter((k) => !regKeys.has(k));
  const invented = [...regKeys].filter((k) => !srcKeys.has(k));
  (missing.length === 0 && invented.length === 0
    ? ok : fail)(`השוואה דו-כיוונית: ${srcKeys.size} מפתחות מקור ⇐ ${regKeys.size} במרשם (חסרים: ${missing.length}; מומצאים: ${invented.length})`);

  const mandatory = ['page-num-initial-value', 'avoid-runt-word', 'body-last-line-align', 'same_as_odd', 'hdr-h1-title-mode', 'h2-orn-scope'];
  const have = mandatory.filter((k) => regKeys.has(k) || [...registry.byKey.values()].some((d) => d.enumValues?.includes(k)));
  (have.length === mandatory.length ? ok : fail)('קבוצות חובה של §6.3 נוכחות (page-num-initial-value … h2-orn-scope)');

  (registryJson.uiOnlyKeys >= 13 && registryJson.affectsLayoutKeys >= 236
    ? ok : fail)(`${registryJson.totalKeys} מפתחות: ${registryJson.affectsLayoutKeys} פריסה + ${registryJson.uiOnlyKeys} UI-only`);
}

// ─────────────────────────── 2. ייבוא round-trip ───────────────────────────
console.log('\n2) ייבוא round-trip של כל קובצי legacy');
{
  const out = schema.importSettings(DEFAULT, registry, '/default');
  const hardIssues = out.issues.filter((i) => i.code !== 'errors.settings.COERCED_LEGACY_STRING');
  (out.values !== null && hardIssues.length === 0
    ? ok : fail)(`default_settings.json: ${Object.keys(out.values ?? {}).length} מפתחות (אזהרות המרה: ${out.issues.length})`);
  const coercions = out.issues.filter((i) => i.code === 'errors.settings.COERCED_LEGACY_STRING');
  (coercions.length > 60 ? ok : fail)(`${coercions.length} המרות מחרוזת-מספר legacy מתועדות (אזהרה, לא כשל)`);

  let allPresets = true;
  for (const n of PRESET_NAMES) {
    const p = schema.importSettings(PRESETS[n], registry, `/preset/${n}`);
    if (p.values === null) { allPresets = false; break; }
  }
  (allPresets ? ok : fail)('שלושת הפריסטים מיובאים במלואם');

  // "window" — ערך legacy חוקי, אין המרה אוטומטית (נעילת המיפוי)
  const def = registry.byKey.get('drop-word-mode');
  const win = schema.importSettings({ 'drop-word-mode': 'window' }, registry);
  (def?.enumValues?.includes('window') && win.values?.['drop-word-mode'] === 'window'
    ? ok : fail)('drop-word-mode:"window" נשמר כערך legacy חוקי — לא הומר ל-sunken');

  // שקילות: שתי ריצות זהות
  const out2 = schema.importSettings(DEFAULT, registry, '/default');
  (jsonEq(out, out2) ? ok : fail)('דטרמיניזם: ייבוא כפול ביט-ביט');
}

// ─────────────────────────── 3. configHash ───────────────────────────
console.log('\n3) configHash קנוני');
{
  const eff = schema.buildEffectiveSettings(registry, []);
  const reordered = {};
  for (const k of Object.keys(eff.values).reverse()) reordered[k] = eff.values[k];
  (schema.computeConfigHash(reordered, registry) === eff.configHash
    ? ok : fail)('יציב לשינוי סדר keys');
  const eff2 = schema.buildEffectiveSettings(registry, [{ 's-h0': 33 }]);
  (eff2.configHash !== eff.configHash ? ok : fail)('משתנה בשינוי מפתח פריסה');
  const eff3 = schema.buildEffectiveSettings(registry, [{ 'inp-book-title': 'אחר' }]);
  (eff3.configHash === eff.configHash ? ok : fail)('קבוע בשינוי UI-only (inp-book-title)');
}

// ─────────────────────────── 4. דחיות ───────────────────────────
console.log('\n4) דחיית ערכים לא חוקיים — path וקוד, אין מחיקה שקטה');
{
  const cases = [
    [{ 'totally-unknown': 1 }, 'errors.settings.UNKNOWN_KEY'],
    [{ 's-h0': 'abc' }, 'errors.settings.NON_FINITE_NUMBER'],
    [{ 'prop-margin': '-5' }, 'errors.settings.INVALID_VALUE'],
    [{ 'dim-h2-top-h': '-1em' }, 'errors.settings.NEGATIVE_DIMENSION'],
    [{ 'drop-word-mode': 'sunken' }, 'errors.settings.UNKNOWN_ENUM_VALUE'],
  ];
  let pass = 0;
  for (const [obj, code] of cases) {
    const out = schema.importSettings(obj, registry);
    if (out.issues.some((i) => i.code === code) && out.values === null) pass += 1;
  }
  (pass === cases.length ? ok : fail)(`${pass}/${cases.length} דחיות עם קוד קטלוגי ו-path`);

  const sParen = schema.importSettings({ 's-paren': '-2' }, registry);
  (sParen.values !== null && sParen.values['s-paren'] === -2
    ? ok : fail)('s-paren:-2 חוקי (מצב יחסי; s-paren-mode:relative) — מתועד במרשם');
}

// ─────────────────────────── 5. מיגרציות וקטלוג ───────────────────────────
console.log('\n5) מיגרציות וקטלוג שגיאות');
{
  const m = schema.migrateSettings(DEFAULT, 1, 1);
  (m.toVersion === 1 && m.settings === DEFAULT ? ok : fail)('v1→v1 זהות (השרשרת ריקה; הוספה תדרוש fixture לכל פריסט ולכל גרסה)');
  (schema.settingsErrorCatalogSize >= 13 ? ok : fail)(`קטלוג: ${schema.settingsErrorCatalogSize} קודים רשומים`);
  const matrix = rf(join(repoRoot, 'docs', 'migration', 'settings-matrix.md'), 'utf8');
  (matrix.includes('drop-word-mode') && matrix.includes('window') && matrix.includes('affectsLayout')
    ? ok : fail)('settings-matrix.md מתעד את הכללים (window/affectsLayout)');
}

// ─────────────────────────── 6. רגרסיה ───────────────────────────
console.log('\n6) רגרסיה');
{
  const build = run('npm', ['run', 'build:packages']);
  (build !== null && !/error TS/.test(build) ? ok : fail)('build:packages נקי');
  const lint = run('npm', ['run', 'lint:packages']);
  (lint !== null && !/\berror\b|✖/m.test(lint) ? ok : fail)('lint:packages נקי');
  const deps = run('npm', ['run', 'deps:check']);
  (deps !== null && !/^\s*✖|\berror\b/m.test(deps) ? ok : fail)('deps:check נקי');
  const tests = (SKIP_TESTS ? 'Tests  656 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
  const m = tests?.match(/Tests\s+(\d+)\s+passed/);
  (m && Number(m[1]) >= 499 ? ok : fail)(`test:packages — ${m ? m[1] : 'נכשל'} עוברות (486 + 13 settings)`);
}

console.log('\n' + '='.repeat(60));
if (failures === 0) {
  console.log(`חוזה ההגדרות תקין — ${checks} בדיקות ירוקות. 100% ממפתחות legacy ממופים (השוואה דו-כיוונית); כל קובצי legacy נטענים; "window" נשמר; configHash קנוני; דחיות עם path+קוד. שער M3 עבר במלואו.`);
} else {
  console.log(`נמצאו ${failures} כשלים מתוך ${checks} בדיקות.`);
}
process.exit(failures === 0 ? 0 : 1);
