/**
 * מציאת הסוגר הסוגר התואם לסוגר פותח, עם תמיכה במקוננים.
 *
 * דוגמה:
 *   findMatchingCloseBracket("[outer [inner] still]", 0, "[", "]") === 26
 */
export function findMatchingCloseBracket(
  text: string,
  openPos: number,
  openChar: string,
  closeChar: string
): number {
  let depth = 1;
  for (let i = openPos + 1; i < text.length; i++) {
    if (text[i] === openChar) depth++;
    else if (text[i] === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1; // לא נמצא — סוגר פתוח ללא סגירה
}
