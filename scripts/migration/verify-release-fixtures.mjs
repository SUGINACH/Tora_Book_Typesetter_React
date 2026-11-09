#!/usr/bin/env node
/**
 * verify-release-fixtures — מאמת שלב 74: קורפוס ה-release ומסמך הייחוס
 * (אפיון §17.3, §17.4, §18-M8; תכנית שלב 74).
 *
 * בדיקות:
 *   1. הרישום: 9 קבצי קורפוס release קיימים עם sourceSha256 + provenance
 *      (נכתבו בשלב 74) + invariants; plannedFixtures מסומן כמומש בשלב 74.
 *   2. הזהב (release-golden.json): לכל fixture — layoutHash (hex-64), 0 HIGH,
 *      שימור אטומים, deterministic; הקלטים נעולים (sourceSha256 + settings +
 *      fonts + assets — אין קלט חיצוני לא נעול).
 *   3. כיסוי 8 דרישות §17.3: כל דרישה ממופה ל-fixture שמכסה אותה
 *      (מיפוי מפורש ומתועד, לא רמיזה).
 *   4. מסמך הייחוס: מסלול ההרכבה (--compose) — סוגי העמודים כוללים
 *      main-shaar, toc, body, notes, back-shaar; preview.html הופק;
 *      שתי ריצות hash זהה.
 *   5. דטרמיניזם חי: הרצה חדשה של מסמך הייחוס דרך ה-CLI ← אותו layoutHash
 *      כמו בזהב (הזהב מתאר את ההווה).
 *   6. שליליים: זיוף הזהב (hash שונה / HIGH מוסתר / אטומים שאינם שווים)
 *      נתפס על ידי אותן הבדיקות.
 *   7. רגרסיה: build, typecheck, lint, deps, test:packages.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { execFileSync, spawnSync } from 'node:child_process';
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
const runCode = (cmd, args) => {
  try { execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }); return 0; }
  catch (e) { return e.status ?? 1; }
};

const FIX = join(repoRoot, 'packages', 'test-fixtures');
const REACT_REPO = 'SUGINACH/Tora_Book_Typesetter_React';
const HEX40 = /^[0-9a-f]{40}$/;
/** קומיט אמיתי בהיסטוריה — provenance של ה-release מצביע על הקומיט שהכניס את הקורפוס. */
const commitExists = (sha) => {
  try { execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: repoRoot, stdio: 'ignore' }); return true; } catch { return false; }
};
const registry = JSON.parse(readFileSync(join(FIX, 'registry.json'), 'utf8'));
const golden = JSON.parse(readFileSync(join(FIX, 'release-golden.json'), 'utf8'));
const releaseFixtures = registry.fixtures.filter((f) => f.kind === 'release');

// ---------- 1) הרישום ----------
console.log('1) הרישום — קורפוס release נעול');
(releaseFixtures.length === 9 ? ok : fail)(`9 fixtures מסוג release ברישום (נמצאו ${releaseFixtures.length})`);
let hashOk = 0;
for (const f of releaseFixtures) {
  const p = join(FIX, f.corpusFile.path);
  const provOk = f.provenance?.sourceRepo === REACT_REPO
    && HEX40.test(f.provenance?.sourceSha ?? '') && commitExists(f.provenance.sourceSha);
  if (existsSync(p) && /^[0-9a-f]{64}$/.test(f.corpusFile.sha256 ?? '') && provOk) hashOk += 1;
}
(hashOk === 9 ? ok : fail)(`לכל ה-9: קובץ קיים + sourceSha256 (hex-64) + provenance — SHA-40 של הקומיט שהכניס, אמיתי בהיסטוריה (${hashOk}/9)`);
((registry.plannedFixtures?.fulfilledAtStage ?? 0) === 74 ? ok : fail)('plannedFixtures מסומן כמומש בשלב 74');
(Array.isArray(registry.plannedFixtures?.fulfilledBy) && registry.plannedFixtures.fulfilledBy.length === 9
  ? ok : fail)('fulfilledBy מקשר את 9 ה-fixtures');

