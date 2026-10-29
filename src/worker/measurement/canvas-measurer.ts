import type { TextMeasurer } from './text-metrics';
import type { FontConfig } from '../../types';

/**
 * מודד טקסט אמיתי — משתמש ב-Canvas API כדי למדוד רוחב טקסט
 * עם הגופן האמיתי שנטען בדפדפן.
 *
 * זהו המודד המדויק — מחליף את SimulatedMeasurer שרק מעריך.
 *
 * דרישות:
 * - גופנים חייבים להיות טעונים לפני המדידה (document.fonts.ready)
 * - Canvas API זמין בכל הדפדפנים המודרניים
 */
export class CanvasMeasurer implements TextMeasurer {
  private ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  constructor() {
    if (typeof OffscreenCanvas !== 'undefined') {
      // Worker או main thread עם OffscreenCanvas
      const canvas = new OffscreenCanvas(2000, 200);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('OffscreenCanvas 2d context not available');
      this.ctx = ctx;
    } else if (typeof document !== 'undefined') {
      // Main thread עם Canvas רגיל
      const canvas = document.createElement('canvas');
      canvas.width = 2000;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2d context not available');
      this.ctx = ctx;
    } else {
      throw new Error('No Canvas available — use SimulatedMeasurer instead');
    }
  }

  /**
   * מגדיר את הגופן ב-context לפני מדידה.
   */
  private setFont(font: FontConfig): void {
    const size = typeof font.size === 'number' ? `${font.size}pt` : font.size;
    const weight = font.weight ?? 400;
    const italic = font.italic ? 'italic' : 'normal';
    const family = font.family.map((f) => `'${f}'`).join(', ');
    this.ctx.font = `${italic} ${weight} ${size} ${family}`;
    if (font.color) {
      this.ctx.fillStyle = font.color;
    }
  }

  /**
   * מודד רוחב טקסט אמיתי עם הגופן האמיתי.
   * מחזיר רוחב בפיקסלים.
   */
  measureText(text: string, font: FontConfig): number {
    this.setFont(font);
    // עברית RTL — מודדים את הטקסט כמו שהוא
    const metrics = this.ctx.measureText(text);
    return metrics.width;
  }

  /**
   * מודד גובה שורה אמיתי.
   *
   * Canvas API נותן:
   * - fontBoundingBoxAscent + fontBoundingBoxDescent = גובה הגופן המלא
   * - actualBoundingBoxAscent + actualBoundingBoxDescent = גובה הטקסט בפועל
   *
   * אנחנו משתמשים ב-fontBoundingBox כי הוא כולל את כל ה-line-height.
   */
  measureLineHeight(font: FontConfig): number {
    this.setFont(font);
    const metrics = this.ctx.measureText('Mם'); // אות לטינית + אות עברית עם descender

    // fontBoundingBox — הגובה המלא של הגופן (כולל ascenders/descenders)
    const ascent = (metrics as any).fontBoundingBoxAscent ?? metrics.actualBoundingBoxAscent ?? 0;
    const descent = (metrics as any).fontBoundingBoxDescent ?? metrics.actualBoundingBoxDescent ?? 0;
    const fontHeight = ascent + descent;

    if (fontHeight > 0) {
      // כופלים ב-line-height ratio כדי לקבל גובה שורה מלא
      const lineHeightRatio = typeof font.lineHeight === 'number' ? font.lineHeight : 1.34;
      return fontHeight * lineHeightRatio;
    }

    // fallback אם fontBoundingBox לא זמין
    const size = typeof font.size === 'number' ? font.size : 12;
    return size * (typeof font.lineHeight === 'number' ? font.lineHeight : 1.34);
  }

  /**
   * מודד גובה בלוק (סך כל השורות).
   */
  measureBlockHeight(lines: string[], font: FontConfig): number {
    return lines.length * this.measureLineHeight(font);
  }

  /**
   * בודק אם גופן מסוים נטען וזמין.
   */
  isFontLoaded(fontFamily: string): boolean {
    if (typeof document !== 'undefined' && (document as any).fonts) {
      return (document as any).fonts.check(`12pt "${fontFamily}"`);
    }
    return true; // לא יכולים לבדוק — מניחים שכן
  }

  /**
   * ממתין לטעינת כל הגופנים הדרושים.
   */
  static async waitForFonts(): Promise<void> {
    if (typeof document !== 'undefined' && (document as any).fonts) {
      await (document as any).fonts.ready;
    }
  }
}

/**
 * Factory — בוחר את המודד הזמין.
 * מנסה CanvasMeasurer (מדויק), נופל ל-SimulatedMeasurer (הערכה).
 */
export async function createMeasurer(): Promise<import('./text-metrics').TextMeasurer> {
  try {
    // המתן לטעינת גופנים לפני יצירת המודד
    await CanvasMeasurer.waitForFonts();
    return new CanvasMeasurer();
  } catch {
    // Fallback לסימולציה אם Canvas לא זמין (jsdom, Worker ללא OffscreenCanvas)
    const { SimulatedMeasurer } = await import('./text-metrics');
    return new SimulatedMeasurer();
  }
}
