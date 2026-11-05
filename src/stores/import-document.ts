/**
 * import-document.ts — פעולת ייבוא המסמך של המעטפת (שלב 80; אפיון §3.3, §13–14).
 *
 * מסלול אחד לכל מקורות הייבוא (קובץ טקסט, Word, דוגמה): קבלת התוכן ←
 * ביטול ריצה פעילה (אין job יתום בוער בעובד) ← ניקוי בין מסמכים ←
 * כתיבת המקור ← ניתוח הקלט (פרסור יחיד) ← פרסום המפה והסקירה ב־editor
 * store. כישלון מתאם (פורמט/קריאה/המרה) אינו משנה מסמך — המסמך הנוכחי
 * נשאר והכישלון מדווח בקוד קטלוגי לתצוגה (אין console.warn שקט).
 *
 * ה-revision anchor: הניתוח נחתם למהדורה שנוצרה בכתיבת הטקסט — עריכה
 * מאוחרת משאירה את המפה "לא עדכנית" עד הריצה הבאה (עוגן stale-job
 * של שלב 76, באותה שיטה, בלי שעון).
 */
import { peekUiRuntime } from '../worker-host/ui-runtime.js';
import { analyzeSource, makeImportIssue, type LocatedIssue } from './source-analysis.js';
import { useEditorStore } from './editor-store.js';
import { resetForNewDocument } from './index.js';

/** המקור שיצר את הטקסט — לתיוג בלבד (התנהגות זהה לכולם). */
export type ImportSourceKind = 'text-file' | 'word-file' | 'sample';

/**
 * קבלת מסמך חדש: תוכן ← ביטול ריצה ← ניקוי ← כתיבה ← ניתוח ← מפה.
 *
 * טהור מבחינת החלטות: הניתוח דטרמיניסטי, והכתיבה ל-stores היא הצד היחיד
 * עם השפעה. מחזיר את הניתוח לבדיקות.
 */
export function importDocumentText(text: string, name: string, _kind: ImportSourceKind): ReturnType<typeof analyzeSource> {
  // ביטול ריצה פעילה לפני מסמך חדש — אחרת ה-job הישם ממשיך לרוץ בעובד
  // אחרי שהמצב כבר אופס (שכבות ה-stale היו חוסמות את התוצאה, אבל
  // העבודה היתומה מבוזבזת). peek — אין יצירת זמן־ריצה רק כדי לבטל.
  const runtime = peekUiRuntime();
  if (runtime !== null) runtime.controller.cancel();

  resetForNewDocument();
  const editor = useEditorStore.getState();
  editor.setDocumentName(name);
  editor.setText(text);

  // הניתוח נקשר למהדורה שנוצרה זה עתה — setText כבר העלה את המונה.
  const revision = useEditorStore.getState().revision;
  const result = analyzeSource({
    source: text,
    documentId: name !== '' ? name : 'ui',
    revision,
    documentName: name,
  });
  useEditorStore.getState().setImportAnalysis(result.analysis);
  return result;
}

/**
 * דיווח כישלון מתאם (פורמט/קריאה/המרה/דוגמה) — המסמך הנוכחי אינו
 * משתנה; הכישלון נשמר ב־editor store ומוצג במפת הקלט. קוד חייב להיות
 * רשום בקטלוג הייבוא (נאכץ ביצירת הבעיה).
 */
export function reportImportFailure(code: string, params: Readonly<Record<string, string | number | boolean | null>>): LocatedIssue {
  const issue = makeImportIssue(code, params);
  useEditorStore.getState().setImportIssue(issue);
  return issue;
}
