#!/usr/bin/env node
/**
 * verify-adr008-lines — אימות שלב 88: [ADR-008] ייצוג קווי טקסט ב־HTML
 * (תכנית 88; אפיון §15.3, §16; ADR-008).
 *
 * שעת השלב: "אין אובדן נוסח או סדר קריאה בהיטל".
 *
 * נבדק פונקציונלית בתהליך (כמו verify-render-html): מנוע אמיתי על
 * test-all-triggers ⇒ IR ⇒ renderHtml, ואז ניתוח ה־HTML:
 *   1. קנוניות — שתי הרצות ביט-ביט.
 *   2. אפס כפילות/אובדן — מיפוי 1:1 בין data-run-id בקובץ לבין ריצות
 *      ה־IR; הטקסט המוצג של כל ריצה === הטקסט הלוגי מהמקור (logicalTextOfRun).
 *   3. BiDi — טקסט לוגי של ריצת rtl === פרוסת המקור בסדר אטומים הפוך
 *      (מזהי האטומים מקודדים טווחי מקור); ריצת ltr — חזותי===לוגי.
 *   4. נגישות — role="region"+aria-label לכל עמוד; aria-hidden לפיגומי
 *      המיקום הריקים; lang="he" ו-dir="rtl" ברמת המסמך.
 *   5. selection — data-run-id + data-run-direction לכל ריצה (המיפוי
 *      המלא ל-SourceSpan במעטפת — שלב 81; כאן הזמינות בפלט).
 */
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };

console.log('0) מסמך ההחלטה');
const adr = readFileSync(join(repoRoot, 'docs', 'adr', 'ADR-008-html-line-representation.md'), 'utf8');
/## ההחלטה/.test(adr) && /חלופות שנדחו/.test(adr) ? ok('ADR-008 — הקשר/החלטה/חלופות קיימים') : fail('ADR-008 חסר מבנה');
const adrReadme = readFileSync(join(repoRoot, 'docs', 'adr', 'README.md'), 'utf8');
/\| ADR-008 \|[^|]+\| 88 \| מקובל \|/.test(adrReadme) ? ok('docs/adr/README — ADR-008 מקובל') : fail('README — ADR-008 אינו מסומן מקובל');

const rh = await import(join(repoRoot, 'packages', 'render-html', 'dist', 'index.js'));
const la = await import(join(repoRoot, 'packages', 'layout-api', 'dist', 'index.js'));
const engine = await import(join(repoRoot, 'packages', 'layout-engine', 'dist', 'index.js'));
const cm = await import(join(repoRoot, 'packages', 'content-model', 'dist', 'index.js'));
const tp = await import(join(repoRoot, 'packages', 'measurement-api', 'dist', 'test-provider.js'));

const provider = tp.createTestMeasurementProvider();
const FONT = { fontId: 'guttman-rashi-normal', contentSha256: 'a'.repeat(64), family: 'Guttman Rashi', weight: 400, style: 'normal' };
const SOURCE = readFileSync(join(repoRoot, 'test-triggers', 'test-all-triggers.txt'), 'utf8');
const parsed = cm.parseSourceText(SOURCE, { documentId: 'verify-adr008', sourceName: 't.txt' });
const doc = { ...parsed.doc, transforms: parsed.transforms };
const settings = { schemaVersion: 1, enginePolicyId: 'torah-v1', values: { 'size-body': 12, 'line-height-body': 1.34, 'prop-margin': 7.5, 'note-marker-size': 8, 'note-marker-type': 'super', 'fn-reset-mode': 'page', 'page-num-format': 'gematria', 'page-num-initial-value': 1 }, configHash: 'c'.repeat(64) };
const req = { document: doc, settings, assets: { schemaVersion: 1, fonts: [{ usage: 'body', font: FONT }], fontsManifestSha256: 'f'.repeat(64), assetsManifestSha256: '0'.repeat(64) }, trace: 'off', budget: { maxCandidatesPerState: 64, maxBeamWidth: 8, maxExpandedStates: 200000, maxOuterIterations: 8 }, sourceSha256: '5'.repeat(64), parserVersion: 'v1' };
const out = engine.typeset(req, provider, { policyId: 'torah-v1' });
const ASSETS = { schemaVersion: 1, fonts: [{ fontId: 'guttman-rashi-normal', family: 'Guttman Rashi', file: 'Guttman-Rashi-Normal.woff2', format: 'woff2', contentSha256: 'a'.repeat(64) }] };

console.log('\n1) קנוניות ביט-ביט');
const r1 = rh.renderHtml(out.layout, undefined, ASSETS, undefined, { source: SOURCE });
const r2 = rh.renderHtml(out.layout, undefined, ASSETS, undefined, { source: SOURCE });
(r1.html === r2.html ? ok : fail)('שתי הרצות ⇒ אותם bytes');

