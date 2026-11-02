#!/usr/bin/env node
/**
 * gen-fonts-manifest.mjs — בניית manifest גופנים מלא v2 (שלב 23).
 *
 * אסמכתא: אפיון §6.4, §18-M3, §21 · תכנית שלב 23 · החלטות D-001/D-002 במלאי.
 *
 * המחולל דטרמיניסטי: אותם קלטים ⇐ אותו מניפסט ביט-ביט (אין תאריך, אין מונה).
 * מקורות: manifest v1 (שלב 2 — שמות משפחה עבריים, קבוצות, רישיונות, רשימות)
 * + הבינארים ב־assets/fonts (נקראים בפועל: חתימה, unitsPerEm, usWeightClass,
 * fsSelection, טבלת name) + wawoff2 (יישום הייחוס של Google, נעול 2.0.1) לפריקת
 * WOFF2. הפורמט נקבע לפי החתימה בלבד — הרישום גילה קבצי ‎.woff שתוכנם WOFF2.
 *
 * שדות חדשים לכל גופן: fontId (font:v1|sha256), weight (usWeightClass),
 * style (italic לפי fsSelection), unitsPerEm, binaryFormat, nameTable,
 * sfntSha256 (פריקת WOFF2 הקנונית — לזהות בין hosts בשלב 29), source, וכן
 * distributionBlocked עם סיבה ומדיניות לפי החלטות הרישוי. גופן שאינו ניתן
 * לפענוח נשאר במרשם עם parseError מפורש — שום דבר אינו נעלם בשקט.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import wawoff2 from 'wawoff2';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fontsDir = join(repoRoot, 'assets', 'fonts');
const manifestPath = join(fontsDir, 'manifest.json');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const v1 = JSON.parse(readFileSync(manifestPath, 'utf8'));

// הערות v2 קבועות — המחולל idempotent: ריצה על מניפסט v2 קיים מסירה אותן ומוסיפה פעם אחת
const V2_NOTES = [
  'v2 (שלב 23): לכל גופן — fontId, weight (usWeightClass), style (fsSelection), unitsPerEm, binaryFormat (לפי החתימה — הרישום גילה קבצי .woff שתוכנם WOFF2), nameTable ו־sfntSha256 (פריקה קנונית — לזהות בין hosts, שלב 29).',
  'distributionBlocked (D-001/D-002): הגופן כשיר לשימוש לצורך תאימות אך מסומן כחסר רישיון מתועד — הדגל אינו מסיר מהמרשם, אינו מחליף גופן ואינו משנה bytes; שער ההפצה (שלב 99) יבדוק אותו.',
];
const baseNotes = (v1.notes ?? []).filter((n) => !V2_NOTES.includes(n));

// מקורות המלאי (מהמניפסט הישן) — לתיעוד הפרוטננס של כל קובץ
const ORANGE = 'SUGINACH/Tora_Book_Typesetter_Orange@93ad1e5704405fb2806a126ea1b519a35a87f378';
const sourceOf = (entry) => {
  if (entry.group === 'selfhost') return `${ORANGE}:fonts/selfhost/${entry.file.replace(/^selfhost\//, '')}`;
  return `${ORANGE}:fonts/${entry.file}`;
};

// מדיניות הפצה לפי החלטות המלאי (D-001/D-002) — הדגל אינו מסיר ואינו מחליף
const distributionPolicy = (group) => {
  if (group === 'bundled') {
    return {
      blocked: true,
      reason: 'LICENSE_UNVERIFIED',
      decision: 'D-001',
      policy: 'usable-for-compat; excluded-from-release-bundle (נבדק בשער שלב 99)',
    };
  }
  if (group === 'guttman-rashi') {
    return {
      blocked: true,
      reason: 'LICENSE_UNVERIFIED',
      decision: 'D-002',
      policy: 'usable-for-compat; excluded-from-release-bundle (נבדק בשער שלב 99)',
    };
  }
  // selfhost — OFL-1.1 מתועד
  return { blocked: false, reason: 'OFL-1.1', decision: null, policy: 'redistributable-with-license' };
};

// ─────────────────────────── פרסר sfnt/woff1 ───────────────────────────

function parseSfntDirectory(buf, offset = 0) {
  const numTables = buf.readUInt16BE(offset + 4);
  const dir = new Map();
  for (let i = 0; i < numTables; i++) {
    const e = offset + 12 + i * 16;
    const tag = buf.toString('latin1', e, e + 4);
    dir.set(tag, { offset: buf.readUInt32BE(e + 8), length: buf.readUInt32BE(e + 12) });
  }
  return dir;
}

function parseWoff1Tables(buf) {
  const numTables = buf.readUInt16BE(12);
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const e = 44 + i * 20;
    const tag = buf.toString('latin1', e, e + 4);
    const offset = buf.readUInt32BE(e + 4);
    const compLength = buf.readUInt32BE(e + 8);
    const origLength = buf.readUInt32BE(e + 12);
    const data = compLength < origLength
      ? inflateSync(buf.subarray(offset, offset + compLength))
      : buf.subarray(offset, offset + compLength);
    tables.set(tag, data);
  }
  return tables;
}

function readNameTable(name) {
  const names = {};
  if (!name || name.length < 6) return names;
  const count = name.readUInt16BE(2);
  const stringOffset = name.readUInt16BE(4);
  for (let i = 0; i < count; i++) {
    const rec = 6 + i * 12;
    if (rec + 12 > name.length) break;
    const platformId = name.readUInt16BE(rec);
    const nameId = name.readUInt16BE(rec + 6);
    const length = name.readUInt16BE(rec + 8);
    const offset = name.readUInt16BE(rec + 10);
    if (![1, 2, 16, 17].includes(nameId)) continue;
    const raw = name.subarray(stringOffset + offset, stringOffset + offset + length);
    if (raw.length < length) continue;
    const value = (platformId === 3 || platformId === 0)
      ? Buffer.from(raw).swap16().toString('utf16le')
      : raw.toString('latin1');
    if (value && !names[nameId]) names[nameId] = value;
  }
  return names;
}

function extractFromTables(head, os2, name) {
  if (!head || head.length < 20) throw new Error('head table חסר או קצר');
  if (head.readUInt32BE(12) !== 0x5f0f3cf5) throw new Error('head magic שגוי');
  const unitsPerEm = head.readUInt16BE(18);
  if (unitsPerEm < 16 || unitsPerEm > 16384) throw new Error(`unitsPerEm חריג: ${unitsPerEm}`);
  const weight = os2 && os2.length >= 8 ? os2.readUInt16BE(4) : null;
  const fsSelection = os2 && os2.length >= 64 ? os2.readUInt16BE(62) : null;
  const style = fsSelection !== null ? ((fsSelection & 0x01) === 1 ? 'italic' : 'normal') : 'normal';
  return { unitsPerEm, weight, style, names: readNameTable(name) };
}

/** פענוח גופן לפי חתימת התוכן — מחזיר { binaryFormat, ...מטא־דאטה, sfntSha256? }. */
async function probeFontBinary(buf) {
  const sig = buf.toString('latin1', 0, 4);
  if (sig === 'wOF2') {
    const sfnt = Buffer.from(await wawoff2.decompress(buf));
    if (sfnt.readUInt32BE(0) === 0x74746366) {
      throw new Error('WOFF2 collection (TTC) אינו נתמך במלאי');
    }
    const dir = parseSfntDirectory(sfnt, 0);
    const head = dir.get('head');
    const os2 = dir.get('OS/2');
    const name = dir.get('name');
    const info = extractFromTables(
      head ? sfnt.subarray(head.offset, head.offset + head.length) : null,
      os2 ? sfnt.subarray(os2.offset, os2.offset + os2.length) : null,
      name ? sfnt.subarray(name.offset, name.offset + name.length) : null,
    );
    return { binaryFormat: 'woff2', sfntSha256: sha256(sfnt), ...info };
  }
  if (sig === 'wOF ') {
    const tables = parseWoff1Tables(buf);
    const info = extractFromTables(tables.get('head'), tables.get('OS/2'), tables.get('name'));
    return { binaryFormat: 'woff', ...info };
  }
  if (buf.readUInt32BE(0) === 0x00010000 || sig === 'OTTO' || sig === 'true' || sig === 'ttcf') {
    if (sig === 'ttcf') throw new Error('אוסף TTC אינו נתמך במלאי');
    const dir = parseSfntDirectory(buf, 0);
    const info = extractFromTables(
      dir.get('head') ? buf.subarray(dir.get('head').offset, dir.get('head').offset + dir.get('head').length) : null,
      dir.get('OS/2') ? buf.subarray(dir.get('OS/2').offset, dir.get('OS/2').offset + dir.get('OS/2').length) : null,
      dir.get('name') ? buf.subarray(dir.get('name').offset, dir.get('name').offset + dir.get('name').length) : null,
    );
    return { binaryFormat: 'sfnt', ...info };
  }
  throw new Error(`חתימה לא מזוהה: ${sig.replace(/[^\x20-\x7e]/g, '?')}`);
}

