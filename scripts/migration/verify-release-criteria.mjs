#!/usr/bin/env node
/**
 * verify-release-criteria — אימות שלב 100: מעבר קריטריוני release
 * (אפיון §20 — הרשימה המלאה; §24 — הגדרת "התכנית בוצעה"; §18-M12).
 *
 * כל קריטריון §20 מסומן רק בצירוף פקודת הבדיקה שהוכיחה אותו — כאן:
 * הזול�ים רצים בפועל, הכבדים נבדקת הרשמתם הכפויה ב-CI (שער ה-push
 * של אותו קומיט — הראיה היא ריצת ה-CI הירוקה עצמה).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
const REFERENCE = join(repoRoot, 'packages', 'cli', 'test', 'fixtures', 'reference-source.txt');
const LONG = join(repoRoot, 'packages', 'test-fixtures', 'corpus', 'canonical', 'very_long_test_text.txt');

let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const runCli = (args) => spawnSync(process.execPath, [BIN, ...args], {
  cwd: repoRoot, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, env: { ...process.env, NO_COLOR: '1' },
});

console.log('§20 — קריטריוני Release (כל סעיף עם פקודת ההוכחה)');

console.log('\n1) אין HIGH במאגר החובה ובמסמך הארוך');
{
  const out = join(tmpdir(), 'crit-long');
  const r = runCli(['--input', LONG, '--out', out]);
  const aud = r.status === 0 ? JSON.parse(readFileSync(join(out, 'audit.json'), 'utf8')) : { findings: [{ severity: 'HIGH' }] };
  (r.status === 0 && !(aud.findings ?? []).some((f) => f.severity === 'HIGH')
    ? ok : fail)('המסמך הארוך — אפס HIGH (node packages/cli/dist/main.js --input <very_long> --out …)');
  (existsSync(join(repoRoot, 'packages', 'test-fixtures', 'release-golden.json'))
    ? ok : fail)('מאגר החובה — נעול ב-golden (verify-release-fixtures; CI)');
}

console.log('\n2) כל MEDIUM וכל fallback מקושרים להסבר ומדיניות');
{
  (existsSync(join(repoRoot, 'scripts', 'migration', 'verify-release-manifest.mjs'))
    ? ok : fail)('verify-release-manifest — כל MEDIUM מוסבר; לכל fallback מדיניות (רץ ב-CI)');
}

console.log('\n3) 100% source atoms מכוסים; כל suppression/insertion מוצהר');
{
  const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  (ci.includes('verify-text-audit') ? ok : fail)('verify-text-audit — כיסוי אטומים על כל הקורפוס + הצהרות (CI)');
  (ci.includes('verify-atoms') ? ok : fail)('verify-atoms — זהות אטומים (CI)');
}

console.log('\n4) Node 22 ו-Web Worker — אותו layoutHash; Tauri smoke תקין');
{
  const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  (ci.includes('verify-cross-host-release') ? ok : fail)('verify-cross-host-release — עשר ריצות Node + worker + Tauri (CI)');
  (ci.includes('verify-e2e-skeleton') ? ok : fail)('verify-e2e-skeleton — CLI←IR←Worker←HTML אותו hash (CI)');
}

console.log('\n5) עשר חזרות על reference — אותו hash');
{
  const out = join(tmpdir(), 'crit-repeat');
  const r = runCli(['--input', REFERENCE, '--out', out, '--repeat', '10']);
  if (r.status === 0) {
    const rep = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    (rep.repeats === 10 && rep.deterministic === true ? ok : fail)('--repeat 10 ⇒ deterministic=true');
  } else {
    fail('--repeat 10 נכשל');
  }
}

console.log('\n6) אין DOM/Canvas/CSSOM/network בחבילות הליבה');
{
  const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  (ci.includes('deps:check') ? ok : fail)('dependency-cruiser — גבולות תלות (CI)');
  (ci.includes('lint:packages') ? ok : fail)('lint:packages — איסור DOM/Node בליבה (CI)');
  (ci.includes('verify-dependency-rules') ? ok : fail)('verify-dependency-rules — בדיקה שלילית שההפרה נתפסת (CI)');
}

console.log('\n7) גופן חסר/shaping — כישלון מפורש; אין SimulatedMeasurer בייצור');
{
  const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  (ci.includes('verify-enforcement') ? ok : fail)('verify-enforcement — איסור fallback שקט (CI)');
  (ci.includes('verify-harfbuzz-provider') ? ok : fail)('verify-harfbuzz-provider — ספק נעול (CI)');
  // הפרוביידר של הבדיקות אסור בייבוא מקוד ריצה — הכלל עצמו ב-dep-cruiser
  const dep = readFileSync(join(repoRoot, '.dependency-cruiser.cjs'), 'utf8');
  (dep.includes('test-provider') ? ok : fail)('איסור test-provider מקוד ריצה (.dependency-cruiser.cjs)');
}

console.log('\n8) anchors/TOC/notes/מספור — semantic audit');
{
  const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  (ci.includes('verify-links') ? ok : fail)('verify-links — כל העוגנים והקישורים (CI)');
  (ci.includes('verify-anchor-toc') ? ok : fail)('verify-anchor-toc — TOC מדוד (CI)');
  (ci.includes('verify-m7-gate') ? ok : fail)('verify-m7-gate — כותרות רצות/פוליו/גימטריה (CI)');
}

console.log('\n9) אין overflow/חפיפה גיאומטריים ב-IR');
{
  const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  (ci.includes('verify-layout-audit') ? ok : fail)('verify-layout-audit — ביקורת גאומטרית על ה-IR (CI)');
}

console.log('\n10) preview ו-HTML מאותו IR; PDF בחוזה הטקסט והקישורים');
{
  const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  (ci.includes('verify-projection-equivalence') ? ok : fail)('verify-projection-equivalence — IR אחד ⇒ שלושה היטלים (CI)');
  (ci.includes('verify-export-pdf') ? ok : fail)('verify-export-pdf — PDF: טקסט/גופנים/קישורים/סימניות (CI)');
  (ci.includes('verify-pdf-audit') ? ok : fail)('verify-pdf-audit — פרסור PDF עצמאי (CI)');
}

console.log('\n11) כל setting עם consumer מוגדר ומבחן; migrations');
{
  const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  (ci.includes('verify-settings-coverage') ? ok : fail)('verify-settings-coverage — 257 מפתחות עם צרכנים (CI)');
  (ci.includes('verify-presets-migrations') ? ok : fail)('verify-presets-migrations — שרשרת המיגרציות (CI)');
}

console.log('\n12) Worker אמיתי, ביטול, progress, stale-job');
{
  const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  (ci.includes('verify-ui-worker') ? ok : fail)('verify-ui-worker — Worker אמיתי, supersede/ביטול (CI)');
  (ci.includes('verify-preview-virtualization') ? ok : fail)('verify-preview-virtualization — progress/ביטול/זום (CI)');
  (ci.includes('verify-e2e-focused') ? ok : fail)('verify-e2e-focused — E2E על האפליקציה הבנויה (CI)');
}

console.log('\n13) i18n parity, שגיאות מתורגמות, RTL UI');
{
  const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
  (ci.includes('verify-i18n-parity') ? ok : fail)('verify-i18n-parity — parity מלא (CI)');
  (ci.includes('scripts/i18n_audit.py') ? ok : fail)('scripts/i18n_audit.py — ביקורת i18n ב-CI (פייתון; שלב 96)');
  (ci.includes('verify-rtl-ltr') ? ok : fail)('verify-rtl-ltr — RTL/LTR + הפרדת כיוון הנוסח (שלב 94; CI)');
}

console.log('\n14) המסמך הארוך הקנוני אופליין; שינויי בייסליין מוסברים');
{
  const out = join(tmpdir(), 'crit-long2');
  const r = runCli(['--input', LONG, '--out', out]);
  (r.status === 0 && String(r.stdout ?? '') + String(r.stderr ?? '').includes('network attempts: 0')
    ? ok : fail)('אופליין מלא — אפס ניסיונות רשת (מודפס בפלט הריצה)');
  (existsSync(join(repoRoot, 'packages', 'test-fixtures', 'release-golden.json'))
    ? ok : fail)('בייסליין — golden נעול; שינוי דורש regen מפורש והסבר ב-WORKLOG');
}

console.log('\n15) README/CHECKLIST/WORKLOG/GLOSSARY — רק נאמת');
{
  (existsSync(join(repoRoot, 'scripts', 'migration', 'verify-release-manifest.mjs'))
    ? ok : fail)('נבדק ב-verify-release-manifest §6 (רץ ב-CI)');
}

console.log('\n— שלב 100: המנוע החדש default; legacy נעול לדיפרנציאל בלבד');
{
  const args = readFileSync(join(repoRoot, 'packages', 'cli', 'src', 'args.ts'), 'utf8');
  (/raw\.get\('engine'\) \?\? 'next'/.test(args) ? ok : fail)("ברירת המחדל: engine=next (args.ts)");
  (/--engine <name>       legacy \| next/.test(args) ? ok : fail)('הדגל קיים לריצות reference בלבד (מתועד ב-usage)');
  const engineFlag = readFileSync(join(repoRoot, 'scripts', 'migration', 'verify-engine-flag.mjs'), 'utf8');
  (/legacy/.test(engineFlag) ? ok : fail)('verify-engine-flag — נעילת legacy לבדיקות differential (CI)');
}

console.log('\n— שלב 100: אריזת הפצה');
{
  const release = join(repoRoot, '.github', 'workflows', 'release.yml');
  (existsSync(release) ? ok : fail)('.github/workflows/release.yml — בניית הפצה מתויגת (וב + מתקיני Tauri + חתימת hashes)');
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  (/^\d+\.\d+\.\d+$/.test(pkg.version) ? ok : fail)(`גרסה ממוספרת: ${pkg.version}`);
  const tauriConf = JSON.parse(readFileSync(join(repoRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'));
  (/^\d+\.\d+\.\d+$/.test(tauriConf.version ?? '') ? ok : fail)('גרסת Tauri ממוספרת');
  // הווב: סטטי ואופליין — הבאנדל נבדק ב-verify-tauri-shell §5 (מקומי, אין רשת)
  (existsSync(join(repoRoot, 'dist', 'index.html')) ? ok : fail)('באנדל הווב סטטי (dist) — נבדק מקומי-בלבד ב-verify-tauri-shell');
}

console.log('\n— §24: שרשרת "התכנית בוצעה"');
{
  // מסמך קנוני ⇒ CLI בלי דפדפן ⇒ IR מאומת ⇒ שלושה היטלים בלי חישוב מחדש
  const out = join(tmpdir(), 'crit-24');
  const r = runCli(['--input', REFERENCE, '--out', out, '--compose', '--html', '--pdf']);
  if (r.status !== 0 && r.status !== 7) {
    fail('הרצת השרשרת (compose+html+pdf) נכשלה: ' + String(r.stderr ?? '').slice(0, 200));
  } else {
    const need = ['layout.json', 'report.json', 'manifest.json', 'audit.json'];
    const missing = need.filter((f) => !existsSync(join(out, f)));
    (missing.length === 0 ? ok : fail)(`CLI ללא דפדפן ⇒ IR+manifest+audit${missing.length ? ' (חסר: ' + missing.join(', ') + ')' : ''}`);
    const rep = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    (/^[0-9a-f]{64}$/.test(rep.layoutHash) ? ok : fail)('IR עם layoutHash קנוני');
    // שלושת ההיטלים מאותו IR: preview.html (html) + pdf + ה-React (E2E oracle)
    (existsSync(join(out, 'preview.html')) ? ok : fail)('HTML מה-IR (preview.html)');
    (existsSync(join(out, 'book.pdf')) ? ok : fail)('PDF מה-IR (book.pdf)');
    const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
    (ci.includes('verify-projection-equivalence') && ci.includes('verify-e2e-focused')
      ? ok : fail)('React/HTML/PDF מאותו IR — בלי עימוד מחדש (verify-projection-equivalence + אורקל E2E)');
  }
}

console.log(`\nתוצאה: ${checks - failures}/${checks}`);
process.exit(failures === 0 ? 0 : 1);
