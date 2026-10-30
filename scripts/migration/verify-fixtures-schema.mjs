#!/usr/bin/env node
/**
 * verify-fixtures-schema — סכמת fixtures, כלי golden ושער M1 המלא (שלב 13).
 * אסמכתא: אפיון §17.3, §18-M1 · תכנית 100 השלבים, שלב 13.
 *
 * בדיקות:
 *   1. חבילת test-fixtures מייצאת סכמה וכלי golden; הרישום כולו (26 פריטים)
 *      עובר את validateRegistry ללא אף בעיה.
 *   2. הסכמה המלאה: לכל פריט fontManifestSha256 התואם בפועל ל־assets/fonts/manifest.json
 *      (צליבת שלב 2↔שלב 13); goldenLayoutSha256 — null או hex תקין.
 *   3. מחזור golden חי: בנייה←השוואה עובר; ה־golden המחויב (tests/golden/demo.golden.json)
 *      מושווה בהצלחה מול אותו IR עם layoutHash האמיתי.
 *   4. שער M1 המלא:
 *      א. כל 11 חבילות הקוד מיובאות ב־Node טהור (אין window/document בכלל).
 *      ב. יחידות וגיבוב יציבים (רגרסיה: verify-units + verify-canonical-hash).
 *      ג. build + typecheck + lint + deps ירוקים.
 *      ד. החבילות אינן מחוברות למסלול ייצור — אף יבוא @tora/* בקוד היישום הישן.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

// ---------- 1. הסכמה והרישום ----------
console.log('1) סכמת fixtures והרישום המלא');
const tf = await import('@tora/test-fixtures');
for (const name of ['validateFixture', 'validateRegistry', 'buildGolden', 'compareGolden', 'parseGolden']) {
  (name in tf ? ok : fail)(`ייצוא: ${name}`);
}
const registry = JSON.parse(readFileSync(join(repoRoot, 'packages', 'test-fixtures', 'registry.json'), 'utf8'));
const issues = tf.validateRegistry(registry);
(issues.length === 0 ? ok : fail)(`validateRegistry: ${registry.fixtures.length} פריטים — ${issues.length} בעיות${issues.length ? ' (ראשונה: ' + JSON.stringify(issues[0]) + ')' : ''}`);

// ---------- 2. הסכמה המלאה + צליבת מניפסט גופנים ----------
console.log('\n2) סכמה מלאה — צליבת fontManifestSha256 מול שלב 2');
const fontManifestSha = createHash('sha256')
  .update(readFileSync(join(repoRoot, 'assets', 'fonts', 'manifest.json')))
  .digest('hex');
(registry.fontsManifest?.sha256 === fontManifestSha
  ? ok : fail)('רשומת המניפסט ברישום תואמת ל־assets/fonts/manifest.json בפועל');
let allFontsMatch = true;
let badGolden = [];
for (const f of registry.fixtures) {
  if (f.fontManifestSha256 !== fontManifestSha) allFontsMatch = false;
  if (f.expected.goldenLayoutSha256 !== null && !/^[0-9a-f]{64}$/.test(f.expected.goldenLayoutSha256)) {
    badGolden.push(f.id);
  }
}
(allFontsMatch ? ok : fail)('לכל 26 הפריטים fontManifestSha256 תואם למניפסט בפועל');
(badGolden.length === 0 ? ok : fail)(`goldenLayoutSha256 — null (עד המנוע) או hex תקין${badGolden.length ? '; פגומים: ' + badGolden.join(',') : ''}`);

// ---------- 3. מחזור golden ----------
console.log('\n3) מחזור golden (כלים + הקובץ המחויב)');
const { layoutHash } = await import('@tora/layout-api');
const demoIr = {
  schemaVersion: 1,
  demo: true,
  note: 'golden הדגמה משלב 13 — מוחלף בפלט מנוע אמיתי בשלבים 33+',
  pages: [
    { id: 'p1', columns: [{ x: 0, width: 1000 }, { x: 1100, width: 1000 }] },
    { id: 'p2', columns: [{ x: 0, width: 1000 }, { x: 1100, width: 1000 }] },
  ],
};
const built = tf.buildGolden(demoIr, layoutHash);
const cycled = tf.compareGolden(demoIr, built, layoutHash);
(cycled.equal ? ok : fail)('בנייה←השוואה (in-memory): שווה');
const goldenPath = join(repoRoot, 'tests', 'golden', 'demo.golden.json');
(existsSync(goldenPath) ? ok : fail)('tests/golden/demo.golden.json קיים (מחויב)');
if (existsSync(goldenPath)) {
  const committed = tf.parseGolden(readFileSync(goldenPath, 'utf8'));
  const result = tf.compareGolden(demoIr, committed, layoutHash);
  (result.equal ? ok : fail)(`ההשוואה מול ה־golden המחויב עוברת (${committed.goldenLayoutSha256.slice(0, 12)}…)`);
  const modified = { ...demoIr, pages: [{ id: 'pX', columns: [] }] };
  const neg = tf.compareGolden(modified, committed, layoutHash);
  (!neg.equal && neg.diffReport.includes('golden mismatch')
    ? ok : fail)('שינוי תוכן → השוואה נכשלת עם דו"ח diff (בדיקה שלילית)');
}

// ---------- 4. שער M1 המלא ----------
console.log('\n4) שער M1 המלא');
// א — יבוא כל חבילות הקוד ב־Node טהור
const CODE_PACKAGES = ['content-model', 'settings-schema', 'measurement-api', 'layout-api',
  'layout-engine', 'policy-torah', 'measurement-harfbuzz', 'audit-core',
  'render-html', 'export-pdf', 'cli', 'test-fixtures'];
let importFailures = [];
for (const p of CODE_PACKAGES) {
  try {
    await import(`@tora/${p}`);
  } catch (e) {
    importFailures.push(`${p}: ${String(e?.message).slice(0, 60)}`);
  }
}
(importFailures.length === 0
  ? ok : fail)(`כל ${CODE_PACKAGES.length} החבילות מיובאות ב־Node טהור (בלי window/document)${importFailures.length ? ' — כשלים: ' + importFailures.join('; ') : ''}`);

// ב — יחידות וגיבוב יציבים (רגרסיה)
(run('node', ['scripts/migration/verify-units.mjs']) === 0 ? ok : fail)('verify-units — PASS (רגרסיה)');
(run('node', ['scripts/migration/verify-canonical-hash.mjs']) === 0 ? ok : fail)('verify-canonical-hash — PASS (רגרסיה)');

// ג — build + typecheck + lint + deps
(run('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
(run('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('typecheck:packages — PASS');
(run('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
(run('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');

// ד — החבילות אינן מחוברות למסלול הייצוג הישן
let oldSrcUsesTora = [];
const scanOld = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) scanOld(p);
    else if (/\.(ts|tsx)$/.test(e.name) && readFileSync(p, 'utf8').includes('@tora/')) oldSrcUsesTora.push(p);
  }
};
scanOld(join(repoRoot, 'src'));
(oldSrcUsesTora.length === 0
  ? ok : fail)(`הקוד הישן (src/) אינו מייבא @tora/* — החבילות אינן מחוברות למסלול הייצור הישן${oldSrcUsesTora.length ? ': ' + oldSrcUsesTora.slice(0, 3).join(', ') : ''}`);

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`סכמת ה-fixtures וכלי ה-golden תקינים — ${checks} בדיקות ירוקות.`);
console.log('שער M1: יבוא ליבה ב־Node בלי window/document; יחידות וגיבוב יציבים; build ו-typecheck ירוקים; החבילות מנותקות ממסלול הייצור הישן.');
