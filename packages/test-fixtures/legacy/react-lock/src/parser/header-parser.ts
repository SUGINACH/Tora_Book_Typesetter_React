import type { HeadingLevel } from '../types';

/**
 * זיהוי כותרות ב-3 מבנים שונים.
 *
 * מבנה 1: `כותרת N - text`
 * מבנה 2: `כותרת N מספר X - text`
 * מבנה 3: `כותרת N מספר X (Y) - text`
 *
 * המקף חובה — יכול להיות -, –, או —.
 * שורה בלי מקף אינה נחשבת לכותרת (בשקט, ללא שגיאה).
 */

// ביטוי רגולרי מאוחד — מזהה את כל 3 המבנים
const HEADER_REGEX =
  /^כותרת\s+(\d+)(?:\s+מספר\s+(\d+)(?:\s*\((\d+)\))?)?(?:\s*-\s*|\s*–\s*|\s*—\s*|\s*-\s*)(.+)$/;

export interface ParsedHeading {
  level: HeadingLevel;
  simanNumber?: number;
  subNumber?: number;
  text: string;
}

/**
 * פונקציה טהורה — מזהה כותרת בשורה.
 * מחזירה null אם השורה אינה כותרת.
 */
export function parseHeading(line: string): ParsedHeading | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('כותרת')) return null;

  const match = trimmed.match(HEADER_REGEX);
  if (!match) return null;

  const level = parseInt(match[1]!, 10);
  if (level < 0 || level > 7) return null;

  const simanNumber = match[2] ? parseInt(match[2], 10) : undefined;
  const subNumber = match[3] ? parseInt(match[3], 10) : undefined;
  const text = (match[4] ?? '').trim();

  return {
    level: level as HeadingLevel,
    simanNumber,
    subNumber,
    text,
  };
}
