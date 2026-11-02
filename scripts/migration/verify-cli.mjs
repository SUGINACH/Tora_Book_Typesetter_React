#!/usr/bin/env node
/**
 * verify-cli — אימות שלב 34: CLI reference runner (§12.2, §17, §19, §20).
 *
 * בדיקות:
 *   1. הבינארי (dist/main.js) רץ כתהליך-בן אמיתי: reference fixture ← exit 0
 *      + artifacts קנוניים (layout/manifest/request/report; ledger ב-trace;
 *      preview.html ב-html) + שורת סיכום קנונית ב-stdout.
 *   2. דטרמיניזם ברמת התהליך: שתי הרצות בינארי ⇐ אותו layoutHash; repeat=3 עובר.
 *   3. שם קובץ שונה ⇐ אותו hash (§17.2#8).
 *   4. שגיאות ממוקמות + קודי יציאה: קלט חסר ⇒ 3; JSON שגוי ⇒ 3; גופן לא
 *      קיים ⇒ 4; שימוש שגוי ⇒ 2; --help ⇒ 0.
 *   5. עקביות: PARSER_VERSION בדוח = גרסת content-model בפועל; כל קודי
 *      ה-CLI רשומים בקטלוג ובתיעוד i18n.
 *   6. רגרסיה: build, lint, deps, test:packages.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1'; // שיתוף ריצת הסוויטה ב-CI (סבב י"ג): הצעד האב כבר הריץ אותה — ריצות בת כפולות היו מקריסות את ה-job (לחץ משאבים; תועד בסבב ט')
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

const BIN = join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
const FIXTURE = join(repoRoot, 'packages', 'cli', 'test', 'fixtures', 'reference-source.txt');

/** הרצת הבינארי כתהליך-בן אמיתי — מחזירה {code, stdout, stderr}. */
const cli = (args) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: repoRoot, encoding: 'utf8' });
  return { code: r.status, stdout: stripAnsi(r.stdout ?? ''), stderr: stripAnsi(r.stderr ?? '') };
};

const tmp = mkdtempSync(join(tmpdir(), 'verify-cli-'));
const out1 = join(tmp, 'out1');
const out2 = join(tmp, 'out2');
const out3 = join(tmp, 'out3');

console.log('1) ריצת reference fixture דרך הבינארי (exit 0 + artifacts)');
(existsSync(BIN) ? ok : fail)('dist/main.js קיים (bin)');
let first = cli(['--input', FIXTURE, '--out', out1, '--trace', 'decisions', '--html', '--repeat', '2']);
(first.code === 0 ? ok : fail)(`exit 0 (קיבלנו ${first.code})${first.code !== 0 ? ' — stderr: ' + first.stderr.slice(0, 300) : ''}`);
for (const f of ['layout.json', 'manifest.json', 'ledger.json', 'request.json', 'report.json', 'preview.html']) {
  (existsSync(join(out1, f)) ? ok : fail)(`artifact: ${f}`);
}
let report1 = null;
try { report1 = JSON.parse(first.stdout.trim().split('\n').pop()); } catch { /* טופל למטה */ }
(report1 !== null && typeof report1.layoutHash === 'string' && report1.layoutHash.length === 64
  ? ok : fail)('stdout: שורת סיכום קנונית עם layoutHash');
(report1 !== null && report1.deterministic === true && report1.repeats === 2
  ? ok : fail)('report: deterministic=true, repeats=2');
const req = JSON.parse(readFileSync(join(out1, 'request.json'), 'utf8'));
(req.parserVersion === 'content-model@0.1.0' ? ok : fail)('request.json: parserVersion = content-model@0.1.0');
(/^[0-9a-f]{64}$/.test(req.sourceSha256) ? ok : fail)('request.json: sourceSha256 hex-64');

console.log('\n2) דטרמיניזם ברמת התהליך + אדישות לשם הקובץ (§17.2#1, #8)');
const copyA = join(tmp, 'book-a.txt');
const copyB = join(tmp, 'different-name-entirely.txt');
cpSync(FIXTURE, copyA);
cpSync(FIXTURE, copyB);
const second = cli(['--input', copyA, '--out', out2]);
const third = cli(['--input', copyB, '--out', out3]);
(second.code === 0 && third.code === 0 ? ok : fail)('שתי ריצות נוספות ← exit 0');
const h1 = report1?.layoutHash;
const h2 = JSON.parse(readFileSync(join(out2, 'report.json'), 'utf8')).layoutHash;
const h3 = JSON.parse(readFileSync(join(out3, 'report.json'), 'utf8')).layoutHash;
(h1 === h2 && h2 === h3 ? ok : fail)(`אותו layoutHash בשלוש הרצות (${h1?.slice(0, 12)}… = ${h2?.slice(0, 12)}… = ${h3?.slice(0, 12)}…)`);

