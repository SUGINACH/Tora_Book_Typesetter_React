/**
 * editor-store.test.ts — בדיקות store המסמך (שלב 76; אפיון §13.1).
 *
 * מה מוכח כאן: מקור גולמי + מצב עריכה בלבד — **אין שום שדה IR**
 * (המאמת הסטטי מוכיח זאת שוב ברמת הקוד); revision מונוטוני; השמירה
 * היא rawText+documentName בלבד; rehydrate קורא מהערוץ המוזרק.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { createMemoryKVStorage, setKVStorage, STORAGE_KEYS } from '../../src/stores/storage.js';
import { useEditorStore } from '../../src/stores/editor-store.js';

const reset = (): void => {
  setKVStorage(createMemoryKVStorage());
  useEditorStore.getState().reset();
};

beforeEach(reset);

describe('editor-store — מקור גולמי בלי IR', () => {
  test('מצב התחלתי: ריק, מהדורה 0, לא מלוכלך', () => {
    const s = useEditorStore.getState();
    expect(s.rawText).toBe('');
    expect(s.documentName).toBe('');
    expect(s.revision).toBe(0);
    expect(s.dirty).toBe(false);
  });

  test('אין שדות IR במצב — editor אינו מחזיק פריסה (§13.1)', () => {
    const forbidden = ['ir', 'pages', 'manifest', 'findings', 'anchors', 'layoutHash', 'lastRenderedPages'];
    const dataFields = Object.keys(useEditorStore.getState()).filter((k) => !['setText', 'setDocumentName', 'markSaved', 'reset', 'rehydrate'].includes(k));
    for (const f of forbidden) expect(dataFields).not.toContain(f);
    expect(dataFields.sort()).toEqual(['dirty', 'documentName', 'rawText', 'revision']);
  });

  test('setText מעלה מהדורה ומלכלך; טקסט זהה — נייטרלי', () => {
    const rev0 = useEditorStore.getState().revision; // בסיס יחסי — ה־store הוא singleton
    useEditorStore.getState().setText('שלום');
    const after = useEditorStore.getState();
    expect(after.rawText).toBe('שלום');
    expect(after.revision).toBe(rev0 + 1);
    expect(after.dirty).toBe(true);
    useEditorStore.getState().setText('שלום');
    expect(useEditorStore.getState().revision).toBe(rev0 + 1); // ללא שינוי ⇐ ללא מהדורה
    useEditorStore.getState().setText('שלום עליכם');
    expect(useEditorStore.getState().revision).toBe(rev0 + 2);
  });

  test('setDocumentName מלכלך; markSaved מנקה', () => {
    useEditorStore.getState().setDocumentName('sefer.txt');
    expect(useEditorStore.getState().documentName).toBe('sefer.txt');
    expect(useEditorStore.getState().dirty).toBe(true);
    useEditorStore.getState().markSaved();
    expect(useEditorStore.getState().dirty).toBe(false);
  });

  test('reset מרוקן ומעלה מהדורה (מונוטוני, לא מתאפס לאפס)', () => {
    useEditorStore.getState().setText('טקסט');
    useEditorStore.getState().setDocumentName('שם');
    const revBefore = useEditorStore.getState().revision;
    useEditorStore.getState().reset();
    const s = useEditorStore.getState();
    expect(s.rawText).toBe('');
    expect(s.documentName).toBe('');
    expect(s.dirty).toBe(false);
    expect(s.revision).toBeGreaterThan(revBefore);
  });
});

describe('editor-store — שמירה והחייאה', () => {
  test('setText כותב rawText+documentName בלבד לערוץ; revision/dirty אינם נשמרים', () => {
    const mem = createMemoryKVStorage();
    setKVStorage(mem);
    useEditorStore.getState().setText('תוכן נשמר');
    useEditorStore.getState().setDocumentName('מסמך');
    const saved = JSON.parse(mem.getItem(STORAGE_KEYS.editor)!);
    expect(saved).toEqual({ rawText: 'תוכן נשמר', documentName: 'מסמך' });
  });

  test('rehydrate קורא מהערוץ המוזרק — כולל דריסת מצב קודם', () => {
    // קודם כותבים לערוץ אחד (זרוק) — ואז מחליפים ערוץ לערוץ עם נתונים
    // שמורים: ההחייאה קוראת מהערוץ הפעיל, לא מהזיכרון שבידיים.
    setKVStorage(createMemoryKVStorage());
    useEditorStore.getState().setText('בזיכרון בלבד');
    const mem = createMemoryKVStorage({
      [STORAGE_KEYS.editor]: JSON.stringify({ rawText: 'מהדיסק', documentName: 'ישן.txt' }),
    });
    setKVStorage(mem);
    useEditorStore.getState().rehydrate();
    const s = useEditorStore.getState();
    expect(s.rawText).toBe('מהדיסק');
    expect(s.documentName).toBe('ישן.txt');
  });

  test('rehydrate עם JSON פגום — נשארים במצב הנוכחי בלי זריקה', () => {
    setKVStorage(createMemoryKVStorage());
    useEditorStore.getState().setText('קיים'); // נכתב לערוץ זרוק
    setKVStorage(createMemoryKVStorage({ [STORAGE_KEYS.editor]: '{broken' }));
    useEditorStore.getState().rehydrate(); // פגום ⇐ fallback בשקט
    expect(useEditorStore.getState().rawText).toBe('קיים');
  });
});
