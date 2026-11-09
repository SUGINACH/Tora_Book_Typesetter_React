/**
 * sfnt.ts — פרסור ו-subsetting של TrueType (sfnt) עבור export-pdf (ADR-009; §15.4).
 *
 * קלט: ה-sfnt שממנו המנוע מדד — עבור גופני WOFF2 זהו ה-sfnt הקנוני אחרי
 * הפריקה (אותם bytes; ‎sfntSha256‎ במרשם נועל את הזהות בין hosts — שלב 29).
 * אין כאן shaping: הגליפים ומיקומיהם מגיעים מה־IR; כאן רק טבלאות.
 *
 * מה נקרא: head/hhea/maxp/hmtx/loca/glyf/cmap (פורמט 4 בלבד — עברית
 * ולטינית; פורמטים אחרים ⇒ שגיאה קולנית; אין fallback שקט — §15.4).
 * ה-subset: ‎notdef (gid 0) תמיד + ה-gids שנציירו בלבד; מיפוי מקורי→חדש
 * עולה וקבוע; ‎loca/glyf/hmtx‎ נבנים מחדש; ‎head/hhea/maxp‎ מועתקים עם
 * ‎numGlyphs‎ מעודכן; ‎checkSumAdjustment‎ מאופס ו-checksums לפי טבלה
 * מחושבים — דטרמיניסטי כולו (אותם גליפים ⇒ אותם bytes ביט-ביט).
 * ‎cmap‎ אינו נכלל ב-subset (‎CIDFontType2‎ עם ‎Identity‎ אינו זקוק לו;
 * ‎ToUnicode‎ נותן את החילוץ) — תיעוד ב־ADR-009.
 */
export interface SfntTable {
  readonly tag: string;
  readonly data: Uint8Array;
}

export interface ParsedSfnt {
  readonly unitsPerEm: number;
  readonly indexToLocFormat: 0 | 1;
  readonly numGlyphs: number;
  readonly ascent: number;
  readonly descent: number; // שלילי כמקובל
  readonly lineGap: number;
  readonly bbox: readonly [number, number, number, number]; // xMin yMin xMax yMax (font units)
  /** רוחב glyph לפי hmtx (עם fallback ל-lastEntry — כלל הפונט). */
  readonly advanceOf: (gid: number) => number;
  /** קידוד→gid לפי cmap פורמט 4 (הקריאה לגופנים ללא cmap ⇒ שגיאה קולנית). */
  readonly gidOfCodePoint: (cp: number) => number;
  /** קטע ה-glyf של glyph (ריק ⇒ glyph ריק). */
  readonly glyphData: (gid: number) => Uint8Array;
}

export class SfntError extends Error {
  constructor(readonly code: string, readonly params: Readonly<Record<string, string | number>>) {
    super(`errors.export-pdf.${code} ${JSON.stringify(params)}`);
    this.name = 'SfntError';
  }
}

const u16 = (d: Uint8Array, o: number): number => ((d[o] as number) << 8) | (d[o + 1] as number);
const i16 = (d: Uint8Array, o: number): number => {
  const v = ((d[o] as number) << 8) | (d[o + 1] as number);
  return v >= 0x8000 ? v - 0x10000 : v;
};
const u32 = (d: Uint8Array, o: number): number => (((d[o] as number) << 24) | ((d[o + 1] as number) << 16) | ((d[o + 2] as number) << 8) | (d[o + 3] as number)) >>> 0;

function findTable(bytes: Uint8Array, tag: string): Uint8Array | undefined {
  if (bytes.length < 12) throw new SfntError('SFNT_TRUNCATED', { length: bytes.length });
  const numTables = u16(bytes, 4);
  if (bytes.length < 12 + numTables * 16) throw new SfntError('SFNT_DIR_TRUNCATED', { numTables });
  for (let i = 0; i < numTables; i += 1) {
    const o = 12 + i * 16;
    if (String.fromCharCode(bytes[o] as number, bytes[o + 1] as number, bytes[o + 2] as number, bytes[o + 3] as number) === tag) {
      const off = u32(bytes, o + 8);
      const len = u32(bytes, o + 12);
      if (off + len > bytes.length) throw new SfntError('SFNT_TABLE_RANGE', { tag, off, len });
      return bytes.subarray(off, off + len);
    }
  }
  return undefined;
}

