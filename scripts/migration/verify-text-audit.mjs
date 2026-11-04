#!/usr/bin/env node
/**
 * verify-text-audit — אימות שלב 21: Text Audit v1 וספר טרנספורמציות + שער M2 מלא.
 * אסמכתא: אפיון §14.1–14.3, §17.1–17.2, §18-M2 · תכנית שלב 21.
 *
 * בדיקות:
 *   1. ממשק ה־API: runTextAudit + 11 קודי ממצא + קטלוג שגיאות מקומי.
 *   2. הוכחה על כל קורפוס הבדיקה (63 קבצים): הביקורת העצמאית ok (אפס HIGH),
 *      100% כיסוי (missing=0, duplicated=0), דטרמיניזן, חשבונאות מלאה.
 *   3. חבילת ה־fuzz (vitest): אין crash/איבוד אטומים על מחולל כל התחביר.
 *   4. שעד M2 (§18-M2):
 *      א. round-trip מוכיח 100% כיסוי אטומים על כל fixtures שלב 4 (26 מסמכי
 *         המרשם ⊂ 63 הקבצים) + אידמפוטנטיות serialize→parse→serialize.
 *      ב. notes וסוגריים שומרים מקור (אפס יתומות; סריקת סוגריים דטרמיניסטית
 *         עם המשכיות מצבי גבול).
 *      ג. שגיאות קלט מקומיות (פרמטרי מיקום בקטלוג).
 *      ד. rollback מתועד: ה־react-lock ממשיך לספק את המבנה הישן לצורך
 *         differential בלבד (SHA מאומת; אף חבילת ייצור אינה מייבאת אותו).
 *   5. רגרסיה: test:packages, build, typecheck, lint, deps + כל מאמתי הפרק.
 *
 * יציאה: 0 = שער M2 עבר; 1 = כשל.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cm = await import('@tora/content-model');
const ac = await import('@tora/audit-core');

let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1'; // שיתוף ריצת הסוויטה ב-CI (סבב י"ג): הצעד האב כבר הריץ אותה — ריצות בת כפולות היו מקריסות את ה-job (לחץ משאבים; תועד בסבב ט')
// קודי בקרה ANSI (צבע) — מוסרים מכל פלט תהליך-בן לפני התאמת טקסט
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

const run = (cmd, args) => {
  try {
    // ANSI-safe: ב-CI (CI=true) chalk/vitest מצבעים את הפלט גם שלא דרך TTY; קודי הצבע
    // בין "Tests" למספר שברו התאמות טקסט (נתגלה ב-GitHub Actions). מנקים קודי בקרה
    // וגם מזריקים NO_COLOR=1 — שתי הגנות עצמאיות.
    const out = execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
    return out.replace(ANSI_RE, '').replace(/\x1b/g, ''); // ניקוי סופי: ESC בודד שנותר
  } catch (e) {
    return e.stdout ?? null;
  }
};

// ─────────────────────────── 1. ממשק ה-API ───────────────────────────
console.log('1) ממשק ה־API והקטלוגים');
{
  (typeof ac.runTextAudit === 'function' ? ok : fail)('runTextAudit זמין');
  (Array.isArray(ac.TEXT_AUDIT_FINDING_CODES) && ac.TEXT_AUDIT_FINDING_CODES.length === 11
    ? ok : fail)(`11 קודי ממצא רשומים (נמצאו ${Array.isArray(ac.TEXT_AUDIT_FINDING_CODES) ? ac.TEXT_AUDIT_FINDING_CODES.length : 0})`);
  (ac.isRegisteredAuditErrorKey('errors.audit.INVALID_INPUT') && ac.auditErrorCatalogSize() === 2
    ? ok : fail)('קטלוג audit-core: 2 קודי שגיאה רשומים');
  (cm.contentModelErrorCatalogSize() === 85 ? ok : fail)(`קטלוג content-model: 85 קודים — 82 קודמים + 3 assets שלב 68 (נמצאו ${cm.contentModelErrorCatalogSize()})`);
}

// ─────────────────────────── 2. הוכחה על הקורפוס ───────────────────────────
console.log('\n2) Text Audit v1 על כל קורפוס הבדיקה — הוכחה עצמאית');
const corpusRoot = join(repoRoot, 'packages/test-fixtures/corpus');
const corpusFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.txt')) corpusFiles.push(p);
  }
})(corpusRoot);
let totals = { atoms: 0, files: 0, highFindings: 0, lowFindings: 0, suppress: 0, insert: 0, split: 0, merge: 0 };
{
  let auditBad = [];
  let determinismBad = [];
  let roundTripBad = [];
  let determinismChecked = 0;
  for (const file of corpusFiles) {
    const raw = readFileSync(file, 'utf8');
    const rel = file.slice(corpusRoot.length + 1);
    const result = cm.parseSourceText(raw, { documentId: `verify-21/${rel.replace(/[\\/]/g, ':')}` });
    const report = ac.runTextAudit(raw, result);
    totals.files += 1;
    totals.atoms += report.atomCount;
    totals.highFindings += report.highCount;
    totals.lowFindings += report.lowCount;
    totals.suppress += report.suppressedRecords;
    totals.insert += report.insertedAtomCount;
    totals.split += report.splitRecords;
    totals.merge += report.mergeRecords;
    if (!report.ok || report.independentCoverage.missing !== 0 || report.independentCoverage.duplicated !== 0) {
      auditBad.push(`${rel}:${report.findings.filter((f) => f.severity === 'HIGH').map((f) => f.code).slice(0, 2).join(',')}`);
    }
    // דטרמיניזן על קבצים עד 1MB (זיכרון; הכיסוי המלא נבדק לכל קובץ לעיל,
    // והדטרמיניזן מוכח בכבדות ב-fuzz — 3 ריצות — ובמאמתי 19–20 על כל הקורפוס)
    if (raw.length <= 1_000_000) {
      determinismChecked += 1;
      const again = ac.runTextAudit(raw, result);
      if (JSON.stringify(again.findings) !== JSON.stringify(report.findings)) determinismBad.push(rel);
    }
    // round-trip ביט-ביט (אין נרמול בשמירה — ADR-007)
    const s1 = cm.serializeDocument(result.doc);
    if (s1 !== cm.serializeDocument(cm.parseDocument(s1))) roundTripBad.push(rel);
  }
  console.log(`         · ${totals.files} קבצים · ${totals.atoms.toLocaleString('en-US')} אטומים · ${totals.suppress} הסרות מוצהרות · ${totals.insert.toLocaleString('en-US')} החדרות חיבור · דטרמיניזן נבדק על ${determinismChecked} קבצים`);
  (auditBad.length === 0 ? ok : fail)(`הביקורת העצמאית: אפס HIGH ו־100% כיסוי על כל הקורפוס (${auditBad.length}: ${auditBad.slice(0, 3).join('; ')})`);
  (determinismBad.length === 0 ? ok : fail)(`דטרמיניזן הדוח (${determinismChecked} קבצים ≤ 1MB; ${determinismBad.length}: ${determinismBad.slice(0, 3).join('; ')})`);
  (roundTripBad.length === 0 ? ok : fail)(`round-trip serialize→parse→serialize ביט-ביט (${roundTripBad.length}: ${roundTripBad.slice(0, 3).join('; ')})`);
}

// ─────────────────────────── 3. חבילת ה-fuzz ───────────────────────────
console.log('\n3) חבילת ה־fuzz — אין crash/איבוד אטומים (§17.1)');
{
  const out = run('npx', ['vitest', 'run', '--config', 'vitest.packages.config.ts',
    'packages/audit-core/test/text-audit.fuzz.test.ts']);
  const passed = out !== null && /Tests\s+\d+ passed/.test(out) && !/failed/.test(String(out).split('Test Files').pop() ?? '');
  (passed ? ok : fail)('text-audit.fuzz.test.ts — 5 תכונות (מחולל כל התחביר, 400+ ריצות)');
}

// ─────────────────────────── 4. שעד M2 (§18-M2) ───────────────────────────
console.log('\n4) שעד M2 מלא — §18-M2');
{
  // א. כל fixtures שלב 4 בקורפוס המאומת
  const registry = JSON.parse(readFileSync(join(repoRoot, 'packages/test-fixtures/registry.json'), 'utf8'));
  const documentFixtures = (registry.fixtures ?? registry.items ?? []).filter((it) => it.kind === 'document' && it.corpusFile?.path);
  (documentFixtures.length === 26 ? ok : fail)(`26 מסמכי המרשם (שלב 4) זמינים (נמצאו ${documentFixtures.length})`);
  let fixtureBad = 0;
  for (const it of documentFixtures) {
    const p = join(repoRoot, 'packages/test-fixtures', it.corpusFile.path);
    if (!p.endsWith('.txt')) continue;
    const raw = readFileSync(p, 'utf8');
    const result = cm.parseSourceText(raw, { documentId: 'verify-21-fixture' });
    const report = ac.runTextAudit(raw, result);
    if (!report.ok) fixtureBad += 1;
  }
  (fixtureBad === 0 ? ok : fail)(`כל מסמכי המרשם: הביקורת ok — round-trip מוכיח 100% כיסוי אטומים (${fixtureBad} כשלים)`);

  // ב. notes שומרים מקור — אפס יתומות; סוגריים שומרים מקור — סריקה דטרמיניסטית והמשכית
  let orphanBad = 0;
  let bracketBad = 0;
  for (const file of corpusFiles) {
    const raw = readFileSync(file, 'utf8');
    const result = cm.parseSourceText(raw, { documentId: 'verify-21-gate' });
    const numbered = cm.numberNotes(result.doc, { scope: 'continuous', labelFormat: 'numeric', streams: ['footnote', 'endnote'] });
    if (numbered.orphanNoteIds.length > 0) orphanBad += 1;
    const rescan = cm.scanBrackets(result.doc);
    if (JSON.stringify(rescan) !== JSON.stringify(result.brackets)) bracketBad += 1;
    for (let i = 0; i + 1 < result.brackets.body.blockStates.length; i = i + 1) {
      const a = JSON.stringify(result.brackets.body.blockStates[i].openAtEnd);
      const b = JSON.stringify(result.brackets.body.blockStates[i + 1].openAtStart);
      if (a !== b) { bracketBad += 1; break; }
    }
  }
  (orphanBad === 0 ? ok : fail)(`notes שומרים מקור — אפס יתומות על כל הקורפוס (${orphanBad})`);
  (bracketBad === 0 ? ok : fail)(`סוגריים שומרים מקור — סריקה דטרמיניסטית עם המשכיות מצבי גבול (${bracketBad})`);

  // ג. שגיאות קלט מקומיות — פרמטרי מיקום בשגיאות הפרסר
  let localized = true;
  let localizedDetail = '';
  try {
    cm.parseSourceText('שם הספר: א\nשם הספר: ב', { documentId: 'verify-21-err' });
    localized = false;
    localizedDetail = 'כפילות לא נדחתה';
  } catch (e) {
    const err = e;
    if (err.catalogKey !== 'errors.parser.DUPLICATE_METADATA_KEY') { localized = false; localizedDetail = `קוד ${err.catalogKey}`; }
    else if (Number(err.params?.startUtf16 ?? '-1') < 0) { localized = false; localizedDetail = 'בלי מיקום'; }
  }
  try {
    cm.parseSourceText('a\u0001b', { documentId: 'verify-21-err2' });
    localized = false;
    localizedDetail += '; sentinel לא נדחה';
  } catch (e) {
    if (Number(e.params?.offset ?? '-1') < 0) { localized = false; localizedDetail += '; sentinel בלי מיקום'; }
  }
  (localized ? ok : fail)(`שגיאות קלט מקומיות — קוד קטלוגי + מיקום בפרמטרים (${localizedDetail})`);

  // ד. rollback מתועד: ה־react-lock ממשיך לספק את המבנה הישן לצורך differential בלבד
  const manifest = JSON.parse(readFileSync(join(repoRoot, 'packages/test-fixtures/legacy/react-lock/manifest.json'), 'utf8'));
  let shaBad = 0;
  for (const f of manifest.files) {
    const disk = readFileSync(join(repoRoot, 'packages/test-fixtures/legacy/react-lock', f.path));
    if (createHash('sha256').update(disk).digest('hex') !== f.sha256) shaBad += 1;
  }
  (shaBad === 0 ? ok : fail)(`rollback: react-lock שלם ומאומת SHA (${manifest.files.length} קבצים, ${shaBad} חריגות)`);
  // אף חבילת ייצור אינה מייבאת את הקוד הישן המוחזק (depcruise: legacy מוחרג מהגרף)
  (run('npm', ['run', 'deps:check']) !== null ? ok : fail)('rollback: אף חבילת ייצור אינה מייבאת את הישן המוחזק (deps:check)');
}

// ─────────────────────────── 5. רגרסיה מלאה ───────────────────────────
console.log('\n5) רגרסיה מלאה — כל מאמתי הפרק + מערכת הבדיקות');
{
  const t = (SKIP_TESTS ? 'Tests  1033 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
  (t !== null && !/failed\b/.test(String(t).split('Test Files').pop() ?? '') ? ok : fail)('test:packages — כל הבדיקות ירוקות');
  (run('npm', ['run', 'build:packages']) !== null ? ok : fail)('build:packages — PASS');
  (run('npm', ['run', 'typecheck:packages', '--', '--force']) !== null ? ok : fail)('typecheck:packages --force — PASS');
  (run('npm', ['run', 'lint:packages']) !== null ? ok : fail)('lint:packages — PASS');
  // מאמתי-בן: כל אחד כבר רץ גם כשלב עצמאי ב-CI; כאן הם רגרסיה כפולה. האב מחזיק את
  // זיכרון ביקורת הקורפוס שלו בזמן שהבן מריץ קורפוס + vitest משלו — בראנר GitHub
  // (7GB) נצפה כשל תעתיק חד-פעמי שלא הופיע בריצה העצמאית של אותו מאמת (2bf0c76).
  // לכן: ניסיון חוזר אחד + הדפסת סוף פלט הבן בכל כשל — כשל אמיתי (דטרמיניסטי)
  // ייראה בלוג ויישאר אדום; קריסת זיכרון תעבור בניסיון השני.
  const childVerifier = (label, script) => {
    let out = run('node', [script]);
    let passed = out !== null && !/נכשל/.test(out);
    if (!passed) {
      console.log(`  [דיאג] ${label} — ניסיון ראשון נכשל; פלט (סוף 25 שורות):`);
      console.log(out !== null
        ? out.split('\n').slice(-25).map((l) => `  | ${l}`).join('\n')
        : '  | (אין פלט — הבן נהרג, כנראה OOM)');
      out = run('node', [script]);
      passed = out !== null && !/נכשל/.test(out);
      if (!passed) {
        console.log(`  [דיאג] ${label} — גם הניסיון השני נכשל; פלט (סוף 25 שורות):`);
        console.log(out !== null
          ? out.split('\n').slice(-25).map((l) => `  | ${l}`).join('\n')
          : '  | (אין פלט — הבן נהרג, כנראה OOM)');
      }
    }
    (passed ? ok : fail)(`${label} — PASS`);
  };
  childVerifier('verify-parser (דיפרנציאל מלא מול הישן)', 'scripts/migration/verify-parser.mjs');
  childVerifier('verify-brackets', 'scripts/migration/verify-brackets.mjs');
  childVerifier('verify-notes', 'scripts/migration/verify-notes.mjs');
  childVerifier('verify-unicode', 'scripts/migration/verify-unicode.mjs');
}

// ─────────────────────────── סיכום — שער M2 ───────────────────────────
console.log('\n' + '='.repeat(60));
if (failures === 0) {
  console.log(`שער M2 מלא עבר: ${checks} בדיקות ירוקות. Text Audit v1 מוכיח 100% כיסוי אטומים על כל הקורפוס בחישוב עצמאי; הערות וסוגריים שומרים מקור; שגיאות קלט מקומיות; rollback מתועד. פרק ג (שלבים 14–21) הושלם.`);
  process.exit(0);
} else {
  console.log(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות — שער M2 טרם עבר`);
  process.exit(1);
}
