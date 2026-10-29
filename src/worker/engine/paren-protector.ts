import type { FinalPage, Settings, ColumnContent } from '../../types';

/**
 * הגנת סוגריים — פונקציה טהורה.
 *
 * מונעת חיתוך באמצע זוג סוגריים מרובעים [...] בין טורים.
 *
 * פתרון: אם בלוק מסתיים עם סוגר פתוח (open bracket balance > 0)
 * — העברת הבלוק כולו לטור השמאלי כדי לשמור על שלמות הזוג.
 */
export function protectParens(
  pages: FinalPage[],
  _settings: Settings
): FinalPage[] {
  if (pages.length === 0) return pages;
  return pages.map((page) => protectPageParens(page));
}

function protectPageParens(page: FinalPage): FinalPage {
  if (page.columns.length !== 2) return page;

  const right = page.columns[0]!;
  const left = page.columns[1]!;

  let moved = 0;

  while (right.blocks.length > 1) {
    const lastIdx = right.blocks.length - 1;
    const last = right.blocks[lastIdx]!;
    if (!hasOpenBracket(last.content)) break;

    right.blocks.pop();
    right.height -= last.height;
    left.blocks.unshift(last);
    left.height += last.height;
    moved++;
  }

  if (moved === 0) return page;
  return page;
}

/**
 * בודק אם לבלוק יש סוגריים מרובעים פתוחים שלא נסגרו.
 * מתחשב בקינון [text [inner] more].
 */
export function hasOpenBracket(text: string): boolean {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth < 0) depth = 0;
    }
  }
  return depth > 0;
}

/**
 * מוצא את המיקום של הסוגר הסוגר התואם ל-openPos. תומך בקינון.
 */
export function findMatchingCloseBracket(
  text: string,
  openPos: number,
  openChar: string = '[',
  closeChar: string = ']'
): number {
  let depth = 1;
  for (let i = openPos + 1; i < text.length; i++) {
    if (text[i] === openChar) depth++;
    else if (text[i] === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * סופר זוגות סוגריים מאוזנים בטקסט.
 */
export function countBracketPairs(text: string): number {
  let pairs = 0;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']') {
      if (depth > 0) {
        depth--;
        pairs++;
      }
    }
  }
  return pairs;
}
