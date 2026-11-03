#!/usr/bin/env node
/**
 * verify-assets — מאמת מניפסטי הנכסים החזותיים v2 (שלב 68; אפיון §7, §13; M8).
 *
 * בדיקות (42):
 *   1. מבנה דרך המודל: פרסור + אפס בעיות סמנטיות לשני המניפסטים; גרסאות; ספירות
 *      (שערים 3 קבצים/86 עיצובים/82+4; עיטורים 5/967/27 חריצים).
 *   2. דיסט: כל קובץ מקור קיים, sha256/בייטים/ספירה תואמים; כל עיצוב מאומת
 *      ביט-לביט מול המקור — legacyId, name, svgSha256, viewBox, תיבת טקסט
 *      ועוגנים (דרך פונקציות המודל — מקור אמת אחד; שינוי בנוסחה ייתפס כאן).
 *   3. כיסוי דו-כיווני מול מלאי ההעברה: 7 פריטי shaar-ornaments + note_rules.json
 *      ⇔ 8 קובצי המניפסט; המקור הנעול; בלוק רישוי מפורש.
 *   4. 27 חריצי תפקיד מובנים: ביט-לביט מול BUILTIN_ROLE_SLOTS; 17 סגנון + 10 ממד;
 *      כל מפתח במרשם עם ברירת המחדל; ברירות spear/star/gray נעולות מול
 *      settings-matrix.md.
 *   5. D-004: 66 קבוצות מזהי legacy כפולים (65 חוצות-קבצים + אחת בתוך
 *      section_dividers.json) — כולן מובחנות במזהים הקנוניים; legacyId נשמר.
 *   6. assetsIdentity: דטרמיניסטית ורגישה לשינוי (מזהה/תיבה/חריץ).
 *   7. תשעה שליליים: שגיאות מבנה (גרסה/רישוי) וסמנטיות (not-derived,
 *      duplicate, out-of-page, not-for-file, builtinSlots:count, count:file)
 *      + קלט שלילי לתיבה.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 * תלויות: Node 22 + ה-dist הבנוי של @tora/content-model.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASSETS_MANIFEST_SCHEMA_VERSION,
  BUILTIN_DRAWINGS,
  BUILTIN_ROLE_SLOTS,
  ORNAMENT_FILE_ROLES,
  SHAAR_FILE_KINDS,
  assetsIdentity,
  legacyPercentBoxOf,
  ornamentAssetId,
  ornamentsManifestIssues,
  parseOrnamentsManifest,
  parseViewBox,
  parseShaarManifest,
  shaarAssetId,
  shaarManifestIssues,
  textBoxAnchorsOf,
  textBoxToPageFractions,
} from '@tora/content-model';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const M = (rel) => join(repoRoot, rel);
const read = (rel) => readFileSync(M(rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const sha256Text = (t) => createHash('sha256').update(t, 'utf8').digest('hex');

let failures = 0;
let checks = 0;
const ok = (m) => { checks++; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks++; failures++; console.log(`  [FAIL] ${m}`); };

const shaarRaw = json('assets/shaar/manifest.json');
const ornRaw = json('assets/ornaments/manifest.json');

// ---------- 1. מבנה דרך המודל ----------
console.log('1) מבנה דרך המודל (פרסור + אפס בעיות סמנטיות)');
let shaar;
let orn;
try {
  shaar = parseShaarManifest(shaarRaw);
  const issues = shaarManifestIssues(shaar);
  if (issues.length === 0) ok('מניפסט שערים: פרסור + אפס בעיות');
  else fail(`מניפסט שערים — בעיות: ${issues.slice(0, 3).join('; ')}`);
} catch (e) {
  fail(`מניפסט שערים לא נפרס: ${String(e?.message)}`);
}
try {
  orn = parseOrnamentsManifest(ornRaw);
  const issues = ornamentsManifestIssues(orn);
  if (issues.length === 0) ok('מניפסט עיטורים: פרסור + אפס בעיות');
  else fail(`מניפסט עיטורים — בעיות: ${issues.slice(0, 3).join('; ')}`);
} catch (e) {
  fail(`מניפסט עיטורים לא נפרס: ${String(e?.message)}`);
}
(
  shaarRaw.schemaVersion === ASSETS_MANIFEST_SCHEMA_VERSION
  && ornRaw.schemaVersion === ASSETS_MANIFEST_SCHEMA_VERSION
  && shaarRaw.kind === 'shaar' && ornRaw.kind === 'ornaments'
  ? ok : fail)('schemaVersion=2 ו-kind לשני המניפסטים');
const withBox = shaar?.designs.filter((d) => d.textBox !== null).length ?? -1;
(
  shaar?.files.length === 3 && shaar?.designs.length === 86 && withBox === 82
  && shaar?.designs.length - withBox === 4
  ? ok : fail)(`שערים: 3 קבצים, 86 עיצובים (82 עם תיבה + 4 בלי; בפועל ${shaar?.files.length}/${shaar?.designs.length}/${withBox})`);
(
  orn?.files.length === 5 && orn?.designs.length === 967 && orn?.builtinSlots.length === 27
  ? ok : fail)(`עיטורים: 5 קבצים, 967 עיצובים + 27 חריצים (בפועל ${orn?.files.length}/${orn?.designs.length}/${orn?.builtinSlots.length})`);

// ---------- 2. הדיסק — כל עיצוב ביט-לביט מול המקור ----------
console.log('\n2) הדיסק: קבצים ועיצובים ביט-לביט');
const srcCache = new Map();
const loadSrc = (dir, file) => {
  const key = `${dir}/${file}`;
  if (!srcCache.has(key)) srcCache.set(key, JSON.parse(readFileSync(M(join(dir, file)), 'utf8')));
  return srcCache.get(key);
};
for (const [rel, dir] of [['assets/shaar/manifest.json', 'assets/shaar'], ['assets/ornaments/manifest.json', 'assets/ornaments']]) {
  const m = rel.endsWith('shaar/manifest.json') ? shaarRaw : ornRaw;
  for (const e of m.files ?? []) {
    const p = M(join(dir, e.file));
    const buf = existsSync(p) ? readFileSync(p) : null;
    if (buf === null) { fail(`חסר קובץ: ${dir}/${e.file}`); continue; }
    const data = JSON.parse(buf.toString('utf8'));
    (
      sha256File(p) === e.sha256 && buf.length === e.bytes && data.length === e.count
      ? ok : fail)(`${e.file}: sha256+בייטים+ספירה (${e.count} עיצובים)`);
  }
}
// שערים — עיצוב אחר עיצוב, כולל תיבה ועוגנים דרך המודל
{
  let bad = [];
  for (const rec of shaarRaw.designs ?? []) {
    const d = loadSrc('assets/shaar', rec.file)[rec.index];
    if (d === undefined || rec.legacyId !== d.id || rec.name !== d.name || rec.svgSha256 !== sha256Text(d.svg)) {
      bad.push(`${rec.file}#${rec.index}:legacy/svg`); continue;
    }
    const vb = parseViewBox(d.svg);
    if (vb === null || vb.width !== rec.viewBox.width || vb.height !== rec.viewBox.height) { bad.push(`${rec.file}#${rec.index}:viewBox`); continue; }
    if ('box' in d) {
      const f = textBoxToPageFractions(legacyPercentBoxOf(d.box));
      const a = textBoxAnchorsOf(f);
      if (JSON.stringify(f) !== JSON.stringify(rec.textBox) || JSON.stringify(a) !== JSON.stringify(rec.anchors)) {
        bad.push(`${rec.file}#${rec.index}:textBox/anchors`);
      }
    } else if (rec.textBox !== null || rec.anchors !== null) {
      bad.push(`${rec.file}#${rec.index}:textBox-לא-null`);
    }
  }
  (bad.length === 0 ? ok : fail)(`86 עיצובי שער ביט-לביט (legacyId+svgSha256+viewBox+תיבה+עוגנים)${bad.length ? ' — כשלים: ' + bad.slice(0, 3).join(', ') : ''}`);
}
// עיטורים — עיצוב אחר עיצוב
{
  let bad = [];
  for (const rec of ornRaw.designs ?? []) {
    const d = loadSrc('assets/ornaments', rec.file)[rec.index];
    if (d === undefined || rec.legacyId !== d.id || rec.name !== d.name || rec.svgSha256 !== sha256Text(d.svg)) {
      bad.push(`${rec.file}#${rec.index}:legacy/svg`); continue;
    }
    const vb = parseViewBox(d.svg);
    if (vb === null || vb.width !== rec.viewBox.width || vb.height !== rec.viewBox.height) bad.push(`${rec.file}#${rec.index}:viewBox`);
  }
  (bad.length === 0 ? ok : fail)(`967 עיצובי עיטור ביט-לביט (legacyId+svgSha256+viewBox)${bad.length ? ' — כשלים: ' + bad.slice(0, 3).join(', ') : ''}`);
}

// ---------- 3. כיסוי דו-כיווני מול מלאי ההעברה ----------
console.log('\n3) כיסוי דו-כיווני מול מלאי ההעברה');
const inv = json('docs/migration/transfer-inventory.json');
const ornCat = (inv.categories ?? []).find((c) => c.id === 'shaar-ornaments');
{
  let bad = [];
  for (const it of ornCat?.items ?? []) {
    const manifest = json(it.manifest);
    const entry = (manifest.files ?? []).find((e) => e.file === it.file);
    if (entry === undefined) bad.push(`${it.file}: אין רשומה`);
    else if (entry.sha256 !== it.sha256) bad.push(`${it.file}: hash`);
    else if (it.count !== undefined && entry.count !== it.count) bad.push(`${it.file}: ספירה`);
  }
  (bad.length === 0 ? ok : fail)(`7 פריטי shaar-ornaments ⇔ רשומות המניפסטים (hash; ספירה אופציונלית)${bad.length ? ' — ' + bad.join(', ') : ''}`);
}
{
  const nrItem = (inv.categories ?? []).find((c) => c.id === 'note-rules')?.items?.find((i) => i.path === 'note_rules.json');
  const entry = (ornRaw.files ?? []).find((e) => e.file === 'note_rules.json');
  (nrItem !== undefined && entry !== undefined && entry.sha256 === nrItem.sha256
    ? ok : fail)('note_rules.json (קטגוריית note-rules) ⇔ מניפסט העיטורים');
}
{
  const manifestFiles = new Set([
    ...((shaarRaw.files ?? []).map((e) => e.file)),
    ...((ornRaw.files ?? []).map((e) => e.file)),
  ]);
  const invFiles = new Set([...(ornCat?.items ?? []).map((i) => i.file), 'note_rules.json']);
  const same = manifestFiles.size === invFiles.size && [...manifestFiles].every((f) => invFiles.has(f));
  const rolesOk = [...manifestFiles].every((f) => SHAAR_FILE_KINDS[f] !== undefined || ORNAMENT_FILE_ROLES[f] !== undefined);
  (same && rolesOk && manifestFiles.size === 8
    ? ok : fail)(`כיסוי מלא ומדויק: 8 קבצי מקור ⇔ 8 קבצים עם תפקיד במודל (בפועל ${manifestFiles.size})`);
}
{
  const sm = json('docs/migration/source-manifest.json');
  const baseline = sm.baselinePolicy?.baselineCommit;
  (shaarRaw.source?.commit === baseline && ornRaw.source?.commit === baseline && shaarRaw.source?.repo === 'SUGINACH/Tora_Book_Typesetter_Orange'
    ? ok : fail)('המקור בשני המניפסטים === הבייסליין הנעול (Orange)');
}
{
  const catIds = new Set((inv.categories ?? []).map((c) => c.id));
  (shaarRaw.license?.status === 'source-undocumented' && ornRaw.license?.status === 'source-undocumented'
    && shaarRaw.license?.inventoryCategory === 'shaar-ornaments' && ornRaw.license?.inventoryCategory === 'shaar-ornaments'
    && catIds.has('shaar-ornaments')
    ? ok : fail)('רישוי מפורש: source-undocumented + קטגוריית מלאי קיימת (אין נכס בלי אזכור רישוי)');
}

// ---------- 4. 27 חריצי התפקיד המובנים ----------
console.log('\n4) 27 חריצי תפקיד מובנים (17 סגנון + 10 ממד)');
(JSON.stringify(ornRaw.builtinSlots) === JSON.stringify(BUILTIN_ROLE_SLOTS.map((s) => ({ key: s.key, kind: s.kind, defaultValue: s.defaultValue, role: s.role })))
  ? ok : fail)('builtinSlots ביט-לביט מול BUILTIN_ROLE_SLOTS של המודל');
{
  const style = BUILTIN_ROLE_SLOTS.filter((s) => s.kind === 'style').length;
  const dim = BUILTIN_ROLE_SLOTS.filter((s) => s.kind === 'dimension').length;
  (BUILTIN_ROLE_SLOTS.length === 27 && style === 17 && dim === 10
    ? ok : fail)(`27 = 17 סגנון + 10 ממד (בפועל ${BUILTIN_ROLE_SLOTS.length}=${style}+${dim})`);
}
{
  const reg = json('packages/settings-schema/registry.json');
  const regMap = new Map((reg.settings ?? []).map((s) => [s.canonicalKey, String(s.defaultValue)]));
  const bad = BUILTIN_ROLE_SLOTS.filter((s) => regMap.get(s.key) !== s.defaultValue);
  (bad.length === 0 ? ok : fail)(`כל 27 המפתחות קיימים במרשם עם ברירת המחדל הנעולה${bad.length ? ' — חריגים: ' + bad.map((s) => s.key).join(', ') : ''}`);
}
{
  const matrix = read('docs/migration/settings-matrix.md');
  const locks = [['section-divider-style', 'spear'], ['note-rule-style', 'star'], ['hdr-divider-style', 'gray']];
  const bad = locks.filter(([k, v]) => !new RegExp('`' + k + '` \\| enum \\| "' + v + '"').test(matrix));
  (bad.length === 0 ? ok : fail)(`ברירות Orange נעולות ב-settings-matrix.md: spear/star/gray${bad.length ? ' — חסרים: ' + bad.map(([k]) => k).join(', ') : ''}`);
}
{
  const badStyle = BUILTIN_ROLE_SLOTS.filter((s) => s.kind === 'style' && !BUILTIN_DRAWINGS.includes(s.defaultValue));
  const badDim = BUILTIN_ROLE_SLOTS.filter((s) => s.kind === 'dimension' && !/^\d+(\.\d+)?(em|px|%)$/.test(s.defaultValue));
  (badStyle.length === 0 && badDim.length === 0
    ? ok : fail)(`סגנונות מתוך BUILTIN_DRAWINGS (${BUILTIN_DRAWINGS.join('|')}); ממדים עם יחידה (em|px|%)`);
}

// ---------- 5. D-004 — כפילויות legacy מובחנות במזהים הקנוניים ----------
console.log('\n5) D-004: מזהי legacy כפולים — הבחנה קנונית');
{
  const byId = new Map();
  let total = 0;
  for (const [dir, files] of [['assets/shaar', Object.keys(SHAAR_FILE_KINDS)], ['assets/ornaments', Object.keys(ORNAMENT_FILE_ROLES)]]) {
    for (const file of files) {
      for (const [i, d] of loadSrc(dir, file).entries()) {
        total += 1;
        if (!byId.has(d.id)) byId.set(d.id, []);
        byId.get(d.id).push(`${file}#${i}`);
      }
    }
  }
  const dups = [...byId.entries()].filter(([, v]) => v.length > 1);
  let cross = 0;
  let inFileRep = 0;
  for (const [, v] of dups) {
    if (new Set(v).size > 1) cross += 1;
    const cnt = {};
    for (const x of v) {
      const f = x.split('#')[0];
      cnt[f] = (cnt[f] ?? 0) + 1;
    }
    if (Object.values(cnt).some((c) => c > 1)) inFileRep += 1;
  }
  const excess = [...byId.values()].reduce((s, v) => s + v.length - 1, 0);
  (total === 1053 && dups.length === 65 && cross === 65 && inFileRep === 1 && excess === 66
    ? ok : fail)(`65 קבוצות legacy כפולות — כולן חוצות-קבצים; אחת כוללת גם כפילות פנימית בתוך section_dividers.json (בפועל: ${dups.length} קבוצות, ${cross} חוצות, ${inFileRep} עם חזרה פנימית, עודף ${excess} מתוך ${total})`);
}
{
  const ids = [...(shaarRaw.designs ?? []), ...(ornRaw.designs ?? [])].map((d) => d.id);
  const unique = new Set(ids);
  const legacyKept = [...(shaarRaw.designs ?? []), ...(ornRaw.designs ?? [])].every((d) => typeof d.legacyId === 'string' && d.legacyId.length > 0);
  (ids.length === 1053 && unique.size === 1053 && legacyKept
    ? ok : fail)(`1053 מזהים קנוניים ייחודיים (כל כפילות legacy מובחנת) + legacyId נשמר בכולם`);
}
{
  const hasD004 = (inv.decisions ?? []).some((d) => d.id === 'D-004');
  (hasD004 ? ok : fail)('החלטה D-004 מתועדת במלאי ההעברה (מרחב מזהים משותף; מזהה קנוני נושא קובץ+אינדקס; legacyId נשמר)');
}

// ---------- 6. assetsIdentity — דטרמיניזם ורגישות לשינוי ----------
console.log('\n6) assetsIdentity');
if (shaar !== undefined && orn !== undefined) {
  const i1 = JSON.stringify(assetsIdentity(shaar, orn));
  const i2 = JSON.stringify(assetsIdentity(parseShaarManifest(JSON.parse(JSON.stringify(shaarRaw))), parseOrnamentsManifest(JSON.parse(JSON.stringify(ornRaw)))));
  (i1 === i2 ? ok : fail)('דטרמיניסטית — שתי קריאות ⇒ אותה זהות ביט-לביט');
  {
    const m2 = JSON.parse(JSON.stringify(shaarRaw));
    m2.designs[0].id = 'shaar:v2|main|deadbeefdeadbeef#0';
    const i3 = JSON.stringify(assetsIdentity(parseShaarManifest(m2), orn));
    (i3 !== i1 ? ok : fail)('רגישה לשינוי מזהה עיצוב');
  }
  {
    const m2 = JSON.parse(JSON.stringify(shaarRaw));
    m2.designs[0].textBox.left = 0.999;
    const i3 = JSON.stringify(assetsIdentity(parseShaarManifest(m2), orn));
    (i3 !== i1 ? ok : fail)('רגישה לשינוי תיבת טקסט');
  }
  {
    const m2 = JSON.parse(JSON.stringify(ornRaw));
    m2.builtinSlots[0].defaultValue = 'spear';
    const i3 = JSON.stringify(assetsIdentity(shaar, parseOrnamentsManifest(m2)));
    (i3 !== i1 ? ok : fail)('רגישה לשינוי חריץ מובנה');
  }
  {
    const identity = assetsIdentity(shaar, orn);
    const round = JSON.parse(JSON.stringify(identity));
    (JSON.stringify(round) === JSON.stringify(identity)
      ? ok : fail)('ערכים סדירים בלבד — סבב JSON יציב (ה-CLI מגבב canonicalJson+sha256)');
  }
} else {
  fail('זהות לא נבדקה — הפרסור נכשל');
}

// ---------- 7. שליליים ----------
console.log('\n7) בדיקות שליליות (9)');
{
  const m = JSON.parse(JSON.stringify(shaarRaw));
  m.schemaVersion = 1;
  try { parseShaarManifest(m); fail('schemaVersion שגוי לא נתפס'); }
  catch (e) { (String(e?.catalogKey) === 'errors.assets.MANIFEST_INVALID' ? ok : fail)('schemaVersion שגוי ⇒ MANIFEST_INVALID'); }
}
{
  const m = JSON.parse(JSON.stringify(shaarRaw));
  delete m.license;
  try { parseShaarManifest(m); fail('רישוי חסר לא נתפס'); }
  catch (e) { (String(e?.catalogKey) === 'errors.assets.MANIFEST_INVALID' ? ok : fail)('רישוי חסר ⇒ MANIFEST_INVALID'); }
}
{
  const m = JSON.parse(JSON.stringify(shaarRaw));
  m.designs[0].id = 'shaar:v2|main|deadbeefdeadbeef#0';
  const issues = shaarManifestIssues(parseShaarManifest(m));
  (issues.some((s) => s.startsWith('not-derived:')) ? ok : fail)('מזהה שאינו נגזר מהתוכן ⇒ not-derived');
}
{
  const m = JSON.parse(JSON.stringify(ornRaw));
  m.designs[1].id = m.designs[0].id;
  const issues = ornamentsManifestIssues(parseOrnamentsManifest(m));
  (issues.some((s) => s.startsWith('duplicate:')) ? ok : fail)('מזהה קנוני כפול ⇒ duplicate');
}
{
  const m = JSON.parse(JSON.stringify(shaarRaw));
  m.designs[0].textBox.left = -0.5;
  const issues = shaarManifestIssues(parseShaarManifest(m));
  (issues.some((s) => s.startsWith('out-of-page:')) ? ok : fail)('שבר שלילי ⇒ out-of-page');
}
{
  const m = JSON.parse(JSON.stringify(ornRaw));
  m.designs[0].file = 'shaar_main.json';
  const issues = ornamentsManifestIssues(parseOrnamentsManifest(m));
  (issues.some((s) => s.startsWith('not-for-file:')) ? ok : fail)('עיצוב לקובץ שאינו של המניפסט ⇒ not-for-file');
}
{
  const m = JSON.parse(JSON.stringify(ornRaw));
  m.builtinSlots.pop();
  const issues = ornamentsManifestIssues(parseOrnamentsManifest(m));
  (issues.some((s) => s.startsWith('builtinSlots:count')) ? ok : fail)('26 חריצים ⇒ builtinSlots:count');
}
{
  const m = JSON.parse(JSON.stringify(shaarRaw));
  const f = m.files.find((e) => e.file === 'shaar_main.json');
  f.count = 31;
  const issues = shaarManifestIssues(parseShaarManifest(m));
  (issues.some((s) => s.startsWith('count:shaar_main.json')) ? ok : fail)('ספירה לא תואמת ⇒ count:{file}');
}
{
  try { textBoxToPageFractions({ left: -5, top: 0, right: 0, bottom: 0 }); fail('קלט שלילי לתיבה לא נתפס'); }
  catch (e) { (String(e?.catalogKey) === 'errors.assets.TEXTBOX_OUT_OF_PAGE' ? ok : fail)('קלט שלילי לתיבה ⇒ TEXTBOX_OUT_OF_PAGE');
  }
}

// ---------- סיכום ----------
console.log('\n' + '='.repeat(60));
if (failures > 0) {
  console.error(`נכשל: ${failures} בעיות מתוך ${checks} בדיקות`);
  process.exit(1);
}
console.log(`מניפסטי הנכסים v2 תקינים — ${checks} בדיקות ירוקות. אין נכס בלי מזהה נגזר; אין כפילות בלי הבחנה; אין חריץ בלי נעילה.`);