// ─────────────────────────── בניית המניפסט ───────────────────────────

const fonts = [];
const failures = [];
for (const entry of v1.fonts) {
  const bytes = readFileSync(join(fontsDir, entry.file));
  const contentSha256 = sha256(bytes);
  if (contentSha256 !== entry.sha256) {
    throw new Error(`sha256 לא תואם למניפסט v1: ${entry.file} — הקובץ השתנה מאז שלב 2`);
  }
  const record = {
    file: entry.file,
    fontId: `font:v1|${contentSha256}`,
    sha256: entry.sha256,
    bytes: entry.bytes,
    family: entry.family ?? null,
    format: entry.format,
    group: entry.group,
    inPriorityList: entry.inPriorityList ?? false,
    inExtendedList: entry.inExtendedList ?? false,
    license: entry.license ?? null,
    source: sourceOf(entry),
    distributionBlocked: distributionPolicy(entry.group),
  };
  try {
    const probe = await probeFontBinary(bytes);
    record.binaryFormat = probe.binaryFormat;
    record.unitsPerEm = probe.unitsPerEm;
    record.weight = probe.weight;
    record.style = probe.style;
    record.nameTable = {
      family: probe.names[1] ?? null,
      subfamily: probe.names[2] ?? null,
      typographicFamily: probe.names[16] ?? null,
      typographicSubfamily: probe.names[17] ?? null,
    };
    if (probe.sfntSha256) record.sfntSha256 = probe.sfntSha256;
  } catch (e) {
    record.parseError = e.message;
    failures.push({ file: entry.file, error: e.message });
  }
  fonts.push(record);
}

