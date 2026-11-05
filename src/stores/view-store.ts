/**
 * view-store.ts — מצב תצוגה בלבד (שלב 76; אפיון §13.1).
 *
 * "viewStore — zoom, page selection, locale ו־source/layout selection;
 *  כל אלה UI-only."
 *
 *   1. שום דבר כאן אינו נכנס ל־layoutHash או להחלטות מנוע (§13.2,
 *      §17.2#5): zoom הוא transform של המיכל בלבד.
 *   2. zoom נתון לתחום סגור [0.25, 4] — clamp בכל כתיבה, גם לקלט
 *      משובש; אין NaN (ערך לא סופי נדחה).
 *   3. השמירה: zoom+locale בלבד (`tora-ui:view:v1`) — העדפות משתמש;
 *      בחירת עמוד/focus אינן נשמרות (מצב עבודה).
 */
import { create } from 'zustand';
import { readJson, STORAGE_KEYS, writeJson } from './storage.js';

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const LOCALES = Object.freeze(['he', 'en'] as const);
export type Locale = (typeof LOCALES)[number];

/** מוקד הצגה — קישור עורך↔פריסה (§13.3/§14.2) ברמת ה־UI בלבד.
 * שלב 81: שני הכיוונים — pane 'layout' = בחירה בעורך שמדגישה פריטים בפריסה;
 * pane 'source' = קליק על פריט בפריסה (או בעיה במפת הקלט) שבוחר טווח בעורך. */
export interface ViewFocus {
  readonly pane: 'source' | 'layout';
  readonly pageId?: string;
  readonly atomId?: string;
  /** הפריט שהופעל בפריסה (קו/סמן) — להדגשתו שם גם כשהמוקד בעורך (שלב 81). */
  readonly itemId?: string;
  /** טווח מקור לבחירה בעורך (שלב 80) — היסטים UTF-16 במרחב המקור הגולמי. */
  readonly sourceSpan?: { readonly startUtf16: number; readonly endUtf16: number };
}

interface ViewStoreState {
  readonly zoom: number;
  readonly selectedPageId: string | null;
  readonly locale: Locale;
  readonly focus: Readonly<ViewFocus> | null;
  setZoom(zoom: number): void;
  selectPage(pageId: string | null): void;
  setLocale(locale: Locale): void;
  setFocus(focus: ViewFocus | null): void;
  /** איפוס מלא (ברירות מחדל) — resetForNewDocument שומר zoom/locale. */
  reset(): void;
  rehydrate(): void;
}

interface PersistedView {
  readonly zoom?: unknown;
  readonly locale?: unknown;
}

const clampZoom = (zoom: number): number =>
  Number.isFinite(zoom) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)) : 1;

const persist = (state: ViewStoreState): void => {
  writeJson(STORAGE_KEYS.view, { zoom: state.zoom, locale: state.locale });
};

export const useViewStore = create<ViewStoreState>()((set) => ({
  zoom: 1,
  selectedPageId: null,
  locale: 'he',
  focus: null,

  setZoom: (zoom) =>
    set((state) => {
      const next = clampZoom(zoom);
      if (next === state.zoom) return state;
      const newState = { ...state, zoom: next };
      persist(newState);
      return newState;
    }),

  selectPage: (pageId) =>
    set((state) => (pageId === state.selectedPageId ? state : { ...state, selectedPageId: pageId })),

  setLocale: (locale) =>
    set((state) => {
      if (locale === state.locale) return state;
      const newState = { ...state, locale };
      persist(newState);
      return newState;
    }),

  setFocus: (focus) =>
    set((state) => {
      const frozen = focus === null ? null : Object.freeze({ ...focus });
      return Object.is(frozen, state.focus) ? state : { ...state, focus: frozen };
    }),

  reset: () =>
    set((state) => {
      const newState = { ...state, zoom: 1, selectedPageId: null, locale: 'he' as const, focus: null };
      persist(newState);
      return newState;
    }),

  rehydrate: () => {
    const saved = readJson<PersistedView>(STORAGE_KEYS.view, {});
    set((state) => ({
      zoom: typeof saved.zoom === 'number' && Number.isFinite(saved.zoom) ? clampZoom(saved.zoom) : state.zoom,
      locale: saved.locale === 'he' || saved.locale === 'en' ? saved.locale : state.locale,
    }));
  },
}));
