/**
 * view-store.test.ts — בדיקות store התצוגה (שלב 76; אפיון §13.1).
 *
 * מה מוכח כאן: zoom תחום [0.25, 4] גם לקלט קיצוני/NaN; locale סגור
 * (he|en); focus קפוא בכניסה; השמירה היא zoom+locale בלבד (העדפות
 * משתמש) — בחירת עמוד/focus אינם נשמרים; rehydrate כולל סגירת
 * zoom שמור חריג.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { createMemoryKVStorage, setKVStorage, STORAGE_KEYS } from '../../src/stores/storage.js';
import { useViewStore, ZOOM_MAX, ZOOM_MIN } from '../../src/stores/view-store.js';

beforeEach(() => {
  setKVStorage(createMemoryKVStorage());
  useViewStore.getState().reset();
});

describe('view-store — zoom', () => {
  test('ברירת מחדל 1; סגירה לתחום [0.25, 4] לקלט קיצוני ולא־פיניטי', () => {
    expect(useViewStore.getState().zoom).toBe(1);
    expect(ZOOM_MIN).toBe(0.25);
    expect(ZOOM_MAX).toBe(4);
    useViewStore.getState().setZoom(0.01);
    expect(useViewStore.getState().zoom).toBe(0.25);
    useViewStore.getState().setZoom(100);
    expect(useViewStore.getState().zoom).toBe(4);
    useViewStore.getState().setZoom(2.5);
    expect(useViewStore.getState().zoom).toBe(2.5);
    useViewStore.getState().setZoom(Number.NaN);
    expect(useViewStore.getState().zoom).toBe(1); // NaN ⇐ ערך ברירת המחדל, לא NaN
    useViewStore.getState().setZoom(Number.POSITIVE_INFINITY);
    expect(useViewStore.getState().zoom).toBe(1);
  });
});

describe('view-store — עמוד, locale ומוקד', () => {
  test('selectPage/setLocale/setFocus; focus קפוא בכניסה', () => {
    useViewStore.getState().selectPage('page-7');
    expect(useViewStore.getState().selectedPageId).toBe('page-7');
    useViewStore.getState().selectPage(null);
    expect(useViewStore.getState().selectedPageId).toBeNull();
    useViewStore.getState().setLocale('en');
    expect(useViewStore.getState().locale).toBe('en');
    useViewStore.getState().setFocus({ pane: 'layout', pageId: 'page-7', atomId: 'atom-3' });
    const focus = useViewStore.getState().focus!;
    expect(focus.pane).toBe('layout');
    expect(focus.pageId).toBe('page-7');
    expect(Object.isFrozen(focus)).toBe(true);
    useViewStore.getState().setFocus(null);
    expect(useViewStore.getState().focus).toBeNull();
  });
});

describe('view-store — שמירה והחייאה', () => {
  test('מה שנשמר הוא zoom+locale בלבד; עמוד/focus אינם נשמרים', () => {
    const mem = createMemoryKVStorage();
    setKVStorage(mem);
    useViewStore.getState().setZoom(1.5);
    useViewStore.getState().setLocale('en');
    useViewStore.getState().selectPage('page-9');
    useViewStore.getState().setFocus({ pane: 'source' });
    const saved = JSON.parse(mem.getItem(STORAGE_KEYS.view)!);
    expect(saved).toEqual({ zoom: 1.5, locale: 'en' });
  });

  test('rehydrate קורא zoom+locale וסוגר zoom חריג לתחום', () => {
    setKVStorage(
      createMemoryKVStorage({
        [STORAGE_KEYS.view]: JSON.stringify({ zoom: 99, locale: 'en' }),
      }),
    );
    useViewStore.getState().rehydrate();
    const s = useViewStore.getState();
    expect(s.zoom).toBe(4); // נסגר — לא מאמינים לקלט שמור
    expect(s.locale).toBe('en');
    setKVStorage(createMemoryKVStorage({ [STORAGE_KEYS.view]: '{broken' }));
    useViewStore.getState().rehydrate(); // פגום ⇐ נשארים במצב הנוכחי
    expect(useViewStore.getState().locale).toBe('en');
  });
});
