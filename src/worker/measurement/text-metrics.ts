import type { FontConfig } from '../../types';

/**
 * ממשק למודד טקסט.
 */
export interface TextMeasurer {
  measureText(text: string, font: FontConfig): number;
  measureLineHeight(font: FontConfig): number;
  measureBlockHeight(lines: string[], font: FontConfig): number;
}

/**
 * מודד סימולטיבי משופר — נותן הערכות ריאליסטיות יותר.
 *
 * משתמש בהערכות מבוססות על:
 * - רוחב ממוצע לתו עברי: ~0.5 × גודל גופן
 * - רוחב רווח: ~0.25 × גודל גופן
 * - גובה שורה: גודל × line-height
 *
 * אינו מדויק כמו OffscreenCanvas אבל מספיק טוב ל-MVP.
 */
export class SimulatedMeasurer implements TextMeasurer {
  measureText(text: string, font: FontConfig): number {
    const size = typeof font.size === 'number' ? font.size : 12;
    // הערכה: תו עברי ממוצע = 0.55 × גודל, רווח = 0.3 × גודל
    let width = 0;
    for (const ch of text) {
      if (ch === ' ') {
        width += size * 0.3;
      } else if (ch >= '\u0590' && ch <= '\u05FF') {
        // עברי
        width += size * 0.55;
      } else if (ch >= 'a' && ch <= 'z' || ch >= 'A' && ch <= 'Z') {
        // לטיני
        width += size * 0.45;
      } else if (ch >= '0' && ch <= '9') {
        width += size * 0.5;
      } else {
        // ברירת מחדל
        width += size * 0.5;
      }
    }
    return width;
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
