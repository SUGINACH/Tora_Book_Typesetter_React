/**
 * tauri-errors.ts — מיפוי שגיאות המארח (Tauri plug-ins) לקטלוג השגיאות
 * היחיד של הממשק (שלב 95; אפיון §12.3, §16; תכנית: "מיפוי כל dialog/file
 * error לאותו קטלוג שגיאות מקומי של הממשק").
 *
 * עקרונות:
 *   - קטלוג סגור: כל כישלון ממופה לקוד מהקטלוג הקפוא (errors.import.*) —
 *     אין הצגת message גולם מעולם (§16). הסיווג לפי תבניות הטקסונומיה
 *     היציבה של הפלאגינים (fs/dialog של Tauri v2), לא לפי מחרוזת משתמש.
 *   - ביטול דיאלוג אינו שגיאה: המשתמש סגר את החלון — מוחזר null והקריאה
 *     היא פעולת-אין (אין דיווח שווא במפת הקלט).
 *   - מקור יחיד לסיווג כישלונות ייבוא קבצים: גם המסלול הדפדפני (input
 *     type=file בתוך ה-webview) וגם המסלול הטבעי (פלאגיני Tauri) עוברים
 *     דרך classifyHostFileFailure — לוגיקה אחת, לא שתיים מקבילות.
 *   - טהור: אין DOM בזמן המודול; isTauriHost נשמר פונקציה (בדי�יק ב-node
 *     ללא window מחזיר false — המפה לא מופעלת מחוץ ל-webview).
 */

/** קוד קטלוגי + פרמטרים — הפורמט היחיד שמפת הקלט מקבלת (§14.1). */
export interface ImportFailure {
  readonly code: string;
  readonly params: Readonly<Record<string, string>>;
}

/** זיהוי סביבת Tauri (ה-webview חושף __TAURI_INTERNALS__). */
export function isTauriHost(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * האם השגיאה היא שגיאת מארח מפלאגיני Tauri — לפי הצורה שהם זורקים
 * (אובייקט עם plugin או מחרוזת המתחילה ב-prefix של הפלאגין). זיהוי
 * לפי צורה ולא לפי מחלקה — ה-API אינו מייצא סוג שגיאה יציב.
 */
export function isTauriPluginError(err: unknown): boolean {
  // צורות הפלאגין: מחרוזת "plugin:fs | …" / "fs.…" / אובייקט {plugin:'fs'};
  // ‎\b לא מפריד בתוך מילים (fscroll אינו fs).
  const shape = /^[\s"']*(plugin:)?(fs|dialog)\b/i;
  if (typeof err === 'string') return shape.test(err) || /\btauri\b/i.test(err);
  if (err !== null && typeof err === 'object') {
    const e = err as { plugin?: unknown; message?: unknown };
    if (e.plugin === 'fs' || e.plugin === 'dialog') return true;
    if (typeof e.message === 'string' && shape.test(e.message)) return true;
  }
  return false;
}

/** ביטול דיאלוג — לא שגיאה (המשתמש סגר את החלון). */
export function isDialogCanceled(err: unknown): boolean {
  const msg = typeof err === 'string' ? err : (err as { message?: unknown })?.message;
  return typeof msg === 'string' && /cancel/i.test(msg);
}

/**
 * סיווג שגיאת פלאגין לקוד הקטלוגי — טקסונומיה יציבה של fs/dialog:
 * לא-נמצא / הרשאה / גודל / קריאה כללית. הסיבה נשמרת כפרמטר מנורמל
 * (reason) — לא כמחרוזת המקור.
 */
export function classifyTauriPluginError(err: unknown): ImportFailure {
  const raw = typeof err === 'string' ? err : String((err as { message?: unknown })?.message ?? err ?? '');
  if (/not\s*found|no\s*such\s*file|os\s*error\s+2\b/i.test(raw)) {
    return { code: 'errors.import.FILE_UNREADABLE', params: { reason: 'not-found' } };
  }
  if (/permission|denied|forbidden|read-only/i.test(raw)) {
    return { code: 'errors.import.FILE_UNREADABLE', params: { reason: 'permission' } };
  }
  if (/too\s*large|size\s*limit/i.test(raw)) {
    return { code: 'errors.import.FILE_UNREADABLE', params: { reason: 'too-large' } };
  }
  return { code: 'errors.import.FILE_UNREADABLE', params: { reason: 'io' } };
}

export interface HostFileFailureOptions {
  /** שם הקובץ שנבחר (מסלול מלא ב-Tauri; שם בלבד בדפדפן). */
  readonly fileName: string;
  /** סוג ה-MIME כפי שהדפדפן מדווח (דפדפן בלבד; ב-Tauri לא נדרש). */
  readonly mimeType?: string;
  /** סוג הייבוא — קובע את קוד כישלון ההמרה/הפורמט בנפילה לדפדפן. */
  readonly kind: 'text' | 'word' | 'sample';
  /** נתיב הדוגמה (kind='sample'). */
  readonly path?: string;
}

/**
 * מקור יחיד לסיווג כישלון ייבוא קובץ: שגיאת מארח של Tauri ⇐ מיפוי הפלאגין;
 * ביטול דיאלוג ⇐ null; אחרת ⇐ הסיווג הדפדפני לפי תכונות הקובץ עצמו
 * (סיומת/סוג — לא לפי message גולם; §16).
 */
export function classifyHostFileFailure(err: unknown, opts: HostFileFailureOptions): ImportFailure | null {
  if (isTauriPluginError(err)) {
    if (isDialogCanceled(err)) return null; // פעולת-אין — לא כישלון ייבוא
    return classifyTauriPluginError(err);
  }
  const ext = opts.fileName.includes('.') ? opts.fileName.split('.').pop() ?? '' : '';
  if (opts.kind === 'text') {
    const isFormatIssue = !opts.fileName.toLowerCase().endsWith('.txt') && opts.mimeType !== 'text/plain';
    return isFormatIssue
      ? { code: 'errors.import.UNSUPPORTED_FORMAT', params: { extension: ext } }
      : { code: 'errors.import.FILE_UNREADABLE', params: { reason: 'read-failed' } };
  }
  if (opts.kind === 'word') {
    const isFormatIssue = !opts.fileName.toLowerCase().endsWith('.docx');
    return isFormatIssue
      ? { code: 'errors.import.UNSUPPORTED_FORMAT', params: { extension: ext } }
      : { code: 'errors.import.WORD_CONVERT_FAILED', params: {} };
  }
  return { code: 'errors.import.SAMPLE_UNAVAILABLE', params: { path: opts.path ?? opts.fileName } };
}
