import { parseHeading } from './header-parser';
import type { ParsedSidenote } from '../types';

/**
 * זיהוי הערות צד — כותרות ברמה 7.
 * הטקסט אינו מופיע בגוף הטקסט, מוצמד לפסקה הבאה.
 */
export function parseSidenotes(
  lines: string[]
): { lines: string[]; sidenotes: ParsedSidenote[] } {
  const sidenotes: ParsedSidenote[] = [];
  const newLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const heading = parseHeading(lines[i]!.trim());
    if (heading && heading.level === 7) {
      sidenotes.push({
        id: `sn-${sidenotes.length + 1}-${i}`,
        text: heading.text,
        sourceLine: i,
        attachToNextParagraph: true,
      });
      // אינו מוסיף שום דבר ל-newLines — ההערה תוצמד לפסקה הבאה
    } else {
      newLines.push(lines[i]!);
    }
  }

  return { lines: newLines, sidenotes };
}