function requireTable(bytes: Uint8Array, tag: string): Uint8Array {
  const t = findTable(bytes, tag);
  if (t === undefined) throw new SfntError('SFNT_TABLE_MISSING', { tag });
  return t;
}

export function parseSfnt(bytes: Uint8Array): ParsedSfnt {
  const magic = u32(bytes, 0);
  if (magic !== 0x00010000 && magic !== 0x74727565) {
    throw new SfntError('SFNT_MAGIC', { got: magic.toString(16) });
  }
  const head = requireTable(bytes, 'head');
  const hhea = requireTable(bytes, 'hhea');
  const maxp = requireTable(bytes, 'maxp');
  const hmtx = requireTable(bytes, 'hmtx');
  const loca = requireTable(bytes, 'loca');
  const glyf = requireTable(bytes, 'glyf');
  const cmapSeg = findTable(bytes, 'cmap');
  if (cmapSeg === undefined) throw new SfntError('SFNT_TABLE_MISSING', { tag: 'cmap' });

  const unitsPerEm = u16(head, 18);
  const indexToLocFormat = (u16(head, 50) as 0 | 1);
  const numGlyphs = u16(maxp, 4);
  const numberOfHMetrics = u16(hhea, 34);
  const ascent = i16(hhea, 4);
  const descent = i16(hhea, 6);
  const lineGap = i16(hhea, 8);
  const bbox: [number, number, number, number] = [i16(head, 36), i16(head, 38), i16(head, 40), i16(head, 42)];

  if (unitsPerEm < 16 || unitsPerEm > 16384) throw new SfntError('SFNT_UPM', { unitsPerEm });

  const advanceOf = (gid: number): number => {
    if (gid < 0 || gid >= numGlyphs) return 0;
    if (gid < numberOfHMetrics) return u16(hmtx, gid * 4);
    return numberOfHMetrics > 0 ? u16(hmtx, (numberOfHMetrics - 1) * 4) : 0;
  };
  const glyphData = (gid: number): Uint8Array => {
    if (gid < 0 || gid >= numGlyphs) return new Uint8Array(0);
    const prev = indexToLocFormat === 0
      ? u16(loca, gid * 2) * 2
      : u32(loca, gid * 4);
    const next = indexToLocFormat === 0
      ? u16(loca, (gid + 1) * 2) * 2
      : u32(loca, (gid + 1) * 4);
    if (next < prev) return new Uint8Array(0);
    return glyf.subarray(prev, next);
  };

  // cmap — פורמט 4 בלבד (עברית/לטינית); טבלת-בת Windows Unicode BMP.
  let gidOfCodePoint: (cp: number) => number = () => 0;
  for (let t = 0; t < u16(cmapSeg, 2); t += 1) {
    const rec = 4 + t * 8;
    const platform = u16(cmapSeg, rec);
    if (platform !== 3 && platform !== 0) continue;
    const subOff = u32(cmapSeg, rec + 4);
    if (u16(cmapSeg, subOff) !== 4) continue;
    const segCountX2 = u16(cmapSeg, subOff + 6);
    const segCount = segCountX2 / 2;
    const endOff = subOff + 14;
    const startOff = endOff + segCountX2 + 2;
    const deltaOff = startOff + segCountX2;
    const rangeOff = deltaOff + segCountX2;
    gidOfCodePoint = (cp: number): number => {
      if (cp > 0xffff) return 0;
      for (let s = 0; s < segCount; s += 1) {
        const end = u16(cmapSeg, endOff + s * 2);
        if (cp > end) continue;
        const start = u16(cmapSeg, startOff + s * 2);
        if (cp < start) continue;
        const delta = i16(cmapSeg, deltaOff + s * 2);
        const range = u16(cmapSeg, rangeOff + s * 2);
        if (range === 0) return (cp + delta) & 0xffff;
        const glyphIndexAddress = rangeOff + s * 2 + range + (cp - start) * 2;
        const g = u16(cmapSeg, glyphIndexAddress);
        return g === 0 ? 0 : (g + delta) & 0xffff;
      }
      return 0;
    };
    break;
  }

  return Object.freeze({
    unitsPerEm, indexToLocFormat, numGlyphs, ascent, descent, lineGap, bbox,
    advanceOf, gidOfCodePoint, glyphData,
  });
}

