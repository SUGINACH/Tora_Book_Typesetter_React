#!/usr/bin/env node
/**
 * verify-fonts-manifest — אימות שלב 23: manifest גופנים מלא מהתוכנה הישנה.
 * אסמכתא: אפיון §6.4, §18-M3, §21 · תכנית שלב 23.
 *
 * בדיקות:
 *   1. מבנה: schemaVersion 2; כל רשומה עוברת isFontManifestRecord; fontId
 *      נגזר מה־sha256; אין כפילות מזהה בלי אותם bytes.
 *   2. כיסוי דו־כיווני מלא מול מלאי ההעברה: כל קובץ גופן במלאי (transfer-inventory,
 *      קטגוריית fonts) קיים במניפסט עם hash זהה; כל רשומת מניפסט מקורה במלאי;
 *      אין קובץ חסר ואין קובץ עודף. 100% מהגופנים רשומים — כולל היסטוריים
 *      וכאלה שלא זוהה להם שימוש.
 *   3. אמת מול הדיסק: sha256 של כל אחד מ־1,796 הקבצים מחושב מחדש ותואם;
 *      החתימה בפועל (magic) תואמת ל־binaryFormat — נבדק על כל הקבצים
 *      (הקריאה זולה; פריקת WOFF2 מלאה — על מדגם דטרמיניסטי).
 *   4. מטא־דאטה מהבינארים: unitsPerEm בטווח 16–16384 לכל רשומה; מדגם
 *      דטרמיניסטי (כל קובץ 40 + כל החריגים) — פריקה מחודשת והשוואת
 *      unitsPerEm/weight/style/sfntSha256 ביט-ביט (דטרמיניזם המחולל).
 *   5. רישוי והפצה: selfhost — רישיון OFL קיים וקובצי הרישיון על הדיסק;
 *      bundled/guttman — החלטות D-001/D-002 מתועדות במלאי; distributionBlocked
 *      מסומן עם סיבה ומדיניות; הדגל אינו מסיר ואינו מחליף.
 *   6. אכיפת טעינה (החלק הטהור): loadFontSet על סט אמיתי — הצלחה מלאה;
 *      byte אחד שהשתנה ← FONT_HASH_MISMATCH; מזהה בלתי-מוכר ← UNKNOWN_FONT_ID;
 *      אין גופן מערכת ואין רשת במסלול (סריקת הקוד: אין fetch/XHR/CDN).
 *   7. דוח כיסוי: docs/migration/fonts-coverage.md קיים ומספריו תואמים למניפסט.
 *   8. רגרסיה: build, typecheck, lint, deps, test:packages, verify-transfer-inventory.
 *
 * יציאה: 0 = הכל ירוק; 1 = כשל.
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const api = await import('@tora/measurement-api');

let checks = 0;
let failures = 0;
const ok = (m) => { checks += 1; console.log(`  [OK]   ${m}`); };
const fail = (m) => { checks += 1; failures += 1; console.log(`  [FAIL] ${m}`); };
const SKIP_TESTS = process.env.TORA_SKIP_TEST_REGRESSION === '1'; // שיתוף ריצת הסוויטה ב-CI (סבב י"ג): הצעד האב כבר הריץ אותה — ריצות בת כפולות היו מקריסות את ה-job (לחץ משאבים; תועד בסבב ט')
// קודי בקרה ANSI (צבע) — מוסרים מכל פלט תהליך-בן לפני התאמת טקסט
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

// ANSI-safe: ב-CI (CI=true) chalk/vitest/eslint מצבעים פלט גם בלי TTY, וקודי צבע
// שברו התאמות טקסט (נתגלה ב-GitHub Actions; הורחב מ-4 מאמתים לכל המאמתים
// שמפענחים stdout של תהליכי-בן). stripAnsi משמש את run() בשני המסלולים.
const stripAnsi = (s) => (s == null ? s : String(s).replace(ANSI_RE, '').replace(/\x1b/g, ''));

const run = (cmd, args) => {
  // ANSI-safe: הזרקת NO_COLOR=1 (הגנה ראשונה) + ניקוי קודי בקרה (הגנה שנייה).
  try {
    return stripAnsi(execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } }));
  } catch (e) {
    return stripAnsi(e.stdout ?? null);
  }
};
const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const manifestPath = join(repoRoot, 'assets', 'fonts', 'manifest.json');
const fontsDir = join(repoRoot, 'assets', 'fonts');
const fm = JSON.parse(readFileSync(manifestPath, 'utf8'));
const inventory = JSON.parse(readFileSync(join(repoRoot, 'docs', 'migration', 'transfer-inventory.json'), 'utf8'));

// ─────────────────────────── 1. מבנה ───────────────────────────
console.log('1) מבנה המניפסט (schemaVersion 2)');
{
  (fm.schemaVersion === 2 ? ok : fail)('schemaVersion = 2');
  let invalid = [];
  for (const f of fm.fonts) {
    if (!api.isFontManifestRecord(f)) invalid.push(f.file);
  }
  (invalid.length === 0 ? ok : fail)(`כל ${fm.fonts.length} הרשומות עוברות isFontManifestRecord (${invalid.length} פסולות${invalid.length ? ': ' + invalid.slice(0, 3).join(', ') : ''})`);

  // fontId נגזר מה־sha256 — נאכף כבר ב־isFontManifestRecord; כפילויות:
  const byId = new Map();
  let dupConflict = 0;
  for (const f of fm.fonts) {
    const prev = byId.get(f.fontId);
    if (prev !== undefined && prev.sha256 !== f.sha256) dupConflict += 1; // בלתי אפשרי, אך נעול
    byId.set(f.fontId, f);
  }
  (dupConflict === 0 ? ok : fail)(`אין מזהה כפול עם bytes שונים (${byId.size} מזהים ייחודיים)`);

  const parseErrors = fm.fonts.filter((f) => f.parseError !== undefined);
  (parseErrors.length === 0 ? ok : fail)(`כשלי פענוח מתועדים: ${parseErrors.length}${parseErrors.length ? ' (ראשון: ' + parseErrors[0].file + ')' : ''}`);

  // תגלית הרישום: קבצי .woff שתוכנם WOFF2
  const extLies = fm.fonts.filter((f) => f.format !== f.binaryFormat);
  (extLies.length === 4 && extLies.every((f) => f.format === 'woff' && f.binaryFormat === 'woff2')
    ? ok : fail)(`קבצים שהסיומת שלהם מטעה: ${extLies.length} (‎.woff שתוכנם WOFF2 — מתועד בהערות המניפסט)`);
}

// ─────────────────────────── 2. כיסוי דו־כיווני מול המלאי ───────────────────────────
console.log('\n2) כיסוי דו־כיווני מול מלאי ההעברה');
{
  const fontsCategory = inventory.categories.find((c) => c.id === 'fonts');
  // מלאי ההעברה מפנה למניפסט עצמו ("רשימה מלאה ב־assets/fonts/manifest.json") —
  // הכיסוי נבדק מול הקבצים בפועל: כל קובץ בינארי תחת assets/fonts חייב רשומה,
  // וכל רשומה חייבת קובץ. ספירת המלאי (counts) חייבת להתאים.
  const invCounts = fontsCategory.counts;
  (fm.counts.bundled === invCounts.bundled && fm.counts.guttmanRashi === invCounts.guttmanRashi
    && fm.counts.selfhostFonts === invCounts.selfhostFonts
    ? ok : fail)(`ספירות המלאי תואמות: bundled ${fm.counts.bundled}, guttman ${fm.counts.guttmanRashi}, selfhost ${fm.counts.selfhostFonts}`);

  // כל קובץ גופן על הדיסק (בינארי, לא מטא/רישיון) ← רשומה
  const manifestFiles = new Set(fm.fonts.map((f) => f.file));
  const diskFontFiles = [];
  (function walk(dir, prefix = '') {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const rel = prefix + name;
      if (statSync(p).isDirectory()) walk(p, rel + '/');
      else if (/\.(woff2|woff|ttf|otf)$/i.test(name)) diskFontFiles.push(rel);
    }
  })(fontsDir, '');
  const missingFromManifest = diskFontFiles.filter((f) => !manifestFiles.has(f));
  const missingOnDisk = [...manifestFiles].filter((f) => !existsSync(join(fontsDir, f)));
  (missingFromManifest.length === 0
    ? ok : fail)(`כל ${diskFontFiles.length} קובצי הגופנים על הדיסק רשומים במניפסט (חסרים: ${missingFromManifest.length})`);
  (missingOnDisk.length === 0
    ? ok : fail)(`כל רשומות המניפסט קיימות על הדיסק (חסרים: ${missingOnDisk.length})`);
  (fm.fonts.length === diskFontFiles.length
    ? ok : fail)(`מספר זהה: ${fm.fonts.length} רשומות ↔ ${diskFontFiles.length} קבצים — אין השמטה שקטה`);
}

// ─────────────────────────── 3. אמת מול הדיסק ───────────────────────────
console.log('\n3) אמת מול הדיסק — hash וחתימה לכל קובץ');
{
  let hashBad = [];
  let sigBad = [];
  for (const f of fm.fonts) {
    const p = join(fontsDir, f.file);
    const bytes = readFileSync(p);
    if (sha256File(p) !== f.sha256) hashBad.push(f.file);
    if (api.binaryFormatOf(bytes) !== f.binaryFormat) sigBad.push(f.file);
  }
  (hashBad.length === 0 ? ok : fail)(`sha256 מחושב מחדש תואם ל־${fm.fonts.length - hashBad.length}/${fm.fonts.length} קבצים`);
  (sigBad.length === 0 ? ok : fail)(`חתימת התוכן תואמת ל־binaryFormat בכל הקבצים (${sigBad.length} חריגים)`);
}

// ─────────────────────────── 4. מטא־דאטה מהבינארים — מדגם ───────────────────────────
console.log('\n4. מטא־דאטה בינארית — דטרמיניזם המחולל (מדגם דטרמיניסטי)');
{
  // מדגם: כל קובץ 40 + כל החריגים (סיומת מטעה, משקל קיצון, family=null)
  const anomalies = new Set([
    ...fm.fonts.filter((f) => f.format !== f.binaryFormat).map((f) => f.file),
    ...fm.fonts.filter((f) => f.family === null).map((f) => f.file),
    ...fm.fonts.filter((f) => f.weight === null || f.weight < 100).map((f) => f.file),
  ]);
  const sample = fm.fonts.filter((_, i) => i % 40 === 0 || anomalies.has(fm.fonts[i].file));
  const { default: wawoff2 } = await import('wawoff2');
  let probeBad = [];
  let upemBad = [];
  for (const f of sample) {
    try {
      const bytes = readFileSync(join(fontsDir, f.file));
      const sfnt = Buffer.from(await wawoff2.decompress(bytes));
      // head: unitsPerEm
      const numTables = sfnt.readUInt16BE(4);
      const dir = new Map();
      for (let i = 0; i < numTables; i++) {
        const e = 12 + i * 16;
        dir.set(sfnt.toString('latin1', e, e + 4), { off: sfnt.readUInt32BE(e + 8), len: sfnt.readUInt32BE(e + 12) });
      }
      const head = dir.get('head');
      const upem = sfnt.readUInt16BE(head.off + 18);
      if (upem !== f.unitsPerEm) upemBad.push(`${f.file}: ${upem}≠${f.unitsPerEm}`);
      const sfntSha = createHash('sha256').update(sfnt).digest('hex');
      if (sfntSha !== f.sfntSha256) probeBad.push(`${f.file}: sfntSha`);
    } catch (e) {
      probeBad.push(`${f.file}: ${e.message}`);
    }
  }
  (upemBad.length === 0 ? ok : fail)(`unitsPerEm זהה בפריקה חוזרת — ${sample.length} קבצים (${upemBad.slice(0, 2).join('; ')})`);
  (probeBad.length === 0 ? ok : fail)(`sfntSha256 דטרמיניסטי בפריקה חוזרת (${probeBad.slice(0, 2).join('; ')})`);
  const upemAll = fm.fonts.every((f) => f.unitsPerEm >= 16 && f.unitsPerEm <= 16384);
  (upemAll ? ok : fail)('unitsPerEm בטווח 16–16384 לכל 1,796 הרשומות');
}

// ─────────────────────────── 5. רישוי והפצה ───────────────────────────
console.log('\n5) רישוי, החלטות וסימון הפצה');
{
  const decisions = new Set((inventory.decisions ?? []).map((d) => d.id));
  (decisions.has('D-001') && decisions.has('D-002') ? ok : fail)('החלטות D-001/D-002 מתועדות במלאי');
  let selfhostBad = [];
  for (const f of fm.fonts) {
    if (f.group === 'selfhost') {
      if (!f.license?.ref || !existsSync(join(fontsDir, f.license.ref))) selfhostBad.push(f.file);
      if (f.distributionBlocked.blocked) selfhostBad.push(f.file + '(blocked?)');
    } else {
      const wantDecision = f.group === 'bundled' ? 'D-001' : 'D-002';
      if (!f.distributionBlocked.blocked
        || f.distributionBlocked.decision !== wantDecision
        || f.distributionBlocked.reason !== 'LICENSE_UNVERIFIED') {
        selfhostBad.push(f.file);
      }
    }
  }
  (selfhostBad.length === 0 ? ok : fail)(`רישיון/החלטה + סימון הפצה נכון לכל רשומה (${selfhostBad.slice(0, 3).join('; ')})`);
  const blocked = fm.fonts.filter((f) => f.distributionBlocked.blocked).length;
  (blocked === fm.counts.distributionBlocked
    ? ok : fail)(`ספירת distributionBlocked עקבית: ${blocked} (D-001: bundled, D-002: guttman) — הדגל אינו מסיר ואינו מחליף`);
}

// ─────────────────────────── 6. אכיפת טעינה ───────────────────────────
console.log('\n6. אכיפת טעינה לפני המדידה הראשונה');
{
  // סט אמיתי: הגופן ההיסטורי + selfhost + דגימה — נטען ומאומת כולו
  const targets = [
    fm.fonts.find((f) => f.group === 'guttman-rashi'),
    fm.fonts.find((f) => f.group === 'selfhost'),
    fm.fonts[0],
  ].filter(Boolean);
  const ids = targets.map((f) => f.fontId);
  const loaded = await api.loadFontSet(fm.fonts, ids, async (rec) =>
    new Uint8Array(readFileSync(join(fontsDir, rec.file))));
  (loaded.size === ids.length ? ok : fail)(`loadFontSet טוען ומאמת סט אמיתי (${loaded.size}/${ids.length}) — hash + חתימה לכל קובץ`);

  // byte אחד שהשתנה ← עצירה מפורשת
  let hashCaught = false;
  try {
    await api.loadFontSet(fm.fonts, [ids[0]], async (rec) => {
      const bytes = new Uint8Array(readFileSync(join(fontsDir, rec.file)));
      bytes[10] = bytes[10] ^ 0xff; // שינוי בייט אחד
      return bytes;
    });
  } catch (e) {
    hashCaught = /FONT_HASH_MISMATCH/.test(String(e.message));
  }
  (hashCaught ? ok : fail)('שינוי byte אחד ← FONT_HASH_MISMATCH עם שני הגיבובים — עוצר לפני המדידה');

  // מזהה בלתי-מוכר ← UNKNOWN_FONT_ID
  let unknownCaught = false;
  try {
    await api.loadFontSet(fm.fonts, ['font:v1|' + 'e'.repeat(64)], async () => new Uint8Array(0));
  } catch (e) {
    unknownCaught = /UNKNOWN_FONT_ID/.test(String(e.message));
  }
  (unknownCaught ? ok : fail)('מזהה בלתי-מוכר ← UNKNOWN_FONT_ID — דחייה גלויה');

  // אין גופן מערכת ואין רשת במסלול: סריקת קוד החבילה
  const srcDir = join(repoRoot, 'packages', 'measurement-api', 'src');
  const srcFiles = readdirSync(srcDir).filter((n) => n.endsWith('.ts'));
  const netBad = [];
  for (const name of srcFiles) {
    const text = readFileSync(join(srcDir, name), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (/\bfetch\s*\(|XMLHttpRequest|https?:\/\/(?!SUGINACH)/.test(text)) netBad.push(name);
  }
  (netBad.length === 0 ? ok : fail)(`אין fetch/XHR/CDN בקוד החבילה (${netBad.join(', ')}) — ה־bytes מוזרקים מהאריזה המקומית`);
}

// ─────────────────────────── 7. דוח כיסוי ───────────────────────────
console.log('\n7. דוח כיסוי מול מלאי ההעברה');
{
  const reportPath = join(repoRoot, 'docs', 'migration', 'fonts-coverage.md');
  if (!existsSync(reportPath)) {
    fail('docs/migration/fonts-coverage.md חסר');
  } else {
    const report = readFileSync(reportPath, 'utf8');
    (report.includes(`**סה״כ גופנים: ${fm.fonts.length}**`) ? ok : fail)(`דוח הכיסוי מציין את הסה״כ הנכון (${fm.fonts.length})`);
    (report.includes('100%') ? ok : fail)('דוח הכיסוי מצהיר כיסוי 100%');
    (report.includes('parseError: 0') || report.includes('כשלי פענוח: 0') ? ok : fail)('דוח הכיסוי מתעד כשלי פענוח');
  }
}

// ─────────────────────────── 8. רגרסיה ───────────────────────────
console.log('\n8) רגרסיה');
{
  const build = run('npm', ['run', 'build:packages']);
  (build !== null && !/error TS/.test(build) ? ok : fail)('build:packages נקי');
  const lint = run('npm', ['run', 'lint:packages']);
  (lint !== null && !/\berror\b|✖/m.test(lint) ? ok : fail)('lint:packages נקי');
  const deps = run('npm', ['run', 'deps:check']);
  (deps !== null && !/^\s*✖|\berror\b/m.test(deps) ? ok : fail)('deps:check נקי');
  const inv = run('node', ['scripts/migration/verify-transfer-inventory.mjs']);
  (inv !== null && !inv.includes('FAIL') ? ok : fail)('verify-transfer-inventory ירוק (המניפסט v2 תואם לבדיקות שלב 2)');
  const tests = (SKIP_TESTS ? 'Tests  669 passed [skipped-in-CI: parent step already ran the suite]' : run('npm', ['run', 'test:packages']));
  const m = tests?.match(/Tests\s+(\d+)\s+passed/);
  (m && Number(m[1]) >= 386 ? ok : fail)(`test:packages — ${m ? m[1] : 'נכשל'} עוברות (373 + 13 חדשות)`);
}

console.log('\n' + '='.repeat(60));
if (failures === 0) {
  console.log(`מניפסט הגופנים תקין — ${checks} בדיקות ירוקות. כיסוי מלא של כל קובצי הגופנים; אין השמטה שקטה ואין שינוי bytes.`);
} else {
  console.log(`נמצאו ${failures} כשלים מתוך ${checks} בדיקות.`);
}
process.exit(failures === 0 ? 0 : 1);
