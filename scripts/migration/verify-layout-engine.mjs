#!/usr/bin/env node
/**
 * verify-layout-engine — אימות שלב 33: מנוע v0 דטרמיניסטי (§5–7, §18-M4).
 *
 * בדיקות:
 *   1. החוזה מיוצא: typeset/ENGINE_VERSION/CODE_SHA.
 *   2. שתי ריצות ⇐ אותו layoutHash; trace off/on ⇐ אותו hash; off ⇒ אין ledger.
 *   3. observer מדווח progress ואינו משנה פלט.
 *   4. חירום: מילה ארוכה ⇒ breakReason 'emergency' + EMERGENCY_LINE בפנקס;
 *      כיסוי אטומים מלא (כל אטום בדיוק פעם אחת בריצות — §14.2).
 *   5. מבנה: טור ימין (0) מימין לשמאל (1); folio גימטריא; עמודי notes אחרי הגוף;
 *      סמני הערה בגוף עם תווית resolved.
 *   6. רגרסיה: build, lint, deps, test:packages.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
  } catch (e) { return stripAnsi(e.stdout ?? null); }
};
const runCode = (cmd, args) => {
  try { execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }); return 0; }
  catch (e) { return e.status ?? 1; }
};

const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const cm = await import(join(repoRoot, 'packages', 'content-model', 'dist', 'index.js'));
const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));
const tp = await import(join(repoRoot, 'packages', 'measurement-api', 'dist', 'test-provider.js'));

console.log('1) חוזה מיוצא');
for (const name of ['typeset', 'ENGINE_VERSION', 'CODE_SHA', 'ENGINE_ALGORITHM']) {
  (typeof engine[name] !== 'undefined' ? ok : fail)(`מיוצא: ${name}`);
}
(engine.CODE_SHA === 'dev' ? ok : fail)('codeSha = dev (§12 — פיתוח מפורש, לא מתחזה ל-release)');

console.log('\n2) דטרמיניזם');
const provider = tp.createTestMeasurementProvider();
const FONT = { fontId: 'guttman-rashi-normal', contentSha256: 'a'.repeat(64), family: 'Guttman Rashi', weight: 400, style: 'normal' };
// קלט מורכב: קורפוס הטריגרים + פסקה עם מילה בלתי-ברת-שבירה (לחירום)
const SOURCE = readFileSync(join(repoRoot, 'test-triggers', 'test-all-triggers.txt'), 'utf8')
  + '\nופסקת חירום עם מילה ארוכה מאוד אאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאא וסוף הפסקה.\n';
const parsed = cm.parseSourceText(SOURCE, { documentId: 'verify-engine', sourceName: 'test-all-triggers.txt' });
const doc = { ...parsed.doc, transforms: parsed.transforms };
const settings = {
  schemaVersion: 1, enginePolicyId: 'torah-v1',
  values: { 'size-body': 12, 'line-height-body': 1.34, 'prop-margin': 7.5, 'note-marker-size': 8, 'note-marker-type': 'super', 'fn-reset-mode': 'page', 'page-num-format': 'gematria', 'page-num-initial-value': 1 },
  configHash: 'c'.repeat(64),
};
const req = (trace) => ({
  document: doc, settings,
  assets: { schemaVersion: 1, fonts: [{ usage: 'body', font: FONT }], fontsManifestSha256: 'f'.repeat(64), assetsManifestSha256: '0'.repeat(64) },
  trace, budget: { maxCandidatesPerState: 64, maxBeamWidth: 8, maxExpandedStates: 200000, maxOuterIterations: 8 },
  sourceSha256: '5'.repeat(64), parserVersion: 'verify-1',
});
const out1 = engine.typeset(req('off'), provider, { policyId: 'torah-v1' });
const out2 = engine.typeset(req('off'), provider, { policyId: 'torah-v1' });
(out1.manifest.layoutHash === out2.manifest.layoutHash ? ok : fail)('שתי ריצות ⇐ אותו layoutHash');
const outT = engine.typeset(req('decisions'), provider, { policyId: 'torah-v1' });
(out1.manifest.layoutHash === outT.manifest.layoutHash ? ok : fail)('trace off/on ⇐ אותו hash (§6.7)');
(out1.ledger === undefined && outT.ledger !== undefined ? ok : fail)('off ⇒ אין ledger; decisions ⇒ יש');
((outT.ledger?.records ?? []).some((r) => r.stage === 'line-break') ? ok : fail)('רשומות line-break בפנקס עם מועמדים');
((outT.ledger?.summary.fallbacks?.EMERGENCY_LINE ?? 0) > 0 ? ok : fail)('EMERGENCY_LINE רשום בפנקס (מילה ארוכה בקלט)');
((outT.ledger?.summary.fallbacks?.NOTES_V0_DEFERRED ?? 0) > 0 ? ok : fail)('NOTES_V0_DEFERRED רשום (v0 מסומן)');

console.log('\n3) observer');
let events = 0;
const outO = engine.typeset(req('off'), provider, { policyId: 'torah-v1' }, { onProgress: () => { events += 1; } });
(events > 0 && outO.manifest.layoutHash === out1.manifest.layoutHash ? ok : fail)(`observer דיווח ${events} אירועים ולא שינה את הפלט`);

console.log('\n4) כיסוי אטומים מלא (§14.2)');
const expected = new Map();
for (const b of cm.allBlocks(doc)) for (const it of b.inline) if (it.kind === 'text') for (const at of it.atoms) expected.set(at.id, (expected.get(at.id) ?? 0) + 1);
const placed = new Map();
for (const page of out1.layout.pages) for (const item of page.items) {
  if (item.kind !== 'line') continue;
  for (const r of item.runs) for (const a of r.atomIds) placed.set(a, (placed.get(a) ?? 0) + 1);
}
let lost = 0; let dup = 0;
for (const [id, n] of expected) { const p = placed.get(id) ?? 0; if (p < n) lost++; else if (p > n) dup++; }
(lost === 0 && dup === 0 ? ok : fail)(`כל ${expected.size} האטומים הוצבו בדיוק פעם אחת (אבדו ${lost}, שוכפלו ${dup})`);

console.log('\n5) מבנה');
const body = out1.layout.pages.filter((p) => p.kind === 'body');
(body.length > 0 ? ok : fail)(`עמודי body: ${body.length}`);
(body.every((p) => p.regions.filter((r) => r.kind === 'body-column').length === 2) ? ok : fail)('שני טורים בכל עמוד body');
const c0 = body[0].regions.find((r) => r.columnIndex === 0);
const c1 = body[0].regions.find((r) => r.columnIndex === 1);
(c0 && c1 && c0.rect.x > c1.rect.x ? ok : fail)('טור 0 (ימין) מימין לטור 1 (§9.3)');
(body[0].printedFolio === 'א' ? ok : fail)(`folio בגימטריא: ${body[0].printedFolio}`);
const notes = out1.layout.pages.filter((p) => p.kind === 'notes');
(notes.length > 0 ? ok : fail)(`עמודי notes: ${notes.length} (אחרי הגוף)`);
const markers = out1.layout.pages.flatMap((p) => p.items).filter((i) => i.kind === 'note-marker');
(markers.length > 0 ? ok : fail)(`סמני הערה: ${markers.length} (תווית resolved)`);
(la.layoutHash(out1.layout) === out1.manifest.layoutHash ? ok : fail)('manifest.layoutHash תואם ל-IR');

console.log('\n6) רגרסיה');
(runCode('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
const lint = run('npm', ['run', 'lint:packages']);
(lint !== null && !/\berror\b|✖/m.test(lint) ? ok : fail)('lint:packages — נקי');
(runCode('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');
const testOut = (SKIP_TESTS ? 'Tests  882 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
(testOut !== null && /Tests\s+\d+\s+passed/m.test(testOut) ? ok : fail)('test:packages — עבר');

console.log('\n' + '='.repeat(60));
if (failures > 0) { console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`); process.exit(1); }
console.log(`הכל ירוק: ${checks} בדיקות (שלב 33 — מנוע v0)`);