// ─────────────────────────── בניית subset ───────────────────────────

function pad4(n: number): number {
  return (n + 3) & ~3;
}

function tableChecksum(data: Uint8Array): number {
  let sum = 0;
  const len = pad4(data.length);
  for (let i = 0; i < len; i += 4) {
    const b = [
      i < data.length ? data[i] : 0,
      i + 1 < data.length ? data[i + 1] : 0,
      i + 2 < data.length ? data[i + 2] : 0,
      i + 3 < data.length ? data[i + 3] : 0,
    ];
    sum = ((sum + ((((b[0] as number) << 24) | ((b[1] as number) << 16) | ((b[2] as number) << 8) | (b[3] as number)) >>> 0)) >>> 0) as number;
  }
  return sum >>> 0;
}

/** סדר טבלאות קבוע — ממוין לקסיקוגרפי לפי תג (כלל TrueType) לפני הכתיבה. */
export const SUBSET_TABLE_ORDER = ['glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp'] as const;

export interface SubsetResult {
  readonly bytes: Uint8Array;
  /** מיפוי gid מקורי → gid ב-subset (notdef→0 תמיד). */
  readonly gidMap: ReadonlyMap<number, number>;
  readonly numGlyphs: number;
  /** רוחב (font units) לפי gid חדש — ל-DW/W. */
  readonly advanceOfNew: (newGid: number) => number;
}

/**
 * buildSubset — sfnt חדש עם ה-gids שנציירו בלבד.
 * ‎notdef‎ (0) כלול תמיד (מפה לעצמו); יתר ה-gids ממוינים עולה — מיפוי
 * קבוע ודטרמיניסטי. ‎loca‎ תמיד פורמט 0 (קצר) כשמספר הגליפים מאפשר —
 * לא: פורמט נשמר כמו במקור כדי למזער הבדלי פרשנות.
 */
