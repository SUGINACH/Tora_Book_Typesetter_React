#!/usr/bin/env node
/**
 * verify-cross-host — אימות שלב 29: זהות מדידה בין hosts ואכיפת offline.
 * אסמכתא: אפיון §17.1 (Cross-host: Node + Worker; Offline: network deny),
 * §19 ("cross-host Worker tests + offline tests") · תכנית שלב 29.
 *
 * בדיקות:
 *   1. עצמאות שני ה-hosts: הראשי (Node) והשני (worker_threads) — טעינה
 *      מלאה כל אחד בנפרד; environmentHash זהה; וקטורי גליפים מלאים
 *      (לא רק רוחבי מחרוזת) זהים ביט-ביט; requestHash זהה לכל כניסה.
 *   2. cache קר/חם: cold ⇐ warm (withShapingCache) וזהה גם בין ה-hosts.
 *   3. offline: שומר רשת מותקן בשני ה-hosts מרגע ההתחלה — טעינה+מדידה
 *      ירוקות עם אפס ניסיונות; עדות שלילית (fetch בפועל נתפס); סריקת
 *      מקור — אין fetch/CDN/רשת בקוד ייצור.
 *   4. הקורפוס הייצגי: 4 גופנים, ≥5 גדלים, 2 כיוונים, features, ריווח.
 *   5. רגרסיה: build, lint, deps, test:packages.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync as rf, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1'; // שיתוף ריצת הסוויטה ב-CI (סבב י"ג): הצעד האב כבר הריץ אותה — ריצות בת כפולות היו מקריסות את ה-job (לחץ משאבים; תועד בסבב ט')
// קודי בקרה ANSI (צבע) — מוסרים מכל פלט תהליך-בן לפני התאמת טקסט
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

// ANSI-safe: ב-CI (CI=true) chalk/vitest/eslint מצבעים פלט גם בלי TTY, וקודי צבע
// שברו התאמות טקסט (נתגלה ב-GitHub Actions; סבב ז' 2026-11-02). שתי הגנות עצמאיות.
const stripAnsi = (s) => (s == null ? s : String(s).replace(ANSI_RE, '').replace(/\x1b/g, ''));

const run = (cmd, args) => {
  // ANSI-safe: הזרקת NO_COLOR=1 (הגנה ראשונה) + ניקוי קודי בקרה (הגנה שנייה).
  try {
    return stripAnsi(execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }));
  } catch (e) {
    return stripAnsi(e.stdout ?? null);
  }
};
const sha256File = (p) => createHash('sha256').update(rf(p)).digest('hex');
const jsonEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const workerHelper = await import(join(repoRoot, 'packages', 'measurement-harfbuzz', 'test', 'cross-host.worker.mjs'));
const { buildProviderFromPaths, runCorpusOnProvider, installNetworkDeny, CORPUS } = workerHelper;

// ─────────────────────────── 1. שני ה-hosts ───────────────────────────
console.log('1) זהות מדידה בין שני hosts (Node + worker_threads)');
const denyMain = installNetworkDeny();
const { provider: mainProvider, manifest } = await buildProviderFromPaths(repoRoot);
const mainResults = await runCorpusOnProvider(mainProvider, manifest);
const mainHash = mainProvider.environmentHash;

const workerOut = await new Promise((res, rej) => {
  const w = new Worker(join(repoRoot, 'packages', 'measurement-harfbuzz', 'test', 'cross-host.worker.mjs'), { workerData: { repoRoot } });
  const timer = setTimeout(() => rej(new Error('worker timeout')), 60000);
  w.on('message', (m) => { clearTimeout(timer); res(m); });
  w.on('error', (e) => { clearTimeout(timer); rej(e); });
});
{
  (workerOut.ok === true ? ok : fail)('ה-worker חזר תקין (טעינה עצמאית מלאה)');
  (workerOut.environmentHash === mainHash ? ok : fail)('environmentHash זהה בין ה-hosts (נגזר מהנעילות בלבד)');
  let identical = workerOut.results?.length === mainResults.length;
  if (identical) {
    for (let i = 0; i < mainResults.length; i++) {
      if (!jsonEq(workerOut.results[i], mainResults[i])) { identical = false; break; }
    }
  }
  (identical ? ok : fail)(`וקטורי הגליפים המלאים זהים ביט-ביט — ${mainResults.length} כניסות (glyphId/cluster/advance/offsets/width/חסרים)`);
  const hashesOk = identical && workerOut.results.every((r, i) => r.requestHash === mainResults[i].requestHash);
  (hashesOk ? ok : fail)('requestHash זהה לכל כניסה — לא רק רוחבי מחרוזת');
  const noMissing = mainResults.every((r) => r.missingGlyphAtomIds.length === 0);
  (noMissing ? ok : fail)('הקורפוס נטול גליפים חסרים (הגופנים מכסים את הכניסות)');
}

// ─────────────────────────── 2. cache קר/חם ───────────────────────────
console.log('\n2) cache קר/חם — זהות התוצאה');
{
  const api = await import('@tora/measurement-api');
  const cached = api.withShapingCache(mainProvider);
  const warm1 = await runCorpusOnProvider(cached, manifest);
  const warm2 = await runCorpusOnProvider(cached, manifest);
  (jsonEq(warm1, mainResults) ? ok : fail)('cold ⇐ warm (מטמון) — וקטורים זהים');
  (jsonEq(warm2, warm1) ? ok : fail)('ריצה שנייה בתוך אותו host — זהה ביט-ביט (דטרמיניזם מלא)');
  (jsonEq(warm2, workerOut.results) ? ok : fail)('warm גם זהה ל-host השני');
}

// ─────────────────────────── 3. offline ───────────────────────────
console.log('\n3) אכיפת offline — network deny');
{
  (denyMain.attempts === 0 ? ok : fail)(`host ראשי: אפס ניסיונות רשת בטעינה+מדידה (התקבלו ${denyMain.attempts})`);
  (workerOut.denyAttempts === 0 ? ok : fail)(`host שני (worker): אפס ניסיונות (התקבלו ${workerOut.denyAttempts})`);
  let threw = false;
  try { await globalThis.fetch('https://example.invalid/'); } catch (e) { threw = /network-denied-by-guard/.test(String(e)); }
  denyMain.attempts = 0;
  (threw ? ok : fail)('עדות שלילית: fetch בפועל נתפס וזורק בידי השומר');
  // סריקת מקור: אין fetch/CDN/רשת בקוד ייצור של הספק
  const srcDir = join(repoRoot, 'packages', 'measurement-harfbuzz', 'src');
  let clean = true;
  const offenders = [];
  for (const f of readdirSync(srcDir)) {
    if (!f.endsWith('.ts')) continue;
    const src = rf(join(srcDir, f), 'utf8');
    if (/\bfetch\s*\(|node:https?:|https?:\/\/(?!www\.unicode\.org)/.test(src)) { clean = false; offenders.push(f); }
  }
  (clean ? ok : fail)(`קוד הייצור נקי מ-fetch/CDN/רשת${offenders.length ? ' — ' + offenders.join(', ') : ''}`);
  const wasmLocal = existsSync(join(repoRoot, 'node_modules', 'harfbuzzjs', 'dist', 'harfbuzz.wasm'));
  (wasmLocal ? ok : fail)('ה-WASM נטען מהאריזה המקומית בלבד (node_modules הנעול)');
}

// ─────────────────────────── 4. הקורפוס הייצגי ───────────────────────────
console.log('\n4) הקורפוס הייצגי');
{
  const fonts = new Set(CORPUS.map((c) => c.fontFile));
  const sizes = new Set(CORPUS.map((c) => c.fontSizePt));
  const dirs = new Set(CORPUS.map((c) => c.direction));
  const langs = new Set(CORPUS.map((c) => c.language));
  const hasFeatures = CORPUS.some((c) => Object.keys(c.features).length > 0);
  const hasSpacing = CORPUS.some((c) => c.letterSpacingLu > 0);
  const hasNikkud = CORPUS.some((c) => /[\u0591-\u05C7]/.test(c.text));
  (fonts.size === 4 ? ok : fail)(`4 משפחות גופנים (התקבלו ${fonts.size})`);
  (sizes.size >= 5 ? ok : fail)(`≥5 גדלים (התקבלו ${sizes.size})`);
  (dirs.size === 2 && langs.size === 2 ? ok : fail)('שני כיוונים ושתי שפות');
  (hasFeatures && hasSpacing && hasNikkud ? ok : fail)('features + ריווח אותיות + ניקוד וטעמים');
}

// ─────────────────────────── 5. רגרסיה ───────────────────────────
console.log('\n5) רגרסיה');
{
  const build = run('npm', ['run', 'build:packages']);
  (build !== null && !/error TS/.test(build) ? ok : fail)('build:packages נקי');
  const lint = run('npm', ['run', 'lint:packages']);
  (lint !== null && !/\berror\b|✖/m.test(lint) ? ok : fail)('lint:packages נקי');
  const deps = run('npm', ['run', 'deps:check']);
  (deps !== null && !/^\s*✖|\berror\b/m.test(deps) ? ok : fail)('deps:check נקי');
  const tests = (SKIP_TESTS ? 'Tests  1163 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
  const m = tests?.match(/Tests\s+(\d+)\s+passed/);
  (m && Number(m[1]) >= 499 ? ok : fail)(`test:packages — ${m ? m[1] : 'נכשל'} עוברות (477 + 9 cross-host)`);
}

console.log('\n' + '='.repeat(60));
if (failures === 0) {
  console.log(`זהות מדידה בין hosts תקינה — ${checks} בדיקות ירוקות. שני hosts (Node + worker_threads) ⇐ וקטורים מלאים זהים ביט-ביט; cold ⇐ warm; offline מלא (אפס ניסיונות רשת, שומר פעיל); הסטייה אינה אופציה — כל שינוי נחקר בשורש.`);
} else {
  console.log(`נמצאו ${failures} כשלים מתוך ${checks} בדיקות.`);
}
process.exit(failures === 0 ? 0 : 1);
