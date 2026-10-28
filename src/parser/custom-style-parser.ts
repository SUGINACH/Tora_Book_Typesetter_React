import type { CustomTextStyle } from '../types';

/**
 * זיהוי סגנונות מותאמים אישית — linePrefix או inlineMarker.
 */
export interface CustomStyleMatch {
  styleId: string;
  text: string;
  line: number;
  column: number;
}

/**
 * החלת סגנונות מותאמים אישית על שורות.
 *
 * לכל סגנון עם matcher מסוג linePrefix:
 * שורות שמתחילות בקידוממת מקבלות סימון מיוחד.
 */
export function applyCustomStyles(
  lines: string[],
  styles: CustomTextStyle[]
): { lines: string[]; matches: CustomStyleMatch[] } {
  const matches: CustomStyleMatch[] = [];
  const enabledStyles = styles.filter((s) => s.enabled);

  const newLines = lines.map((line, lineIdx) => {
    let processedLine = line;
    let trimmedLine = line.trim();

    for (const style of enabledStyles) {
      if (style.matcher.type === 'linePrefix') {
        if (trimmedLine.startsWith(style.matcher.prefix)) {
          const content = trimmedLine.slice(style.matcher.prefix.length).trim();
          matches.push({
            styleId: style.id,
            text: content,
            line: lineIdx,
            column: 0,
          });
          processedLine = `\u0001CUSTOM:${style.id}\u0002${content}`;
        }
      }
      // inlineMarker ו-regex יטופלו אחרת
    }

    return processedLine;
  });

  return { lines: newLines, matches };
}

/**
 * זיהוי inline markers בתוך שורה.
 */
export function findInlineMarkers(
  text: string,
  open: string,
  close: string
): Array<{ start: number; end: number; content: string }> {
  const results: Array<{ start: number; end: number; content: string }> = [];
  let pos = 0;

  while (pos < text.length) {
    const start = text.indexOf(open, pos);
    if (start === -1) break;

    const end = text.indexOf(close, start + open.length);
    if (end === -1) break;

    results.push({
      start,
      end: end + close.length,
      content: text.slice(start + open.length, end),
    });
    pos = end + close.length;
  }

  return results;
}
