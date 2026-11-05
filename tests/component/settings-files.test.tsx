// @vitest-environment jsdom
/**
 * settings-files.test.tsx — בדיקות סרגל קבצים ותבניות (שלב 79; אפיון §6.3,
 * §18-M9, תכנית שלב 79: "טעינת presets שמורים, שמירת presets חדשים,
 * ייבוא/ייצוא קובצי הגדרות").
 *
 * מה נבדק כאן מול דלתות השלב:
 *   1. הסרגל מרונדר בתוך הלוח ומציע ייבוא/ייצוא/תבניות.
 *   2. ייבוא קובץ מורשת תקין ⇐ סיכום מלא (נטענו/המרות/נדחו), ה־draft
 *      וה־effective מתעדכנים (§13.3).
 *   3. קובץ שאינו JSON ⇐ הודעת שגיאה מפורשת, שום דבר לא נטען בשקט.
 *   4. קובץ עם מפתח לא מוכר וערך לא חוקי ⇐ הדחיות מוצגות עם קוד+path
 *      ("נדחה עם הסבר מדויק") והמפתח הזר נשמר בתצוגת "לא מופו".
 *   5. קובץ בגרסה עתידית ⇐ MIGRATION_FAILED מדויק.
 *   6. ייצוא ⇐ Blob עם מעטפת {$format, schemaVersion, values} מהמצב
 *      האפקטיבי.
 *   7–10. תבניות: שמירה/טעינה (מחליף draft)/מחיקה/דחיית שם ריק או קיים.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { ReactElement } from 'react';
import { useSettingsStore } from '../../src/stores/settings-store.js';
import { createMemoryKVStorage, setKVStorage } from '../../src/stores/storage.js';
import { SettingsPanel } from '../../src/components/settings/SettingsPanel.js';

const renderUi = (ui: ReactElement): ReturnType<typeof render> => render(ui);

const jsonFile = (obj: unknown, name = 'settings.json'): File =>
  new File([JSON.stringify(obj)], name, { type: 'application/json' });

/** קריאת Blob כטקסט — FileReader (ל-jsdom אין Blob.text). */
const readBlob = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read failed'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });

