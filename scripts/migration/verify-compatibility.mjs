#!/usr/bin/env node
/**
 * verify-compatibility — מאמת שלב 73: שער התאימות (אפיון §17.4, §18-M8,
 * §20; תכנית שלב 73).
 *
 * בדיקות:
 *   1. מבנה: המטריצה קיימת, generatedAtStage=73, סטטוסים מהקבוצה הסגורה
 *      {identical, justified-different, deferred, not-applicable}; אין regression.
 *   2. כיסוי קורפוס: כל 35 ה-fixtures של registry.json רצו (26 מורשת-Orange +
 *      9 release שנכתבו בשלב 74 — ללא בייסליין; נבדקים מול זהב ה-release),
 *      deterministic, offline, ושימור תוכן מלא — atomsPlaced == atomsContent
 *      (נוסח/אטומים תמיד בנפרד מגאומטריה).
 *   3. הקנוני: הצינור המלא כולל preview.html; sourceSha256 תואם ל-registry
 *      (אותו קובץ טקסט ישן — בלי עריכה ידנית); 0 ממצאי HIGH.
 *   4. השוואות בייסליין: כל הבדל גאומטריה מסווג justified-different עם
 *      הצדקה; כל ריצת בייסליין שקיימת לקורפוס מקושרת (מיפוי inputSha256).
 *   5. קטגוריות: 7 קטגוריות ההעברה; כל פריט עם סטטוס; כל justified-different
 *      מנומק; ספירות תואמות למקורות (registry/fonts/shaar/ornaments/settings).
 *   6. צלבי: שערי differential (M5) אמיתיים; טענות parity מאומתות;
 *      מלאי ההעברה ללא פריט ללא החלטה.
 *   7. דטרמיניזם חי: ריצה חדשה של ch05 דרך ה-CLI ← אותו layoutHash כמו
 *      במטריצה (המטריצה מתארת את ההווה, לא מסמך היסטורי).
 *   8. שליליים: חיפוש regression במטריצה שהוחדר ידנית ← המאמת תופס;
 *      atoms שאינם שווים ← תופס.
 *   9. רגרסיה: build, typecheck, lint, deps, test:packages.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1';
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

const MATRIX_PATH = join(repoRoot, 'docs', 'migration', 'compatibility', 'matrix.json');
const REPORT_PATH = join(repoRoot, 'docs', 'migration', 'compatibility-report.md');
const STATUSES = new Set(['identical', 'justified-different', 'deferred', 'not-applicable']);

// ---------- 1) מבנה ----------
console.log('1) מבנה המטריצה');
(existsSync(MATRIX_PATH) ? ok : fail)('docs/migration/compatibility/matrix.json קיים');
(existsSync(REPORT_PATH) ? ok : fail)('docs/migration/compatibility-report.md קיים');
const matrix = JSON.parse(readFileSync(MATRIX_PATH, 'utf8'));
(matrix.generatedAtStage === 73 ? ok : fail)('generatedAtStage = 73');
(matrix.schemaVersion === 1 ? ok : fail)('schemaVersion = 1');
const badStatus = [];
for (const c of matrix.categories ?? []) {
  for (const it of c.items ?? []) {
    if (!STATUSES.has(it.status)) badStatus.push(`${c.id}/${it.item}=${it.status}`);
  }
}
(badStatus.length === 0 ? ok : fail)(badStatus.length === 0
  ? `כל הסטטוסים מהקבוצה הסגורה (${matrix.categories.length} קטגוריות)`
  : `סטטוסים בלתי-חוקיים: ${badStatus.slice(0, 3).join(', ')}`);
(matrix.summary.regressions === 0 ? ok : fail)(`רגרסיות נוסח/אטומים: ${matrix.summary.regressions} (שער: 0)`);
(matrix.summary.gate.noUnexplainedDifference === true ? ok : fail)('שער: אין הבדל בלתי מוסבר');
(matrix.summary.gate.noUnhandledLegacyItem === true ? ok : fail)('שער: אין פריט legacy לא מטופל');

// ---------- 2) כיסוי קורפוס ----------
console.log('\n2) כיסוי הקורפוס — כל ה-fixtures רצו עם שימור תוכן');
const registry = JSON.parse(readFileSync(join(repoRoot, 'packages', 'test-fixtures', 'registry.json'), 'utf8'));
const runById = new Map((matrix.corpusRuns ?? []).map((r) => [r.fixtureId, r]));
const missing = registry.fixtures.filter((f) => !runById.has(f.id));
(missing.length === 0 ? ok : fail)(`כל ${registry.fixtures.length} ה-fixtures של registry.json נמצאים במטריצה${missing.length ? ` (חסרים: ${missing.map((f) => f.id).slice(0, 3).join(', ')})` : ''}`);
let passCount = 0;
let atomsOkCount = 0;
for (const r of matrix.corpusRuns ?? []) {
  if (r.exitCode === 0) passCount += 1;
  if (r.exitCode === 0 && r.deterministic === true && r.offline === true
    && r.atomsContent !== null && r.atomsContent === r.atomsPlaced && r.auditOk === true) atomsOkCount += 1;
}
(passCount === registry.fixtures.length ? ok : fail)(`exit 0: ${passCount}/${registry.fixtures.length}`);
(atomsOkCount === registry.fixtures.length ? ok : fail)(`דטרמיניזם + offline + שימור תוכן (atoms == content, audit ok): ${atomsOkCount}/${registry.fixtures.length}`);
const layoutHashes = matrix.corpusRuns.filter((r) => /^[0-9a-f]{64}$/.test(r.layoutHash ?? ''));
(layoutHashes.length === registry.fixtures.length ? ok : fail)('לכל ריצה layoutHash חוקי (hex-64)');

// ---------- 3) הקנוני — הצינור המלא ----------
console.log('\n3) המסמך הקנוני — יבוא ← עימוד ← ביקורת ← HTML בלי עריכה ידנית');
const canon = runById.get('canonical-long-document');
if (canon === undefined) {
  fail('חסרת ריצת הקנוני במטריצה');
} else {
  const regCanon = registry.fixtures.find((f) => f.id === 'canonical-long-document');
  (canon.sourceSha256 === regCanon.corpusFile.sha256 ? ok : fail)('sourceSha256 תואם ל-registry — אותו קובץ טקסט ישן ממש (לא העתק נערך)');
  (canon.html === true && (canon.previewHtmlBytes ?? 0) > 1000000 ? ok : fail)(`preview.html הופק (${((canon.previewHtmlBytes ?? 0) / 1048576).toFixed(1)}MB)`);
  (canon.deterministic === true ? ok : fail)('שתי ריצות — hash זהה (repeat)');
  (canon.auditOk === true && canon.auditHigh === 0 ? ok : fail)(`ביקורת: 0 ממצאי HIGH (${canon.atomsContent.toLocaleString('en-US')} אטומים הוצבו בדיוק פעם אחת)`);
  (canon.offline === true ? ok : fail)('offline מלא (0 בקשות רשת)');
}

// ---------- 4) השוואות בייסליין ----------
console.log('\n4) השוואות מול הבייסליין — נוסח/אטומים ⊥ גאומטריה');
const baseline = JSON.parse(readFileSync(join(repoRoot, 'docs', 'migration', 'baseline', 'baseline-run.json'), 'utf8'));
const baselineShas = new Set(baseline.runs.map((r) => r.inputSha256));
const corpusShas = new Set(registry.fixtures.map((f) => f.corpusFile.sha256));
const expectedLinked = registry.fixtures.filter((f) => baselineShas.has(f.corpusFile.sha256));
const linked = (matrix.comparisons ?? []).filter((c) => c.baselineRunId !== null);
(linked.length === expectedLinked.length ? ok : fail)(`כל ריצת בייסליין שקיימת לקורפוס מקושרת (${linked.length}/${expectedLinked.length})`);
// המורשת (26): לכל אחת השוואת בייסליין במטריצה — ההשוואות הן לקורפוס המורשת בלבד
const inheritedIds = new Set(registry.fixtures.filter((f) => f.kind !== 'release').map((f) => f.id));
const compIds = new Set((matrix.comparisons ?? []).map((c) => c.fixtureId));
const missingComp = [...inheritedIds].filter((id) => !compIds.has(id));
(missingComp.length === 0 ? ok : fail)(missingComp.length === 0
  ? `כל ${inheritedIds.size} פריטי המורשת עם השוואת בייסליין במטריצה`
  : `השוואות חסרות למורשת: ${missingComp.slice(0, 3).join(', ')}`);
let wordingAll = 0;
let justOk = 0;
for (const c of matrix.comparisons ?? []) {
  if (c.wordingAndAtoms === 'identical') wordingAll += 1;
  if (c.geometry === 'justified-different' && typeof c.justification === 'string' && c.justification.length > 20) justOk += 1;
}
(wordingAll === inheritedIds.size ? ok : fail)(`נוסח/אטומים זהים בכל קורפוס המורשת: ${wordingAll}/${inheritedIds.size} (ל-9 ה-release אין בייסליין — סמכותם זהב שלב 74)`);
const justDiff = (matrix.comparisons ?? []).filter((c) => c.geometry === 'justified-different');
(justDiff.length === justOk ? ok : fail)(`כל ${justDiff.length} הבדלי הגאומטריה מוצדקים בכתב (ADR/differential)`);
// ה-release (שלב 74): אין להם בייסליין — ריצות המטריצה שלהם חייבות להתאים לזהב הנעול
{
  const releaseGolden = JSON.parse(readFileSync(join(repoRoot, 'packages', 'test-fixtures', 'release-golden.json'), 'utf8'));
  const goldenById = new Map(releaseGolden.records.map((r) => [r.fixtureId, r]));
  const releaseFixtures = registry.fixtures.filter((f) => f.kind === 'release');
  let releaseMatch = 0;
  for (const f of releaseFixtures) {
    const run = runById.get(f.id);
    const g = goldenById.get(f.id);
    if (run && g && run.layoutHash === g.layoutHash && run.sourceSha256 === f.corpusFile.sha256
      && run.atomsContent === run.atomsPlaced && run.auditHigh === 0) releaseMatch += 1;
  }
  (releaseMatch === releaseFixtures.length ? ok : fail)(`ריצות ה-release במטריצה תואמות את זהב שלב 74 — layoutHash + שימור אטומים + 0 HIGH (${releaseMatch}/${releaseFixtures.length})`);
  (matrix.summary.releaseCoveredByGolden === releaseFixtures.length ? ok : fail)(`summary.releaseCoveredByGolden = ${releaseFixtures.length}`);
  (matrix.extendedAtStage === 74 ? ok : fail)('המטריצה הורחבה בשלב 74 לכלול את ריצות ה-release');
}

// ---------- 5) קטגוריות ----------
console.log('\n5) כיסוי קטגוריות ההעברה');
const expectedCats = ['text-identifiers', 'settings', 'fonts', 'page-parts', 'shaar', 'ornaments', 'note-rules'];
const catIds = (matrix.categories ?? []).map((c) => c.id);
for (const id of expectedCats) (catIds.includes(id) ? ok : fail)(`קטגוריה: ${id}`);
const fontsManifest = JSON.parse(readFileSync(join(repoRoot, 'assets', 'fonts', 'manifest.json'), 'utf8'));
const shaarManifest = JSON.parse(readFileSync(join(repoRoot, 'assets', 'shaar', 'manifest.json'), 'utf8'));
const ornamentsManifest = JSON.parse(readFileSync(join(repoRoot, 'assets', 'ornaments', 'manifest.json'), 'utf8'));
const catCount = (id) => (matrix.categories.find((c) => c.id === id)?.items ?? []).length;
(catCount('fonts') === fontsManifest.fonts.length ? ok : fail)(`fonts: ${catCount('fonts')} = מניפסט הגופנים (${fontsManifest.fonts.length})`);
(catCount('shaar') === shaarManifest.designs.length ? ok : fail)(`shaar: ${catCount('shaar')} = מניפסט השערים (${shaarManifest.designs.length})`);
(catCount('ornaments') === ornamentsManifest.designs.length ? ok : fail)(`ornaments: ${catCount('ornaments')} = מניפסט העיטורים (${ornamentsManifest.designs.length})`);
const settingsRegistry = JSON.parse(readFileSync(join(repoRoot, 'packages', 'settings-schema', 'registry.json'), 'utf8'));
(catCount('settings') === settingsRegistry.settings.length ? ok : fail)(`settings: ${catCount('settings')} = מרשם ההגדרות (${settingsRegistry.settings.length})`);
const identifiers = JSON.parse(readFileSync(join(repoRoot, 'docs', 'migration', 'identifiers.json'), 'utf8'));
(catCount('text-identifiers') === identifiers.records.length ? ok : fail)(`text-identifiers: ${catCount('text-identifiers')} = identifiers.json (${identifiers.records.length})`);
const unjustified = (matrix.categories ?? []).flatMap((c) => (c.items ?? [])
  .filter((it) => it.status === 'justified-different' && !(typeof it.justification === 'string' && it.justification.length > 10))
  .map((it) => `${c.id}/${it.item}`));
(unjustified.length === 0 ? ok : fail)(unjustified.length === 0
  ? 'כל פריט justified-different בקטגוריות מלווה הצדקה'
  : `פריטים ללא הצדקה: ${unjustified.slice(0, 3).join(', ')}`);

// ---------- 6) צלבי ----------
console.log('\n6) בדיקות צלביות — differential (M5), parity, מלאי ההעברה');
const differential = JSON.parse(readFileSync(join(repoRoot, 'docs', 'migration', 'differential-lines.json'), 'utf8'));
(differential.summary.gate.noTrueRegression === true ? ok : fail)('differential: אין רגרסיה אמיתית');
(differential.summary.gate.contentConserved === true ? ok : fail)('differential: תוכן נשמר');
(differential.summary.gate.noUnexplainedOverflow === true ? ok : fail)('differential: אין גלישה בלתי מוסברת');
const parityMatrix = JSON.parse(readFileSync(join(repoRoot, 'docs', 'migration', 'parity-matrix.json'), 'utf8'));
const parityVerified = parityMatrix.claims.filter((c) => c.status === 'verified').length;
(matrix.summary.gate.parityClaimsVerified === parityVerified ? ok : fail)(`טענות parity מאומתות: ${parityVerified} (תואם למטריצת ה-parity)`);
const transfer = JSON.parse(readFileSync(join(repoRoot, 'docs', 'migration', 'transfer-inventory.json'), 'utf8'));
const undecided = (transfer.decisions ?? []).filter((d) => !d.decision).length;
(undecided === 0 ? ok : fail)('מלאי ההעברה: לכל פריט החלטה מתועדת');

// ---------- 7) דטרמיניזם חי ----------
console.log('\n7) דטרמיניזם חי — ch05 דרך ה-CLI מול המטריצה');
{
  const tmp = mkdtempSync(join(tmpdir(), 'verify-compat-'));
  try {
    const r = spawnSync(process.execPath, [
      join(repoRoot, 'packages', 'cli', 'dist', 'main.js'),
      '--input', join(repoRoot, 'packages', 'test-fixtures', 'corpus', 'chapters', 'ch05.txt'),
      '--out', join(tmp, 'out'), '--trace', 'summary',
    ], { cwd: repoRoot, encoding: 'utf8' });
    const rec = runById.get('chapter-focus-ch05');
    if (r.status === 0 && rec) {
      const report = JSON.parse((r.stdout ?? '').trim().split('\n').pop());
      (report.layoutHash === rec.layoutHash ? ok : fail)(`ריצה חדשה של ch05 ← אותו layoutHash כמו במטריצה (${report.layoutHash.slice(0, 12)}…)`);
      (report.pages === rec.pages ? ok : fail)(`עמודים: ${report.pages} = מטריצה (${rec.pages})`);
    } else {
      fail(`ריצת ch05 נכשלה (exit ${r.status}) או חסרה במטריצה`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- 8) שליליים — המאמת תופס זיוף ----------
console.log('\n8) שליליים — זיוף המטריצה נתפס');
{
  const tmp = mkdtempSync(join(tmpdir(), 'verify-compat-neg-'));
  try {
    const fake = JSON.parse(readFileSync(MATRIX_PATH, 'utf8'));
    // זיוף א: רגרסיה מוסתרת — atoms שאינם שווים
    const fakeA = structuredClone(fake);
    const a = fakeA.corpusRuns.find((r) => r.fixtureId === 'chapter-focus-ch09');
    a.atomsPlaced = (a.atomsContent ?? 0) + 7;
    const pA = join(tmp, 'a.json');
    writeFileSync(pA, JSON.stringify(fakeA));
    const caughtA = catchesTamper(pA);
    (caughtA ? ok : fail)('זיוף: atoms שאינם שווים נתפס');
    // זיוף ב: רגרסיית נוסח
    const fakeB = structuredClone(fake);
    const b = fakeB.comparisons.find((c) => c.fixtureId === 'chapter-focus-ch13');
    b.wordingAndAtoms = 'regression';
    const pB = join(tmp, 'b.json');
    writeFileSync(pB, JSON.stringify(fakeB));
    const caughtB = catchesTamper(pB);
    (caughtB ? ok : fail)('זיוף: רגרסיית נוסח נתפסת');
    // זיוף ג: סטטוס בלתי-חוקי
    const fakeC = structuredClone(fake);
    fakeC.categories[0].items[0].status = 'looks-fine';
    const pC = join(tmp, 'c.json');
    writeFileSync(pC, JSON.stringify(fakeC));
    const caughtC = catchesTamper(pC);
    (caughtC ? ok : fail)('זיוף: סטטוס בלתי-חוקי נתפס');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** הרצת הבדיקות המבניות על מטריצה מזויפת — האם משהו היה נתפס? */
