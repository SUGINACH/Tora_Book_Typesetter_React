#!/usr/bin/env node
/**
 * font-binary-probe.mjs — פרסר בינארי של גופנים לבניית המניפסט (שלב 23).
 * קורא unitsPerEm (head), usWeightClass + fsSelection (OS/2) ושמות (name)
 * מ־WOFF2 / WOFF / sfnt. Node בלבד (zlib ל-brotli/deflate) — כלי בנייה,
 * לא חלק מחבילות הליבה.
 *
 * כללי WOFF2 (WOFF2 File Format 2.0 §4-5):
 *   - מרשם הטבלאות אחרי כותרת 48 בתים; דגלים: 6 ביטים תחתונים = אינדקס
 *     תג ידוע (63 = התג עצמו בעקבות), 2 ביטים עליונים = גרסת transform.
 *   - transformLength נקרא כשגרסת ה-transform אינה אפס (כל תג) —
 *     כמו בקוד הייחוס woff2_dec.cc (ReadTableDirectory).
 *   - הזרם הדחוס brotli יחיד ומתחיל מיד אחרי המרשם; הטבלאות בזרם המפורק
 *     לפי סדר המרשם, כל אחת מרופדת לכפולה של 4.
 *   - הפורמט נקבע לפי החתימה בלבד — הרישום שלב 23 גילה קבצי .woff
 *     שתוכנם WOFF2 בפועל.
 */
import { readFileSync } from 'node:fs';
import { brotliDecompressSync, inflateSync } from 'node:zlib';

/** תגים ידועים (ערכים 0–11 מאומתים מול המפרט; השאר אופקיים לצרכינו). */
const KNOWN_HEAD = 1;
const KNOWN_NAME = 5;
const KNOWN_OS2 = 6;

function readUIntBase128(buf, pos) {
  let result = 0;
  let bytesRead = 0;
  for (;;) {
    const b = buf[pos + bytesRead];
    if (b === undefined) throw new Error('UIntBase128: out of data');
    if (bytesRead >= 5 || (bytesRead === 4 && b > 1)) {
      throw new Error('UIntBase128: exceeds 32 bits');
    }
    result = result * 128 + (b & 0x7f);
    bytesRead += 1;
    if ((b & 0x80) === 0) break;
  }
  return { value: result, bytesRead };
}

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

/** WOFF2 → זרם מפורק + מיקומי טבלאות. */
function parseWoff2(buf) {
  const numTables = buf.readUInt16BE(12);
  const totalCompressedSize = buf.readUInt32BE(20);
  let pos = 48;
  const entries = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[pos]; pos += 1;
    const tagIdx = flags & 0x3f;
    const transformVersion = (flags >> 6) & 0x03;
    let tag = null; // לא ידוע — לא נדרש לחישוב המיקומים
    if (tagIdx === 63) {
      tag = buf.toString('latin1', pos, pos + 4);
      pos += 4;
    } else if (tagIdx === KNOWN_HEAD) tag = 'head';
    else if (tagIdx === KNOWN_NAME) tag = 'name';
    else if (tagIdx === KNOWN_OS2) tag = 'OS/2';
    const orig = readUIntBase128(buf, pos);
    pos += orig.bytesRead;
    let transformLength = orig.value;
    if (transformVersion !== 0) {
      const tl = readUIntBase128(buf, pos);
      pos += tl.bytesRead;
      transformLength = tl.value;
    }
    entries.push({ tag, transformLength });
  }
  const streamStart = pos;
  const stream = brotliDecompressSync(buf.subarray(streamStart, streamStart + totalCompressedSize));
  let off = 0;
  const dir = new Map();
  for (const e of entries) {
    dir.set(e.tag ?? `#${dir.size}`, { offset: off, length: e.transformLength });
    off += Math.ceil(e.transformLength / 4) * 4;
  }
  return { stream, dir };
}

