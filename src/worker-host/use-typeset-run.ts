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
 */
import { useCallback } from 'react';
import { getUiRuntime } from './ui-runtime.js';
import { useEditorStore } from '../stores/editor-store.js';
import { useSettingsStore } from '../stores/settings-store.js';

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
    if (effective === null) return; // יש בעיות — מוצגות ב־issues; לא רצים
    const runtime = await getUiRuntime();
    runtime.controller.run({
      source: editor.rawText,
      settings: effective,
      assets: runtime.bundle.assets,
      fonts: runtime.bundle.fonts,
      wasmBytes: runtime.bundle.wasmBytes,
      woff2DecoderBytes: runtime.bundle.woff2DecoderBytes,
      documentId: editor.documentName !== '' ? editor.documentName : 'ui',
    });
  }, []);

  const cancel = useCallback(() => {
    void getUiRuntime().then((rt) => {
      rt.controller.cancel();
    });
  }, []);

  return { run, cancel };
}
