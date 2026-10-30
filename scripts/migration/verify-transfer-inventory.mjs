#!/usr/bin/env node
/**
 * verify-transfer-inventory — אימות מלאי ההעברה הנעול (שלב 2 בתכנית 100 השלבים).
 * אסמכתא: אפיון §2, §3.3, §5, §21 · תכנית 100 השלבים, סעיף ד + שלב 2.
 *
 * בדיקות:
 *   1. transfer-inventory.json: שבע הקטגוריות מסעיף ד קיימות; לכל קטגוריה סטטוס ויעד;
 *      לכל פריט hash בן 64 hex.
 *   2. assets/fonts/manifest.json: כל קובץ קיים ו־sha256 שלו תואם בחישוב מחדש;
 *      לכל גופן רישיון או החלטה מתועדת (selfhost → קובץ רישיון קיים; bundled/guttman → החלטה במלאי).
 *   3. assets/ornaments/manifest.json + assets/shaar/manifest.json: קבצים תואמים,
 *      כל עיצוב מאומת מול ה־SVG בפועל, ספירות תואמות, כפילויות מתועדות.
 *   4. עקביות בין-מסמכים: commit המקור במניפסטים === הבייסליין הנעול ב־source-manifest.json.
 *   5. בדיקה צולבת: hash המסמך הקנוני תואם לתיעוד המקורי ב־PROVENANCE.md של Orange.
 *   6. (כשזמינה מראה מקומית) אימות ה־hash של כל הפריטים הדחויים מול קובצי Orange בפועל.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 * תלויות: אפס (Node 22).
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const M = (rel) => join(repoRoot, rel);
const read = (rel) => readFileSync(M(rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));

let failures = 0;
let checks = 0;
const ok = (m) => { checks++; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks++; failures++; console.log(`  [FAIL] ${m}`); };

const sha256File = (p) => {
  const h = createHash('sha256');
  h.update(readFileSync(p));
  return h.digest('hex');
};
const HEX64 = /^[0-9a-f]{64}$/;

// ---------- 1. מבנה המלאי ----------
console.log('1) מבני המלאי (שבע קטגוריות סעיף ד)');
const inv = json('docs/migration/transfer-inventory.json');
const EXPECTED_CATEGORIES = [
  'text-identifiers', 'settings', 'fonts', 'page-parts', 'shaar-ornaments', 'note-rules', 'test-corpus',
];
const catIds = (inv.categories ?? []).map((c) => c.id);
for (const id of EXPECTED_CATEGORIES) {
  (catIds.includes(id) ? ok : fail)(`קטגוריה: ${id}`);
}
for (const c of inv.categories ?? []) {
  if (!c.status || !c.destination) fail(`לקטגוריה ${c.id} חסר סטטוס או יעד`);
  const items = c.items;
  if (Array.isArray(items)) {
    for (const it of items) {
      if (!HEX64.test(it.sha256 ?? '')) fail(`${c.id}/${it.path ?? it.file}: sha256 חסר או שגוי`);
    }
  }
}
ok('לכל פריט במלאי hash תקין (64 hex)');

const decisions = new Set((inv.decisions ?? []).map((d) => d.id));
(inv.decisions?.length >= 1 ? ok : fail)(`החלטות מתועדות: ${[...decisions].join(', ')}`);

// ---------- 2. manifest גופנים ----------
console.log('\n2) assets/fonts/manifest.json');
const fm = json('assets/fonts/manifest.json');
let fontsVerified = 0;
let licenseOk = 0;
let licenseFail = 0;
for (const f of fm.fonts ?? []) {
  const p = M(join('assets/fonts', f.file));
  if (!existsSync(p)) { fail(`חסר קובץ גופן: ${f.file}`); continue; }
  if (sha256File(p) !== f.sha256) { fail(`sha256 לא תואם: ${f.file}`); continue; }
  fontsVerified++;
  // רישיון או החלטה
  if (f.group === 'selfhost') {
    const refOk = f.license?.ref && existsSync(M(join('assets/fonts', f.license.ref)));
    if (refOk) licenseOk++; else { licenseFail++; fail(`רישיון selfhost חסר: ${f.file}`); }
  } else {
    const dec = f.group === 'bundled' ? 'D-001' : f.group === 'guttman-rashi' ? 'D-002' : null;
    if (dec && decisions.has(dec)) licenseOk++; else { licenseFail++; fail(`אין רישיון/החלטה לגופן: ${f.file} (${f.group})`); }
  }
}
ok(`גופנים אומתו מול הדיסק: ${fontsVerified}/${fm.fonts.length} (sha256 תואם)`);
(licenseFail === 0 ? ok : fail)(`רישיון או החלטה לכל גופן: ${licenseOk}/${fm.fonts.length}`);
for (const group of ['metadata', 'selfhostOther']) {
  for (const e of fm[group] ?? []) {
    const p = M(join('assets/fonts', e.file));
    if (!existsSync(p) || sha256File(p) !== e.sha256) fail(`לא תואם (${group}): ${e.file}`);
  }
  ok(`${group}: ${fm[group]?.length ?? 0} קבצים אומתו`);
}
const fontsOnDisk = fm.fonts.length + (fm.metadata?.length ?? 0) + (fm.selfhostOther?.length ?? 0);
ok(`סה"כ פריטי מניפסט הגופנים: ${fontsOnDisk}`);

// ---------- 3. manifests עיטורים ושערים ----------
console.log('\n3) assets/ornaments + assets/shaar');
for (const [rel, dir] of [
  ['assets/ornaments/manifest.json', 'assets/ornaments'],
  ['assets/shaar/manifest.json', 'assets/shaar'],
]) {
  const m = json(rel);
  for (const e of m.files ?? []) {
    const p = M(join(dir, e.file));
    if (!existsSync(p)) { fail(`חסר קובץ: ${dir}/${e.file}`); continue; }
    if (sha256File(p) !== e.sha256) { fail(`sha256 לא תואם: ${dir}/${e.file}`); continue; }
    const data = JSON.parse(readFileSync(p, 'utf8'));
    if (data.length !== e.count) { fail(`ספירה לא תואמת: ${e.file} (${data.length} ≠ ${e.count})`); continue; }
    // אימות כל עיצוב מול ה־SVG בפועל
    let designsOk = true;
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const rec = m.designs.find((x) => x.file === e.file && x.index === i);
      if (!rec || rec.id !== d.id || rec.name !== d.name) { designsOk = false; fail(`עיצוב לא תואם: ${e.file}[${i}]`); break; }
      const svgHash = createHash('sha256').update(d.svg, 'utf8').digest('hex');
      if (svgHash !== rec.svgSha256) { designsOk = false; fail(`svgSha256 לא תואם: ${e.file}[${i}]`); break; }
      if (rec.hasBox !== ('box' in d)) { designsOk = false; fail(`hasBox לא תואם: ${e.file}[${i}]`); break; }
    }
    if (designsOk) ok(`${e.file}: ${e.count} עיצובים אומתו במלואם${e.duplicateIds ? ` (כפילויות מתועדות: ${Object.keys(e.duplicateIds).length})` : ''}`);
  }
  const total = (m.files ?? []).reduce((s, e) => s + e.count, 0);
  ok(`${rel}: ${total} עיצובים בסך הכול`);
}

// ---------- 4. עקביות בין-מסמכים ----------
console.log('\n4) עקביות בין-מסמכים');
const sm = json('docs/migration/source-manifest.json');
const baseline = sm.baselinePolicy?.baselineCommit;
const orangeInSources = (sm.sources ?? []).find((s) => s.id === 'Orange')?.commit;
(baseline === orangeInSources ? ok : fail)('הבייסליין ב-source-manifest תואם למקור Orange');
for (const rel of ['assets/fonts/manifest.json', 'assets/ornaments/manifest.json', 'assets/shaar/manifest.json']) {
  const m = json(rel);
  (m.source?.commit === baseline ? ok : fail)(`commit המקור ב־${rel} === הבייסליין הנעול`);
}
// צליבוב: hash הפריטים במלאי === hash הקבצים במניפסטים
const ornCat = (inv.categories ?? []).find((c) => c.id === 'shaar-ornaments');
for (const it of ornCat?.items ?? []) {
  const manifest = json(it.manifest);
  const entry = (manifest.files ?? []).find((e) => e.file === it.file);
  if (!entry) fail(`פריט המלאי ${it.file} לא נמצא במניפסט ${it.manifest}`);
  else if (entry.sha256 !== it.sha256) fail(`hash במלאי אינו תואם את המניפסט: ${it.file}`);
  else if (entry.count !== it.count) fail(`ספירה במלאי אינה תואמת את המניפסט: ${it.file}`);
  else ok(`צליבוב מלאי↔מניפסט: ${it.file} (${it.count} עיצובים)`);
}

// ---------- 5. בדיקה צולבת מול PROVENANCE ----------
console.log('\n5) בדיקות צולבות');
const PROVENANCE_CANONICAL_SHA = '5e73b913f9843fce695d0e4073c176961b8dbc2fa87e8e4c3d99051a826ce0e4';
const corpus = (inv.categories ?? []).find((c) => c.id === 'test-corpus');
const canonical = (corpus?.items ?? []).find((i) => i.path === 'very_long_test_text.txt');
(canonical?.sha256 === PROVENANCE_CANONICAL_SHA
  ? ok
  : fail)('very_long_test_text.txt תואם לתיעוד המקורי ב־PROVENANCE.md של Orange');

// ---------- 6. אימות פריטים דחויים מול מראה מקומית ----------
console.log('\n6) אימון המקורות הדחויים (מראה מקומית, אם זמינה)');
const mirrorsRoot = process.env.TORA_LEGACY_MIRRORS || join(repoRoot, '..', 'legacy');
const orangeMirror = join(mirrorsRoot, 'Orange');
if (existsSync(orangeMirror)) {
  let verified = 0;
  let mismatch = 0;
  for (const c of inv.categories ?? []) {
    if (!Array.isArray(c.items)) continue;
    for (const it of c.items) {
      if (!it.path) continue;
      const p = join(orangeMirror, it.path);
      if (!existsSync(p)) { fail(`חסר במראה: ${it.path}`); mismatch++; continue; }
      if (sha256File(p) === it.sha256) verified++;
      else { fail(`hash במלאי אינו תואם את המראה: ${it.path}`); mismatch++; }
    }
  }
  (mismatch === 0 ? ok : fail)(`${verified} פריטי מקור דחויים אומתו מול Orange בפועל`);
} else {
  console.log('  [דלג] אין מראה מקומית — הגדר TORA_LEGACY_MIRRORS לאימות מלא');
}

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`מלאי ההעברה תקין — ${checks} בדיקות ירוקות. אין נכס בלי hash; אין גופן בלי רישיון או החלטה.`);
