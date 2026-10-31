import { findMatchingCloseBracket } from './nested-bracket-matcher';
import type { ParsedFootnote } from '../types';

/**
 * זיהוי הערות שוליים [ ... ] עם תמיכה במקוננים.
 *
 * ברירת מחדל: תוחמים [ ו-].
 * ניתן לשנות דרך settings.notes.footnoteDelimiters.
 *
 * דוגמה: "טקסט [הערה א] עוד טקסט [הערה [פנימית] ב]"
 *   → { text: "טקסט [[FN:1]] עוד טקסט [[FN:2]]", footnotes: [...] }
 */
export function parseFootnotes(
  text: string,
  delimiters: [string, string] = ['[', ']']
): { text: string; footnotes: ParsedFootnote[] } {
  const [open, close] = delimiters;
  const footnotes: ParsedFootnote[] = [];
  let result = '';
  let pos = 0;
  let line = 0;

  while (pos < text.length) {
    const openIdx = text.indexOf(open, pos);
    if (openIdx === -1) {
      result += text.slice(pos);
      break;
    }

    // חישוב מספר השורה עד ה-openIdx
    for (let i = pos; i < openIdx; i++) {
      if (text[i] === '\n') line++;
    }

    result += text.slice(pos, openIdx);
    const closeIdx = findMatchingCloseBracket(text, openIdx, open, close);

    if (closeIdx === -1) {
      // סוגר פתוח ללא סגירה — לא מערה, משאירים כטקסט
      result += text.slice(openIdx);
      break;
    }

    const footnoteText = text.slice(openIdx + 1, closeIdx);
    const footnote: ParsedFootnote = {
      id: `fn-${footnotes.length + 1}-${openIdx}`,
      text: footnoteText,
      sourceLine: line,
      sourceColumn: openIdx,
    };
    footnotes.push(footnote);
    result += `\u0001FN:${footnote.id}\u0002`;
    pos = closeIdx + 1;
  }

  return { text: result, footnotes };
}

/**
 * החלפת סמני מקום של הערות בסימון ויזואלי.
 */
export function renderFootnoteMarker(footnoteId: string, marker: string): string {
  return `<sup class="fn-marker" data-fn-id="${footnoteId}">${marker}</sup>`;
}
