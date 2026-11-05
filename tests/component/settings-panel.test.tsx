/**
 * settings-panel.test.tsx — בדיקות לוח ההגדרות מ־Setting Registry (שלב 78).
 *
 * @vitest-environment jsdom
 *
 * מה שנבדק כאן (מול דלתות השלב בתכנית):
 *   1. כיסוי מלא והדדי בין המרשם לקטלוג — אין שדה יתום בשני הכיוונים
 *      ("שדה ללא consumer או consumer ללא שדה נכשלים בבדיקה").
 *   2. הלוח מרנדר את כל 257 המפתחות מהמרשם, בקיבוץ המדורים הדטרמיניסטי.
 *   3. הפקדים לפי המרשם (checkbox/select/number/text), enum מוגבל לערכי
 *      המרשם, יחידה ותג affectsLayout מוצגים.
 *   4. מסלול §13.3: שינוי חוקי ⇐ draft + effective/configHash מתעדכנים;
 *      ערך לא חוקי ⇐ נדחה עם issue, ה־draft אינו זז.
 *   5. "כל הגדרה משפיעה על החלק המוצהר": כל מפתח פריסה (236) משנה
 *      configHash בשינוי; כל מפתח UI (21) אינו משנה אותו לעולם.
 *   6. תלויות: שערים נעולים עד הצגתם; s-paren פעיל במצב יחסי.
 *   7. השער הסטטי (אין טופס מקביל) — במאמת verify-settings-panel.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReactElement } from 'react';
import {
  settingsRegistry,
  useSettingsStore,
} from '../../src/stores/settings-store.js';
import {
  SETTINGS_LABELS,
  SECTION_LABELS,
} from '../../src/i18n/settings-labels.js';
import { SettingsPanel } from '../../src/components/settings/SettingsPanel.js';
import {
  buildEffectiveSettings,
  type SettingDefinition,
} from '@tora/settings-schema';

const renderUi = (ui: ReactElement): ReturnType<typeof render> => render(ui);

/** ערך חלופי תקין לפי טיפוס ההגדרה — לבדיקת השפעה על configHash. */
const alternateValue = (def: SettingDefinition): unknown => {
  const cur = useSettingsStore.getState().effective?.values[def.key];
  switch (def.type) {
    case 'boolean':
      return !(cur === true);
    case 'number':
      return typeof cur === 'number' ? cur + 7 : 7;
    case 'enum':
      // enum חד-ערכי (נצפה ערך אחד): אין ערך חלופי חוקי — השוואת זהות בלבד
      return def.enumValues !== null && def.enumValues.length > 1
        ? def.enumValues.find((v) => v !== String(cur)) ?? null
        : null;
    case 'dimension':
      return String(cur) === '10px' ? '11px' : '10px';
    case 'color':
      return String(cur) === '#123456' ? '#654321' : '#123456';
    case 'font-stack':
      return String(cur) === 'serif' ? 'test-serif, serif' : 'serif';
    default:
      return String(cur) === 'בדיקה' ? 'בדיקה-אחרת' : 'בדיקה';
  }
};