console.log('\n2) אפס כפילות/אובדן — מיפוי 1:1 ל-IR');
const runsInIr = [];
for (const p of out.layout.pages) for (const it of p.items) if (it.kind === 'line') for (const r of it.runs) runsInIr.push(r);
const htmlRuns = [...r1.html.matchAll(/<span class="tora-run" dir="(rtl|ltr)" data-run-id="([^"]+)" data-run-direction="(rtl|ltr)"/g)];
const idsInHtml = new Map();
for (const m of htmlRuns) idsInHtml.set(m[2], (idsInHtml.get(m[2]) ?? 0) + 1);
(runsInIr.length === htmlRuns.length ? ok : fail)(`מספר הריצות בקובץ === ב-IR (${htmlRuns.length}/${runsInIr.length})`);
let dupLoss = 0;
for (const r of runsInIr) if ((idsInHtml.get(r.id) ?? 0) !== 1) dupLoss += 1;
(dupLoss === 0 ? ok : fail)(`כל ריצה בדיוק פעם אחת (חריגות: ${dupLoss})`);
let textMismatch = 0;
let checkedText = 0;
for (const r of runsInIr) {
  const idx = r1.html.indexOf(`data-run-id="${r.id}"`);
  if (idx < 0) { textMismatch += 1; continue; }
  const seg = r1.html.slice(idx, idx + 2000);
  const m = seg.match(/>([^<]*)<\/span>/);
  const displayed = m === null ? null : m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const logical = rh.logicalTextOfRun(r, SOURCE);
  checkedText += 1;
  // ההיטל חותך רווחי-רפאים (U+0020 בלבד) בקצה הלוגי של ריצת ראש-קו
  // (isLineVisualStart): זנב ל-rtl, ראש ל-ltr — ולכן המוצג הוא הלוגי
  // לאחר חיתוך רווחים משני הצדדים (או הלוגי כמו שהוא).
  const trimmed = r.direction === 'rtl' ? logical.replace(/ +$/, '') : logical.replace(/^ +/, '');
  if (displayed === null || (displayed !== logical && displayed !== trimmed)) textMismatch += 1;
}
(textMismatch === 0 ? ok : fail)(`הטקסט המוצג של כל ריצה === קידומת הטקסט הלוגי (${checkedText} נבדקו; ${textMismatch} חריגות)`);

console.log('\n3) BiDi — נאמנות למקור דרך מזהי האטומים');
let bidiBad = 0; let bidiChecked = 0;
for (const r of runsInIr) {
  if (r.atomIds.length === 0) continue;
  bidiChecked += 1;
  const logical = rh.logicalTextOfRun(r, SOURCE);
  // שחזור עצמאי: פרוסות המקור לפי הטווחים המקודדים במזהים, בסדר אטומים
  // הפוך לריצת rtl / ישר ל-ltr — חייב להתאים ביט-ביט ל-logicalTextOfRun.
  const parts = [];
  const ids = r.direction === 'rtl' ? [...r.atomIds].reverse() : r.atomIds;
  for (const id of ids) {
    const f = String(id).split('|');
    if (f.length !== 6 || f[0] !== 'atom:v1') { bidiBad += 1; continue; }
    if (f[4] === 'parser:paragraph-join') { parts.push(' '); continue; }
    if (f[4] !== 'src') { bidiBad += 1; continue; }
    const [s, e] = f[3].split('+').map(Number);
    if (!Number.isSafeInteger(s) || !Number.isSafeInteger(e)) { bidiBad += 1; continue; }
    parts.push(SOURCE.slice(s, e));
  }
  if (parts.join('') !== logical) bidiBad += 1;
}
(bidiBad === 0 ? ok : fail)(`טקסט לוגי שווה לשחזור עצמאי מהמקור (${bidiChecked} ריצות; ${bidiBad} חריגות)`);

console.log('\n4) נגישות — reading order ופיגומים');
const pages = (r1.html.match(/<section class="tora-page"/g) ?? []).length;
const withRole = (r1.html.match(/role="region" aria-label="עמוד /g) ?? []).length;
(pages > 0 && pages === withRole ? ok : fail)(`כל עמוד role=region+aria-label (${withRole}/${pages})`);
const regions = (r1.html.match(/<div class="tora-region"/g) ?? []).length;
const regionsHidden = (r1.html.match(/<div class="tora-region"[^>]*aria-hidden="true"/g) ?? []).length;
(regions === regionsHidden ? ok : fail)(`פיגומי אזור aria-hidden (${regionsHidden}/${regions})`);
const anchors = (r1.html.match(/<span class="tora-anchor"/g) ?? []).length;
const anchorsHidden = (r1.html.match(/<span class="tora-anchor"[^>]*aria-hidden="true"/g) ?? []).length;
(anchors === anchorsHidden ? ok : fail)(`עוגנים aria-hidden (${anchorsHidden}/${anchors})`);
/<html dir="rtl" lang="he">/.test(r1.html) ? ok('lang="he" dir="rtl" ברמת המסמך') : fail('חסר lang/dir ברמת המסמך');

console.log('\n5) selection — מזהים למיפוי ל-SourceSpan');
const withDir = (r1.html.match(/data-run-direction="(rtl|ltr)"/g) ?? []).length;
(withDir === htmlRuns.length && withDir > 0 ? ok : fail)(`data-run-direction לכל ריצה (${withDir}/${htmlRuns.length})`);
const linesWithSource = (r1.html.match(/data-source-id="/g) ?? []).length;
(linesWithSource > 0 ? ok : fail)(`קווים נושאים data-source-id (${linesWithSource})`);

console.log(`\nתוצאה: ${checks - failures}/${checks}`);
process.exit(failures === 0 ? 0 : 1);
