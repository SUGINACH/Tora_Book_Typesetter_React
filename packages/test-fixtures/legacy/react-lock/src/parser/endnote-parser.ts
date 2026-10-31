import type { ParsedEndnote } from '../types';

/**
 * זיהוי הערות סיום.
 * ברירת מחדל: שורה המתחילה ב-"הערת סיום -".
 */
export function parseEndnotes(
  lines: string[],
  prefix: string = 'הערת סיום -'
): { lines: string[]; endnotes: ParsedEndnote[] } {
  const endnotes: ParsedEndnote[] = [];
  const newLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith(prefix)) {
      const endnoteText = line.slice(prefix.length).trim();
      const endnote: ParsedEndnote = {
        id: `en-${endnotes.length + 1}-${i}`,
        text: endnoteText,
        sourceLine: i,
      };
      endnotes.push(endnote);
      newLines.push(`\u0001EN:${endnote.id}\u0002`);
    } else {
      newLines.push(lines[i]!);
    }
  }

  return { lines: newLines, endnotes };
}
