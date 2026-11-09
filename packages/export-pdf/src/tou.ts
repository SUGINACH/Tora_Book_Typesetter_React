/**
 * tou.ts — בניית ToUnicode CMap (ADR-009; §15.4): חילוץ טקסט אמיתי.
 *
 * מיפוי gid (2 בתים BE) → טקסט UTF-16BE. כל גליף ממופה לטקסט של האטום
 * שלו; גליפים עוקבים של אותו אטום (cluster רב-גליפי) — הראשון נושא
 * את הטקסט והשאר ממופים למחרוזת ריקה (אין כפילות בחילוץ). מיפוי לגליף
 * עם טקסט ריק חוקי (תווים שאינם נכנסים לחילוץ — למשל גליף-אפס של
 * רווח-רפאים).
 */
export interface TouEntry {
  readonly gid: number;
  readonly text: string;
}

/** UTF-16BE hex של מחרוזת — בריחה קבועה. */
function utf16beHex(text: string): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp > 0xffff) {
      // תו מחוץ ל-BMP — זוג עגלים; ה-IR מקודד UTF-16 ממילא (§4.2), ולכן
      // זה מגיע כשני surrogates נפרדים והענף הזה אינו נדרש — אך נשמר
      // להחלטות עתידיות (דטרמיניסטי גם כאן).
      const h = cp - 0x10000;
      const hi = 0xd800 + (h >> 10);
      const lo = 0xdc00 + (h & 0x3ff);
      out += hi.toString(16).padStart(4, '0') + lo.toString(16).padStart(4, '0');
    } else {
      out += cp.toString(16).padStart(4, '0');
    }
  }
  return out;
}

/**
 * buildToUnicode — מקבץ את כל המיפויים ל-bfchar יחיד (סדר gid עולה —
 * הקלט ממוין על ידי הקורא). מחרוזות ריקות ממופות ל-<> (חוקי ב-CMap:
 * מיפוי לתווית ריקה).
 */
export function buildToUnicode(entries: readonly TouEntry[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => a.gid - b.gid);
  const lines: string[] = [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /Adobe-Identity-UCS def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<0000> <ffff>',
    'endcodespacerange',
  ];
  const chunks: string[] = [];
  for (const e of sorted) {
    const gidHex = (e.gid & 0xffff).toString(16).padStart(4, '0');
    const textHex = utf16beHex(e.text);
    chunks.push(`<${gidHex}> <${textHex}>`);
  }
  // עד 100 שורות ב-bfchar — חלוקה קבועה ודטרמיניסטית.
  const PER = 100;
  for (let i = 0; i < chunks.length; i += PER) {
    const part = chunks.slice(i, i + PER);
    lines.push(`${part.length} beginbfchar`);
    lines.push(...part);
    lines.push('endbfchar');
  }
  if (chunks.length === 0) {
    lines.push('0 beginbfchar');
    lines.push('endbfchar');
  }
  lines.push('endcmap');
  lines.push('CMapName currentdict /CMap defineresource pop');
  lines.push('end');
  lines.push('end');
  return new TextEncoder().encode(lines.join('\n'));
}
