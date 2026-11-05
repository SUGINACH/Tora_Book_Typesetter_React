/**
 * index.ts — חבית חמשת ה־stores של המעטפת החדשה (שלב 76; אפיון §13.1).
 *
 * החלוקה: editor (מקור גולמי; בלי IR) · settings (draft/presets/issues)
 * · run (מכונת מצבים + stale-job) · result (IR/manifest/findings/anchors,
 * קפוא עמוק) · view (zoom/עמוד/locale/focus — UI בלבד).
 *
 * ניקוי בין מסמכים (שלב 84; אפיון §13, §18-M9): resetForNewDocument
 * מאפס את המסמך, ה־job והתוצאה ומנקה בחירת עמוד/focus — אך **שומר
 * zoom ו־locale** (העדפות משתמש אינן "מסמך") ואת ההגדרות/presets
 * (נתוני משתמש). השלמת שלב 84: הניקוי עצמו מבטל ריצה פעילה קודם —
 * דרך הוק ביטול רשום (registerRunCancellation) — כך ש**כל** נקודת
 * מעבר בין מסמכים מבטלת את ה־job ומנקה מנויים, לא רק פעולת הייבוא.
 */
export * from './storage.js';
export * from './editor-store.js';
export * from './settings-store.js';
export * from './run-store.js';
export * from './result-store.js';
export * from './view-store.js';
export * from './legacy-migrate.js';
export * from './selectors.js';
// source-analysis — ניתוח הקלט (שלב 80): טיפוסים ופונקציות טהורות.
// import-document — פעולת הייבוא (שלב 80) אינה בחבית: הוא צורך את
// resetForNewDocument מכאן, וייצואו מהחבית היה יוצר תלות מעגלית.
export * from './source-analysis.js';

import { useEditorStore } from './editor-store.js';
import { useSettingsStore } from './settings-store.js';
import { useRunStore } from './run-store.js';
import { useResultStore } from './result-store.js';
import { useViewStore } from './view-store.js';

/** פעולת ביטול ריצה פעילה — נרשמת על ידי מי שמחזיק את זמן־הריצה. */
export type RunCancellation = () => void;

/** ההוק הרשום — null כשלא נרשם דבר (אין זמן־ריצה שנבנה). */
let runCancellation: RunCancellation | null = null;

/**
 * רישום פעולת ביטול ריצה פעילה למעבר בין מסמכים (שלב 84; אפיון §13).
 *
 * מי שמחזיק את זמן־הריצה רושם כאן פעולה אחת: בייצור — App בהרכבה
 * (‎peekUiRuntime()?.controller.cancel()‎ — ביטול ה־job + ניקוי מנויי
 * הערוץ, שלב 83); בבדיקות — הזרקה. הרישום אינו תלות מעגלית: ה־stores
 * אינם מייבאים את worker-host; ההפך הוא הכיוון המותר. null מסיר
 * רישום (פירוק הרכבה). רישום חדש מחליף את הקודם — הרשאה אחת, לא רשימה.
 */
export function registerRunCancellation(cancel: RunCancellation | null): void {
  runCancellation = cancel;
}

/** מעבר למסמך חדש: ביטול ריצה ← מסמך/job/תוצאה מתאפסים; zoom/locale נשמרים. */
export function resetForNewDocument(): void {
  // ביטול ריצה פעילה **לפני** איפוס המצב (שלב 84): אחרת job יתום היה
  // ממשיך לרוץ בעובד אחרי שהמצב כבר אופס — שכבות ה-stale-job (שלב 76)
  // היו חוסמות את התוצאה, אבל העבודה מבוזבזת והמנויים חיים. best-effort
  // מתועד: ביטול שזרק אינו עוצר מעבר מסמך — שכבות ה-stale ממשיכות
  // להגן על נכונות התוצאה בכל מקרה (הגנה בעומק).
  if (runCancellation !== null) {
    try {
      runCancellation();
    } catch {
      /* best-effort מתועד לעיל — הניקוי ממשיך */
    }
  }
  useEditorStore.getState().reset();
  useRunStore.getState().reset();
  useResultStore.getState().reset();
  const view = useViewStore.getState();
  view.selectPage(null);
  view.setFocus(null);
}

/** מילוי ה־stores מהאחסון הפעיל (אחרי מיגרציה או הזרקת ערוץ בבדיקות). */
export function rehydrateStores(): void {
  useEditorStore.getState().rehydrate();
  useSettingsStore.getState().rehydrate();
  useViewStore.getState().rehydrate();
}