const manifest = {
  schemaVersion: 2,
  generatedAt: v1.generatedAt, // תאריך ההקפאה המקורי (שלב 2) — המניפסט עצמו דטרמיניסטי
  source: v1.source,
  familyMappingSources: v1.familyMappingSources,
  licensePolicy: v1.licensePolicy,
  woff2Decoder: {
    package: 'wawoff2',
    version: '2.0.1',
    role: 'פריקת WOFF2 קנונית לצורך חילוץ מטא־דאטה ו־sfntSha256 (יישום הייחוס של Google; הספק בפועל — שלב 24, ADR-003)',
  },
  notes: [
    ...baseNotes,
    ...V2_NOTES,
  ],
  counts: {
    ...v1.counts,
    fontsTotal: fonts.length,
    parseErrors: failures.length,
    distributionBlocked: fonts.filter((f) => f.distributionBlocked?.blocked).length,
  },
  fonts,
  selfhostOther: v1.selfhostOther,
  metadata: v1.metadata,
};

writeFileSync(manifestPath, JSON.stringify(manifest, null, 1) + '\n');

console.log(`manifest v2 נכתב: ${fonts.length} גופנים; כשלי פענוח: ${failures.length}`);
if (failures.length > 0) {
  console.log('כשלים (נשארים במרשם עם parseError):');
  for (const f of failures) console.log(`  - ${f.file}: ${f.error}`);
}
