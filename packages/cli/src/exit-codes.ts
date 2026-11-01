/**
 * exit-codes.ts — קודי יציאה מתועדים של ה־CLI (§12.2: "כשל רשת, גופן או hash
 * מחזיר exit code שונה ומתועד"; שלב 34).
 *
 * המיפוי קבוע ומתועד כאן וב־README; שינוי ערך הוא שבירת חוזה של ה־CI.
 */
export const EXIT_SUCCESS = 0 as const;
/** שימוש שגוי בדגלים/ארגומנטים. */
export const EXIT_USAGE = 2 as const;
/** קלט שגוי — מסמך/הגדרות חסרים, בלתי קריאים או בלתי חוקיים (השגיאה ממוקמת: קובץ+סיבה). */
export const EXIT_INPUT = 3 as const;
/** כשל גופן/מדידה — טעינה, אימות hash או השגם. */
export const EXIT_FONT = 4 as const;
/** כשל מנוע — typeset זרק שגיאה מקוטלגת. */
export const EXIT_ENGINE = 5 as const;
/** כשל פלט — כתיבת artifacts נכשלה. */
export const EXIT_OUTPUT = 6 as const;
/** ממצאי ביקורת — auditLayout מצא HIGH; הפריסה הופקה אך אינה עוברת שער (שלב 38). */
export const EXIT_AUDIT = 7 as const;

/** כל הקודים החוקיים (לבדיקות). */
export const EXIT_CODES = Object.freeze([EXIT_SUCCESS, EXIT_USAGE, EXIT_INPUT, EXIT_FONT, EXIT_ENGINE, EXIT_OUTPUT, EXIT_AUDIT]);
