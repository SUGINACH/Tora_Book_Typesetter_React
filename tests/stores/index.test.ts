/**
 * index.test.ts — בדיקות החבית ומחזור החיים של ה־stores (שלב 76).
 *
 * מה מוכח כאן: resetForNewDocument מאפס מסמך/job/תוצאה ומנקה בחירת
 * עמוד/focus — אך **שומר zoom ו־locale** (העדפות משתמש אינן מסמך);
 * rehydrateStores ממלא את שלושת הערוצים מהאחסון; החבית חושפת את
 * חמשת ה־stores ואת הבוררים.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { createMemoryKVStorage, setKVStorage, STORAGE_KEYS } from '../../src/stores/storage.js';
import { resetForNewDocument, rehydrateStores } from '../../src/stores/index.js';
import { useEditorStore } from '../../src/stores/editor-store.js';
import { useRunStore } from '../../src/stores/run-store.js';
import { useResultStore } from '../../src/stores/result-store.js';
import { useViewStore } from '../../src/stores/view-store.js';
import { useSettingsStore } from '../../src/stores/settings-store.js';

beforeEach(() => {
  setKVStorage(createMemoryKVStorage());
  useEditorStore.getState().reset();
  useRunStore.getState().reset();
  useResultStore.getState().reset();
  useViewStore.getState().reset();
  useSettingsStore.getState().reset();
});

describe('resetForNewDocument — ניקוי בין מסמכים', () => {
  test('מסמך/job/תוצאה/עמוד/focus מתאפסים; zoom ו־locale נשמרים', () => {
    useEditorStore.getState().setText('מסמך ראשון');
    useEditorStore.getState().setDocumentName('א.txt');
    useRunStore.getState().begin('job-1', 'h1');
    useViewStore.getState().setZoom(2.5);
    useViewStore.getState().setLocale('en');
    useViewStore.getState().selectPage('page-4');
    useViewStore.getState().setFocus({ pane: 'layout', pageId: 'page-4' });

    resetForNewDocument();

    const ed = useEditorStore.getState();
    expect(ed.rawText).toBe('');
    expect(ed.documentName).toBe('');
    expect(ed.dirty).toBe(false);
    const run = useRunStore.getState();
    expect(run.phase).toBe('idle');
    expect(run.jobId).toBeNull();
    const res = useResultStore.getState();
    expect(res.ir).toBeNull();
    expect(res.layoutHash).toBeNull();
    const view = useViewStore.getState();
    expect(view.zoom).toBe(2.5); // העדפת משתמש — נשמרה
    expect(view.locale).toBe('en'); // העדפת משתמש — נשמרה
    expect(view.selectedPageId).toBeNull(); // מצב עבודה — התאפס
    expect(view.focus).toBeNull();
  });

  test('revision ממשיך לעלות גם על פני מסמכים — עוגן stale-job אמין', () => {
    useEditorStore.getState().setText('א');
    const revAfterFirst = useEditorStore.getState().revision;
    resetForNewDocument();
    useEditorStore.getState().setText('ב');
    expect(useEditorStore.getState().revision).toBeGreaterThan(revAfterFirst);
  });
});

describe('rehydrateStores — מילוי מלא מהאחסון', () => {
  test('שלושת הערוצים נקראים יחד (editor/settings/view)', () => {
    setKVStorage(
      createMemoryKVStorage({
        [STORAGE_KEYS.editor]: JSON.stringify({ rawText: 'מהדיסק', documentName: 'ד.txt' }),
        [STORAGE_KEYS.settings]: JSON.stringify({ draft: { 'auto-dh': true }, presets: {}, unmappedLegacy: {} }),
        [STORAGE_KEYS.view]: JSON.stringify({ zoom: 0.5, locale: 'en' }),
      }),
    );
    rehydrateStores();
    expect(useEditorStore.getState().rawText).toBe('מהדיסק');
    expect(useEditorStore.getState().documentName).toBe('ד.txt');
    expect(useSettingsStore.getState().draft['auto-dh']).toBe(true);
    expect(useViewStore.getState().zoom).toBe(0.5);
    expect(useViewStore.getState().locale).toBe('en');
  });
});

describe('חבית — חמשת ה־stores חשופים', () => {
  test('hooks של חמשת ה־stores ומודולי העזר זמינים מהחבית', async () => {
    const barrel = await import('../../src/stores/index.js');
    expect(typeof barrel.useEditorStore).toBe('function');
    expect(typeof barrel.useSettingsStore).toBe('function');
    expect(typeof barrel.useRunStore).toBe('function');
    expect(typeof barrel.useResultStore).toBe('function');
    expect(typeof barrel.useViewStore).toBe('function');
    expect(typeof barrel.resetForNewDocument).toBe('function');
    expect(typeof barrel.rehydrateStores).toBe('function');
    expect(typeof barrel.migrateLegacyUiState).toBe('function');
    expect(typeof barrel.deepFreeze).toBe('function');
    expect(typeof barrel.useRawText).toBe('function');
  });
});
