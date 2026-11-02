import { useEffect, useRef } from 'react';
import { useDocumentStore } from '../store/document-store';
import { useSettingsStore } from '../store/settings-store';

const STORAGE_KEY = 'tora-typesetter-autosave';

/**
 * Auto-save — שמירת הטקסט הגולמי כל 5 שניות לאחר השינוי האחרון.
 * משחזר את הטקסט בעת טעינת האפליקציה.
 */
export function useAutoSave() {
  const rawText = useDocumentStore((s) => s.rawText);
  const setText = useDocumentStore((s) => s.setText);
  const settings = useSettingsStore((s) => s.settings);
  const prevText = useRef(rawText);

  // שחזור בעת טעינה
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && !rawText) {
      setText(saved);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save עם debounce
  useEffect(() => {
    if (prevText.current === rawText) return;
    prevText.current = rawText;

    const timer = setTimeout(() => {
      if (rawText) {
        localStorage.setItem(STORAGE_KEY, rawText);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [rawText]);

  // שמירת הגדרות מיידית (כבר מטופל על ידי zustand persist)
  // אבל נשמור גם גרסת JSON לגיבוי
  useEffect(() => {
    const timer = setTimeout(() => {
      localStorage.setItem('tora-typesetter-settings-backup', JSON.stringify(settings));
    }, 2000);
    return () => clearTimeout(timer);
  }, [settings]);
}
