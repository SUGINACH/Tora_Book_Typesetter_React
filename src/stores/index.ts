/**
 * index.ts — חבית חמשת ה־stores של המעטפת החדשה (שלב 76; אפיון §13.1).
 *
 * החלוקה: editor (מקור גולמי; בלי IR) · settings (draft/presets/issues)
 * · run (מכונת מצבים + stale-job) · result (IR/manifest/findings/anchors,
 * קפוא עמוק) · view (zoom/עמוד/locale/focus — UI בלבד).
 *
 * ניקוי בין מסמכים: resetForNewDocument אופס את המסמך, ה־job והתוצאה
 * ומנקה בחירת עמוד/focus — אך **שומר zoom ו־locale** (העדפות משתמש
 * אינן "מסמך") ואת ההגדרות/presets (נתוני משתמש; שלב 84 מרחיב).
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

/** מעבר למסמך חדש: מסמך/job/תוצאה מתאפסים; zoom/locale נשמרים. */
export function resetForNewDocument(): void {
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
