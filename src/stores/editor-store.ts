/**
 * editor-store.ts — store המסמך של המעטפת החדשה (שלב 76; אפיון §13.1).
 *
 * "editorStore — מקור גולמי ומצב עריכה; אינו מכיר Layout IR."
 *
 *   1. שדות: טקסט גולמי, שם מסמך, מונה מהדורות (revision) ודגלון
 *      שינויים שלא נשמרו (dirty). זהו — **אין כאן IR, עמודים, findings
 *      או manifest**; אלו חיים ב־result-store בלבד.
 *   2. revision עולה מונוטונית בכל setText — עוגן דטרמיניסטי לביטול
 *      job ישן (stale) בלי שעון (שיעור ADR: אין זמן בהחלטות מנוע).
 *   3. השמירה: rawText+documentName בלבד נכתבים ל־`tora-ui:editor:v1`;
 *      revision/dirty אינם נשמרים — הם מצב עבודה, לא מסמך.
 */
import { create } from 'zustand';
import { readJson, STORAGE_KEYS, writeJson } from './storage.js';

interface EditorStoreState {
  readonly rawText: string;
  readonly documentName: string;
  readonly revision: number;
  readonly dirty: boolean;
  setText(text: string): void;
  setDocumentName(name: string): void;
  markSaved(): void;
  reset(): void;
  /** קריאה מחדש מהאחסון המוזרק (מיגרציה/בדיקות). */
  rehydrate(): void;
}

interface PersistedEditor {
  readonly rawText?: unknown;
  readonly documentName?: unknown;
}

const persist = (state: EditorStoreState): void => {
  writeJson(STORAGE_KEYS.editor, {
    rawText: state.rawText,
    documentName: state.documentName,
  });
};

export const useEditorStore = create<EditorStoreState>()((set) => ({
  rawText: '',
  documentName: '',
  revision: 0,
  dirty: false,

  setText: (text) =>
    set((state) => {
      if (text === state.rawText) return state;
      const next = { ...state, rawText: text, revision: state.revision + 1, dirty: true };
      persist(next);
      return next;
    }),

  setDocumentName: (name) =>
    set((state) => {
      if (name === state.documentName) return state;
      const next = { ...state, documentName: name, dirty: true };
      persist(next);
      return next;
    }),

  markSaved: () =>
    set((state) => {
      if (!state.dirty) return state;
      return { ...state, dirty: false };
    }),

  reset: () =>
    set((state) => {
      // אין מה לאפס — מצב התחלתי; לא מקפיצים מהדורה ולא כותבים לדיסק.
      if (state.rawText === '' && state.documentName === '' && !state.dirty) return state;
      const next = {
        ...state,
        rawText: '',
        documentName: '',
        revision: state.revision + 1,
        dirty: false,
      };
      persist(next);
      return next;
    }),

  rehydrate: () => {
    const saved = readJson<PersistedEditor>(STORAGE_KEYS.editor, {});
    set((state) => ({
      rawText: typeof saved.rawText === 'string' ? saved.rawText : state.rawText,
      documentName: typeof saved.documentName === 'string' ? saved.documentName : state.documentName,
    }));
  },
}));