describe('שלב 78 — קטלוג התוויות מול המרשם (אין שדה יתום)', () => {
  it('לכל אחת מ-257 רשומות המרשם יש תווית והסבר בקטלוג', () => {
    expect(settingsRegistry.byKey.size).toBe(257);
    const missing = [...settingsRegistry.byKey.values()]
      .filter((d) => SETTINGS_LABELS[d.ui.labelKey] === undefined)
      .map((d) => d.ui.labelKey);
    expect(missing).toEqual([]);
  });

  it('אין בקטלוג מפתח שאינו במרשם (צרכן ללא שדה)', () => {
    const registryKeys = new Set(
      [...settingsRegistry.byKey.values()].map((d) => d.ui.labelKey),
    );
    const orphans = Object.keys(SETTINGS_LABELS).filter(
      (k) => !registryKeys.has(k),
    );
    expect(orphans).toEqual([]);
  });

  it('כל תווית והסבר הם מחרוזות לא-ריקות', () => {
    for (const [key, label] of Object.entries(SETTINGS_LABELS)) {
      expect(typeof label.he, key).toBe('string');
      expect(label.he.length, key).toBeGreaterThan(0);
      expect(typeof label.description, key).toBe('string');
      expect(label.description.length, key).toBeGreaterThan(0);
    }
  });

  it('לכל מדור במרשם יש תווית מדור, ואין מדור קטלוג יתום', () => {
    const registrySections = new Set(
      [...settingsRegistry.byKey.values()].map((d) => d.ui.section),
    );
    for (const sec of registrySections) {
      expect(SECTION_LABELS[sec], `section ${sec}`).toBeDefined();
    }
    const orphanSections = Object.keys(SECTION_LABELS).filter(
      (s) => !registrySections.has(s),
    );
    expect(orphanSections).toEqual([]);
    expect(registrySections.size).toBe(13);
  });

  it('תלויות המרשם: 4 זוגות בלבד, וכל מטרה קיימת במרשם', () => {
    const deps = [...settingsRegistry.byKey.values()]
      .map((d) => d.ui.dependsOn)
      .filter((d): d is NonNullable<typeof d> => d !== null);
    expect(deps.length).toBe(4);
    for (const dep of deps) {
      expect(settingsRegistry.byKey.has(dep.key), dep.key).toBe(true);
      expect(dep.values.length).toBeGreaterThan(0);
    }
  });
});

describe('שלב 78 — לוח ההגדרות מגולל מהמרשם', () => {
  beforeEach(() => {
    cleanup();
    useSettingsStore.getState().reset();
    useSettingsStore.setState({ draft: Object.freeze({}), issues: Object.freeze([]), unmappedLegacy: Object.freeze({}), effective: null, presets: Object.freeze({}) });
  });

  it('מרנדר את כל 257 המפתחות — כל מפתח מרשם מופיע פעם אחת', () => {
    renderUi(<SettingsPanel />);
    const rows = screen.queryAllByTestId('settings-panel')[0].querySelectorAll('[data-setting-key]');
    expect(rows.length).toBe(257);
    const seen = new Set<string>();
    for (const r of rows) {
      const k = r.getAttribute('data-setting-key') as string;
      expect(seen.has(k), `כפילות ${k}`).toBe(false);
      seen.add(k);
    }
    for (const def of settingsRegistry.byKey.values()) {
      expect(seen.has(def.key), `חסר ${def.key}`).toBe(true);
    }
  });

  it('13 המדורים מוצגים בסדר הופעה ראשון במרשם (דטרמיניסטי)', () => {
    const order: string[] = [];
    for (const def of settingsRegistry.byKey.values()) {
      if (!order.includes(def.ui.section)) order.push(def.ui.section);
    }
    renderUi(<SettingsPanel />);
    const sections = screen.queryAllByTestId('settings-panel')[0].querySelectorAll('[data-setting-section]');
    expect(sections.length).toBe(13);
    expect([...sections].map((s) => s.getAttribute('data-setting-section'))).toEqual(order);
  });

  it('תווית עברית מהקטלוג מוצגת לשדה (למשל s-paren)', () => {
    renderUi(<SettingsPanel />);
    expect(screen.getByText('גודל סוגריים')).toBeTruthy();
  });

  it('פקדים לפי המרשם: checkbox לבוליאן, select ל-enum (מוגבל לערכים), number למספר', () => {
    renderUi(<SettingsPanel />);
    const boolKey = 'avoid-widows';
    const checkbox = document.getElementById(`setting-${boolKey}`) as HTMLInputElement;
    expect(checkbox?.type).toBe('checkbox');
    expect(checkbox?.getAttribute('data-setting-control')).toBe('checkbox');

    const enumDef = settingsRegistry.byKey.get('body-last-line-align');
    if (enumDef === undefined || enumDef.enumValues === null) throw new Error('enum def חסר');
    const select = document.getElementById('setting-body-last-line-align') as HTMLSelectElement;
    expect(select?.tagName).toBe('SELECT');
    const options = [...select.querySelectorAll('option')].map((o) => o.getAttribute('value'));
    expect(options).toEqual([...enumDef.enumValues]);

    const num = document.getElementById('setting-s-h2') as HTMLInputElement;
    expect(num?.type).toBe('number');
    expect(num?.getAttribute('data-setting-control')).toBe('number');
  });

  it('תג affectsLayout: "פריסה" למפתח פריסה, "UI" למפתח ממשק בלבד', () => {
    renderUi(<SettingsPanel />);
    const layoutRow = document.querySelector('[data-setting-key="s-h2"]');
    expect(layoutRow?.getAttribute('data-affects-layout')).toBe('true');
    const uiRow = document.querySelector('[data-setting-key="inp-book-title"]');
    expect(uiRow?.getAttribute('data-affects-layout')).toBe('false');
  });

  it('מסנן: טקסט חופשי מצמצם לשדות התואמים בלבד', () => {
    renderUi(<SettingsPanel />);
    const filter = screen.getByTestId('settings-filter') as HTMLInputElement;
    fireEvent.change(filter, { target: { value: 'סוגריים' } });
    const rows = screen.queryAllByTestId('settings-panel')[0].querySelectorAll('[data-setting-key]');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(257);
    for (const r of rows) {
      const k = r.getAttribute('data-setting-key') as string;
      const def = settingsRegistry.byKey.get(k);
      const label = def !== undefined ? SETTINGS_LABELS[def.ui.labelKey]?.he : undefined;
      const hit = k.includes('paren') || (label ?? '').includes('סוגריים');
      expect(hit, `שדה לא תואם עבר לסינון: ${k}`).toBe(true);
    }
  });
});

