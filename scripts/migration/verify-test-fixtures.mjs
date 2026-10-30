#!/usr/bin/env node
/**
 * verify-test-fixtures — אימות קורפוס הבדיקה הנעול (שלב 4 בתכנית 100 השלבים).
 * אסמכתא: אפיון §17.3, §18-M0, §23 · תכנית 100 השלבים, שלב 4.
 *
 * בדיקות:
 *   1. מבנה הרישום: schemaVersion, fixtures לא ריק, documentedBehaviors, plannedFixtures.
 *   2. לכל fixture: id ייחודי; קובץ הקורפוס קיים ו־sha256 תואם בחישוב מחדש;
 *      provenance מלא (repo, SHA של Orange הנעול, נתיב, סיבה); invariants לא ריקים.
 *   3. קישורי בייסליין: הקובץ קיים, וגם inputSha256 הרשום ב־baseline-run.json של אותה ריצה
 *      תואם בדיוק ל־sourceSha256 של ה־fixture (צליבת שלב 3↔שלב 4).
 *   4. הגדרות: sha256 של default_settings.json תואם לרשום במלאי ההעברה (צליבת שלב 2↔שלב 4).
 *   5. documentedBehaviors: מזהה, סיבה, invariants, והפניות קורפוס תקפות (תומך בגלוב ch-*).
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKG = join(repoRoot, 'packages', 'test-fixtures');
const read = (p) => readFileSync(p, 'utf8');
const json = (p) => JSON.parse(read(p));

let failures = 0;
let checks = 0;
const ok = (m) => { checks++; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks++; failures++; console.log(`  [FAIL] ${m}`); };
const sha256 = (p) => {
  const h = createHash('sha256');
  h.update(readFileSync(p));
  return h.digest('hex');
};
const HEX64 = /^[0-9a-f]{64}$/;
const ORANGE_SHA = '93ad1e5704405fb2806a126ea1b519a35a87f378';

// ---------- 1. מבנה ----------
console.log('1) מבנה הרישום');
const reg = json(join(PKG, 'registry.json'));
(reg.schemaVersion === 1 ? ok : fail)('schemaVersion = 1');
(Array.isArray(reg.fixtures) && reg.fixtures.length >= 20 ? ok : fail)(`fixtures: ${reg.fixtures?.length ?? 0} (צפוי ≥ 20)`);
(Array.isArray(reg.documentedBehaviors) && reg.documentedBehaviors.length >= 5
  ? ok : fail)(`documentedBehaviors: ${reg.documentedBehaviors?.length ?? 0}`);
(reg.plannedFixtures?.requirements?.length >= 8 ? ok : fail)(`plannedFixtures.requirements: ${reg.plannedFixtures?.requirements?.length ?? 0} (דרישות §17.3)`);

// ---------- 2. הפריטים ----------
console.log('\n2) פריטים: קורפוס, hash, provenance, invariants');
const ids = new Set();
let corpusOk = 0;
for (const f of reg.fixtures ?? []) {
  if (ids.has(f.id)) fail(`id כפול: ${f.id}`);
  ids.add(f.id);
  const p = join(PKG, f.corpusFile?.path ?? '');
  if (!f.corpusFile?.path || !existsSync(p)) { fail(`${f.id}: חסר קובץ קורפוס`); continue; }
  if (!HEX64.test(f.corpusFile.sha256 ?? '')) { fail(`${f.id}: sha256 חסר/שגוי`); continue; }
  if (sha256(p) !== f.corpusFile.sha256) { fail(`${f.id}: sha256 אינו תואם את הקובץ`); continue; }
  const prov = f.provenance ?? {};
  const provOk = prov.sourceRepo === 'SUGINACH/Tora_Book_Typesetter_Orange'
    && prov.sourceSha === ORANGE_SHA && !!prov.sourcePath && !!prov.reason;
  if (!provOk) { fail(`${f.id}: provenance חסר או שגוי`); continue; }
  if (!Array.isArray(f.expected?.invariants) || f.expected.invariants.length === 0) {
    fail(`${f.id}: אין invariants צפויים`);
    continue;
  }
  corpusOk++;
}
ok(`${corpusOk}/${reg.fixtures.length} fixtures תקינים: קובץ + hash + provenance + invariants`);

// ---------- 3. קישורי בייסליין ----------
console.log('\n3) קישורי בייסליין (צליבת שלב 3↔שלב 4)');
const baselineRun = json(join(repoRoot, 'docs', 'migration', 'baseline', 'baseline-run.json'));
const baselineByArtifact = {};
for (const r of baselineRun.runs ?? []) baselineByArtifact[join('docs', 'migration', 'baseline', r.artifacts.report)] = r;
let linked = 0;
let linkedOk = 0;
for (const f of reg.fixtures ?? []) {
  const link = f.expected?.baselineArtifact;
  if (!link) continue;
  linked++;
  const abs = join(repoRoot, link);
  const run = baselineByArtifact[link];
  if (!existsSync(abs) || !run) { fail(`${f.id}: קישור בייסליין שבור — ${link}`); continue; }
  if (run.inputSha256 !== f.corpusFile.sha256) {
    fail(`${f.id}: inputSha256 בבייסליין אינו תואם את sourceSha256 של הפריט`);
    continue;
  }
  linkedOk++;
}
ok(`${linkedOk}/${linked} קישורי בייסליים אומתו (hash הקלט תואם בשני הצדדים)`);

// ---------- 4. הגדרות ברירת מחדל ----------
console.log('\n4) הגדרות ברירת מחדל (צליבת שלב 2↔שלב 4)');
const inv = json(join(repoRoot, 'docs', 'migration', 'transfer-inventory.json'));
const settingsCat = (inv.categories ?? []).find((c) => c.id === 'settings');
const invSettings = (settingsCat?.items ?? []).find((i) => i.path === 'default_settings.json');
(reg.defaultSettings?.sha256 === invSettings?.sha256
  ? ok : fail)('sha256 של default_settings.json תואם למלאי ההעברה');
let variantsOk = 0;
for (const f of reg.fixtures ?? []) {
  if (!f.settingsVariant) continue;
  const p = join(PKG, f.settingsVariant.path);
  if (!existsSync(p) || sha256(p) !== f.settingsVariant.sha256) fail(`settingsVariant שגוי: ${f.id}`);
  else variantsOk++;
}
ok(`${variantsOk} הגדרות-משתנה אומתו`);

// ---------- 5. התנהגויות מתועדות ----------
console.log('\n5) התנהגויות מתועדות');
const globMatch = (pattern) => {
  if (!pattern.includes('*')) return ids.has(pattern);
  const re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  return [...ids].some((id) => re.test(id));
};
let behOk = 0;
for (const b of reg.documentedBehaviors ?? []) {
  const valid = b.id && b.reason && Array.isArray(b.invariants) && b.invariants.length > 0
    && Array.isArray(b.corpus) && b.corpus.length > 0 && b.corpus.every(globMatch);
  if (valid) behOk++;
  else fail(`documentedBehavior שגוי או עם הפניה תלויה: ${b.id}`);
}
ok(`${behOk}/${reg.documentedBehaviors.length} התנהגויות מתועדות תקינות ומקושרות לקורפוס`);

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`קורפוס הבדיקה תקין — ${checks} בדיקות ירוקות. אין fixture בלי מקור ו־hash.`);
