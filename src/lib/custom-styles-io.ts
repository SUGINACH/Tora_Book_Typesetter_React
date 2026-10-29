import type { CustomTextStyle } from '../types';

/**
 * ייצוא סגנונות מותאמים אישית ל-JSON.
 */
export function exportCustomStyles(styles: CustomTextStyle[]): string {
  return JSON.stringify({
    version: 1,
    type: 'tora-typesetter-custom-styles',
    styles,
  }, null, 2);
}

/**
 * ייבוא סגנונות מ-JSON.
 */
export function importCustomStyles(json: string): CustomTextStyle[] {
  const parsed = JSON.parse(json);
  if (parsed.type !== 'tora-typesetter-custom-styles') {
    throw new Error('פורמט שגוי');
  }
  if (parsed.version !== 1) {
    throw new Error(`גרסה לא נתמכת: ${parsed.version}`);
  }
  return parsed.styles;
}