const importFile = async (obj: unknown): Promise<void> => {
  const input = document.querySelector('[data-testid="import-settings-file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [jsonFile(obj)] } });
  await waitFor(() => {
    expect(document.querySelector('[data-testid="import-summary"], [data-testid="import-file-error"]')).not.toBeNull();
  });
};

describe('שלב 79 — סרגל קבצים ותבניות בלוח ההגדרות', () => {
  let createdBlobs: Blob[];
  let clickSpies: { mockRestore(): void }[];

  beforeEach(() => {
    cleanup();
    setKVStorage(createMemoryKVStorage());
    useSettingsStore.getState().reset();
    useSettingsStore.setState({ draft: Object.freeze({}), issues: Object.freeze([]), unmappedLegacy: Object.freeze({}), effective: null, presets: Object.freeze({}) });
    // jsdom אינו מממש createObjectURL — מנופש לבדיקת הייצוא; ההרצה
    // של click על עוגן מדולגת כדי שלא להיכנס לניווט שאינו ממומש שם.
    createdBlobs = [];
    Object.defineProperty(URL, 'createObjectURL', {
      value: (blob: Blob): string => { createdBlobs.push(blob); return 'blob:test'; },
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', { value: (): void => {}, configurable: true });
    clickSpies = [vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})];
  });

  afterEach(() => {
    for (const s of clickSpies) s.mockRestore();
  });

  it('הסרגל מרונדר בתוך הלוח: ייבוא, ייצוא ושמירת תבנית', () => {
    renderUi(<SettingsPanel />);
    expect(document.querySelector('[data-testid="settings-files"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="import-settings-file"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="export-settings"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="preset-name"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="preset-save"]')).not.toBeNull();
  });

  it('ייבוא קובץ מורשת תקין — סיכום מלא; draft ו־effective מתעדכנים (§13.3)', async () => {
    renderUi(<SettingsPanel />);
    await importFile({ 'auto-dh': true, 'builder-back-bottom': '18' });
    const summary = document.querySelector('[data-testid="import-summary"]')!;
    expect(summary.textContent).toContain('נטענו 2 מפתחות');
    expect(summary.textContent).toContain('1 המרות מתועדות');
    expect(summary.textContent).toContain('0 נדחו');
    const s = useSettingsStore.getState();
    expect(s.draft['auto-dh']).toBe(true);
    expect(s.draft['builder-back-bottom']).toBe(18); // קנוני — number
    expect(s.effective?.values['auto-dh']).toBe(true);
  });

  it('קובץ שאינו JSON — הודעת שגיאה מפורשת; ה־draft אינו זז', async () => {
    renderUi(<SettingsPanel />);
    useSettingsStore.getState().setDraftValue('auto-dh', true);
    const before = useSettingsStore.getState().draft;
    const input = document.querySelector('[data-testid="import-settings-file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['{ לא ג׳ייסון'], 'bad.json', { type: 'application/json' })] } });
    await waitFor(() => {
      expect(document.querySelector('[data-testid="import-file-error"]')).not.toBeNull();
    });
    expect(document.querySelector('[data-testid="import-file-error"]')!.textContent).toContain('JSON');
    expect(useSettingsStore.getState().draft).toBe(before); // כלום לא נטען בשקט
  });

  it('מפתח לא מוכר וערך לא חוקי — הדחיות מוצגות עם קוד+path; הזר נשמר ב"לא מופו"', async () => {
    renderUi(<SettingsPanel />);
    await importFile({ 'stray-key': 'x', 'dim-h2-btm-h': '-2em' });
    const summary = document.querySelector('[data-testid="import-summary"]')!;
    expect(summary.textContent).toContain('0 מפתחות');
    expect(summary.textContent).toContain('2 נדחו');
    const codes = [...document.querySelectorAll('[data-issue-code]')].map((el) => el.getAttribute('data-issue-code'));
    expect(codes).toContain('errors.settings.UNKNOWN_KEY');
    expect(codes).toContain('errors.settings.NEGATIVE_DIMENSION');
    const issueEl = document.querySelector('[data-issue-code="errors.settings.UNKNOWN_KEY"]')!;
    expect(issueEl.getAttribute('data-issue-path')).toContain('stray-key'); // הסבר מדויק — עם path
    expect(document.querySelector('[data-testid="unmapped-legacy"]')!.textContent).toContain('stray-key');
    expect(useSettingsStore.getState().draft['dim-h2-btm-h']).toBeUndefined();
  });

  it('קובץ בגרסה עתידית (v2) — MIGRATION_FAILED מדויק, כלום לא נטען', async () => {
    renderUi(<SettingsPanel />);
    await importFile({ $format: 'tora-settings', schemaVersion: 2, values: { 'auto-dh': false } });
    const summary = document.querySelector('[data-testid="import-summary"]')!;
    expect(summary.textContent).toContain('נטענו 0 מפתחות');
    expect(summary.textContent).toContain('1 נדחו');
    const codes = [...document.querySelectorAll('[data-issue-code]')].map((el) => el.getAttribute('data-issue-code'));
    expect(codes).toContain('errors.settings.MIGRATION_FAILED');
    expect(useSettingsStore.getState().draft['auto-dh']).toBeUndefined();
  });

  it('ייצוא — Blob עם מעטפת tora-settings מהמצב האפקטיבי', async () => {
    renderUi(<SettingsPanel />);
    useSettingsStore.getState().setDraftValue('auto-dh', true);
    useSettingsStore.getState().applyDraft();
    const exportBtn = await waitFor(() => {
      const btn = document.querySelector('[data-testid="export-settings"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      return btn;
    });
    fireEvent.click(exportBtn);
    expect(createdBlobs).toHaveLength(1);
    const parsed = JSON.parse(await readBlob(createdBlobs[0]!)) as {
      $format: string; schemaVersion: number; values: Record<string, unknown>;
    };
    expect(parsed.$format).toBe('tora-settings');
    expect(parsed.schemaVersion).toBe(1);
    expect(Object.keys(parsed.values)).toHaveLength(257); // תמונת מצב מלאה מה-effective
    expect(parsed.values['auto-dh']).toBe(true); // העריכה של ה-draft כלולה
  });

  it('שמירת תבנית — נכנסת לרשימה; טעינה מחליפה את ה-draft; מחיקה מסירה', async () => {
    renderUi(<SettingsPanel />);
    useSettingsStore.getState().setDraftValue('auto-dh', true);
    fireEvent.change(document.querySelector('[data-testid="preset-name"]')!, { target: { value: 'תבנית בדיקה' } });
    fireEvent.click(document.querySelector('[data-testid="preset-save"]')!);
    await waitFor(() => {
      expect(document.querySelector('[data-testid="preset-select"]')).not.toBeNull();
    });
    expect(useSettingsStore.getState().presets['תבנית בדיקה']).toBeDefined();

    // שינוי אחרי השמירה — הטעינה מחזירה את המצב השמור (מחליף, לא ממזג)
    useSettingsStore.getState().setDraftValue('auto-dh', false);
    useSettingsStore.getState().setDraftValue('avoid-orphans', false);
    fireEvent.change(document.querySelector('[data-testid="preset-select"]')!, { target: { value: 'תבנית בדיקה' } });
    fireEvent.click(document.querySelector('[data-testid="preset-load"]')!);
    const loaded = useSettingsStore.getState();
    expect(loaded.draft['auto-dh']).toBe(true);
    expect(loaded.draft['avoid-orphans']).toBeUndefined();
    expect(loaded.effective?.values['auto-dh']).toBe(true); // §13.3 — effective עדכני אחרי טעינה

    fireEvent.change(document.querySelector('[data-testid="preset-select"]')!, { target: { value: 'תבנית בדיקה' } });
    fireEvent.click(document.querySelector('[data-testid="preset-delete"]')!);
    await waitFor(() => {
      expect(useSettingsStore.getState().presets['תבנית בדיקה']).toBeUndefined();
    });
  });

  it('שם ריק או קיים — השמירה נדחית עם רמז, הרשימה אינה משתנה', () => {
    renderUi(<SettingsPanel />);
    useSettingsStore.getState().setDraftValue('auto-dh', true);
    // ריק
    fireEvent.click(document.querySelector('[data-testid="preset-save"]')!);
    expect(document.querySelector('[data-testid="preset-hint"]')).not.toBeNull();
    expect(Object.keys(useSettingsStore.getState().presets)).toHaveLength(0);
    // קיים
    fireEvent.change(document.querySelector('[data-testid="preset-name"]')!, { target: { value: 'אותו שם' } });
    fireEvent.click(document.querySelector('[data-testid="preset-save"]')!);
    expect(Object.keys(useSettingsStore.getState().presets)).toEqual(['אותו שם']);
    fireEvent.change(document.querySelector('[data-testid="preset-name"]')!, { target: { value: 'אותו שם' } });
    fireEvent.click(document.querySelector('[data-testid="preset-save"]')!);
    expect(document.querySelector('[data-testid="preset-hint"]')).not.toBeNull();
    expect(Object.keys(useSettingsStore.getState().presets)).toEqual(['אותו שם']); // לא נוצר כפיל
  });
});
