import type { FontConfig } from '../../types';

/**
 * ממשק למודד טקסט — מאפשר הזרקת implementation.
 * ב-worker יהיה OffscreenCanvas; בבדיקות יהיה mock.
 */
export interface TextMeasurer {
  /** מדידת רוחב טקסט בפיקסלים */
  measureText(text: string, font: FontConfig): number;
  /** מדידת גובה שורה */
  measureLineHeight(font: FontConfig): number;
  /** מדידת גובה בלוק */
  measureBlockHeight(lines: string[], font: FontConfig): number;
}

/**
 * ברירת מחדל סימולטיבית — משתמשת בהערכות פשוטות.
 * ב-Worker האמיתי יוחלף ב-OffscreenCanvas.
 */
export class SimulatedMeasurer implements TextMeasurer {
  measureText(text: string, font: FontConfig): number {
    const size = typeof font.size === 'number' ? font.size : 12;
    // הערכה גסה: כל תו = חצי מגודל הגופן (ממוצע לעברית)
    return text.length * size * 0.55;
  }

  measureLineHeight(font: FontConfig): number {
    const size = typeof font.size === 'number' ? font.size : 12;
    const lineHeightRatio =
      typeof font.lineHeight === 'number' ? font.lineHeight : 1.34;
    return size * lineHeightRatio;
  }

  measureBlockHeight(lines: string[], font: FontConfig): number {
    return lines.length * this.measureLineHeight(font);
  }
}

/**
 * שבירת שורות — פונקציה טהורה.
 * מקבלת טקסט פסקה, רוחב טור, ומודד, מחזירה שורות.
 */
export function breakLines(
  text: string,
  font: FontConfig,
  columnWidth: number,
  measurer: TextMeasurer
): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let currentLine = '';
  let currentWidth = 0;
  const spaceWidth = measurer.measureText(' ', font);

  for (const word of words) {
    const wordWidth = measurer.measureText(word, font);
    const newWidth = currentWidth + (currentLine ? spaceWidth : 0) + wordWidth;

    if (newWidth > columnWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
      currentWidth = wordWidth;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
      currentWidth = newWidth;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}
