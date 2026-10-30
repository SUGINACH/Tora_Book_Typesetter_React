#!/usr/bin/env node
/**
 * verify-error-catalog — אימות קטלוג השגיאות ותשתית ה־i18n (שלב 12 בתכנית 100 השלבים).
 * אסמכתא: אפיון §6.3, §16, §12.1 · תכנית 100 השלבים, שלב 12.
 *
 * בדיקות:
 *   1. הקטלוג קיים ומיוצא: ERROR_CATALOG, EngineError, ValidationIssue, isRegisteredErrorKey.
 *   2. שלושת קודי היסוד רשומים: MISSING_FONT, FONT_HASH_MISMATCH, MEASUREMENT_UNAVAILABLE.
 *   3. אכיפה חיה: EngineError עם מפתח לא רשום נדחה; שגיאת יחידות אמיתית עוברת דרך הקטלוג.
 *   4. סריקת קוד-מקור: כל קוד שנזרק ב־src של החבילות (UnitsError/CanonicalHashError/EngineError) רשום.
 *   5. טבלת מפתחות התרגום הראשונית קיימת ומכסה את כל הקטלוג.
 *   6. בדיקות יחידה+property ירוקות; רגרסיה מלאה.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let failures = 0;
let checks = 0;
const ok = (m) => { checks++; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks++; failures++; console.log(`  [FAIL] ${m}`); };
const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { cwd: repoRoot, stdio: 'pipe' });
    return 0;
  } catch {
    return 1;
  }
};

// ---------- 1–3. הקטלוג בזמן ריצה ----------
console.log('1) הקטלוג בזמן ריצה (מה־dist)');
const api = await import('@tora/measurement-api');
for (const name of ['ERROR_CATALOG', 'EngineError', 'isRegisteredErrorKey']) {
  (name in api ? ok : fail)(`ייצוא (ערך): ${name}`);
}
// ValidationIssue הוא טיפוס — נבדק בהצהרות ה־dist (export * from './errors.js')
const dts = readFileSync(join(repoRoot, 'packages', 'measurement-api', 'dist', 'errors.d.ts'), 'utf8');
(dts.includes('export interface ValidationIssue') ? ok : fail)('ייצוא (טיפוס): ValidationIssue');
const catalog = api.ERROR_CATALOG;
const catalogSize = Object.keys(catalog).length;
(catalogSize >= 15 ? ok : fail)(`הקטלוג כולל ${catalogSize} קודים (צפוי ≥ 15)`);

console.log('\n2) קודי היסוד');
for (const key of ['errors.font.MISSING_FONT', 'errors.font.FONT_HASH_MISMATCH', 'errors.measurement.MEASUREMENT_UNAVAILABLE']) {
  (api.isRegisteredErrorKey(key) ? ok : fail)(`רשום: ${key}`);
}

console.log('\n3) אכיפה חיה');
try {
  new api.EngineError('errors.font.NOT_REGISTERED');
  fail('EngineError היה צריך לדחות מפתח לא רשום');
} catch (e) {
  (/UNREGISTERED_ERROR_KEY/.test(String(e?.message)) ? ok : fail)('EngineError דוחה מפתח לא רשום (UNREGISTERED_ERROR_KEY)');
}
try {
  api.mmToLu(Number.NaN);
  fail('mmToLu(NaN) היה צריך לזרוק');
} catch (e) {
  (e instanceof api.EngineError && e.catalogKey === 'errors.units.NON_FINITE_MM'
    ? ok : fail)('mmToLu(NaN) זורק UnitsError דרך הקטלוג (errors.units.NON_FINITE_MM)');
}

// ---------- 4. סריקת קוד-מקור ----------
console.log('\n4) סריקה: כל קוד שנזרק רשום בקטלוג');
const srcFiles = [];
const scan = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else if (e.name.endsWith('.ts') && p.includes('/src/')) srcFiles.push(p);
  }
};
scan(join(repoRoot, 'packages'));
let thrownCodes = 0;
let unregistered = [];
for (const f of srcFiles) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/new (UnitsError|CanonicalHashError)\(\s*'([A-Z0-9_]+)'/g)) {
    thrownCodes++;
    const key = `errors.${m[1] === 'UnitsError' ? 'units' : 'hash'}.${m[2]}`;
    if (!api.isRegisteredErrorKey(key)) unregistered.push(`${key} (${f.split('packages/')[1]})`);
  }
  for (const m of text.matchAll(/new EngineError\(\s*'(errors\.[a-z]+\.[A-Z0-9_]+)'/g)) {
    thrownCodes++;
    if (!api.isRegisteredErrorKey(m[1])) unregistered.push(m[1]);
  }
}
(unregistered.length === 0
  ? ok : fail)(`${thrownCodes} קודי שגיאה נזרקים בקוד המקור — כולם רשומים בקטלוג${unregistered.length ? ' — חסרים: ' + unregistered.join(', ') : ''}`);

// ---------- 5. טבלת מפתחות התרגום ----------
console.log('\n5) טבלת מפתחות התרגום הראשונית (docs/i18n/error-keys.md)');
const tablePath = join(repoRoot, 'docs', 'i18n', 'error-keys.md');
(existsSync(tablePath) ? ok : fail)('docs/i18n/error-keys.md קיים');
if (existsSync(tablePath)) {
  const table = readFileSync(tablePath, 'utf8');
  const missingInTable = Object.keys(catalog).filter((k) => !table.includes(`\`${k}\``));
  (missingInTable.length === 0
    ? ok : fail)(`הטבלה מכסה את כל ${catalogSize} הקודים${missingInTable.length ? ' — חסרים: ' + missingInTable.join(', ') : ''}`);
}

// ---------- 6. בדיקות + רגרסיה ----------
console.log('\n6) בדיקות ורגרסיה');
(run('npm', ['run', 'test:packages']) === 0 ? ok : fail)('test:packages — PASS');
(run('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
(run('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('typecheck:packages — PASS');
(run('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
(run('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`קטלוג השגיאות תקין — ${checks} בדיקות ירוקות. אין שגיאה ללא קוד ומפתח i18n.`);
