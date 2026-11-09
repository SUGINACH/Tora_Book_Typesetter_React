// @vitest-environment jsdom
/**
 * stores.test.tsx — בדיקות רינדור של הבוררים (שלב 76; אפיון §13.1).
 *
 * מה מוכח כאן (בספירת רינדורים אמיתית ב־jsdom):
 *   1. בורר סקלרי: רכיב שצורך rawText אינו מרנדר כשמשתנה שדה אחר
 *      באותו store (documentName) — וכן כשמשתנה store אחר.
 *   2. shallow לאובייקט מורכב: progress בעל ערכים זהים ⇐ אין רינדור
 *      נוסף; שינוי ערך ⇐ רינדור.
 *   3. יציבות ייחוס בתוצאה: setResult כפול עם אותו אובייקט IR ⇐ רכיב
 *      שצורך את ה־IR לא מרנדר שוב (Object.is).
 *   4. חמשת ה־stores מבודדים: שינוי settings אינו מרנדר רכיב של view.
 *
 * זו ההוכחה שהבוררים "מונעים רינדורים מיותרים" — לא הבטחה בתיעוד.
 */
import { describe, expect, test } from 'vitest';
import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { useRawText, useRunProgress, useLayoutIr, useZoom } from '../../src/stores/selectors.js';
import { useEditorStore } from '../../src/stores/editor-store.js';
import { useRunStore } from '../../src/stores/run-store.js';
import { useResultStore } from '../../src/stores/result-store.js';
import { useSettingsStore } from '../../src/stores/settings-store.js';
import { useViewStore } from '../../src/stores/view-store.js';

const resetAll = (): void => {
  useEditorStore.getState().reset();
  useRunStore.getState().reset();
  useResultStore.getState().reset();
  useViewStore.getState().reset();
  useSettingsStore.getState().reset();
};

describe('בוררים — ספירת רינדורים', () => {
  test('בורר סקלרי: שינוי שדה אחר באותו store אינו מרנדר', () => {
    resetAll();
    let renders = 0;
    function Probe(): React.ReactElement {
      renders += 1;
      const text = useRawText();
      return createElement('div', null, text);
    }
    render(createElement(Probe));
    const baseline = renders;
    act(() => {
      useEditorStore.getState().setDocumentName('שם-חדש'); // שדה אחר — לא rawText
    });
    expect(renders).toBe(baseline);
    act(() => {
      useEditorStore.getState().setText('טקסט חדש');
    });
    expect(renders).toBe(baseline + 1);
  });

  test('shallow: progress חדש-אך-שווה-ערך אינו מרנדר; שינוי ערך מרנדר', () => {
    resetAll();
    let renders = 0;
    function Probe(): React.ReactElement {
      renders += 1;
      const progress = useRunProgress();
      return createElement('div', null, progress === null ? 'null' : `${progress.stage}:${progress.completedUnits}`);
    }
    render(createElement(Probe));
    act(() => {
      useRunStore.getState().begin('job-1', 'h');
    });
    const baseline = renders; // begin אינו משנה progress — אבל המצב כן; ספירה מכאן
    act(() => {
      useRunStore.getState().setProgress('job-1', 'parse', 1, 10);
    });
    expect(renders).toBe(baseline + 1);
    act(() => {
      useRunStore.getState().setProgress('job-1', 'parse', 1, 10); // אותם ערכים — אובייקט חדש
    });
    expect(renders).toBe(baseline + 1); // shallow ⇐ אין רינדור
    act(() => {
      useRunStore.getState().setProgress('job-1', 'parse', 2, 10);
    });
    expect(renders).toBe(baseline + 2);
  });

  test('יציבות ייחוס: setResult כפול עם אותו IR ⇐ רינדור בודד', () => {
    resetAll();
    let renders = 0;
    function Probe(): React.ReactElement {
      renders += 1;
      const ir = useLayoutIr();
      return createElement('div', null, ir === null ? 'null' : 'ir');
    }
    render(createElement(Probe));
    const ir = { schemaVersion: 1, policyId: 'torah-v1', pages: [], anchors: [], transformations: [] } as never;
    act(() => {
      useResultStore.getState().setResult({ ir, manifest: { engine: 'next' } as never, sourceRevision: 1, sourceAtRun: 'מקור בדיקה' }, 'h'.repeat(64));
    });
    const baseline = renders;
    act(() => {
      useResultStore.getState().setResult({ ir, manifest: { engine: 'next' } as never, sourceRevision: 1, sourceAtRun: 'מקור בדיקה' }, 'h'.repeat(64));
    });
    expect(renders).toBe(baseline); // אותה הפנייה ⇐ Object.is ⇐ אין רינדור
  });

  test('בידוד stores: שינוי settings אינו מרנדר רכיב של view', () => {
    resetAll();
    let renders = 0;
    function Probe(): React.ReactElement {
      renders += 1;
      const zoom = useZoom();
      return createElement('div', null, String(zoom));
    }
    render(createElement(Probe));
    const baseline = renders;
    act(() => {
      useSettingsStore.getState().setDraftValue('auto-dh', true); // store אחר
    });
    act(() => {
      useSettingsStore.getState().applyDraft();
    });
    expect(renders).toBe(baseline);
    act(() => {
      useViewStore.getState().setZoom(3);
    });
    expect(renders).toBe(baseline + 1);
  });
});