function parseWoff(buf) {
  const numTables = buf.readUInt16BE(12);
  const tables = new Map();
  for (let i = 0; i < numTables; i++) {
    const e = 44 + i * 20;
    const tag = buf.toString('latin1', e, e + 4);
    const offset = buf.readUInt32BE(e + 4);
    const compLength = buf.readUInt32BE(e + 8);
    const origLength = buf.readUInt32BE(e + 12);
    let data;
    if (compLength < origLength) {
      data = inflateSync(buf.subarray(offset, offset + compLength));
    } else {
      data = buf.subarray(offset, offset + compLength);
    }
    tables.set(tag, data);
  }
  return tables;
}

/** קריאת פרטי גופן מכל פורמט נתמך. */
export function probeFont(buf) {
  const sig = buf.toString('latin1', 0, 4);
  let head, os2, name;
  if (sig === 'wOF2') {
    const { stream, dir } = parseWoff2(buf);
    const h = dir.get('head');
    const o = dir.get('OS/2');
    const n = dir.get('name');
    head = h ? stream.subarray(h.offset, h.offset + h.length) : null;
    os2 = o ? stream.subarray(o.offset, o.offset + o.length) : null;
    name = n ? stream.subarray(n.offset, n.offset + n.length) : null;
  } else if (sig === 'wOF ') {
    const tables = parseWoff(buf);
    head = tables.get('head');
    os2 = tables.get('OS/2');
    name = tables.get('name');
  } else {
    const dir = parseSfntDirectory(buf, 0);
    const h = dir.get('head');
    const o = dir.get('OS/2');
    const n = dir.get('name');
    head = h ? buf.subarray(h.offset, h.offset + h.length) : null;
    os2 = o ? buf.subarray(o.offset, o.offset + o.length) : null;
    name = n ? buf.subarray(n.offset, n.offset + n.length) : null;
  }
  if (!head || head.length < 20) throw new Error('head table חסר או קצר');
  // קסם head: 0x5F0F3CF5 ב-offset 12 — אימות שהפרסר מיושר
  if (head.readUInt32BE(12) !== 0x5f0f3cf5) throw new Error('head magic שגוי — פרסר לא מיושר');
  const unitsPerEm = head.readUInt16BE(18);
  if (unitsPerEm < 16 || unitsPerEm > 16384) throw new Error(`unitsPerEm חריג: ${unitsPerEm}`);
  const weight = os2 && os2.length >= 8 ? os2.readUInt16BE(4) : null;
  const fsSelection = os2 && os2.length >= 64 ? os2.readUInt16BE(62) : null;
  const italic = fsSelection !== null ? (fsSelection & 0x01) === 1 : null;
  // שמות: nameID 1 (family), 2 (subfamily), 16/17 (typographic)
  const names = {};
  if (name && name.length >= 6) {
    const count = name.readUInt16BE(2);
    const stringOffset = name.readUInt16BE(4);
    for (let i = 0; i < count; i++) {
      const rec = 6 + i * 12;
      const platformId = name.readUInt16BE(rec);
      const nameId = name.readUInt16BE(rec + 6);
      const length = name.readUInt16BE(rec + 8);
      const offset = name.readUInt16BE(rec + 10);
      if (![1, 2, 16, 17].includes(nameId)) continue;
      const raw = name.subarray(stringOffset + offset, stringOffset + offset + length);
      let value;
      if (platformId === 3 || platformId === 0) {
        // UTF-16BE → החלפת סדר בתים
        value = Buffer.from(raw).swap16().toString('utf16le');
      } else {
        value = raw.toString('latin1');
      }
      if (value && !names[nameId]) names[nameId] = value;
    }
  }
  return {
    format: sig === 'wOF2' ? 'woff2' : sig === 'wOF ' ? 'woff' : 'sfnt',
    unitsPerEm, weight, fsSelection, italic, names,
  };
}

// CLI: probe של קבצים שהועברו בשורת הפקודה
if (process.argv[1] && process.argv[1].endsWith('font-binary-probe.mjs')) {
  for (const file of process.argv.slice(2)) {
    try {
      const info = probeFont(readFileSync(file));
      console.log(JSON.stringify({ file: file.split('/').pop(), ...info }));
    } catch (e) {
      console.log(JSON.stringify({ file: file.split('/').pop(), error: e.message }));
    }
  }
}