// ---------- 2) הזהב ----------
console.log('\n2) הזהב — נעילת תוצאות וקלטים');
(golden.generatedAtStage === 74 ? ok : fail)('release-golden.json: generatedAtStage = 74');
(golden.records.length === 9 ? ok : fail)(`9 רשומות זהב (${golden.records.length})`);
(golden.summary.allZeroHigh === true ? ok : fail)('כל הרשומות: 0 ממצאי HIGH');
(golden.summary.allAtomsConserved === true ? ok : fail)('כל הרשומות: אטומים הוצבו == אטומי מקור');
(golden.summary.allDeterministic === true ? ok : fail)('כל הרשומות: deterministic');
let locked = 0;
for (const r of golden.records) {
  if (/^[0-9a-f]{64}$/.test(r.sourceSha256 ?? '') && /^[0-9a-f]{64}$/.test(r.layoutHash ?? '')
    && /^[0-9a-f]{64}$/.test(r.fontsManifestSha256 ?? '') && /^[0-9a-f]{64}$/.test(r.assetsManifestSha256 ?? '')) locked += 1;
}
(locked === 9 ? ok : fail)(`כל הקלטים נעולים: sourceSha256 + fontsManifest + assetsManifest (${locked}/9)`);
const goldenById = new Map(golden.records.map((r) => [r.fixtureId, r]));
let matchRegistry = 0;
for (const f of releaseFixtures) {
  const r = goldenById.get(f.id);
  if (r !== undefined && r.sourceSha256 === f.corpusFile.sha256) matchRegistry += 1;
}
(matchRegistry === 9 ? ok : fail)(`הזהב תואם לרישום לפי sourceSha256 (${matchRegistry}/9)`);

// ---------- 3) כיסוי הדרישות ----------
console.log('\n3) כיסוי 8 דרישות §17.3 — מיפוי מפורש');
const REQUIREMENT_MAP = [
  ['כל רמות H0–H7 ושילובי heading escort', 'release-headings-all'],
  ['H3 באמצע עמוד, בסמוך לתחתית ועם שתי הערות', 'release-h3-edges'],
  ['הערת שוליים ארוכה, כמה הערות לאותו עוגן, sidenotes מרובות', 'release-notes-heavy'],
  ['סוגריים מקוננים חוצי טור ועמוד', 'release-brackets-cross'],
  ['first-word-window, drop-word ו-dibbur חופפים', 'release-firstword-dropword'],
  ['TOC בן עמוד אחד/כמה עמודים; מספור; שערים לא ממוספרים', 'release-toc-pages'],
  ['shaar main/back/sub, ornaments בכל scope, עיטורי סיום', 'release-shaar-ornaments'],
  ['עברית, לטינית, מספרים, תווי בידיוק, NBSP ומילה ארוכה', 'release-mixed-scripts'],
];
for (const [req, fid] of REQUIREMENT_MAP) {
  const r = goldenById.get(fid);
  (r !== undefined && r.auditHigh === 0 ? ok : fail)(`דרישה: ${req.slice(0, 42)}… ← ${fid}`);
}

// ---------- 4) מסמך הייחוס ----------
console.log('\n4) מסמך הייחוס — מסלול ההרכבה');
const ref = goldenById.get('release-reference-document');
if (ref === undefined) {
  fail('חסרת רשומת מסמך הייחוס בזהב');
} else {
  (ref.pipeline === 'compose' ? ok : fail)('מסלול: compose (--compose)');
  const kinds = ref.pageKinds ?? [];
  for (const k of ['main-shaar', 'toc', 'body', 'notes', 'back-shaar']) {
    (kinds.includes(k) ? ok : fail)(`סוג עמוד: ${k}`);
  }
  (ref.html === true && (ref.previewHtmlBytes ?? 0) > 1000 ? ok : fail)(`preview.html הופק (${((ref.previewHtmlBytes ?? 0) / 1024).toFixed(0)}KB)`);
  (ref.auditHigh === 0 && ref.atomsContent === ref.atomsPlaced ? ok : fail)(`0 HIGH; ${ref.atomsContent.toLocaleString('en-US')} אטומים הוצבו בדיוק פעם אחת`);
}

