/**
 * זיהוי הערות עריכה: ##text##
 * מוסרות לחלוטין מהמסמך.
 *
 * דוגמה: "טקסט ##לבדוק מקור זה## רגיל"
 *   → "טקסט  רגיל"
 *
 * שים לב: אין לסנן שורות ריקות — הן מפרידות פסקאות ב-AST builder.
 * אם נסנן אותן, כל הפסקאות יתחברו לבלוק אחד ענק.
 */
export function parseEditorialNotes(lines: string[]): string[] {
  return lines.map((line) => line.replace(/##[^#]+##/g, '').trim());
}
