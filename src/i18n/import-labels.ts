/**
 * import-labels.ts — קטלוג תוויות עברי למפת שגיאות הקלט וסקירת המסמך
 * (שלב 80; אפיון §3.3, §13–14, §16).
 *
 * אותו דפוס שנקבע בשלב 78 (settings-labels): קטלוג סטטי, קפוא
 * ודטרמיניסטי; המקור העברי בלבד — תרגום שתי שפות מלא הוא שלב 93.
 * אין הצגת message גולמי של שגיאה או דיאגנוסטיקה (§16) — מוצגים
 * קוד קטלוגי מתורגם + פרמטרים סדירים + מיקום.
 *
 * הכיסוי סגור ונאכף (verify-document-import): כל קוד שהפרסר יכול
 * להוציא — נזרק או מדווח — וכל קוד בקטלוג הייבוא חייבים תווית כאן,
 * ואין תווית יתומה. פרמטרים בסימון ‎{name}‎ מוחלפים בפורמט.
 */

/** תווית אחת — נוסח קצר לתצוגה במפה. */
export interface ImportLabel {
  readonly label: string;
}

/** קטלוג התוויות — קפוא; מפתח = קוד קטלוגי (מפתח i18n). */
export const IMPORT_LABELS: Readonly<Record<string, ImportLabel>> = Object.freeze({
  // ── דיאגנוסטיקת פרסר (מדווחת; חומרה אזהרה) ──
  'errors.parser.WARN_PRE_HEADING_CONTENT': { label: 'שורה לפני הכותרת הראשונה שאינה metadata — נשמרת כתוכן' },
  'errors.parser.WARN_EDITORIAL_REMOVED': { label: 'הערת עורך הוסרה מהגוף ונשמרה בזרם הערות העורך' },
  'errors.parser.WARN_UNMATCHED_EDITORIAL': { label: 'סימון הערת עורך (##) שלא נסגר — נשאר טקסט מילולי' },
  'errors.parser.WARN_H7_SIMAN_DISCARDED': { label: 'מספר סימן על כותרת 7 נזנח — ההערה נשמרת בלעדיו' },
  'errors.parser.WARN_UNMATCHED_FOOTNOTE': { label: 'הפניית הערת שוליים שלא נמצאה לה תוכן — הסימון נשאר במקומו' },
  'errors.parser.WARN_NEAR_MISS_HEADING': { label: 'שורה דומה לכותרת אך אינה תואמת את התחביר המלא' },
  'errors.parser.WARN_UNMATCHED_INLINE_MARKER': { label: 'סמן סגנון פתוח שלא נסגר — הסימון נשאר טקסט מילולי' },
  'errors.parser.WARN_HTML_IN_TEXT': { label: 'תג HTML בגוף הטקסט — יוצג כמילול' },
  'errors.parser.WARN_UNCLOSED_BRACKET': { label: 'סוגריים שלא נסגרו' },
  'errors.parser.WARN_STRAY_CLOSE_BRACKET': { label: 'סוגריים סוגרים ללא פותחים' },
  // ── שגיאות פרסר נזרקות (חוסמות ריצה) ──
  'errors.parser.INVALID_OPTIONS': { label: 'קלט הפרסר אינו חוקי ({reason})' },
  'errors.parser.DUPLICATE_METADATA_KEY': { label: 'מפתח metadata כפול: {key}' },
  'errors.parser.INVALID_ENDNOTE_PREFIX': { label: 'קידומת הערות סיום אינה חוקית' },
  'errors.parser.INVALID_CUSTOM_STYLE': { label: 'הגדרת סגנון מותאם אינה חוקית ({styleId})' },
  'errors.parser.SENTINEL_IN_INPUT': { label: 'הקלט מכיל תווי בקרה אסורים — הפרסר מסרב לקלט מזוהם' },
  'errors.parser.INVALID_CONTROL_CHAR': { label: 'תו בקרה אסור בתוך שורה' },
  'errors.parser.REGISTRY_RECORD_MISSING': { label: 'רשומת מרשם חסרה לפרסר ({recordId}) — כשל פנימי' },
  // ── קטלוג הייבוא (מעטפת) ──
  'errors.import.UNSUPPORTED_FORMAT': { label: 'פורמט קובץ לא נתמך ({extension})' },
  'errors.import.FILE_UNREADABLE': { label: 'הקובץ לא נקרא ({reason})' },
  'errors.import.WORD_CONVERT_FAILED': { label: 'המרת קובץ Word נכשלה — הקובץ לא נטען' },
  'errors.import.SAMPLE_UNAVAILABLE': { label: 'טעינת הדוגמה נכשלה ({path})' },
  'errors.import.EMPTY_DOCUMENT': { label: 'המסמך ריק — אין מה לעמד' },
  'errors.import.BINARY_CONTENT': { label: 'הקובץ אינו טקסט תקין — חלק מהבייטים הוחלפו בעת הפענוח' },
  'errors.import.LARGE_DOCUMENT': { label: 'מסמך גדול ({sizeBytes} תווים) — הניתוח עשוי לקחת זמן' },
});

/** החלפת ‎{param}‎ בערכים — פרמטר חסר נשאר מילולי, לא נזרק (תצוגה בלבד). */
export function formatIssueLabel(code: string, params: Readonly<Record<string, string | number | boolean | null>>): string {
  const entry = IMPORT_LABELS[code];
  if (entry === undefined) return code; // לא אמור לקרות — הכיסוי נאכף במאמת; מוצג הקוד עצמו
  return entry.label.replace(/\{([a-zA-Z]+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? whole : String(value);
  });
}

/** תווית חוזרת לשם סקירת המסמך (מפתחות metadata וזרמי הערות). */
export const OVERVIEW_LABELS = Object.freeze({
  overviewTitle: 'סקירת מסמך',
  metadataTitle: 'metadata',
  notesFootnotes: 'הערות שוליים',
  notesEndnotes: 'הערות סיום',
  notesSidenotes: 'הערות צד',
  notesEditorial: 'הערות עורך',
  simanim: 'סימנים',
  parts: 'חלקים',
  customStyles: 'סגנונות מותאמים',
  issuesTitle: 'מפת שגיאות קלט',
  parseErrorTitle: 'הפרסור נכשל — הריצה חסומה',
  staleNotice: 'המפה איננה עדכנית — המקור נערך מאז הניתוח',
  lineColumn: 'שורה {line}, עמודה {column}',
  noLocation: 'ללא מיקום',
  emptyClean: 'המסמך נטען ונותח — אין בעיות קלט',
} as const);
