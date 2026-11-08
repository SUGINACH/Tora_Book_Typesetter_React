/**
 * use-typeset-run.ts — החיבור של המעטפת למנצח הריצה (שלב 77; אפיון §12–13).
 *
 * מה שה־hook עושה: קורא את המקור מ־editorStore, מייצר effective מה־draft
 * (settings-schema — ייבוא ו־hash בחבילה בלבד), ומעביר הכול ל־TypesetController
 * (Worker בלבד — אין מסלול סינכרוני). מצב הריצה אינו כאן — הרכיבים קוראים
 * אותו מהבוררים של runStore (useRunPhase וכו'); ה־hook מחזיר רק פעולות.
 *
 * ברירת מחדל לא־נודעת: אין טקסט ⇐ אין ריצה; הגדרות לא חוקיות ⇐ אין ריצה
 * (הבעיות כבר מוצגות דרך settingsStore.issues — אין "כמעט תקין").
 *
 * שלב 80 (אפיון §3.3, §13–14): הקלט מנותח לפני השליחה — מפת שגיאות
 * הקלט מתעדכנת מאותו פרסור (פרסור יחיד; התוצאה מוזרקת למנצח), וכשל
 * פרסור ⇐ אין ריצה בכלל — שום job לא נשלח לעובד, השגיאה הקטלוגית
 * הממוקדת (שורה:עמודה) מוצגת במפה. זה המשך ישיר של חסימת ההגדרות
 * משלב 79: שני סוגי הקלט הגרועים נחסמים לפני תחילת עימוד, בלי פעולת-אין.
 */
import { useCallback } from 'react';
import { getUiRuntime, type UiRuntime } from './ui-runtime.js';
import { useEditorStore } from '../stores/editor-store.js';
import { useSettingsStore } from '../stores/settings-store.js';
import { useRunStore } from '../stores/run-store.js';
import { analyzeSource } from '../stores/source-analysis.js';

/**
 * מזהה ה-job של כישלון ההכנה — קבוע ודטרמיניסטי: הפסאדו-job נפתח ונסגר
 * באותו בלוק (begin ← fail) רק כדי להעביר את השגיאה הקטלוגית לפאזת
 * הריצה, שבה מציג אותה LayoutPreview. עבור כישלון הכנה לא נבנתה בקשה —
 * אין inputHash אמיתי, ולכן השדה ריק (אין בדיקה שנשענת עליו).
 */
const PREPARE_FAILURE_JOB_ID = 'ui-prepare-failure';

/** מיפוי שגיאת הכנה לקוד קטלוגי — אותה פרשנות כמו onRejected במנצח. */
const prepareErrorCodeOf = (e: unknown): string =>
  e instanceof Error && 'errorCode' in e
    ? String((e as { errorCode: unknown }).errorCode)
    : 'errors.worker.ENGINE_UNCLASSIFIED';

export interface UseTypesetRun {
  /** הרצת עימוד של המקור הנוכחי דרך ה־Worker. */
  readonly run: () => Promise<void>;
  /** ביטול הריצה הפעילה (אם יש). */
  readonly cancel: () => void;
}

export function useTypesetRun(): UseTypesetRun {
  const run = useCallback(async () => {
    const editor = useEditorStore.getState();
    if (editor.rawText === '') return;
    const settings = useSettingsStore.getState();
    settings.applyDraft();
    const effective = useSettingsStore.getState().effective;
    if (effective === null) return; // יש בעיות — מוצגות ב-issues; לא רצים

    // ניתוח הקלט — לפני השליחה: מפת השגיאות מתעדכנת מהפרסור הזה עצמו,
    // וכשל פרסור חוסם את הריצה (אין job; השגיאה ממוקמת במפה).
    const { analysis, parsed } = analyzeSource({
      source: editor.rawText,
      documentId: editor.documentName !== '' ? editor.documentName : 'ui',
      revision: editor.revision,
      documentName: editor.documentName,
    });
    useEditorStore.getState().setImportAnalysis(analysis);
    if (parsed === null) return; // parseError מוצג במפה — שום job לא נשלח

    // שלב ההכנה (צרור נכסים + עובד) עשוי להיכשל ברשת — הכישלון חייב
    // להיות גלוי: פאזת error עם הקוד הקטלוגי ב-runStore (מוצג ב-LayoutPreview),
    // לא הבטחה נטושה שקטה שמשאירה את הפאזה ב-idle כאילו כלום לא קרה
    // (זו הסיבה שכישלון ה־404 באתר החי נראה כ"כפתור לא עושה כלום").
    let runtime: UiRuntime;
    try {
      runtime = await getUiRuntime();
    } catch (e) {
      const store = useRunStore.getState();
      store.begin(PREPARE_FAILURE_JOB_ID, '');
      store.fail(PREPARE_FAILURE_JOB_ID, prepareErrorCodeOf(e));
      return;
    }
    runtime.controller.run({
      source: editor.rawText,
      settings: effective,
      assets: runtime.bundle.assets,
      fonts: runtime.bundle.fonts,
      wasmBytes: runtime.bundle.wasmBytes,
      woff2DecoderBytes: runtime.bundle.woff2DecoderBytes,
      documentId: editor.documentName !== '' ? editor.documentName : 'ui',
      parsed,
      // שלב 81 — עוגן הטריות: המהדורה של המקור שנשלח; עריכה מכאן ועד הקבלה
      // הופכת את התוצאה לזרה (אינה מתקבלת — שער במנצח).
      sourceRevision: editor.revision,
    });
  }, []);

  const cancel = useCallback(() => {
    void getUiRuntime().then((rt) => {
      rt.controller.cancel();
    });
  }, []);

  return { run, cancel };
}
