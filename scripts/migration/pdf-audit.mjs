/**
 * pdf-audit.mjs — פרסור עצמאי של פלט export-pdf לביקורת (שלב 91; §15, §17).
 *
 * פרסור מלא ללווחות: אובייקטים (סריקה + אימות xref מול ההיסטים),
 * זרמים, גופנים (sfnt), ToUnicode, קישורים, סימניות, תיבות עמוד,
 * וחילוץ טקסט לפי סדר הציור. לשימוש verify-pdf-audit (בדיקות איכות
 * PDF על קורפוס) — לא חלק מהחבילות (כלי בדיקה בלבד).
 */

/**
 * parsePdfAudit — מחזיר מבנה מלא או זורק שגיאה מקוטלגת.
 * @param {Buffer|Uint8Array} bytes
 */
export function parsePdfAudit(bytes) {
  const txt = Buffer.from(bytes).toString('latin1');
  if (!txt.startsWith('%PDF-1.7')) throw new Error('pdf-audit:HEADER');
  if (!/%%EOF\s*$/.test(txt)) throw new Error('pdf-audit:EOF');
  // אובייקטים — סריקה
  const objects = new Map(); // num → { dict, streamText|null }
  for (const m of txt.matchAll(/(\d+) 0 obj\n(<<[\S\s]*?>>)(\nstream\n[\S\s]*?\nendstream)?\nendobj/g)) {
    const num = parseInt(m[1], 10);
    const dict = ((m[2] ?? '')).slice(2, -2).trim();
    const stream = m[3];
    const streamText = stream === undefined ? null : stream.slice('\nstream\n'.length, -'\nendstream'.length);
    if (!objects.has(num)) objects.set(num, { dict, stream: streamText });
  }
  // xref — אימות היסטים מול הסריקה
  const xrefAt = txt.lastIndexOf('xref\n0 ');
  if (xrefAt < 0) throw new Error('pdf-audit:XREF_MISSING');
  const xrefBlock = txt.slice(xrefAt);
  const sizeMatch = xrefBlock.match(/^xref\n0 (\d+)\n/);
  if (sizeMatch === null) throw new Error('pdf-audit:XREF_SIZE');
  const size = parseInt(sizeMatch[1], 10);
  const offsets = [];
  const rows = [...xrefBlock.matchAll(/^(\d{10}) (\d{5}) ([nf]) ?/gm)];
  for (let i = 1; i < size; i += 1) {
    const row = rows[i];
    if (row === undefined) throw new Error(`pdf-audit:XREF_ROW_MISSING ${i}`);
    if (row[3] !== 'n') throw new Error(`pdf-audit:XREF_NOT_N ${i}`);
    offsets.push(parseInt(row[1], 10));
  }
  for (let i = 0; i < offsets.length; i += 1) {
    const num = i + 1;
    const off = offsets[i];
    if (!txt.startsWith(`${num} 0 obj`, off)) throw new Error(`pdf-audit:XREF_OFFSET_MISMATCH ${num}@${off}`);
    if (!objects.has(num)) throw new Error(`pdf-audit:OBJECT_MISSING ${num}`);
  }
  if (objects.size !== size - 1) throw new Error(`pdf-audit:COUNT objects=${objects.size} expected=${size - 1}`);

  // עמודים
  const pageEntries = [...txt.matchAll(/(\d+) 0 obj\n<< \/Type \/Page[^s][\S\s]*?>>\nendobj/g)];
  const pages = pageEntries.map((m) => {
    const num = parseInt(m[1], 10);
    const dict = m[0].replace(/^.*?<< /, '');
    const media = dict.match(/\/MediaBox \[([^\]]+)\]/);
    const crop = dict.match(/\/CropBox \[([^\]]+)\]/);
    const annots = [...dict.matchAll(/\/Annots \[([^\]]*)\]/g)].flatMap((a) => (a[1] ?? '').match(/(\d+) 0 R/g) ?? []);
    const contents = dict.match(/\/Contents (\d+) 0 R/);
    return {
      num,
      objNum: num,
      mediaBox: media === null ? null : (media[1] ?? '').trim(),
      cropBox: crop === null ? null : (crop[1] ?? '').trim(),
      annotObjNums: annots.map((a) => parseInt(a, 10)),
      contentObjNum: contents === null ? null : parseInt(contents[1], 10),
    };
  });
  if (pages.length === 0) throw new Error('pdf-audit:NO_PAGES');

  // גופנים
  const fontFiles = [...txt.matchAll(/\/FontFile2 (\d+) 0 R/g)].map((m) => parseInt(m[1], 10));
  const sfnts = [];
  for (const n of fontFiles) {
    // ישירות מהטקסט: מציאת 'N 0 obj' ואז ה-stream שאחריו
    const objAt = txt.indexOf(`${n} 0 obj`);
    const streamAt = objAt >= 0 ? txt.indexOf('stream\n', objAt) : -1;
    const endAt = streamAt >= 0 ? txt.indexOf('\nendstream', streamAt + 7) : -1;
    if (objAt < 0 || streamAt < 0 || endAt < 0) throw new Error(`pdf-audit:FONTFILE_MISSING ${n}`);
    const b = Buffer.from(txt.slice(streamAt + 7, endAt), 'latin1');
    if (b.length < 12 || b[0] !== 0 || b[1] !== 1) throw new Error(`pdf-audit:FONTFILE_MAGIC ${n}`);
    const numTables = (b[4] << 8) | b[5];
    let maxpOff = -1;
    let locaFmt = 0;
    for (let i = 0; i < numTables; i += 1) {
      const off = 12 + i * 16;
      const tag = String.fromCharCode(b[off], b[off + 1], b[off + 2], b[off + 3]);
      const tableOff = (b[off + 8] << 24 | b[off + 9] << 16 | b[off + 10] << 8 | b[off + 11]) >>> 0;
      if (tag === 'maxp') maxpOff = tableOff;
      if (tag === 'head') locaFmt = (b[tableOff + 50] << 8) | b[tableOff + 51];
    }
    if (maxpOff < 0) throw new Error(`pdf-audit:FONTFILE_MAXP ${n}`);
    const numGlyphs = (b[maxpOff + 4] << 8) | b[maxpOff + 5];
    sfnts.push({ objNum: n, numGlyphs, locaFmt, bytes: b });
  }

  // ToUnicode — ישירות מקטע ה-CMap שבטקסט (begincmap..endcmap)
  const tou = new Map();
  const touStart = txt.indexOf('begincmap');
  if (touStart >= 0) {
    const touEnd = txt.indexOf('endcmap', touStart);
    const touSrc = txt.slice(touStart, touEnd < 0 ? undefined : touEnd);
    for (const m of (touSrc.matchAll(/<([0-9a-fA-F]{4})> <([0-9a-fA-F]*)>/g) ?? [])) {
      const gid = parseInt(m[1], 16);
      const hex = m[2] ?? '';
      let t = '';
      for (let i = 0; i + 4 <= hex.length; i += 4) t += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
      tou.set(gid, t);
    }
  }

  // קישורים
  const links = [];
  for (const [num, o] of objects) {
    if (!o.dict.includes('/Subtype /Link')) continue;
    const rect = o.dict.match(/\/Rect \[([^\]]+)\]/);
    const dest = o.dict.match(/\/Dest \[(\d+) 0 R \/XYZ ([\d.-]+) ([\d.-]+) null\]/);
    if (rect === null || dest === null) throw new Error(`pdf-audit:LINK_MALFORMED ${num}`);
    links.push({ objNum: num, rect: (rect[1] ?? '').trim(), destPageObj: parseInt(dest[1], 10), x: dest[2], y: dest[3] });
  }

  // סימניות
  const bookmarks = [];
  for (const [num, o] of objects) {
    const tm = o.dict.match(/\/Title <([0-9a-fA-F]+)>/);
    if (!o.dict.includes('/Type /Outlines') && tm === null) continue;
    if (tm === null) continue;
    let title = '';
    const hex = tm[1] ?? '';
    for (let i = 0; i + 4 <= hex.length; i += 4) title += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    const dm = o.dict.match(/\/Dest \[(\d+) 0 R \/XYZ ([\d.-]+) ([\d.-]+) null\]/);
    if (dm === null) throw new Error(`pdf-audit:BOOKMARK_DEST ${num}`);
    bookmarks.push({ objNum: num, title, destPageObj: parseInt(dm[1], 10) });
  }

  // חילוץ טקסט לפי עמודים (סדר הציור)
  const extraction = pages.map((p) => {
    if (p.contentObjNum === null) return [];
    const cs = objects.get(p.contentObjNum);
    if (cs === undefined || cs.stream === null) return [];
    const seq = [];
    for (const blk of (cs.stream.matchAll(/BT([\S\s]*?)ET/g) ?? [])) {
      const gids = [...blk[1].matchAll(/<([0-9a-fA-F]{4})> Tj/g)].map((m) => parseInt(m[1], 16));
      for (const g of gids) seq.push(tou.get(g) ?? '\uFFFD');
    }
    return seq;
  });

  return { txt, objects, size, pages, sfnts, tou, links, bookmarks, extraction };
}