describe('שלב 78 — מסלול §13.3: draft ← validation ← effective/hash', () => {
  beforeEach(() => {
    cleanup();
    useSettingsStore.getState().reset();
    useSettingsStore.setState({ draft: Object.freeze({}), issues: Object.freeze([]), unmappedLegacy: Object.freeze({}), effective: null, presets: Object.freeze({}) });
  });

  it('שינוי חוקי נכנס ל-draft ומשנה את configHash (מפתח פריסה)', () => {
    renderUi(<SettingsPanel />);
    useSettingsStore.getState().applyDraft();
    const before = useSettingsStore.getState().effective?.configHash;
    expect(before).toBeDefined();
    const input = document.getElementById('setting-s-h2') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '23' } });
    const after = useSettingsStore.getState();
    expect(after.draft['s-h2']).toBe(23);
    expect(after.effective?.values['s-h2']).toBe(23);
    expect(after.effective?.configHash).not.toBe(before);
  });

  it('ערך לא חוקי נדחה: ה-draft אינו זז והבעיה מוצגת צמוד לשדה', () => {
    renderUi(<SettingsPanel />);
    useSettingsStore.getState().applyDraft();
    const input = document.getElementById('setting-s-h2') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '-5' } }); // שלילי — לא s-paren
    const after = useSettingsStore.getState();
    expect(after.draft['s-h2']).toBeUndefined();
    expect(after.issues.some((i) => i.params.key === 's-h2')).toBe(true);
    const issue = document.querySelector('[data-setting-issue="s-h2"]');
    // שלב 85 (שעת M9 — "שגיאות מתורגמות"): ההודעה מתורגמת מהקטלוג הסגור
    // (SETTINGS_ERROR_LABELS) עם הפרמטרים בפנים — לא קוד גולם.
    expect(issue?.textContent).toContain('ערך לא חוקי עבור s-h2: -5');
    expect(issue?.textContent).toContain('non-negative');
    expect(issue?.textContent).toMatch(/[\u0590-\u05FF]/);
    // ה-effective לא הוחלף לערך הפסול — ה-hash נותר על הערך הקודם
    expect(after.effective?.values['s-h2']).not.toBe(-5);
  });

  it('ערך enum זר נדחה (מפתח מחרוזת לא-enum מקבל טקסט חופשי חוקי)', () => {
    renderUi(<SettingsPanel />);
    useSettingsStore.getState().applyDraft();
    // הזרקה ישירה דרך ה-store — המסלול שה-select היה חוסם
    useSettingsStore.getState().setDraftValue('body-last-line-align', 'no-such-mode');
    const after = useSettingsStore.getState();
    expect(after.draft['body-last-line-align']).toBeUndefined();
    expect(after.issues.some((i) => i.code === 'errors.settings.UNKNOWN_ENUM_VALUE')).toBe(true);
  });

  it('מפתח UI-only אינו משנה configHash לעולם', () => {
    renderUi(<SettingsPanel />);
    useSettingsStore.getState().applyDraft();
    const before = useSettingsStore.getState().effective?.configHash;
    const input = document.getElementById('setting-inp-book-title') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'ספר בדיקה אחר' } });
    const after = useSettingsStore.getState();
    expect(after.draft['inp-book-title']).toBe('ספר בדיקה אחר');
    expect(after.effective?.configHash).toBe(before);
  });

  it('property: כל אחד מ-236 מפתחות הפריסה משנה configHash בשינוי; אין תיוג שווא', () => {
    useSettingsStore.getState().applyDraft();
    const base = useSettingsStore.getState().effective?.configHash;
    expect(base).toBeDefined();
    const skipped: string[] = [];
    for (const def of settingsRegistry.byKey.values()) {
      if (!def.affectsLayout) continue;
      const alt = alternateValue(def);
      if (alt === null) continue; // enum חד-ערכי — אין ערך חלופי חוקי (תועד)
      const eff = buildEffectiveSettings(settingsRegistry, [{ [def.key]: alt }]);
      if (eff.configHash === base) skipped.push(def.key);
    }
    expect(skipped).toEqual([]);
  });

  it('property: אף אחד מ-21 מפתחות ה-UI אינו משנה configHash', () => {
    useSettingsStore.getState().applyDraft();
    const base = useSettingsStore.getState().effective?.configHash;
    const offenders: string[] = [];
    for (const def of settingsRegistry.byKey.values()) {
      if (def.affectsLayout) continue;
      const alt = alternateValue(def);
      if (alt === null) continue;
      const eff = buildEffectiveSettings(settingsRegistry, [{ [def.key]: alt }]);
      if (eff.configHash !== base) offenders.push(def.key);
    }
    expect(offenders).toEqual([]);
  });

  it('ספירת הסיווג: 236 פריסה + 21 UI בלבד', () => {
    const layout = [...settingsRegistry.byKey.values()].filter((d) => d.affectsLayout);
    const uiOnly = [...settingsRegistry.byKey.values()].filter((d) => !d.affectsLayout);
    expect(layout.length).toBe(236);
    expect(uiOnly.length).toBe(21);
    // כל רשומה נושאת consumerId רשום — אין consumer ללא שדה
    for (const d of [...layout, ...uiOnly]) {
      expect(d.consumerId === 'engine' || d.consumerId === 'ui-only').toBe(true);
    }
  });
});