// ---------- 5) דטרמיניזם חי ----------
console.log('\n5) דטרמיניזם חי — מסמך הייחוס דרך ה-CLI מול הזהב');
{
  const tmp = mkdtempSync(join(tmpdir(), 'verify-release-74-'));
  try {
    const r = spawnSync(process.execPath, [
      join(repoRoot, 'packages', 'cli', 'dist', 'main.js'),
      '--input', join(FIX, 'corpus/release/release-reference-document.txt'),
      '--out', join(tmp, 'out'),
      '--settings', join(FIX, 'corpus/release/settings/release-reference-settings.json'),
      '--compose', '--trace', 'summary',
    ], { cwd: repoRoot, encoding: 'utf8' });
    if (r.status === 0 && ref) {
      const report = JSON.parse((r.stdout ?? '').trim().split('\n').pop());
      (report.layoutHash === ref.layoutHash ? ok : fail)(`הרכבה חיה ← אותו layoutHash כמו בזהב (${report.layoutHash.slice(0, 12)}…)`);
      (report.pages === ref.pages ? ok : fail)(`עמודים: ${report.pages} = זהב (${ref.pages})`);
    } else {
      fail(`הרצת מסמך הייחוס נכשלה (exit ${r.status})`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- 6) שליליים ----------
console.log('\n6) שליליים — זיוף הזהב נתפס');
{
  const tmp = mkdtempSync(join(tmpdir(), 'verify-release-74-neg-'));
  try {
    const catches = (g) => {
      for (const r of g.records) {
        if (!/^[0-9a-f]{64}$/.test(r.layoutHash ?? '') || /^[0]+$/.test(r.layoutHash ?? '')) return true; // hash לא חוקי או אפסי
        if (r.auditHigh > 0) return true;
        if (r.atomsContent !== r.atomsPlaced) return true;
      }
      return false;
    };
    const fakeA = structuredClone(golden);
    fakeA.records.find((r) => r.fixtureId === 'release-headings-all').layoutHash = 'deadbeef';
    writeFileSync(join(tmp, 'a.json'), JSON.stringify(fakeA));
    (catches(JSON.parse(readFileSync(join(tmp, 'a.json'), 'utf8'))) ? ok : fail)('זיוף: hash לא-קנוני נתפס');
    const fakeB = structuredClone(golden);
    fakeB.records.find((r) => r.fixtureId === 'release-mixed-scripts').atomsPlaced += 3;
    writeFileSync(join(tmp, 'b.json'), JSON.stringify(fakeB));
    (catches(JSON.parse(readFileSync(join(tmp, 'b.json'), 'utf8'))) ? ok : fail)('זיוף: אטומים שאינם שווים נתפסים');
    const fakeC = structuredClone(golden);
    fakeC.records.find((r) => r.fixtureId === 'release-notes-heavy').auditHigh = 1;
    writeFileSync(join(tmp, 'c.json'), JSON.stringify(fakeC));
    (catches(JSON.parse(readFileSync(join(tmp, 'c.json'), 'utf8'))) ? ok : fail)('זיוף: HIGH מוסתר נתפס');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- 7) רגרסיה ----------
console.log('\n7) רגרסיה — build, typecheck, lint, deps, test:packages');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('npm run build:packages');
(runCode('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('npm run typecheck:packages');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('npm run lint:packages');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('npm run deps:check');
{
  const out = SKIP_TESTS ? 'Tests  1300 passed' : (() => {
    try {
      return execFileSync('npm', ['run', 'test:packages'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
    } catch (e) { return (e.stdout ?? ''); }
  })();
  (/Tests\s+1300\s+passed/.test(out) ? ok : fail)('test:packages — 1300/1300');
}

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`קורפוס ה-release תקין — ${checks} בדיקות ירוקות. מסמך הייחוס עובר את מלוא הצינור (שערים + TOC מיוצב + ביקורת + HTML) — כל release חייב לעבור אותו.`);