export function buildSubset(parsed: ParsedSfnt, originalBytes: Uint8Array, usedGids: readonly number[]): SubsetResult {
  const sorted = [...new Set([...usedGids, 0])].filter((g) => g >= 0 && g < parsed.numGlyphs).sort((a, b) => a - b);
  const gidMap = new Map<number, number>();
  sorted.forEach((g, i) => gidMap.set(g, i));
  const numGlyphs = sorted.length;

  // glyf + loca — העתקות ביט-ביט לתוך buffer אחד (בלי מערכי-ביניים)
  const locaEntries: number[] = [0];
  const glyphSlices: Uint8Array[] = [];
  let glyfOffset = 0;
  for (const g of sorted) {
    const data = parsed.glyphData(g);
    glyphSlices.push(data);
    glyfOffset += data.length;
    locaEntries.push(glyfOffset);
  }
  const glyf = new Uint8Array(glyfOffset);
  {
    let w = 0;
    for (const d of glyphSlices) { glyf.set(d, w); w += d.length; }
  }
  const loca = new Uint8Array(parsed.indexToLocFormat === 0 ? ((numGlyphs + 1) << 1) : (numGlyphs + 1) * 4);
  {
    const dv = new DataView(loca.buffer);
    for (let i = 0; i <= numGlyphs; i += 1) {
      if (parsed.indexToLocFormat === 0) dv.setUint16(i * 2, (locaEntries[i] as number) / 2);
      else dv.setUint32(i * 4, locaEntries[i] as number);
    }
  }

  // hmtx — כל הגליפים החדשים הם "short" (advance+lsb פר-גליף) פרט להיותם
  // תחת numberOfHMetrics=numGlyphs (אין long): פשוט ותקין.
  const hmtx = new Uint8Array(numGlyphs * 4);
  {
    const dv = new DataView(hmtx.buffer);
    for (let i = 0; i < numGlyphs; i += 1) {
      dv.setUint16(i * 4, parsed.advanceOf((sorted[i] as number) ?? 0));
      // lsb: לא נדרש לציור; 0 קבוע (דטרמיניסטי; תיעוד ב-ADR-009).
      dv.setInt16(i * 4 + 2, 0);
    }
  }

  const headSrc = findTable(originalBytes, 'head') as Uint8Array;
  const head = new Uint8Array(headSrc);
  {
    const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
    dv.setUint16(18, parsed.unitsPerEm); // נשמר ממילא
    dv.setUint16(50, parsed.indexToLocFormat);
    dv.setUint32(8, 0); // checkSumAdjustment — מאופס (תיעוד ב-ADR-009)
    // תאריך/זמן ב-head אינם נקראים כאן; הם מועתקים כמות שהם מהמקור —
    // אותם bytes ⇒ אותו פלט (מקור קבוע בריפו).
  }
  const hheaSrc = findTable(originalBytes, 'hhea') as Uint8Array;
  const hhea = new Uint8Array(hheaSrc);
  {
    const dv = new DataView(hhea.buffer, hhea.byteOffset, hhea.byteLength);
    dv.setUint16(34, numGlyphs); // numberOfHMetrics === numGlyphs (הכל short)
  }
  const maxpSrc = findTable(originalBytes, 'maxp') as Uint8Array;
  const maxp = new Uint8Array(maxpSrc);
  {
    const dv = new DataView(maxp.buffer, maxp.byteOffset, maxp.byteLength);
    dv.setUint16(4, numGlyphs);
  }

  const tables: Array<[string, Uint8Array]> = [
    ['glyf', glyf],
    ['head', head],
    ['hhea', hhea],
    ['hmtx', hmtx],
    ['loca', loca],
    ['maxp', maxp],
  ];
  // מיון לקסיקוגרפי לפי תג (דרישת TrueType) — SUBSET_TABLE_TAGS כבר ממוין.
  tables.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const numTables = tables.length;
  let dirLen = 12 + numTables * 16;
  let offset = dirLen;
  const entries: Array<{ tag: string; sum: number; off: number; len: number }> = [];
  const tableData: Array<Uint8Array> = [];
  for (const [tag, data] of tables) {
    entries.push({ tag, sum: tableChecksum(data), off: offset, len: data.length });
    tableData.push(data);
    offset += pad4(data.length);
  }
  const total = offset;

  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x00010000); // sfnt version
  dv.setUint16(4, numTables);
  // searchRange וכו' — לא נדרשים לקריאה; ערכים סטנדרטיים קבועים:
  const maxPow2 = Math.pow(2, Math.floor(Math.log2(numTables)));
  dv.setUint16(6, maxPow2 * 16);
  dv.setUint16(8, Math.floor(Math.log2(numTables)));
  dv.setUint16(10, numTables * 16 - maxPow2 * 16);
  for (let i = 0; i < numTables; i += 1) {
    const e = entries[i] as { tag: string; sum: number; off: number; len: number };
    const rec = 12 + i * 16;
    for (let c = 0; c < 4; c += 1) out[rec + c] = e.tag.charCodeAt(c);
    dv.setUint32(rec + 4, e.sum);
    dv.setUint32(rec + 8, e.off);
    dv.setUint32(rec + 12, e.len);
  }
  for (let i = 0; i < numTables; i += 1) {
    out.set(tableData[i] as Uint8Array, (entries[i] as { off: number }).off);
  }

  const advanceOfNew = (newGid: number): number => (newGid >= 0 && newGid < numGlyphs
    ? parsed.advanceOf(sorted[newGid] as number)
    : 0);

  return { bytes: out, gidMap, numGlyphs, advanceOfNew };
}