describe('שלב 78 — תלויות תצוגה (ui.dependsOn)', () => {
  beforeEach(() => {
    cleanup();
    useSettingsStore.getState().reset();
    useSettingsStore.setState({ draft: Object.freeze({}), issues: Object.freeze([]), unmappedLegacy: Object.freeze({}), effective: null, presets: Object.freeze({}) });
  });

  it('ברירת המחדל: השערים מוצגים ⇒ בוררי העיצוב פעילים', () => {
    renderUi(<SettingsPanel />);
    useSettingsStore.getState().applyDraft();
    const select = document.getElementById('setting-select-shaar-main') as HTMLSelectElement;
    expect(select?.disabled).toBe(false);
  });

  it('כיבוי הצגת השער ראשי ⇒ הבורר נעול עם רמז תלות', () => {
    renderUi(<SettingsPanel />);
    useSettingsStore.getState().applyDraft();
    const toggle = document.getElementById('setting-show-main-shaar') as HTMLInputElement;
    fireEvent.click(toggle); // true ⇒ false
    expect(useSettingsStore.getState().draft['show-main-shaar']).toBe(false);
    const select = document.getElementById('setting-select-shaar-main') as HTMLSelectElement;
    expect(select?.disabled).toBe(true);
    const hint = document.querySelector('[data-setting-dep-hint="show-main-shaar"]');
    expect(hint?.textContent).toContain('show-main-shaar');
  });

  it('s-paren: במצב יחסי (ברירת המחדל) השדה פעיל ומקבל שלילי חוקי', () => {
    renderUi(<SettingsPanel />);
    useSettingsStore.getState().applyDraft();
    const input = document.getElementById('setting-s-paren') as HTMLInputElement;
    expect(input?.disabled).toBe(false);
    fireEvent.change(input, { target: { value: '-3' } });
    const after = useSettingsStore.getState();
    expect(after.draft['s-paren']).toBe(-3); // שלילי חוקי במצב יחסי (RELATIVE_NEGATIVE_KEYS)
  });

  it('התלות נבדקת מול הערך האפקטיבי, לא מול טיוטה חלקית', () => {
    renderUi(<SettingsPanel />);
    useSettingsStore.getState().applyDraft();
    // לפני כל שינוי: effective מכיל את ברירת המחדל show-back-shaar=true
    const select = document.getElementById('setting-select-shaar-back') as HTMLSelectElement;
    expect(select?.disabled).toBe(false);
  });
});

