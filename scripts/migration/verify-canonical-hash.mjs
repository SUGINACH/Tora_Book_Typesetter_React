#!/usr/bin/env node
/**
 * verify-canonical-hash — אימות הגיבוב הקנוני ושלושת ה־hashes (שלב 10 בתכנית 100 השלבים).
 * אסמכתא: אפיון §4.3, §22.2 · docs/adr/ADR-002-canonical-hash.md
 *
 * בדיקות:
 *   1. ADR-002 קיים ומכסה: canonical JSON, SHA-256, הגדרות ה־hashes, חלופות, תנאי ביטול.
 *   2. ה־API בזמן ריצה מה־dist: canonicalJson, sha256Hex, inputHash, configHash,
 *      layoutHash, runFingerprint, environmentHash, fnv1a32.
 *   3. וקטור FIPS-180-4 חי: sha256('abc').
 *   4. שער השימור בזמן ריצה: סדר מפתחות לא משנה; סריאליזציה←פרסור משמר layoutHash.
 *   5. בדיקות היחידה (vitest) ירוקות — כולל האורקל של node:crypto.
 *   6. רגרסיה: build + typecheck + lint + deps + units.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let failures = 0;
let checks = 0;
const ok = (m) => { checks++; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks++; failures++; console.log(`  [FAIL] ${m}`); };
const run = (cmd, args) => {
  try {
    execFileSync(cmd, args, { cwd: repoRoot, stdio: 'pipe' });
    return 0;
  } catch {
    return 1;
  }
};

// ---------- 1. ה־ADR ----------
console.log('1) מסמך ADR-002');
const adrPath = join(repoRoot, 'docs', 'adr', 'ADR-002-canonical-hash.md');
(existsSync(adrPath) ? ok : fail)('docs/adr/ADR-002-canonical-hash.md קיים');
if (existsSync(adrPath)) {
  const adr = readFileSync(adrPath, 'utf8');
  for (const frag of ['canonicalJson', 'SHA-256', 'layoutHash', 'inputHash', 'configHash', 'FNV-1a', 'חלופות', 'תנאי ביטול', 'node:crypto']) {
    (adr.includes(frag) ? ok : fail)(`ADR מכסה: ${frag}`);
  }
}

// ---------- 2–4. ה־API והשערים בזמן ריצה ----------
console.log('\n2) ה־API בזמן ריצה (מה־dist הבנוי)');
const api = await import('@tora/layout-api');
for (const name of ['canonicalJson', 'sha256Hex', 'sha256Bytes', 'inputHash', 'configHash',
  'layoutHash', 'runFingerprint', 'environmentHash', 'fnv1a32', 'CanonicalHashError']) {
  (name in api ? ok : fail)(`ייצוא: ${name}`);
}

console.log('\n3) וקטור FIPS-180-4 חי');
(api.sha256Hex('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  ? ok : fail)("sha256Hex('abc') = ba7816bf…15ad");
(api.sha256Hex('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  ? ok : fail)("sha256Hex('') = e3b0c442…b855");
(api.fnv1a32('a') === 'e40c292c' ? ok : fail)("fnv1a32('a') = e40c292c (היסטורי)");

console.log('\n4) שער השימור בזמן ריצה (ADR-002 §6)');
const irA = { schemaVersion: 1, pages: [{ id: 'p1', cols: [{ x: 1 }, { x: 2 }] }] };
const irB = JSON.parse(api.canonicalJson(irA));
(api.layoutHash(irA) === api.layoutHash(irB)
  ? ok : fail)('סריאליזציה ← פרסור משמרת layoutHash');
const shuffled = {};
shuffled['pages'] = irA.pages;
shuffled['schemaVersion'] = irA.schemaVersion;
(api.canonicalJson(shuffled) === api.canonicalJson(irA)
  ? ok : fail)('סדר הכנסת מפתחות אינו משנה את הסריאליזציה הקנונית');
try {
  api.canonicalJson({ bad: undefined });
  fail('canonicalJson היה צריך לדחות undefined');
} catch (e) {
  (e?.name === 'CanonicalHashError' ? ok : fail)('canonicalJson דוחה undefined ב-CanonicalHashError');
}

// ---------- 5. בדיקות היחידה ----------
console.log('\n5) בדיקות יחידה (vitest, כולל אורקל node:crypto)');
(run('npm', ['run', 'test:packages']) === 0 ? ok : fail)('npm run test:packages — PASS');

// ---------- 6. רגרסיה ----------
console.log('\n6) רגרסיה');
(run('npm', ['run', 'build:packages']) === 0 ? ok : fail)('build:packages — PASS');
(run('npm', ['run', 'typecheck:packages']) === 0 ? ok : fail)('typecheck:packages — PASS');
(run('npm', ['run', 'lint:packages']) === 0 ? ok : fail)('lint:packages — PASS');
(run('npm', ['run', 'deps:check']) === 0 ? ok : fail)('deps:check — PASS');
(run('node', ['scripts/migration/verify-units.mjs']) === 0 ? ok : fail)('verify-units — PASS (רגרסיה)');

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`הגיבוב הקנוני תקין — ${checks} בדיקות ירוקות. גיבוב יציב; שינוי סדר keys אינו משנה hash; סריאליזציה←פרסור משמרת layoutHash.`);
