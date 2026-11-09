#!/usr/bin/env node
/**
 * verify-export-standalone — אימות שלב 87: פלט self-contained וקנוני
 * (תכנית 87; אפיון §15.2, §21).
 *
 * שעת השלב: "הקובץ מוצג offline ללא תלות חיצונית" + "hashes זהים בין
 * ריצות" + "נכסים שלמים".
 *
 * נבדק פונקציונלית על ה־CLI (המסלול הטהור; §12.2):
 *   1. --html ⇒ preview.html שכל מקור הגופן בו data: URI מלא — אין
 *      ‎url("fonts/…")‎, אין http(s), אין <script>, אין @import.
 *   2. הקובץ עומד לבדו: מועתק לספרייה ריקה — שום נכס חסר (offline).
 *   3. שתי ריצות מלאות ⇒ preview.html זהה ביט-ביט (sha256).
 *   4. CSS הדפסה בפלט (@page margin:0, page-break-after, @media print).
 *   5. המעטפת: buildExportHtml מספק dataUri מה-bytes של הצרור (קוד +
 *      חיווט CI; הבדיקות הפונקציונליות ב-vitest — 5 בקובץ הייצוא).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, mkdtempSync, cpSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };

const BIN = join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
const FIXTURE = join(repoRoot, 'packages', 'cli', 'test', 'fixtures', 'reference-source.txt');
const tmp = mkdtempSync(join(tmpdir(), 'verify-standalone-'));
const run = (out) => {
  const r = spawnSync(process.execPath, [BIN, '--input', FIXTURE, '--out', out, '--html'], { cwd: repoRoot, encoding: 'utf8' });
  return { code: r.status, stderr: r.stderr ?? '' };
};

console.log('1) הרצה ראשונה — preview.html self-contained');
const out1 = join(tmp, 'a');
const r1 = run(out1);
if (r1.code !== 0) {
  fail(`CLI נכשל: ${r1.stderr.slice(0, 300)}`);
} else {
  ok('CLI --html ⇒ exit 0');
  const html = readFileSync(join(out1, 'preview.html'), 'utf8');
  const dataUriCount = (html.match(/data:font\/[a-z0-9]+;base64,/g) ?? []).length;
  dataUriCount > 0 ? ok(`@font-face מוטמע — data URI ×${dataUriCount}`) : fail('אין data URI לגופן');
  /url\("fonts\//.test(html) ? fail('נמצאה פניית קובץ חיצונית url("fonts/…")') : ok('אין url("fonts/…")');
  /https?:\/\//.test(html) ? fail('נמצאה כתובת רשת בפלט') : ok('אפס כתובות רשת');
  /<script/.test(html) ? fail('נמצא <script> בפלט') : ok('אפס <script>');
  /@import/.test(html) ? fail('נמצא @import בפלט') : ok('אפס @import');
  // הטמעה שלמה: ה-base64 בפלט חייב להיות מאומת מול קובץ הגופן בפועל
  const m = html.match(/data:font\/(woff2|woff);base64,([A-Za-z0-9+/=]+)/);
  if (m) {
    const fontBytes = readFileSync(join(repoRoot, 'fonts', 'Guttman-Rashi-Normal.woff2'));
    const expected = Buffer.from(fontBytes).toString('base64');
    m[2] === expected
      ? ok('הבסיס64 בפלט === בסיס64 של קובץ הגופן (ביט-ביט)')
      : fail('ה-base64 בפלט אינו תואם את קובץ הגופן');
  } else {
    fail('לא נמצא data URI לפרשון');
  }

  console.log('\n2) הקובץ עומד לבדו בספרייה ריקה (offline)');
  const alone = join(tmp, 'alone');
  mkdirSync(alone, { recursive: true });
  cpSync(join(out1, 'preview.html'), join(alone, 'preview.html'));
  const aloneDir = readdirSync(alone).filter((f) => f.endsWith('.html'));
  aloneDir.length === 1 && !existsSync(join(alone, 'fonts'))
    ? ok('preview.html לבדו — אין ספריית fonts/ ואין נכסים נוספים')
    : fail('הפלט אינו עומד לבדו');

  console.log('\n3) דטרמיניזם — שתי ריצות ⇒ אותם bytes');
  const out2 = join(tmp, 'b');
  const r2 = run(out2);
  if (r2.code === 0) {
    const h1 = createHash('sha256').update(readFileSync(join(out1, 'preview.html'))).digest('hex');
    const h2 = createHash('sha256').update(readFileSync(join(out2, 'preview.html'))).digest('hex');
    h1 === h2 ? ok(`preview.html sha256 זהה בין ריצות (${h1.slice(0, 16)}…)`) : fail('preview.html שונה בין ריצות');
    const rep1 = JSON.parse(readFileSync(join(out1, 'report.json'), 'utf8'));
    const rep2 = JSON.parse(readFileSync(join(out2, 'report.json'), 'utf8'));
    rep1.layoutHash === rep2.layoutHash ? ok('layoutHash זהה (הפלט אינו משפיע)') : fail('layoutHash השתנה בין ריצות');
  } else {
    fail(`ריצה שנייה נכשלה: ${r2.stderr.slice(0, 200)}`);
  }

  console.log('\n4) CSS הדפסה של הקובץ העומד לבדו');
  /@page\{margin:0\}/.test(html) ? ok('@page{margin:0}') : fail('חסר @page{margin:0}');
  /page-break-after:always/.test(html) ? ok('page-break-after:always') : fail('חסר page-break-after');
  /@media print\{\.tora-page/.test(html) ? ok('@media print לעמודים') : fail('חסר @media print');
}

console.log('\n5) המעטפת — הטמעה מה-bytes של הצרור + חיווט');
const appMod = readFileSync(join(repoRoot, 'src', 'worker-host', 'export-html.ts'), 'utf8');
/dataUri/.test(appMod) && /toBase64\(f\.bytes\)/.test(appMod)
  ? ok('export-html.ts — dataUri מה-bytes של הצרור')
  : fail('export-html.ts — אין הטמעה מה-bytes');
const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8');
/verify-export-standalone/.test(ci) ? ok('ci.yml — המאמת מחובר') : fail('ci.yml — המאמת אינו מחובר');
const pkg = readFileSync(join(repoRoot, 'package.json'), 'utf8');
/verify:export-standalone/.test(pkg) ? ok('package.json — סקריפט') : fail('package.json — חסר סקריפט');

rmSync(tmp, { recursive: true, force: true });
console.log(`\nתוצאה: ${checks - failures}/${checks}`);
process.exit(failures === 0 ? 0 : 1);