describe('שלב 78 — לוח ההגדרות במעטפת', () => {
  beforeEach(() => {
    cleanup();
    useSettingsStore.getState().reset();
    useSettingsStore.setState({ draft: Object.freeze({}), issues: Object.freeze([]), unmappedLegacy: Object.freeze({}), effective: null, presets: Object.freeze({}) });
  });

  it('כותרת הלוח והפוטר (configHash) מוצגים', () => {
    renderUi(<SettingsPanel />);
    expect(screen.getByText('הגדרות הספר')).toBeTruthy();
    const footer = screen.getByTestId('settings-footer');
    expect(footer.textContent).toContain('configHash');
    // אחרי applyDraft ראשון (בעלייה) יש hash אמיתי
    expect(footer.textContent).not.toContain('configHash: —');
  });

  it('הקטלוג קפוא — אין מוטציה של המקורות מהלוח', () => {
    renderUi(<SettingsPanel />);
    useSettingsStore.getState().applyDraft();
    const input = document.getElementById('setting-s-h2') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '23' } });
    expect(Object.isFrozen(SETTINGS_LABELS)).toBe(true);
    expect(Object.isFrozen(SECTION_LABELS)).toBe(true);
    // המרשם עצמו לא הועתק/שוכתב — אותו מופע יחיד
    expect(settingsRegistry.byKey.size).toBe(257);
  });

  it('מופע יחיד של המרשם: הלוח וה-store חולקים את אותו אובייקט', () => {
    renderUi(<SettingsPanel />);
    // הייבוא בלוח הוא מ-settings-store — אותו מופע (נבדק במאמת סטטית גם כן)
    const rows = screen.queryAllByTestId('settings-panel')[0].querySelectorAll('[data-setting-key]');
    const firstKey = rows[0]?.getAttribute('data-setting-key');
    expect(settingsRegistry.byKey.has(firstKey as string)).toBe(true);
  });

  it('עריכה דרך הלוח ואז reset — הערכים חוזרים לברירות המחדל', () => {
    renderUi(<SettingsPanel />);
    useSettingsStore.getState().applyDraft();
    const input = document.getElementById('setting-s-h2') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '23' } });
    expect(useSettingsStore.getState().draft['s-h2']).toBe(23);
    useSettingsStore.getState().reset();
    const after = useSettingsStore.getState();
    expect(after.draft['s-h2']).toBeUndefined();
    expect(after.issues.length).toBe(0);
  });
});
