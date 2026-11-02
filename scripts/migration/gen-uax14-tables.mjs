#!/usr/bin/env node
/**
 * gen-uax14-tables.mjs — הפקת טבלאות UAX #14 (שלב 27; Unicode 16.0.0 נעול).
 *
 * קלט: packages/test-fixtures/unicode/*.txt (נעולים ב־SHA; ראה README שם).
 * פלט: packages/measurement-api/src/uax14-tables.ts — דטרמיניסטי לחלוטין:
 *   1. LB_CLASSES — מערך טווחים [start, end, class] לפי LineBreak.txt,
 *      כאשר ‎LB1‎ כבר נאפה: ‎AI/SG/XX→AL‎; ‎SA→CM‎ לבעלי gc=Mn/Mc ואחרת ‎AL‎.
 *   2. EA_WIDE — טווחי ‎$EastAsian‎ (EAW = F או W) לתנאי LB19a/LB21a/LB30.
 *   3. PI_SET / PF_SET — נקודות קוד בקטגוריות Pi/Pf (LB15a/LB15b/LB19).
 *   4. PICTO_CN — ‎Extended_Pictographic ∩ Cn‎ (LB30b).
 *
 * המחולל מפיק קובץ TS אחיד ללא תאריך/זמן; אותם קלטים ⇐ אותו פלט ביט-ביט.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = join(repoRoot, 'packages', 'test-fixtures', 'unicode');
const outPath = join(repoRoot, 'packages', 'measurement-api', 'src', 'uax14-tables.ts');

const sha = (name) => createHash('sha256').update(readFileSync(join(dataDir, name))).digest('hex');
const read = (name) => readFileSync(join(dataDir, name), 'utf8');

// ─── נעילות המקור (מאומתות במאמת השלב מול registry) ───
const LOCK = {
  unicode: '16.0.0',
  uax14: 'revision 53',
  LineBreak: sha('LineBreak.txt'),
  LineBreakTest: sha('LineBreakTest.txt'),
  EastAsianWidth: sha('EastAsianWidth.txt'),
  UnicodeData: sha('UnicodeData.txt'),
  emojiData: sha('emoji-data.txt'),
};

// ─── 1. מחלקות שבירה מ־LineBreak.txt ───
const lb = [];
for (const line of read('LineBreak.txt').split('\n')) {
  const m = line.match(/^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*(\w+)/);
  if (!m) continue;
  lb.push([parseInt(m[1], 16), parseInt(m[2] ?? m[1], 16), m[3]]);
}
lb.sort((a, b) => a[0] - b[0]);

// ─── 2. gc לפתרון SA (LB1: SA→CM ל־Mn/Mc, אחרת AL) + Pi/Pf ───
const gc = new Map();
for (const line of read('UnicodeData.txt').split('\n')) {
  const f = line.split(';');
  if (f.length < 3) continue;
  gc.set(parseInt(f[0], 16), f[2]);
}
const piSet = [];
const pfSet = [];
for (const [cp, cat] of gc) {
  if (cat === 'Pi') piSet.push(cp);
  else if (cat === 'Pf') pfSet.push(cp);
}

// ─── 3. EAW F/W ($EastAsian) ───
const eaWide = [];
for (const line of read('EastAsianWidth.txt').split('\n')) {
  const m = line.match(/^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*([FWH])/); // $EastAsian = F|W|H (ראה סעיף הסימון ב-UAX#14)
  if (!m) continue;
  eaWide.push([parseInt(m[1], 16), parseInt(m[2] ?? m[1], 16)]);
}
eaWide.sort((a, b) => a[0] - b[0]);

// ─── 4. Extended_Pictographic ∩ Cn (LB30b) ───
const picto = [];
for (const line of read('emoji-data.txt').split('\n')) {
  const m = line.match(/^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*Extended_Pictographic\b/);
  if (!m) continue;
  picto.push([parseInt(m[1], 16), parseInt(m[2] ?? m[1], 16)]);
}
// ∩ Cn: מסננים נקודות שמופות ב־UnicodeData (מוקצות) — הנותרות הן Cn
const pictoCn = [];
for (const [start, end] of picto) {
  let runStart = null;
  for (let cp = start; cp <= end; cp++) {
    const assigned = gc.has(cp);
    if (!assigned && runStart === null) runStart = cp;
    if ((assigned || cp === end) && runStart !== null) {
      const runEnd = assigned ? cp - 1 : cp;
      pictoCn.push([runStart, runEnd]);
      runStart = null;
    }
  }
}

// ─── אפיית LB1: AI/SG/XX→AL; SA→CM ל־Mn/Mc ואחרת AL ───
const RESOLVE = { AI: 'AL', SG: 'AL', XX: 'AL', CJ: 'NS' }; // CJ→NS: ברירת המחדל המומלצת ב-UAX#14 (כך גם LineBreakTest.txt)
const baked = lb.map(([start, end, cls]) => {
  if (RESOLVE[cls]) return [[start, end, RESOLVE[cls]]];
  if (cls === 'SA') {
    // פיצול הטווח לפי gc בפועל — התוצאה קבועה ודטרמיניסטית
    const parts = [];
    let cur = null;
    for (let cp = start; cp <= end; cp++) {
      const cat = gc.get(cp);
      const resolved = (cat === 'Mn' || cat === 'Mc') ? 'CM' : 'AL';
      if (cur === null || cur[2] !== resolved) {
        if (cur !== null) parts.push(cur);
        cur = [cp, cp, resolved];
      } else {
        cur[1] = cp;
      }
    }
    if (cur !== null) parts.push(cur);
    return parts;
  }
  return [[start, end, cls]];
}).flat();
baked.sort((a, b) => a[0] - b[0]);
// מיזוג טווחים סמוכים באותה מחלקה
const merged = [];
for (const r of baked) {
  const last = merged[merged.length - 1];
  if (last && last[2] === r[2] && last[1] + 1 === r[0]) last[1] = r[1];
  else merged.push(r);
}

// ─── כתיבת הקובץ ───
const lines = [];
lines.push('/**');
lines.push(' * uax14-tables.ts — טבלאות UAX #14 המיוצרות (שלב 27). CJ→NS נאפה (ברירת מחדל UAX#14).');
lines.push(' *');
lines.push(` * נוצר אוטומטית על ידי scripts/migration/gen-uax14-tables.mjs — אין לערוך ידנית.`);
lines.push(` * מקור: Unicode ${LOCK.unicode}, UAX #14 ${LOCK.uax14}; הנתונים נעולים ב־packages/test-fixtures/unicode.`);
lines.push(' * LB1 נאפה בטבלה: AI/SG/XX→AL; SA→CM לבעלי gc=Mn/Mc ואחרת AL.');
lines.push(' */');
lines.push('');
lines.push(`export const UAX14_UNICODE_VERSION = '${LOCK.unicode}' as const;`);
lines.push(`export const UAX14_REVISION = '${LOCK.uax14}' as const;`);
lines.push(`export const UAX14_SOURCE_SHA256 = Object.freeze({`);
for (const [k, v] of Object.entries(LOCK)) {
  if (k.includes('unicode') || k.includes('uax14')) continue;
  lines.push(`  ${k}: '${v}',`);
}
lines.push(`});`);
lines.push('');
lines.push('/** טווחי מחלקות [start, end, class] — ממוינים, ללא חפיפה (LB1 נאפה). */');
lines.push(`export const LB_RANGES: readonly (readonly [number, number, string])[] = Object.freeze([`);
for (const [s, e, c] of merged) lines.push(`  [${s}, ${e}, '${c}'],`);
lines.push(']);');
lines.push('');
lines.push('/** טווחי $EastAsian (EAW = F | W) — לתנאי LB19a/LB21a/LB30. */');
lines.push(`export const EA_WIDE_RANGES: readonly (readonly [number, number])[] = Object.freeze([`);
for (const [s, e] of eaWide) lines.push(`  [${s}, ${e}],`);
lines.push(']);');
lines.push('');
lines.push('/** נקודות קוד בקטגוריית Pi (LB15a/LB19). */');
lines.push(`export const PI_CODEPOINTS: readonly number[] = Object.freeze([${piSet.sort((a, b) => a - b).join(', ')}]);`);
lines.push('/** נקודות קוד בקטגוריית Pf (LB15b/LB19). */');
lines.push(`export const PF_CODEPOINTS: readonly number[] = Object.freeze([${pfSet.sort((a, b) => a - b).join(', ')}]);`);
lines.push('');
lines.push('/** טווחי Extended_Pictographic ∩ Cn (LB30b). */');
lines.push(`export const PICTO_CN_RANGES: readonly (readonly [number, number])[] = Object.freeze([`);
for (const [s, e] of pictoCn) lines.push(`  [${s}, ${e}],`);
lines.push(']);');
lines.push('');

writeFileSync(outPath, lines.join('\n'));
console.log(`uax14-tables.ts נכתב: ${merged.length} טווחי מחלקה, ${eaWide.length} טווחי EAW, ${piSet.length} Pi, ${pfSet.length} Pf, ${pictoCn.length} טווחי picto∩Cn`);