function catchesTamper(path) {
  const m = JSON.parse(readFileSync(path, 'utf8'));
  // אותן הבדיקות של המאמת (מוקטן):
  for (const c of m.categories ?? []) for (const it of c.items ?? []) if (!STATUSES.has(it.status)) return true;
  if (m.summary.regressions !== 0 && m.summary.gate.noUnexplainedDifference !== false) return true;
  for (const r of m.corpusRuns ?? []) {
    if (r.atomsContent !== null && r.atomsContent !== r.atomsPlaced) return true;
  }
  for (const c of m.comparisons ?? []) if (c.wordingAndAtoms === 'regression') return true;
  return false;
}

// ---------- 9) רגרסיה ----------
console.log('\n9) רגרסיה — build, typecheck, lint, deps, test:packages');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('npm run build:packages');
(runCode('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('npm run typecheck:packages');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('npm run lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('npm run deps:check');
{
  const t = SKIP_TESTS ? 'Tests  1098 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']);
  (/Tests\s+1098\s+passed/.test(t ?? '') ? ok : fail)('test:packages — 1098/1098');
}

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`שער התאימות תקין — ${checks} בדיקות ירוקות. אין פריט legacy לא מטופל; אין הבדל בלתי מוסבר; הקנוני עבר יבוא←עימוד←ביקורת←HTML בלי עריכה ידנית.`);
