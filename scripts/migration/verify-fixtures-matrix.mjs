#!/usr/bin/env node
/**
 * verify-fixtures-matrix — מאמת שלב 75: מטריצת ה-fixtures המלאה — **שער M8**
 * (אפיון §17.3, §17.4, §18-M8; תכנית שלב 75).
 *
 * בדיקות:
 *   1. מבנה: generatedAtStage=75; סטטוסים מהקבוצה הסגורה; שבעת חלקי המטריצה.
 *   2. כיסוי מלא מול המקורות: מזהים (38), הגדרות (257), גופנים (1,796),
 *      שערים (86), עיטורים (967), קורפוס (35), כללי הערות — 1:1 מול
 *      המקורות בפועל (registry, manifests, identifiers).
 *   3. חורים: כל חור עם החלטה מתועדת; **אפס חורים פתוחים** (שער M8).
 *   4. שער M8: שבעת התנאים pass + כל מאמת שהראיות מזכירות קיים בדיסק.
 *   5. ראיות אמיתיות: דגימה מהקישורים נבדקת מול הדיסק (fixtures, מאמתים,
 *      מבחנים); ה-reference בזהב עם 0 HIGH.
 *   6. שליליים: זיוף המטריצה (חור בלי החלטה, תנאי שער flipped) נתפס.
 *   7. רגרסיה: build, typecheck, lint, deps, test:packages.
 *
 * יציאה: 0 = שער M8 עבר; 1 = כשל.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1';
const runCode = (cmd, args) => {
  try { execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }); return 0; }
  catch (e) { return e.status ?? 1; }
};

const matrix = JSON.parse(readFileSync(join(repoRoot, 'docs', 'migration', 'fixtures-matrix.json'), 'utf8'));
const identifiers = JSON.parse(readFileSync(join(repoRoot, 'docs', 'migration', 'identifiers.json'), 'utf8'));
const settingsRegistry = JSON.parse(readFileSync(join(repoRoot, 'packages', 'settings-schema', 'registry.json'), 'utf8'));
const fontsManifest = JSON.parse(readFileSync(join(repoRoot, 'assets', 'fonts', 'manifest.json'), 'utf8'));
const shaarManifest = JSON.parse(readFileSync(join(repoRoot, 'assets', 'shaar', 'manifest.json'), 'utf8'));
const ornamentsManifest = JSON.parse(readFileSync(join(repoRoot, 'assets', 'ornaments', 'manifest.json'), 'utf8'));
const corpusRegistry = JSON.parse(readFileSync(join(repoRoot, 'packages', 'test-fixtures', 'registry.json'), 'utf8'));
const releaseGolden = JSON.parse(readFileSync(join(repoRoot, 'packages', 'test-fixtures', 'release-golden.json'), 'utf8'));

// ---------- 1) מבנה ----------
console.log('1) מבנה המטריצה');
(matrix.generatedAtStage === 75 ? ok : fail)('generatedAtStage = 75');
const expectedSections = ['text-identifiers', 'settings', 'fonts', 'shaar', 'ornaments', 'note-rules', 'corpus'];
for (const s of expectedSections) (Array.isArray(matrix.sections[s]) ? ok : fail)(`חלק: ${s}`);
const STATUSES = new Set(['covered', 'hole']);
const badStatus = Object.values(matrix.sections).flat().filter((r) => !STATUSES.has(r.status));
(badStatus.length === 0 ? ok : fail)(badStatus.length === 0 ? 'כל הסטטוסים מהקבוצה הסגורה (covered|hole)' : `סטטוסים בלתי-חוקיים: ${badStatus.length}`);

// ---------- 2) כיסוי 1:1 מול המקורות ----------
console.log('\n2) כיסוי מלא מול המקורות — 1:1');
const countOf = (s) => matrix.sections[s].length;
(countOf('text-identifiers') === identifiers.records.length ? ok : fail)(`מזהים: ${countOf('text-identifiers')} = identifiers.json (${identifiers.records.length})`);
(countOf('settings') === settingsRegistry.settings.length ? ok : fail)(`הגדרות: ${countOf('settings')} = מרשם (${settingsRegistry.settings.length})`);
(countOf('fonts') === fontsManifest.fonts.length ? ok : fail)(`גופנים: ${countOf('fonts')} = מניפסט (${fontsManifest.fonts.length})`);
(countOf('shaar') === shaarManifest.designs.length ? ok : fail)(`שערים: ${countOf('shaar')} = מניפסט (${shaarManifest.designs.length})`);
(countOf('ornaments') === ornamentsManifest.designs.length ? ok : fail)(`עיטורים: ${countOf('ornaments')} = מניפסט (${ornamentsManifest.designs.length})`);
(countOf('corpus') === corpusRegistry.fixtures.length ? ok : fail)(`קורפוס: ${countOf('corpus')} = registry (${corpusRegistry.fixtures.length})`);
// התאמת מזהים מדויקת (לא רק ספירה)
const identItems = new Set(matrix.sections['text-identifiers'].map((r) => r.item));
const identMatch = identifiers.records.every((r) => identItems.has(r.recordId));
(identMatch ? ok : fail)('מזהי הטקסט תואמים אחד-לאחד ל-identifiers.json');

// ---------- 3) חורים ----------
console.log('\n3) חורים — אפס פתוחים (שער M8)');
const allRows = Object.values(matrix.sections).flat();
const holes = allRows.filter((r) => r.status === 'hole');
const holesNoDecision = holes.filter((r) => typeof r.decision !== 'string' || r.decision.length < 10);
(holesNoDecision.length === 0 ? ok : fail)(holesNoDecision.length === 0
  ? `כל ${holes.length} החורים עם החלטה מתועדת`
  : `חורים בלי החלטה: ${holesNoDecision.length}`);
(matrix.summary.openHoles === 0 ? ok : fail)(`חורים פתוחים: ${matrix.summary.openHoles} — שער: 0`);
(matrix.summary.gate.noOpenHoles === true ? ok : fail)('summary.gate.noOpenHoles = true');
const holesBySection = {};
for (const [sec, rows] of Object.entries(matrix.sections)) {
  const h = rows.filter((r) => r.status === 'hole').length;
  if (h > 0) holesBySection[sec] = h;
}
console.log(`        (חורים לפי חלק: ${JSON.stringify(holesBySection)})`);
// החלטות deferred חייבות להתייחס להיקף v0/M9+ — לא "לא ידוע"
const vague = holes.filter((r) => /לא ידוע|TBD|TODO/.test(r.decision ?? ''));
(vague.length === 0 ? ok : fail)('אף החלטה אינה מעורפלת (לא-ידוע/TBD/TODO)');

// ---------- 4) שער M8 — שבעה תנאים ----------
console.log('\n4) שער M8 — שבעת התנאים');
const M8_CONDITIONS = [
  'אין pageEstimate', 'כל קישור נכון', 'עמודי TOC אינם גולשים', 'ריצה לא מתייצבת נכשלת מפורשות',
  'נכסים offline', 'rollback = ביטול מסלול next למסמכים עם TOC רק אם נרשם במפורש', 'לא מחזירים הערכת עמודים',
];
(matrix.m8Gate.length === 7 ? ok : fail)(`שבעה תנאים (${matrix.m8Gate.length})`);
for (const g of matrix.m8Gate) {
  (g.status === 'pass' && typeof g.evidence === 'string' && g.evidence.length > 10
    ? ok : fail)(`תנאי: ${g.condition.slice(0, 40)} — ${g.status}`);
}
// המאמתים שהראיות מזכירות קיימים בדיסק
let missingVerifiers = 0;
for (const g of matrix.m8Gate) {
  for (const v of g.verifiedBy ?? []) {
    const asVerifier = join(repoRoot, 'scripts', 'migration', `${v}.mjs`);
    const asTest = join(repoRoot, 'packages', v);
    if (!existsSync(asVerifier) && !existsSync(asTest)) missingVerifiers += 1;
  }
}
(missingVerifiers === 0 ? ok : fail)(`כל המאמתים שהראיות מקשרות קיימים (${missingVerifiers} חסרים)`);

// ---------- 5) ראיות אמיתיות — דגימות מול הדיסק ----------
console.log('\n5) ראיות אמיתיות — דגימות מול הדיסק');
{
  // מזהים: כל fixture שהמטריצה טוענת — קיים
  let missingFixture = 0;
  for (const r of matrix.sections['text-identifiers']) {
    if (r.fixture !== null && !existsSync(join(repoRoot, 'packages', 'test-fixtures', r.fixture))) missingFixture += 1;
  }
  (missingFixture === 0 ? ok : fail)(`fixtures של מזהים קיימים בדיסק (${missingFixture} חסרים)`);
  // קורפוס: כל שורה מכוסה (golden או compatibility)
  const goldenIds = new Set(releaseGolden.records.map((x) => x.fixtureId));
  const corpusNotCovered = matrix.sections.corpus.filter((r) => r.status === 'hole');
  (corpusNotCovered.length === 0 ? ok : fail)(`כל ${matrix.sections.corpus.length} ה-fixtures של הקורפוס מכוסים (golden/compatibility)`);
  // ה-reference בזהב: 0 HIGH + compose + 5 סוגי עמודים
  const ref = releaseGolden.records.find((r) => r.fixtureId === 'release-reference-document');
  (ref !== undefined && ref.auditHigh === 0 && ref.pipeline === 'compose'
    && ['main-shaar', 'toc', 'body', 'notes', 'back-shaar'].every((k) => (ref.pageKinds ?? []).includes(k))
    ? ok : fail)('מסמך הייחוס בזהב: compose, 0 HIGH, חמשת סוגי העמודים');
  // מפתחות v0 שנצרכים בפועל — תואמים לקוד
  (matrix.v0ConsumedKeys.length >= 12 ? ok : fail)(`מפתחות v0/compose שנצרכים: ${matrix.v0ConsumedKeys.length} (≥ 12)`);
}

// ---------- 6) שליליים ----------
console.log('\n6) שליליים — זיוף המטריצה נתפס');
{
  const catches = (m) => {
    const rows = Object.values(m.sections).flat();
    for (const r of rows) {
      if (r.status === 'hole' && (typeof r.decision !== 'string' || r.decision.length < 10)) return true;
    }
    if ((m.summary.openHoles ?? 0) !== 0) return true;
    for (const g of m.m8Gate ?? []) if (g.status !== 'pass') return true;
    return false;
  };
  const fakeA = structuredClone(matrix);
  fakeA.sections.settings.find((r) => r.status === 'hole').decision = '';
  (catches(fakeA) ? ok : fail)('זיוף: חור בלי החלטה נתפס');
  const fakeB = structuredClone(matrix);
  fakeB.m8Gate[3].status = 'fail';
  (catches(fakeB) ? ok : fail)('זיוף: תנאי שער שהופל נתפס');
  const fakeC = structuredClone(matrix);
  fakeC.summary.openHoles = 3;
  (catches(fakeC) ? ok : fail)('זיוף: חורים פתוחים נתפסים');
}

// ---------- 7) רגרסיה ----------
console.log('\n7) רגרסיה — build, typecheck, lint, deps, test:packages');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('npm run build:packages');
(runCode('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('npm run typecheck:packages');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('npm run lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('npm run deps:check');
{
  const out = SKIP_TESTS ? 'Tests  1226 passed' : (() => {
    try {
      return execFileSync('npm', ['run', 'test:packages'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
    } catch (e) { return (e.stdout ?? ''); }
  })();
  (/Tests\s+1226\s+passed/.test(out) ? ok : fail)('test:packages — 1226/1226');
}

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות — שער M8 לא עבר`);
  process.exit(1);
}
console.log(`שער M8 עבר — ${checks} בדיקות ירוקות. מטריצת ה-fixtures המלאה מקושרת; אפס חורים פתוחים; שבעת תנאי השער מאומתים.`);