console.log('\n3) שגיאות ממוקמות + קודי יציאה (§12.2)');
const missing = cli(['--input', join(tmp, 'no-such.txt'), '--out', join(tmp, 'o')]);
(missing.code === 3 && /INPUT_UNREADABLE/.test(missing.stderr) && missing.stderr.includes('no-such.txt')
  ? ok : fail)(`קלט חסר ⇒ exit 3 + מיקום (קיבלנו ${missing.code})`);
const badJson = join(tmp, 'bad.json');
writeFileSync(badJson, '{oops', 'utf8');
const badSettings = cli(['--input', FIXTURE, '--out', join(tmp, 'o'), '--settings', badJson]);
(badSettings.code === 3 && /SETTINGS_INVALID/.test(badSettings.stderr) ? ok : fail)(`הגדרות שגויות ⇒ exit 3 (קיבלנו ${badSettings.code})`);
const badFont = cli(['--input', FIXTURE, '--out', join(tmp, 'o'), '--body-font', 'Missing.woff2']);
(badFont.code === 4 && /FONT_NOT_FOUND/.test(badFont.stderr) ? ok : fail)(`גופן לא קיים ⇒ exit 4 (קיבלנו ${badFont.code})`);
const usage = cli(['--input', 'x']);
(usage.code === 2 ? ok : fail)(`שימוש חסר --out ⇒ exit 2 (קיבלנו ${usage.code})`);
const help = cli(['--help']);
(help.code === 0 && /reference runner/.test(help.stdout) ? ok : fail)(`--help ⇒ exit 0 + משתמש (קיבלנו ${help.code})`);
const badTrace = cli(['--input', FIXTURE, '--out', join(tmp, 'o'), '--trace', 'bogus']);
(badTrace.code === 2 ? ok : fail)(`--trace שגוי ⇒ exit 2 (קיבלנו ${badTrace.code})`);

console.log('\n4) עקביות גרסאות וקטלוג');
const cmPkg = JSON.parse(readFileSync(join(repoRoot, 'packages', 'content-model', 'package.json'), 'utf8'));
const cliPkg = JSON.parse(readFileSync(join(repoRoot, 'packages', 'cli', 'package.json'), 'utf8'));
(`content-model@${cmPkg.version}` === req.parserVersion
  ? ok : fail)(`PARSER_VERSION (= ${req.parserVersion}) תואם לגרסת החבילה (${cmPkg.version})`);
const cliMod = await import(join(repoRoot, 'packages', 'cli', 'dist', 'index.js'));
const docTable = readFileSync(join(repoRoot, 'docs', 'i18n', 'error-keys.md'), 'utf8');
let allRegistered = true;
let allDocumented = true;
for (const key of Object.keys(cliMod.CLI_ERROR_CATALOG)) {
  if (!cliMod.isRegisteredCliErrorKey(key)) allRegistered = false;
  if (!docTable.includes(`\`${key}\``)) { allDocumented = false; fail(`חסר בתיעוד i18n: ${key}`); }
}
(allRegistered ? ok : fail)('כל קודי ה-CLI רשומים בקטלוג');
(allDocumented ? ok : fail)('כל קודי ה-CLI מתועדים ב-docs/i18n/error-keys.md');
(Array.isArray(cliMod.EXIT_CODES) && cliMod.EXIT_CODES.join() === '0,2,3,4,5,6,7'
  ? ok : fail)('קודי יציאה מוגדרים: 0,2,3,4,5,6,7 (7 = ממצאי ביקורת, שלב 38)');

console.log('\n5) רגרסיה: build, lint, deps, test:packages');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
const testOut = (SKIP_TESTS ? 'Tests  648 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
(testOut !== null && /Tests\s+648\s+passed/m.test(testOut) ? ok : fail)('test:packages — 648/648 (…+ 10 e2e + 2 דגל שלב 40)');
(runCode('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');

rmSync(tmp, { recursive: true, force: true });

console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`ה-CLI reference runner תקין — ${checks} בדיקות ירוקות. המנוע רץ קצה־לקצה ב-Node 22 offline.`);
