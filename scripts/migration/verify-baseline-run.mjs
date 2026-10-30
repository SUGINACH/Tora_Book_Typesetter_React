#!/usr/bin/env node
/**
 * verify-baseline-run — אימות בייסליין ריצת המנוע הישן (שלב 3 בתכנית 100 השלבים).
 * אסמכתא: אפיון §18-M0 · תכנית 100 השלבים, שלב 3.
 *
 * בדיקות:
 *   1. מבנה baseline-run.json: 6 ריצות, שדות חובה לכל ריצה (קלט, hash, artifacts, תוצאה).
 *   2. לכל ריצה: קובץ הדוח הדחוס קיים; פריסתו לנתונים גולמיים נותנת את reportRawSha256;
 *      sha256 של הקובץ הדחוס תואם; הסיכום קיים ותואם; inputSha256 הפנימי תואם;
 *      מספר העמודים תואם; externalRequests=[] (offline).
 *   3. דטרמיניזם פנימי: בריצות הקנוניות determinismCheck.identical === true.
 *   4. עקביות בין-הרצות: נרמול שלושת שדות זמן הריצה ← השוואה מבנית עמוקה בין שתי
 *      הריצות הקנוניות ← זהות מלאה; וגם הגיבוב הקנוני תואם לערכים הרשומים.
 *
 * שימוש: node scripts/migration/verify-baseline-run.mjs [--print-hashes]
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = join(repoRoot, 'docs', 'migration', 'baseline');
const printHashes = process.argv.includes('--print-hashes');

let failures = 0;
let checks = 0;
const ok = (m) => { checks++; if (!printHashes) console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks++; failures++; console.log(`  [FAIL] ${m}`); };

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/;

const runRecord = JSON.parse(readFileSync(join(BASE, 'baseline-run.json'), 'utf8'));

// ---------- 1. מבנה ----------
console.log('1) מבנה baseline-run.json');
const REQUIRED_RUNS = ['canonical', 'canonical-run2', 'mid', 'ch63', 'twocol', 'smoke'];
const runIds = runRecord.runs?.map((r) => r.id) ?? [];
for (const id of REQUIRED_RUNS) (runIds.includes(id) ? ok : fail)(`ריצה: ${id}`);
if (!runRecord.source?.commit?.startsWith('93ad1e57')) fail('commit המקור אינו Orange הנעול');
else ok('מקור: Orange @ 93ad1e57 (הבייסליין הנעול)');
(runRecord.volatileFields?.fields?.length === 3 ? ok : fail)('שלושה שדות זמן ריצה מתועדים לנרמול');

// ---------- 2. אימות artifacts ----------
console.log('\n2) אימות artifacts (פריסה, גיבוב, סיכומים, offline)');
const reports = {};
for (const r of runRecord.runs ?? []) {
  const a = r.artifacts;
  const gzPath = join(BASE, a.report);
  if (!existsSync(gzPath)) { fail(`${r.id}: חסר ${a.report}`); continue; }
  const gzBuf = readFileSync(gzPath);
  if (sha256(gzBuf) !== a.reportGzSha256) { fail(`${r.id}: sha256 של הקובץ הדחוס אינו תואם`); continue; }
  const rawBuf = gunzipSync(gzBuf);
  if (sha256(rawBuf) !== a.reportRawSha256) { fail(`${r.id}: sha256 של הדוח הגולמי אינו תואם`); continue; }
  const report = JSON.parse(rawBuf.toString('utf8'));
  reports[r.id] = report;
  const sumPath = join(BASE, a.summary);
  if (!existsSync(sumPath)) { fail(`${r.id}: חסר סיכום ${a.summary}`); continue; }
  if (sha256(readFileSync(sumPath)) !== a.summarySha256) { fail(`${r.id}: sha256 של הסיכום אינו תואם`); continue; }
  if (report.run.inputSha256 !== r.inputSha256) { fail(`${r.id}: inputSha256 פנימי אינו תואם`); continue; }
  if (report.pageCount !== r.result.pageCount) { fail(`${r.id}: pageCount אינו תואם`); continue; }
  if ((report.run.externalRequests ?? null) === null || report.run.externalRequests.length !== 0) {
    fail(`${r.id}: externalRequests אינו ריק (offline הופר)`);
    continue;
  }
  ok(`${r.id}: דוח+סיכום אומתו (${report.pageCount} עמודים, offline נקי, hash תואם)`);
}

// ---------- 3. דטרמיניזם פנימי ----------
console.log('\n3) דטרמיניזם פנימי (repeat-render)');
for (const id of ['canonical', 'canonical-run2']) {
  const dc = reports[id]?.run?.determinismCheck;
  (dc?.identical === true ? ok : fail)(`${id}: repeat-render identical=true (אין עמוד שונה)`);
}

// ---------- 4. עקביות בין-הרצות ----------
console.log('\n4) עקביות בין-הרצות (נרמול שדות זמן + השוואה מבנית עמוקה)');
const normalize = (r) => {
  const c = structuredClone(r);
  c.run.generatedAt = '<NORMALIZED>';
  c.run.renderMs = -1;
  c.geometry.stats.extractMs = -1;
  return c;
};
const deepEqual = (a, b) => {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (typeof a === 'object') {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && deepEqual(a[k], b[k]));
  }
  return false;
};
const stableStringify = (x) => {
  if (Array.isArray(x)) return '[' + x.map(stableStringify).join(',') + ']';
  if (x !== null && typeof x === 'object') {
    return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(x[k])).join(',') + '}';
  }
  return JSON.stringify(x);
};

if (reports.canonical && reports['canonical-run2']) {
  const n1 = normalize(reports.canonical);
  const n2 = normalize(reports['canonical-run2']);
  (deepEqual(n1, n2) ? ok : fail)('שתי הריצות הקנוניות זהות מבנית לאחר נרמול (כל 639 העמודים, כל הרשומות)');
  const h1 = sha256(Buffer.from(stableStringify(n1), 'utf8'));
  const h2 = sha256(Buffer.from(stableStringify(n2), 'utf8'));
  (h1 === h2 ? ok : fail)('הגיבוב הקנוני של שתי הריצות זהה');
  (h1 === runRecord.consistencyCheck.normalizedHashRun1
    ? ok
    : fail)('הגיבוב תואם לערך הרשום (normalizedHashRun1)');
  (h2 === runRecord.consistencyCheck.normalizedHashRun2
    ? ok
    : fail)('הגיבוב תואם לערך הרשום (normalizedHashRun2)');
  if (printHashes) {
    console.log(`HASH_RUN1=${h1}`);
    console.log(`HASH_RUN2=${h2}`);
  }
} else {
  fail('חסרות הריצות הקנוניות לבדיקת העקביות');
}

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (!printHashes) {
  if (failures > 0) {
    console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
    process.exit(1);
  }
  console.log(`הבייסליין תקין — ${checks} בדיקות ירוקות. הבייסליין ניתן לשחזור offline ועקבי בין-הרצות.`);
}
