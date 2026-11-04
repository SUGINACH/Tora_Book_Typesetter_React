#!/usr/bin/env node
/**
 * gen-release-manifest.mjs — נעילת ה-golden של קורפוס ה-release (שלב 74; אפיון
 * §17.3, §18-M8; תכנית שלב 74).
 *
 * מה נעשה כאן:
 *   1. הרצת כל קורפוס ה-release (9 fixtures) דרך ה-CLI כתהליכי-בן:
 *      ה-reference במסלול ההרכבה (--compose: שערים + עמודי TOC מיוצבים +
 *      preview.html), השאר במסלול v0 הישיר — עם ההגדרות הנעולות של ה-release.
 *   2. נעילת ה-golden לכל fixture: layoutHash, עמודים, סוגי עמודים, ביקורת
 *      (חייב 0 HIGH), שימור אטומים, sourceSha256, settingsSha256,
 *      fontsManifestSha256, assetsManifestSha256 — **אין קלט חיצוני לא נעול**.
 *   3. כתיבת packages/test-fixtures/release-golden.json — מסמך הייחוס שכל
 *      release חייב לעבור (שער השלב).
 *
 * דטרמיניזם: אין חותמות זמן; אותן תוצאות בכל הרצה.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = join(repoRoot, 'packages', 'test-fixtures');
const BIN = join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
const SETTINGS = join(FIX, 'corpus', 'release', 'settings', 'release-reference-settings.json');

const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const registry = JSON.parse(readFileSync(join(FIX, 'registry.json'), 'utf8'));
const releaseFixtures = registry.fixtures.filter((f) => f.kind === 'release');

const tmp = join(tmpdir(), 'gen-release-74');
const records = [];
for (const f of releaseFixtures) {
  const input = join(FIX, f.corpusFile.path);
  const out = join(tmp, f.id);
  const args = ['--input', input, '--out', out, '--trace', 'summary'];
  const useSettings = f.settings.sha256 === sha256File(SETTINGS);
  if (useSettings) args.push('--settings', SETTINGS);
  if (f.id === 'release-reference-document') args.push('--compose', '--html', '--repeat', '2');
  process.stderr.write(`  ${f.id}… `);
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    process.stderr.write(`FAIL(${r.status})\n`);
    process.stderr.write((r.stderr ?? '').slice(0, 400) + '\n');
    process.exit(1);
  }
  const report = JSON.parse((r.stdout ?? '').trim().split('\n').pop());
  const layout = JSON.parse(readFileSync(join(out, 'layout.json'), 'utf8'));
  const audit = JSON.parse(readFileSync(join(out, 'audit.json'), 'utf8'));
  const kinds = [...new Set(layout.pages.map((p) => p.kind))].sort();
  const request = JSON.parse(readFileSync(join(out, 'request.json'), 'utf8'));
  records.push({
    fixtureId: f.id,
    pipeline: f.id === 'release-reference-document' ? 'compose' : 'v0',
    sourceSha256: f.corpusFile.sha256,
    settingsSha256: request.assets ? sha256OfSettings(request) : f.settings.sha256,
    fontsManifestSha256: request.assets.fontsManifestSha256,
    assetsManifestSha256: request.assets.assetsManifestSha256,
    layoutHash: report.layoutHash,
    pages: report.pages,
    notesPages: report.notesPages,
    pageKinds: kinds,
    auditOk: report.audit.ok,
    auditHigh: report.audit.high,
    atomsContent: audit.stats.contentAtoms,
    atomsPlaced: audit.stats.placedAtomOccurrences,
    deterministic: report.deterministic,
    html: f.id === 'release-reference-document',
    previewHtmlBytes: existsSync(join(out, 'preview.html')) ? readFileSync(join(out, 'preview.html')).length : null,
    invariantsExpected: f.expected.invariants,
  });
  process.stderr.write(`OK (${report.pages}p, ${kinds.join('/')})\n`);
}

function sha256OfSettings(request) {
  return createHash('sha256').update(JSON.stringify(request.settings)).digest('hex');
}

const golden = {
  schemaVersion: 1,
  generatedAtStage: 74,
  authority: 'תכנית 100 השלבים, שלב 74 · אפיון §17.3, §17.4, §18-M8 · המסמך שכל release חייב לעבור',
  method: 'הרצת קורפוס ה-release דרך ה-CLI האמיתי (offline) עם הקלטים הנעולים; ה-reference במסלול ההרכבה (--compose) עם שערים ועמודי TOC מיוצבים בנקודת השבת (ADR-011)',
  records,
  summary: {
    fixtures: records.length,
    allZeroHigh: records.every((r) => r.auditHigh === 0 && r.auditOk === true),
    allAtomsConserved: records.every((r) => r.atomsContent === r.atomsPlaced),
    allDeterministic: records.every((r) => r.deterministic === true),
    composePipeline: records.filter((r) => r.pipeline === 'compose').length,
  },
};
const outPath = join(FIX, 'release-golden.json');
writeFileSync(outPath, JSON.stringify(golden, null, 1) + '\n');
process.stderr.write(`נכתב: ${outPath} (${records.length} records)\n`);
if (!golden.summary.allZeroHigh || !golden.summary.allAtomsConserved) process.exit(1);
