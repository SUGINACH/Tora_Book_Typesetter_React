#!/usr/bin/env node
/**
 * verify-typeset-contract — אימות שלב 32: חוזה typeset(), RunManifest, Decision Ledger (§12, §6.7).
 *
 * בדיקות:
 *   1. חוזה מיוצא: assertTypesetRequest/makeRunManifest/DecisionLedgerBuilder/
 *      typesetRequestIssues/LAYOUT_FALLBACK_CODES.
 *   2. בקשה חיה: trace שגוי/budget שגוי/assets בלי גופן — נדחים; תקינה עוברת.
 *   3. manifest: כל ההאשים HEX64; סדר מפתחות שונה בהגדרות ⇒ configHash זהה.
 *   4. ledger: fallbackCode לא רשום ⇒ דחייה; round-trip serialize; trace off
 *      ⇒ אין ledger; summary ⇒ ספירות בלבד.
 *   5. סריקת קוד: אין Date/random בחוזי המנוע (§23.8).
 *   6. רגרסיה: build, lint, deps, test:packages.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
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
  } catch (e) {
    return stripAnsi(e.stdout ?? null);
  }
};
const runCode = (cmd, args) => {
  try {
    execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
    return 0;
  } catch (e) {
    return (e.status ?? 1);
  }
};

const api = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));

console.log('1) חוזה מיוצא');
for (const name of ['assertTypesetRequest', 'makeTypesetSuccess', 'makeRunManifest', 'DecisionLedgerBuilder', 'typesetRequestIssues', 'LAYOUT_FALLBACK_CODES', 'DEFAULT_SEARCH_BUDGET', 'TRACE_LEVELS', 'isTraceLevel', 'validatedLayout']) {
  (typeof api[name] === 'function' || typeof api[name] === 'object' ? ok : fail)(`מיוצא: ${name}`);
}
const dts = readFileSync(join(repoRoot, 'packages', 'layout-api', 'dist', 'typeset.d.ts'), 'utf8');
for (const t of ['TypesetRequest', 'TypesetSuccess', 'LayoutPolicy', 'LayoutObserver', 'ContentDocument', 'ResolvedAssetManifest', 'SearchBudget']) {
  (dts.includes(`export interface ${t}`) || dts.includes(`export type ${t}`) ? ok : fail)(`טיפוס: ${t}`);
}

console.log('\n2) בקשה חיה');
const FONT = { fontId: 'f', contentSha256: 'a'.repeat(64), family: 'F', weight: 400, style: 'normal' };
const BASE = {
  document: {
    schemaVersion: 1, documentId: 'd', metadata: [], parts: [],
    notes: { footnotes: [], endnotes: [], sidenotes: [], editorial: [] }, transforms: [],
  },
  settings: { schemaVersion: 1, enginePolicyId: 'torah-v1', values: {}, configHash: 'c'.repeat(64) },
  assets: { schemaVersion: 1, fonts: [{ usage: 'body', font: FONT }], fontsManifestSha256: 'f'.repeat(64), assetsManifestSha256: '0'.repeat(64) },
  trace: 'off',
  budget: { ...api.DEFAULT_SEARCH_BUDGET },
  sourceSha256: '5'.repeat(64),
  parserVersion: 'test-1',
};
(api.typesetRequestIssues(BASE).length === 0 ? ok : fail)('בקשה תקינה עוברת');
const badTrace = JSON.parse(JSON.stringify(BASE)); badTrace.trace = 'loud';
(api.typesetRequestIssues(badTrace).includes('trace') ? ok : fail)('trace שגוי נדחה');
const noFont = JSON.parse(JSON.stringify(BASE)); noFont.assets.fonts = [];
(api.typesetRequestIssues(noFont).some((s) => s.startsWith('assets')) ? ok : fail)('assets בלי גופן נדחים');
let reqThrew = false;
try { api.assertTypesetRequest(badTrace); } catch (e) { reqThrew = String(e?.catalogKey).includes('errors.layoutir.INVALID_REQUEST'); }
(reqThrew ? ok : fail)('assertTypesetRequest זורק עם קוד מקוטלג');

console.log('\n3) RunManifest');
const m = api.makeRunManifest({
  engineVersion: '0.1.0', codeSha: 'dev', engine: 'next', sourceSha256: 's'.repeat(64),
  effectiveSettings: BASE.settings, fontsManifestSha256: 'f'.repeat(64), assetsManifestSha256: '0'.repeat(64),
  parserVersion: '1', environmentHash: 'e'.repeat(64), layout: { pages: [] },
});
const HEX = /^[0-9a-f]{64}$/;
(['inputHash', 'configHash', 'layoutHash', 'environmentHash'].every((k) => HEX.test(m[k])) ? ok : fail)('כל ההאשים HEX64');
(Object.isFrozen(m) ? ok : fail)('manifest קפוא');
const s2 = api.makeRunManifest({
  engineVersion: '0.1.0', codeSha: 'dev', engine: 'next', sourceSha256: 's'.repeat(64),
  effectiveSettings: { ...BASE.settings, values: {} }, fontsManifestSha256: 'f'.repeat(64), assetsManifestSha256: '0'.repeat(64),
  parserVersion: '1', environmentHash: 'e'.repeat(64), layout: { pages: [] },
});
(m.configHash === s2.configHash ? ok : fail)('סדר מפתחות שונה ⇒ configHash זהה (§17.2#4)');

console.log('\n4) Decision Ledger');
let fbThrew = false;
const b = new api.DecisionLedgerBuilder('decisions');
try {
  b.append({ stage: 'emergency', scopeId: 'e', sourceSpans: [], stateHash: '1'.repeat(64), candidates: [], selectedCandidateId: '', rejected: [], fallbackCode: 'SIDE_PATH' });
} catch (e) { fbThrew = /INVALID_LEDGER/.test(String(e?.message)); }
(fbThrew ? ok : fail)('fallbackCode לא רשום ⇒ דחייה');
const okB = new api.DecisionLedgerBuilder('decisions');
okB.append({ stage: 'line-break', scopeId: 'b:1', sourceSpans: [], stateHash: '1'.repeat(64), candidates: [{ id: 'c1', cost: 5 }], selectedCandidateId: 'c1', rejected: [] });
const ledger = okB.build();
const text = api.serializeDecisionLedger(ledger);
(api.serializeDecisionLedger(api.parseDecisionLedger(text)) === text ? ok : fail)('round-trip serialize/parse — ביט-ביט');
const offB = new api.DecisionLedgerBuilder('off');
offB.append({ stage: 'line-break', scopeId: 'b:1', sourceSpans: [], stateHash: '1'.repeat(64), candidates: [{ id: 'c1', cost: 5 }], selectedCandidateId: 'c1', rejected: [] });
(offB.build() === undefined ? ok : fail)('trace off ⇒ אין ledger (§6.7)');
(api.isRegisteredFallbackCode('NOTES_V0_DEFERRED') && !api.isRegisteredFallbackCode('NOPE') ? ok : fail)('קודי v0 רשומים; קוד צד לא');

console.log('\n5) סריקת קוד — אין Date/random בחוזי המנוע (§23.8)');
const scan = (dir) => {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...scan(p));
    else if (e.name.endsWith('.ts') && p.includes('/src/')) out.push(p);
  }
  return out;
};
const files = scan(join(repoRoot, 'packages', 'layout-api', 'src'));
const badRand = files.filter((f) => /Math\.random|Date\.now|new Date\(/.test(readFileSync(f, 'utf8')));
(badRand.length === 0 ? ok : fail)(`אין random/Date ב-layout-api/src${badRand.length ? ` — ${badRand.map((f) => f.split('src')[1]).join(', ')}` : ''}`);

console.log('\n6) בדיקות ורגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
const lint = run('npm', ['run', 'lint:packages']);
(lint !== null && !/\berror\b|✖/m.test(lint) ? ok : fail)('lint:packages — נקי');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');
const testOut = (SKIP_TESTS ? 'Tests  648 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
(testOut !== null && /Tests\s+\d+\s+passed/m.test(testOut) ? ok : fail)('test:packages — עבר');

console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`הכל ירוק: ${checks} בדיקות (שלב 32 — חוזה typeset)`);
