#!/usr/bin/env node
/**
 * verify-parity-matrix — אימות מטריצת parity בפועל (שלב 5 בתכנית 100 השלבים).
 * אסמכתא: אפיון §2 (כללי פרשנות), §3.1 · תכנית 100 השלבים, שלב 5.
 *
 * בדיקות:
 *   1. מבנה: לכל טענה יש מזהה ייחודי, נוסח, מקור וסטטוס מפורש מתוך הקבוצה הסגורה.
 *   2. כל טענה "verified" מאומתת מחדש בפועל: פריסת ה־artifact (gzip אם צריך),
 *      ניווט לשדה לפי הנתיב הנקודתי (כולל .length) והשוואת הערך הצפוי.
 *   3. כל טענה "historical" אינה יעד differential ומתועדת בהערה.
 *   4. יעדי ה־differential הם תת־קבוצה של הטענות המאומתות בלבד.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
let failures = 0;
let checks = 0;
const ok = (m) => { checks++; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks++; failures++; console.log(`  [FAIL] ${m}`); };

const matrix = JSON.parse(readFileSync(join(repoRoot, 'docs', 'migration', 'parity-matrix.json'), 'utf8'));
const STATUSES = new Set(['verified', 'historical', 'documented-principle']);

// ---------- 1. מבנה ----------
console.log('1) מבנה המטריצה');
const claims = matrix.claims ?? [];
(claims.length >= 15 ? ok : fail)(`מספר טענות: ${claims.length} (צפוי ≥ 15)`);
const ids = new Set();
for (const c of claims) {
  if (ids.has(c.id)) fail(`מזהה כפול: ${c.id}`);
  ids.add(c.id);
  if (!c.claim || !c.source) fail(`${c.id}: חסר נוסח או מקור`);
  if (!STATUSES.has(c.status)) fail(`${c.id}: סטטוס לא מפורש (${c.status})`);
}
ok('לכל טענה יש מזהה ייחודי, נוסח, מקור וסטטוס מפורש');
const summary = matrix.summary ?? {};
const recount = {
  total: claims.length,
  verified: claims.filter((c) => c.status === 'verified').length,
  historical: claims.filter((c) => c.status === 'historical').length,
  documentedPrinciple: claims.filter((c) => c.status === 'documented-principle').length,
  differentialTargets: claims.filter((c) => c.differentialTarget).length,
};
for (const [k, v] of Object.entries(recount)) {
  (summary[k] === v ? ok : fail)(`סיכום ${k}: ${v} תואם לרישום (${summary[k]})`);
}

// ---------- 2. אימות מחדש של הטענות המאומתות ----------
console.log('\n2) אימות מחדש מול artifacts בפועל');
const artifactCache = new Map();
const loadArtifact = (rel) => {
  if (artifactCache.has(rel)) return artifactCache.get(rel);
  const p = join(repoRoot, rel);
  if (!existsSync(p)) return null;
  let text;
  if (rel.endsWith('.gz')) text = gunzipSync(readFileSync(p)).toString('utf8');
  else text = readFileSync(p, 'utf8');
  const obj = JSON.parse(text);
  artifactCache.set(rel, obj);
  return obj;
};
const navigate = (obj, field) => {
  let cur = obj;
  for (const part of field.split('.')) {
    if (cur === null || cur === undefined || !(part in Object(cur))) return { missing: true };
    cur = cur[part];
  }
  return { value: cur };
};
let verifiedCount = 0;
for (const c of claims) {
  if (c.status !== 'verified') continue;
  verifiedCount++;
  const art = loadArtifact(c.evidence?.artifact);
  if (!art) { fail(`${c.id}: artifact לא נמצא — ${c.evidence?.artifact}`); continue; }
  let allOk = true;
  for (const ch of c.evidence.checks ?? []) {
    const { value, missing } = navigate(art, ch.field);
    const equal = !missing && JSON.stringify(value) === JSON.stringify(ch.expected);
    if (!equal) {
      allOk = false;
      fail(`${c.id}: ${ch.field} = ${JSON.stringify(value)} ≠ צפוי ${JSON.stringify(ch.expected)}`);
    }
  }
  if (allOk) ok(`${c.id}: ${c.evidence.checks.length} בדיקות שדה אומתו מול ${c.evidence.artifact.split('/').pop()}`);
}
ok(`סה"כ ${verifiedCount} טענות מאומתות — כולן נבדקו מחדש מול הפלט בפועל`);

// ---------- 3. טענות היסטוריות ----------
console.log('\n3) טענות היסטוריות (SHA-locked)');
for (const c of claims) {
  if (c.status !== 'historical') continue;
  if (c.differentialTarget) fail(`${c.id}: טענה היסטורית אינה יכולה להיות יעד differential`);
  if (!c.note) fail(`${c.id}: טענה היסטורית בלי הערת הסבר`);
  else ok(`${c.id}: מסומנת היסטורית עם הערה, אינה יעד`);
}

// ---------- 4. יעדי differential ----------
console.log('\n4) יעדי differential (שלב 48 ואילך)');
for (const c of claims) {
  if (c.differentialTarget && c.status !== 'verified') {
    fail(`${c.id}: יעד differential חייב להיות טענה מאומתת (סטטוס: ${c.status})`);
  }
}
ok(`כל ${recount.differentialTargets} יעדי ה־differential הם טענות מאומתות בלבד`);

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`מטריצת ה־parity תקינה — ${checks} בדיקות ירוקות. לכל טענה סטטוס מפורש; כל טענה מאומתת נבדקה מחדש מול הפלט.`);