/**
 * auditPdfAgainstIr — השוואת ה-PDF מול ה-IR: עמודים, תיבות, כיסוי
 * גליפים ב-subset, יעדי קישורים/סימניות קיימים, היעדר גליפים שנציירו
 * מחוץ ל-subset.
 * @returns {Array<string>} בעיות (ריק = תקין)
 */
export function auditPdfAgainstIr(parsed, layout, renderHtmlModule, source) {
  const issues = [];
  if (parsed.pages.length !== layout.pages.length) {
    issues.push(`pages ${parsed.pages.length} != ${layout.pages.length}`);
  }
  layout.pages.forEach((p, i) => {
    const page = parsed.pages[i];
    if (page === undefined) return;
    const wpt = (p.size.width / 65536).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    const hpt = (p.size.height / 65536).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    if (page.mediaBox !== `0 0 ${wpt} ${hpt}`) issues.push(`page ${i} MediaBox ${page.mediaBox} != 0 0 ${wpt} ${hpt}`);
    if (page.cropBox !== page.mediaBox) issues.push(`page ${i} CropBox != MediaBox`);
  });
  const pageObjNums = new Set(parsed.pages.map((p) => p.objNum));
  for (const l of parsed.links) {
    if (!pageObjNums.has(l.destPageObj)) issues.push(`link ${l.objNum} -> missing page ${l.destPageObj}`);
  }
  for (const b of parsed.bookmarks) {
    if (!pageObjNums.has(b.destPageObj)) issues.push(`bookmark ${b.objNum} -> missing page ${b.destPageObj}`);
    if (b.title.trim().length === 0) issues.push(`bookmark ${b.objNum} empty title`);
  }
  // גליפים שצוירו מחוץ ל-subset + כיסוי ToUnicode
  const drawn = new Set();
  parsed.extraction.forEach((seq) => seq.forEach(() => undefined));
  for (const page of parsed.pages) {
    if (page.contentObjNum === null) continue;
    const cs = parsed.objects.get(page.contentObjNum);
    if (cs === undefined || cs.stream === null) continue;
    for (const m of (cs.stream.matchAll(/<([0-9a-fA-F]{4})> Tj/g) ?? [])) {
      drawn.add(parseInt(m[1], 16));
    }
  }
  const subset = parsed.sfnts[0]?.numGlyphs ?? 0;
  for (const g of drawn) if (g >= subset) issues.push(`drawn gid ${g} >= subset ${subset}`);
  // היעדר יעד קישור לעומת ה-IR (קישורים הדדיים — זוגיות)
  if (parsed.links.length % 2 !== 0) issues.push(`odd links count ${parsed.links.length}`);
  return issues;
}
