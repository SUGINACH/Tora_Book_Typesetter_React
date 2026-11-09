/**
 * pdf-writer.ts — כתיבת PDF מינימלי דטרמיניסטי (ADR-009; §15.4).
 *
 * אין ספריית PDF חיצונית (§19 — אין רשת/CDN; הכול נבנה במקום, כמו
 * HarfBuzz/WASM הנעול). זרמים לא-דחוסים בכוונה: ביט-ביט דטרמיניסטי
 * בכל סביבה (פלט Flate אינו מובטח חתום-ביטים בין גרסאות zlib) —
 * תיעוד ב-ADR-009.
 *
 * הרכבה בינארית מדויקת: גופי האובייקטים הם מחרוזות ASCII (מספרים,
 * שמות, hex) ונכתבים כבתים; נתוני זרם (גופן, ToUnicode, תוכן) —
 * Uint8Array גולמי. קידוד UTF-8 של המחרוזות זהה לבתים (ASCII) —
 * תיקון שורש: קידוד UTF-8 של המסמך כולו השחית כל בית ≥0x80 בגופן
 * (0x85 ⇒ c2 85) וה-sfnt המוטמע נפגם.
 */
export interface PdfRef {
  readonly num: number;
}

type Segment = string | Uint8Array;

export class PdfWriter {
  private readonly objects: Array<{ num: number; parts: Segment[] }> = [];
  private next = 1;

  reserve(): PdfRef {
    const num = this.next;
    this.next += 1;
    return { num };
  }

  /**
   * אובייקט עם dict (ASCII) ואופציונלי stream: נתוני הזרם מועברים כבתים
   * גולמיים בלי כל קידוד — ראשית הזרם, סופו ואורכו נאמדים בבתים.
   */
  write(ref: PdfRef, dict: string, stream?: { data: Uint8Array; extra?: string }): void {
    const parts: Segment[] = [];
    parts.push(`<< ${dict}${stream !== undefined ? ` /Length ${stream.data.length}${stream.extra !== undefined ? ` ${stream.extra}` : ''}` : ''} >>`);
    if (stream !== undefined) {
      parts.push('\nstream\n');
      parts.push(stream.data);
      parts.push('\nendstream');
    }
    parts.push('\nendobj');
    this.objects.push({ num: ref.num, parts });
  }

  /** זרם תוכן (content stream) — טקסט ASCII גלוי. */
  content(ref: PdfRef, text: string): void {
    this.write(ref, '', { data: new TextEncoder().encode(text) });
  }

  finish(root: PdfRef, info: PdfRef): Uint8Array {
    const sorted = [...this.objects].sort((a, b) => a.num - b.num);
    const enc = new TextEncoder();
    const chunks: Uint8Array[] = [];
    const pushStr = (s: string): void => { chunks.push(enc.encode(s)); };
    const pushBin = (b: Uint8Array): void => { chunks.push(b); };
    pushStr('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n');
    const offsets: number[] = [];
    let length = 9;
    for (const o of sorted) {
      offsets.push(length);
      pushStr(`${o.num} 0 obj\n`);
      length += `${o.num} 0 obj\n`.length;
      for (const p of o.parts) {
        if (typeof p === 'string') {
          pushStr(p);
          length += p.length; // ASCII — אורך המחרוזת === אורך הבתים
        } else {
          pushBin(p);
          length += p.length;
        }
      }
    }
    const xrefStart = length;
    pushStr(`xref\n0 ${this.next}\n`);
    pushStr('0000000000 65535 f \n');
    for (let i = 1; i < this.next; i += 1) {
      const off = offsets[i - 1];
      if (off === undefined) throw new Error(`errors.export-pdf.OBJECT_MISSING ${i}`);
      pushStr(`${String(off).padStart(10, '0')} 00000 n \n`);
    }
    pushStr(`trailer\n<< /Size ${this.next} /Root ${root.num} 0 R /Info ${info.num} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);
    const total = chunks.reduce((a, c) => a + c.length, 0);
    const out = new Uint8Array(total);
    let w = 0;
    for (const c of chunks) {
      out.set(c, w);
      w += c.length;
    }
    return out;
  }
}

/** מספר PDF קבוע: עד 4 ספרות עשרוניות, אפסים עודפים נחתכים. */
export function pdfNum(v: number): string {
  if (!Number.isFinite(v)) throw new Error(`errors.export-pdf.NUMBER_NOT_FINITE ${v}`);
  const fixed = Math.abs(v) < 0.00005 ? '0' : v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  return fixed === '-0' ? '0' : fixed;
}
