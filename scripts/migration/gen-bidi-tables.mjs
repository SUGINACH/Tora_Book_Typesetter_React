#!/usr/bin/env node
/**
 * gen-bidi-tables.mjs — הפקת טבלאות UAX #9 (שלב 28; Unicode 16.0.0 נעול).
 *
 * קלט: packages/test-fixtures/unicode/*.txt (נעולים ב-SHA; ראה README שם).
 * פלט: packages/measurement-api/src/bidi-tables.ts — דטרמיניסטי לחלוטין:
 *   1. BIDI_RANGES — מערך טווחים [start, end, class] לפי DerivedBidiClass.txt.
 *      תווים שאינם רשומים (L מוקצים וברירת מחדל) ← L בזמן חיפוש.
 *   2. BIDI_BRACKETS — [cp, pairedCp, 'o'|'c'|'u'] לפי BidiBrackets.txt (BD14/BD15/BD16).
 *   3. BIDI_MIRRORED_CODEPOINTS — נקודות קוד עם Bidi_Mirrored=Y (UnicodeData.txt,
 *      שדה 9) — לחוזה האיחוד (L4) בלבד.
 *
 * המחולל מפיק קובץ TS אחיד ללא תאריך/זמן; אותם קלטים ⇐ אותו פלט ביט-ביט.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = join(repoRoot, 'packages', 'test-fixtures', 'unicode');
const outPath = join(repoRoot, 'packages', 'measurement-api', 'src', 'bidi-tables.ts');

const sha = (name) => createHash('sha256').update(readFileSync(join(dataDir, name))).digest('hex');
const read = (name) => readFileSync(join(dataDir, name), 'utf8');

// ─── נעילות המקור (מאומתות במאמת השלב) ───
const LOCK = {
  unicode: '16.0.0',
  uax9: 'revision 50',
  DerivedBidiClass: sha('DerivedBidiClass.txt'),
  BidiTest: sha('BidiTest.txt'),
  BidiCharacterTest: sha('BidiCharacterTest.txt'),
  BidiBrackets: sha('BidiBrackets.txt'),
};

// ─── 1. מחלקות BiDi מ-DerivedBidiClass.txt ───
const ranges = [];
for (const line of read('DerivedBidiClass.txt').split('\n')) {
  const m = line.match(/^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*(\w+)/);
  if (!m) continue;
  ranges.push([parseInt(m[1], 16), parseInt(m[2] ?? m[1], 16), m[3]]);
}
ranges.sort((a, b) => a[0] - b[0]);
// מיזוג טווחים סמוכים באותה מחלקה
const merged = [];
for (const r of ranges) {
  const last = merged[merged.length - 1];
  if (last && last[2] === r[2] && last[1] + 1 === r[0]) last[1] = r[1];
  else merged.push(r);
}

// ─── 2. סוגריים מקוונים מ-BidiBrackets.txt ───
// פורמט: <cp>; <paired cp>; <o | c | u>
const brackets = [];
for (const line of read('BidiBrackets.txt').split('\n')) {
  const m = line.match(/^([0-9A-F]+)\s*;\s*([0-9A-F]+)\s*;\s*([ocu])\b/);
  if (!m) continue;
  brackets.push([parseInt(m[1], 16), parseInt(m[2], 16), m[3]]);
}
brackets.sort((a, b) => a[0] - b[0]);

// ─── 3. Bidi_Mirrored=Y מ-UnicodeData.txt (שדה 9) ───
const mirrored = [];
for (const line of read('UnicodeData.txt').split('\n')) {
  const f = line.split(';');
  if (f.length < 10) continue;
  if (f[9] === 'Y') mirrored.push(parseInt(f[0], 16));
}
mirrored.sort((a, b) => a - b);

// ─── כתיבת הקובץ ───
const lines = [];
lines.push('/**');
lines.push(' * bidi-tables.ts — טבלאות UAX #9 המיוצרות (שלב 28).');
lines.push(' *');
lines.push(' * נוצר אוטומטית על ידי scripts/migration/gen-bidi-tables.mjs — אין לערוך ידנית.');
lines.push(` * מקור: Unicode ${LOCK.unicode}, UAX #9 ${LOCK.uax9}; הנתונים נעולים ב-packages/test-fixtures/unicode.`);
lines.push(' * max_depth = 125 (UBA 6.3.0+); הטבלאות מכסות את כל הנקודות שאינן L (ברירת המחדל בזמן חיפוש).');
lines.push(' */');
lines.push('');
lines.push(`export const BIDI_UNICODE_VERSION = '${LOCK.unicode}' as const;`);
lines.push(`export const BIDI_REVISION = '${LOCK.uax9}' as const;`);
lines.push(`export const BIDI_MAX_DEPTH = 125 as const;`);
lines.push('export const BIDI_SOURCE_SHA256 = Object.freeze({');
for (const [k, v] of Object.entries(LOCK)) {
  if (k.includes('unicode') || k.includes('uax9')) continue;
  lines.push(`  ${k}: '${v}',`);
}
lines.push('});');
lines.push('');
lines.push('/** טווחי מחלקות BiDi [start, end, class] — ממוינים, ללא חפיפה; מחלקה L היא ברירת המחדל. */');
lines.push(`export const BIDI_RANGES: readonly (readonly [number, number, string])[] = Object.freeze([`);
for (const [s, e, c] of merged) lines.push(`  [${s}, ${e}, '${c}'],`);
lines.push(']);');
lines.push('');
lines.push("/** סוגריים מקוונים [cp, pairedCp, 'o'|'c'|'u'] לפי BD14/BD15/BD16 (N0). */");
lines.push(`export const BIDI_BRACKETS: readonly (readonly [number, number, string])[] = Object.freeze([`);
for (const [cp, paired, t] of brackets) lines.push(`  [${cp}, ${paired}, '${t}'],`);
lines.push(']);');
lines.push('');
lines.push('/** נקודות קוד עם Bidi_Mirrored=Y (UnicodeData שדה 9) — חוזה האיחוד L4 בלבד. */');
lines.push(`export const BIDI_MIRRORED_CODEPOINTS: readonly number[] = Object.freeze([`);
for (let i = 0; i < mirrored.length; i += 8) {
  lines.push('  ' + mirrored.slice(i, i + 8).join(', ') + ',');
}
lines.push(']);');
lines.push('');

writeFileSync(outPath, lines.join('\n'));
console.log(`bidi-tables.ts נכתב: ${merged.length} טווחי מחלקה, ${brackets.length} סוגריים מקוונים, ${mirrored.length} נקודות מראה`);
