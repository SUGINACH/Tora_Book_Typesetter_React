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
 *
 * שלב 80 (אפיון §3.3, §13–14): ניתוח הקלט — מפת שגיאות ממוקדת
 * (שורה:עמודה מהפרסר הנעול) וסקירת מסמך (metadata, זרמי הערות).
 * נתון מתחום המסמך, לא Layout IR — נגזר מהמקור הגולמי עצמו
 * (content-model, שלב 17) ואינו נכנס להחלטות עימוד. מתעדכן בפעולת
 * הייבוא ובכל הרצה (אין פרסור בהקלדה — §13.4), נחתם למהדורה
 * שיצר אותו (analyzedRevision — אותו עוגן stale) ואינו נשמר לדיסק:
 * הוא נגזרת, לא מסמך. importIssue — כישלון מתאם חולף שאינו משנה
 * את המסמך הנוכחי.
 */
import { create } from 'zustand';
import { readJson, STORAGE_KEYS, writeJson } from './storage.js';
import type { LocatedIssue, SourceAnalysis } from './source-analysis.js';

interface EditorStoreState {
  readonly rawText: string;
  readonly documentName: string;
  readonly revision: number;
  readonly dirty: boolean;
  /** ניתוח הקלט האחרון (ייבוא/ריצה); null עד הפעולה הראשונה (שלב 80). */
  readonly analysis: SourceAnalysis | null;
  /** כישלון מתאם חולף (פורמט/קריאה/המרה); null כשאין (שלב 80). */
  readonly importIssue: LocatedIssue | null;
  setText(text: string): void;
  setDocumentName(name: string): void;
  /** פרסום ניתוח קלט — קפוא במקום (שלב 80). */
  setImportAnalysis(analysis: SourceAnalysis): void;
  /** דיווח כישלון מתאם ייבוא — לתצוגה בלבד (שלב 80). */
  setImportIssue(issue: LocatedIssue | null): void;
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
  analysis: null,
  importIssue: null,

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

  setImportAnalysis: (analysis) =>
    set((state) => ({ ...state, analysis: Object.freeze(analysis), importIssue: null })),

  setImportIssue: (issue) =>
    set((state) => ({ ...state, importIssue: issue === null ? null : Object.freeze(issue) })),

  markSaved: () =>
    set((state) => {
      if (!state.dirty) return state;
      return { ...state, dirty: false };
    }),

  reset: () =>
    set((state) => {
      // אין מה לאפס — מצב התחלתי; לא מקפיצים מהדורה ולא כותבים לדיסק.
      if (
        state.rawText === '' &&
        state.documentName === '' &&
        !state.dirty &&
        state.analysis === null &&
        state.importIssue === null
      ) {
        return state;
      }
      const next = {
        ...state,
        rawText: '',
        documentName: '',
        revision: state.revision + 1,
        dirty: false,
        analysis: null,
        importIssue: null,
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
