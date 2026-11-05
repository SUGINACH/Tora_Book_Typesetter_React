/**
 * store-cleanup.test.ts — ניקוי ה־stores ובדיקת הגדרות יתומות (שלב 84;
 * אפיון §13, §18-M9; תכנית שלב 84 — "ניקוי stores ובדיקת הגדרות יתומות").
 *
 * שעת השלב: **אין הגדרה יתומה או state מוסמך כפול.** מה מוכח כאן:
 *   1. rehydrate מאמת את ה־draft השמור מול המרשם — מפתח שירד מהמרשם
 *      מאז השמירה אינו נכנס כיתום (נשמר ב־unmappedLegacy עם issue);
 *      ערך שאינו חוקי עוד נדחה; draft תקין נטען כמו שהוא (אין איבוד).
 *   2. אין effective מהעולם הישן: כל שינוי ממשי של ה־draft (עריכה,
 *      ייבוא אובייקט/קובץ, טעינת תבנית) מאפס עד applyDraft; עריכה
 *      שנדחתה אינה מאפסת — ה־draft לא זז.
 *   3. מעבר בין תבניות: ה־draft הוא בדיוק של התבנית החדשה (אין
 *      שאריות מהקודמת) וה־configHash שלה בלבד; הגדרות/תבניות הן נתוני
 *      משתמש ושורדים מעבר בין מסמכים.
 *   4. resetForNewDocument מבטל ריצה פעילה דרך הוק רשום **לפני** האיפוס
 *      (registerRunCancellation, שלב 84) — ההוק רואה את המסמך הישן
 *      ואת ה־job החי; הסרת רישום עוצרת; רישום חדש מחליף.
 *   5. מעבר בין שני מסמכים: ניתוח/עמוד/focus/job של הראשון נעלמים,
 *      הניתוח הוא של השני, revision מונוטוני; zoom/locale נשמרים
 *      (העדפות משתמש) ואינם נוגעים במסמך/הגדרות/ריצה.
 *   6. מיגרציית state שמור: מפתחות המורשת אינם נמחקים גם אחרי
 *      מעברי מסמך חוזרים (קריאה בלבד — שיעור שלב 76).
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { createMemoryKVStorage, setKVStorage, STORAGE_KEYS, LEGACY_STORAGE_KEYS, getKVStorage } from '../../src/stores/storage.js';
import { useSettingsStore } from '../../src/stores/settings-store.js';
import { useEditorStore } from '../../src/stores/editor-store.js';
import { useRunStore } from '../../src/stores/run-store.js';
import { useViewStore } from '../../src/stores/view-store.js';
import { registerRunCancellation, resetForNewDocument } from '../../src/stores/index.js';
import { importDocumentText } from '../../src/stores/import-document.js';
import { migrateLegacyUiState } from '../../src/stores/legacy-migrate.js';

const SOURCE_A = 'שם הספר - מסמך א\nנושא - ניקוי stores\n\nכותרת 1 מספר 1 - פרק א\nפסקה ראשונה עם הערה [הערת שוליים א].\n';
const SOURCE_B = 'שם הספר - מסמך ב\nמקום ושנה - ירושלים תשפ"ו\n\nכותרת 1 מספר 1 - פרק ב\nפסקה שניה [הערה 1] ועוד [הערה 2].\n';

const resetAll = (): void => {
  setKVStorage(createMemoryKVStorage());
  registerRunCancellation(null);
  useEditorStore.getState().reset();
  useRunStore.getState().reset();
  useViewStore.getState().reset();
  useSettingsStore.getState().reset();
};

beforeEach(resetAll);

// ─────────────────── 1) rehydrate — אין הגדרה יתומה מהאחסון ───────────────────

describe('rehydrate — ה־draft השמור מאומת מול המרשם', () => {
  test('draft תקין נטען במלואו ובלי בעיות (אין איבוד נתוני משתמש)', () => {
    setKVStorage(createMemoryKVStorage({
      [STORAGE_KEYS.settings]: JSON.stringify({
        draft: { 'auto-dh': false, 'builder-back-bottom': 24 },
        presets: {},
        unmappedLegacy: {},
      }),
    }));
    useSettingsStore.getState().rehydrate();
    const s = useSettingsStore.getState();
    expect(Object.keys(s.draft).sort()).toEqual(['auto-dh', 'builder-back-bottom']);
    expect(s.draft['auto-dh']).toBe(false);
    expect(s.draft['builder-back-bottom']).toBe(24);
    expect(s.issues).toHaveLength(0);
  });

  test('מפתח שירד מהמרשם אינו נכנס ל־draft כיתום — נשמר ב־unmappedLegacy עם issue', () => {
    setKVStorage(createMemoryKVStorage({
      [STORAGE_KEYS.settings]: JSON.stringify({
        draft: { 'auto-dh': true, 'removed-in-future-registry': 'v' },
        presets: {},
        unmappedLegacy: {},
      }),
    }));
    useSettingsStore.getState().rehydrate();
    const s = useSettingsStore.getState();
    expect(Object.keys(s.draft)).toEqual(['auto-dh']); // היתום לא נכנס
    expect(s.unmappedLegacy['removed-in-future-registry']).toBe('v'); // לא אבד
    expect(s.issues.some((i) => i.code === 'errors.settings.UNKNOWN_KEY')).toBe(true);
  });

  test('ערך שאינו חוקי עוד (שלילי) נדחה — לא ב־draft; ערך תקין לצידו נטען', () => {
    setKVStorage(createMemoryKVStorage({
      [STORAGE_KEYS.settings]: JSON.stringify({
        draft: { 'auto-dh': true, 'builder-back-bottom': -5 },
        presets: {},
        unmappedLegacy: {},
      }),
    }));
    useSettingsStore.getState().rehydrate();
    const s = useSettingsStore.getState();
    expect(Object.keys(s.draft)).toEqual(['auto-dh']);
    expect('builder-back-bottom' in s.draft).toBe(false);
    expect(s.issues.some((i) => i.code === 'errors.settings.INVALID_VALUE')).toBe(true); // number שלילי ⇐ INVALID_VALUE (לא dimension)
  });

  test('effective מתאפס בטעינה מחדש — גם אם היה בנוי לפניה', () => {
    useSettingsStore.getState().setDraftValue('auto-dh', true);
    useSettingsStore.getState().applyDraft();
    expect(useSettingsStore.getState().effective).not.toBeNull();
    useSettingsStore.getState().rehydrate();
    expect(useSettingsStore.getState().effective).toBeNull();
  });
});

// ─────────────────── 2) אין effective מהעולם הישן ───────────────────

describe('effective — כל שינוי draft ממשי מאפס עד applyDraft', () => {
  test('setDraftValue חוקי ⇐ null עד applyDraft; עריכה נדחית אינה מאפסת', () => {
    useSettingsStore.getState().setDraftValue('auto-dh', true);
    useSettingsStore.getState().applyDraft();
    expect(useSettingsStore.getState().effective).not.toBeNull();

    useSettingsStore.getState().setDraftValue('auto-dh', false); // חוקי — draft זז
    expect(useSettingsStore.getState().effective).toBeNull();
    useSettingsStore.getState().applyDraft();
    expect(useSettingsStore.getState().effective?.values['auto-dh']).toBe(false);

    useSettingsStore.getState().setDraftValue('builder-back-bottom', -5); // נדחה — draft לא זז
    expect(useSettingsStore.getState().effective).not.toBeNull(); // לא אופס
    expect(useSettingsStore.getState().issues.some((i) => i.code === 'errors.settings.INVALID_VALUE')).toBe(true);
  });

  test('importObject מאפס רק כשמשהו נכנס ל־draft (מה שנדחה כולו אינו מאפס)', () => {
    useSettingsStore.getState().setDraftValue('auto-dh', true);
    useSettingsStore.getState().applyDraft();

    useSettingsStore.getState().importObject({ 'avoid-widows': false }); // מה שנכנס
    expect(useSettingsStore.getState().effective).toBeNull();
    useSettingsStore.getState().applyDraft();

    useSettingsStore.getState().importObject({ 'no-such-key': 1 }); // הכול נדחה
    expect(useSettingsStore.getState().effective).not.toBeNull(); // ה־draft לא זז
    expect(useSettingsStore.getState().unmappedLegacy['no-such-key']).toBe(1);
  });

  test('importSettingsFile מאפס תמיד — הקובץ מחליף את ה־draft בשלמותו', () => {
    useSettingsStore.getState().setDraftValue('auto-dh', true);
    useSettingsStore.getState().applyDraft();
    useSettingsStore.getState().importSettingsFile({ 'avoid-orphans': false });
    expect(useSettingsStore.getState().effective).toBeNull();
    expect(Object.keys(useSettingsStore.getState().draft)).toEqual(['avoid-orphans']);
  });

  test('loadPreset מאפס עד applyDraft', () => {
    useSettingsStore.getState().setDraftValue('auto-dh', true);
    useSettingsStore.getState().applyDraft();
    useSettingsStore.getState().savePreset('מצב-עבודה');
    useSettingsStore.getState().setDraftValue('avoid-widows', false);

    useSettingsStore.getState().loadPreset('מצב-עבודה');
    expect(useSettingsStore.getState().effective).toBeNull();
    expect(Object.keys(useSettingsStore.getState().draft)).toEqual(['auto-dh']);
  });
});

// ─────────────────── 3) מעבר בין תבניות — בלי דליפת state ───────────────────

describe('מעבר בין תבניות — ה־draft של האחרונה בלבד', () => {
  test('תבנית A ← תבנית B: ה־draft בדיוק מפתחות B; configHash של B בלבד', () => {
    useSettingsStore.getState().importSettingsFile({ 'auto-dh': false, 'avoid-widows': false });
    useSettingsStore.getState().savePreset('תבנית-א');
    useSettingsStore.getState().importSettingsFile({ 'avoid-orphans': false });
    useSettingsStore.getState().savePreset('תבנית-ב');

    useSettingsStore.getState().loadPreset('תבנית-א');
    useSettingsStore.getState().applyDraft();
    const hashA = useSettingsStore.getState().effective?.configHash;

    useSettingsStore.getState().loadPreset('תבנית-ב');
    expect(Object.keys(useSettingsStore.getState().draft)).toEqual(['avoid-orphans']); // אין שאריות A
    useSettingsStore.getState().applyDraft();
    const after = useSettingsStore.getState().effective;
    expect(after).not.toBeNull();
    expect(after?.configHash).not.toBe(hashA); // ה־hash של B, לא של A

    // וההשוואה הישירה: אותו draft ישירות ⇐ אותו hash (דטרמיניזם)
    useSettingsStore.getState().importSettingsFile({ 'avoid-orphans': false });
    useSettingsStore.getState().applyDraft();
    expect(useSettingsStore.getState().effective?.configHash).toBe(after?.configHash);
  });

  test('הגדרות ותבניות הן נתוני משתמש — שורדים מעבר בין מסמכים', () => {
    useSettingsStore.getState().setDraftValue('auto-dh', false);
    useSettingsStore.getState().savePreset('שמורה');
    importDocumentText(SOURCE_A, 'א.txt', 'text-file');
    const s = useSettingsStore.getState();
    expect(s.draft['auto-dh']).toBe(false);
    expect('שמורה' in s.presets).toBe(true);
  });
});

// ─────────────────── 4) ביטול ריצה ומנויים במעבר מסמך ───────────────────

describe('resetForNewDocument — ביטול ריצה פעילה לפני האיפוס (שלב 84)', () => {
  test('ההוק הרשום נקרא לפני האיפוס ורואה את המסמך הישן', () => {
    useEditorStore.getState().setText('מסמך ישן שעוד לא אופס');
    let rawTextAtCancel: string | null = null;
    let calls = 0;
    registerRunCancellation(() => {
      calls += 1;
      rawTextAtCancel = useEditorStore.getState().rawText;
    });
    resetForNewDocument();
    expect(calls).toBe(1);
    expect(rawTextAtCancel).toBe('מסמך ישן שעוד לא אופס'); // ביטול לפני ניקוי
    expect(useEditorStore.getState().rawText).toBe('');
  });

  test('הוק שמבטל job פעיל — cancelled בתוך ההוק, ואחר כך idle נקי לחלוטין', () => {
    useEditorStore.getState().setText('מקור');
    useRunStore.getState().begin('job-84', 'hash-84');
    let phaseAtCancel: string | null = null;
    // בדיוק מה ש־controller.cancel עושה בייצור (App רושם את זה):
    registerRunCancellation(() => {
      const run = useRunStore.getState();
      phaseAtCancel = run.phase;
      if (run.jobId !== null) run.cancel(run.jobId);
    });
    resetForNewDocument();
    expect(phaseAtCancel).toBe('preparing'); // ה־job היה חי בשעת הביטול
    const run = useRunStore.getState();
    expect(run.phase).toBe('idle'); // reset מנקה עד תום — אין מזהה, אין hash
    expect(run.jobId).toBeNull();
    expect(run.inputHash).toBeNull();
  });

  test('הסרת רישום (null) עוצרת את הביטול; רישום חדש מחליף את הקודם', () => {
    let first = 0;
    let second = 0;
    registerRunCancellation(() => {
      first += 1;
    });
    registerRunCancellation(() => {
      second += 1;
    }); // מחליף — הרשאה אחת
    resetForNewDocument();
    expect(first).toBe(0);
    expect(second).toBe(1);
    registerRunCancellation(null);
    resetForNewDocument();
    expect(second).toBe(1); // לא נקרא עוד
  });
});

// ─────────────────── 5) מעבר בין שני מסמכים — בלי דליפת state ───────────────────

describe('מעבר בין שני מסמכים — בלי דליפת state', () => {
  test('ניתוח/עמוד/focus/job של א נעלמים; הניתוח הוא של ב; revision מונוטוני', () => {
    const resultA = importDocumentText(SOURCE_A, 'א.txt', 'text-file');
    expect(useEditorStore.getState().analysis).not.toBeNull();
    useViewStore.getState().selectPage('page-3');
    useViewStore.getState().setFocus({ pane: 'layout', pageId: 'page-3' });
    useRunStore.getState().begin('job-a', 'hash-a');
    const revisionA = useEditorStore.getState().revision;

    const resultB = importDocumentText(SOURCE_B, 'ב.txt', 'text-file');

    const ed = useEditorStore.getState();
    expect(ed.rawText).toBe(SOURCE_B);
    expect(ed.documentName).toBe('ב.txt');
    expect(ed.dirty).toBe(true); // מסמך חדש שטרם נשמר — לא "נקי" מהמסמך הקודם
    expect(ed.revision).toBeGreaterThan(revisionA); // העוגן ממשיך לעלות
    // הניתוח הוא של ב — נחתם למהדורה של ב ומכיל את ה-metadata שלה:
    expect(ed.analysis?.analyzedRevision).toBe(ed.revision);
    const bookOf = (a: { readonly overview: { readonly metadata: readonly { readonly key: string; readonly value: string }[] } | null } | null): string | undefined =>
      a?.overview?.metadata.find((m) => m.key === 'שם הספר')?.value;
    expect(bookOf(ed.analysis)).toBe('מסמך ב');
    expect(ed.importIssue).toBeNull(); // כישלון חולף של א לא נשאר
    // מצב עבודה של א נעלם:
    const view = useViewStore.getState();
    expect(view.selectedPageId).toBeNull();
    expect(view.focus).toBeNull();
    const run = useRunStore.getState();
    expect(run.phase).toBe('idle');
    expect(run.jobId).toBeNull();
    // שני הניתוחים שונים — אין הצגה של א כב:
    expect(bookOf(resultA.analysis)).toBe('מסמך א');
    expect(bookOf(resultB.analysis)).toBe('מסמך ב');
  });

  test('zoom/locale נשמרים במעבר מסמך; מעבר locale אינו נוגע במסמך/הגדרות/ריצה', () => {
    importDocumentText(SOURCE_A, 'א.txt', 'text-file');
    useViewStore.getState().setZoom(2.5);
    useRunStore.getState().begin('job-a', 'hash-a');
    const phaseBefore = useRunStore.getState().phase;

    useViewStore.getState().setLocale('en');
    useViewStore.getState().setLocale('he'); // הלוך ושוב — רק תצוגה
    expect(useRunStore.getState().phase).toBe(phaseBefore); // הריצה לא נפגעה
    expect(useEditorStore.getState().rawText).toBe(SOURCE_A); // המסמך לא נפגע
    expect(Object.keys(useSettingsStore.getState().draft)).toHaveLength(0); // ההגדרות לא נפגעו

    importDocumentText(SOURCE_B, 'ב.txt', 'text-file');
    const view = useViewStore.getState();
    expect(view.zoom).toBe(2.5); // העדפת משתמש — נשמרה
    expect(view.locale).toBe('he'); // העדפת משתמש — נשמרה
  });
});

// ─────────────────── 6) מיגרציית state שמור ───────────────────

describe('מיגרציית state שמור — קריאה בלבד גם במעברי מסמך', () => {
  test('מפתחות המורשת אינם נמחקים גם אחרי מעברי מסמך חוזרים', () => {
    const legacyState = JSON.stringify({
      state: { rawText: 'ישן', settings: { 'old-key': 'old-value' }, zoom: 1.5 },
      version: 1,
    });
    setKVStorage(createMemoryKVStorage({
      [LEGACY_STORAGE_KEYS.editor]: legacyState,
      [LEGACY_STORAGE_KEYS.settings]: legacyState,
      [LEGACY_STORAGE_KEYS.view]: legacyState,
    }));
    const report = migrateLegacyUiState();
    expect(report.ran).toBe(true);

    importDocumentText(SOURCE_A, 'א.txt', 'text-file');
    importDocumentText(SOURCE_B, 'ב.txt', 'text-file');
    resetForNewDocument();
    importDocumentText(SOURCE_A, 'א-שוב.txt', 'text-file');

    const kv = getKVStorage();
    expect(kv.getItem(LEGACY_STORAGE_KEYS.editor)).toBe(legacyState); // לא נמחק
    expect(kv.getItem(LEGACY_STORAGE_KEYS.settings)).toBe(legacyState);
    expect(kv.getItem(LEGACY_STORAGE_KEYS.view)).toBe(legacyState);
  });
});
