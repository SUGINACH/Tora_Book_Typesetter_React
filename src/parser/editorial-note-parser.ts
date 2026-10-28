/**
 * זיהוי הערות עריכה: ##text##
 * מוסרות לחלוטין מהמסמך.
 *
 * דוגמה: "טקסט ##לבדוק מקור זה## רגיל"
 *   → "טקסט  רגיל"
 */
export function parseEditorialNotes(lines: string[]): string[] {
  return lines
    .map((line) => line.replace(/##[^#]+##/g, '').trim())
    .filter((l) => l.length > 0);
}
