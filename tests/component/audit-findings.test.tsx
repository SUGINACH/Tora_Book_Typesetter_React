// @vitest-environment jsdom
/**
 * audit-findings.test.tsx — בדיקות פאנל ממצאי ה-Audit והניווט אליהם (שלב 82;
 * אפיון §13–14, תכנית שלב 82: "הצגת ממצאי Audit וניווט אליהם").
 *
 * מה נבדק כאן מול דלתות השלב:
 *   1. הפאנל אינו מוצג ללא ממצאים; עם ממצאים — ספירות (כולל ולפי
 *      חומרה) ותוויות מתורגמות עם פרמטרים (§16 — אין message גולם).
 *   2. סדר חומרה HIGH ← MEDIUM ← LOW, יציב בתוך חומרה.
 *   3. סינון — חומרה וקוד; הסינון תצוגתי בלבד (אינו משנה את הממצאים).
 *   4. ניווט — ממצא עם span בוחר את הטווח בעורך האמיתי (setSelectionRange);
 *      pageId נוסף בוחר את העמוד; ממצא עם pageId בלבד ← מוקד פריסה.
 *   5. טריות (שלב 81) — עריכה אחרי ריצה: סמן "אינם עדכניים" והניווט מושהה
 *      (היסטים זרים — אין מיפוי מטעה).
 *   6. שעת השלב — אין אפשרות למחוק ממצא: אין פקד הסרה; קוד לא מוכר
 *      מוצג כהוא (הגנת עומק; הכיסוי הסגור נאכף במאמת).
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import type { LayoutDocument, RunManifest } from '@tora/layout-api';
import { useEditorStore } from '../../src/stores/editor-store.js';
import { useResultStore } from '../../src/stores/result-store.js';
import { useViewStore } from '../../src/stores/view-store.js';
import type { ResultFinding } from '../../src/stores/result-store.js';
import { AuditFindings } from '../../src/components/audit/AuditFindings.js';
import { TextEditor } from '../../src/components/editor/TextEditor.js';
import { AUDIT_LABELS } from '../../src/i18n/audit-labels.js';

const resetAll = (): void => {
  useEditorStore.getState().reset();
  useResultStore.getState().reset();
  useViewStore.getState().reset();
};

beforeEach(resetAll);
afterEach(() => {
  cleanup();
  resetAll();
});

const SOURCE = 'שם הספר - ספר הבדיקות\nנושא - ממצאים\n\nכותרת 1 מספר 1 - פרק ראשון\nפסקה ראשונה.\nפסקה שנייה עם הערה [הערה].\n';

const makeIr = (): LayoutDocument =>
  ({
    schemaVersion: 1,
    policyId: 'torah-v1',
    pages: [{ id: 'p-1', physicalIndex: 1, parity: 'recto', kind: 'body', size: { width: 1 as never, height: 1 as never }, regions: [], items: [{ itemId: 'i-1' }] as never[] }],
    anchors: [],
    transformations: [],
  }) as unknown as LayoutDocument;

const makeManifest = (): RunManifest =>
  ({
    schemaVersion: 1,
    engineVersion: 'test',
    codeSha: 'dev',
    engine: 'next',
    inputHash: 'a'.repeat(64),
    configHash: 'b'.repeat(64),
    fontsManifestSha256: 'c'.repeat(64),
    assetsManifestSha256: 'd'.repeat(64),
    environmentHash: 'test-env',
    layoutHash: 'e'.repeat(64),
  }) as unknown as RunManifest;

const span = (start: number, end: number) => ({ documentId: 'doc', stream: 'body' as const, startUtf16: start, endUtf16: end });

const finding = (over: Partial<ResultFinding> & Pick<ResultFinding, 'code' | 'severity'>): ResultFinding => ({
  messageKey: over.code,
  params: {},
  sourceSpans: [],
  ...over,
});

/** הזרקת תוצאה טריה: העורך נכתב ראשון (revision R) והתוצאה נועלת אותו. */
const setResult = (findings: readonly ResultFinding[], stale = false): void => {
  const revision = useEditorStore.getState().revision;
  useResultStore.getState().setResult({ ir: makeIr(), manifest: makeManifest(), findings, sourceRevision: revision }, 'f'.repeat(64));
  if (stale) useEditorStore.getState().setText(useEditorStore.getState().rawText + 'עריכה מאוחרת');
};

const FINDINGS: readonly ResultFinding[] = [
  finding({ code: 'audit.text.ORPHAN_NOTE', severity: 'MEDIUM', params: { noteId: 'fn-7', kind: 'שוליים' }, sourceSpans: [span(78, 85)] }),
  finding({ code: 'audit.layout.ATOM_MISSING', severity: 'HIGH', params: { atomId: 'atom:v1|doc|body|10+20|t|0' }, sourceSpans: [span(10, 20)], pageId: 'p-1' }),
  finding({ code: 'audit.links.LINK_PAGE_MISMATCH', severity: 'MEDIUM', params: { linkId: 'lnk-1', target: 'a-1' }, pageId: 'p-2', actual: 3, expected: 5 }),
  finding({ code: 'audit.text.HTML_IN_ATOMS', severity: 'LOW', params: { excerpt: '<b>' }, sourceSpans: [span(40, 43)] }),
];

describe('שלב 82 — פאנל ממצאי Audit וניווט', () => {
  test('ללא ממצאים הפאנל אינו מוצג; אין תוכן סמוי', () => {
    useEditorStore.getState().setText(SOURCE);
    setResult([]);
    const { container } = render(createElement(AuditFindings));
    expect(container.querySelector('[data-testid="audit-findings"]')).toBeNull();
  });

  test('ממצאים — כותרת, ספירה כוללת וספירה לפי חומרה', () => {
    useEditorStore.getState().setText(SOURCE);
    setResult(FINDINGS);
    const { container } = render(createElement(AuditFindings));
    expect(container.querySelector('[data-testid="audit-findings"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="audit-counts"]')?.textContent).toContain('4');
    expect(container.querySelector('[data-testid="audit-counts-severity"]')?.textContent).toContain('חמור 1');
    expect(container.querySelector('[data-testid="audit-counts-severity"]')?.textContent).toContain('בינוני 2');
    expect(container.querySelector('[data-testid="audit-counts-severity"]')?.textContent).toContain('קל 1');
  });

  test('סדר תצוגה לפי חומרה HIGH ← MEDIUM ← LOW; יציב בתוך חומרה', () => {
    useEditorStore.getState().setText(SOURCE);
    setResult(FINDINGS);
    const { container } = render(createElement(AuditFindings));
    const rows = [...container.querySelectorAll('[data-testid^="audit-row-"]')];
    expect(rows).toHaveLength(4);
    expect(rows[0]?.textContent).toContain('ATOM_MISSING'); // HIGH ראשון
    expect(rows[1]?.textContent).toContain('ORPHAN_NOTE'); // MEDIUM ראשון בסדר ה־IR
    expect(rows[2]?.textContent).toContain('LINK_PAGE_MISMATCH');
    expect(rows[3]?.textContent).toContain('HTML_IN_ATOMS'); // LOW אחרון
  });

  test('תווית מתורגמת עם פרמטרים — {noteId} מוחלף; הקוד הקטלוגי מוצג', () => {
    useEditorStore.getState().setText(SOURCE);
    setResult(FINDINGS);
    const { container } = render(createElement(AuditFindings));
    const row = container.querySelector('[data-testid="audit-row-0"]');
    expect(row?.textContent).toContain('אטום מהמסמך לא הוצב בפריסה');
    expect(row?.textContent).toContain('atom:v1|doc|body|10+20|t|0'); // הפרמטר הוצב בתווית
    expect(row?.textContent).toContain('audit.layout.ATOM_MISSING'); // הקוד עצמו
    expect(row?.textContent).not.toContain('{atomId}'); // אין מקום פרמטר לא מוחלף
  });

  test('כיסוי הקטלוג — כל קודי הבדיקה קיימים בקטלוג התוויות', () => {
    for (const f of FINDINGS) {
      expect(AUDIT_LABELS[f.code]).toBeDefined();
    }
  });

  test('actual/expected מוצגים כשהממצא נושא אותם', () => {
    useEditorStore.getState().setText(SOURCE);
    setResult(FINDINGS);
    const { container } = render(createElement(AuditFindings));
    const values = container.querySelector('[data-testid="audit-values-2"]');
    expect(values).not.toBeNull();
    expect(values?.textContent).toContain('3');
    expect(values?.textContent).toContain('5');
    // שורה בלי actual/expected — אין אלמנט ערכים
    expect(container.querySelector('[data-testid="audit-values-0"]')).toBeNull();
  });

  test('מיקום — שורת המקור מחושבת מההיסף; עמוד מוצג כשקיים', () => {
    useEditorStore.getState().setText(SOURCE);
    setResult(FINDINGS);
    const { container } = render(createElement(AuditFindings));
    // השורה הצפויה מחושבת מהמקור עצמו (אמת המידה — הפיצול על \n בלבד, כמו הפרסר)
    const lineOf = (offset: number): number => SOURCE.slice(0, offset).split('\n').length;
    expect(container.querySelector('[data-testid="audit-row-0"]')?.textContent).toContain(`שורה ${lineOf(10)}`);
    expect(container.querySelector('[data-testid="audit-row-0"]')?.textContent).toContain('p-1');
    // LINK_PAGE_MISMATCH: בלי spans, עם pageId — עמוד בלבד
    expect(container.querySelector('[data-testid="audit-row-2"]')?.textContent).toContain('p-2');
    expect(container.querySelector('[data-testid="audit-row-2"]')?.textContent).not.toContain('שורה');
    // ORPHAN_NOTE — span על שורה מאוחרת יותר במסמך (לא הראשונה)
    const orphanLine = lineOf(78);
    expect(orphanLine).toBeGreaterThan(1);
    expect(container.querySelector('[data-testid="audit-row-1"]')?.textContent).toContain(`שורה ${orphanLine}`);
  });

  test('סינון חומרה — רק החומרה שנבחרה; aria-pressed מתעדכן', () => {
    useEditorStore.getState().setText(SOURCE);
    setResult(FINDINGS);
    const { container } = render(createElement(AuditFindings));
    const high = container.querySelector('[data-testid="audit-filter-high"]') as HTMLButtonElement;
    expect(high.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(high);
    const rows = [...container.querySelectorAll('[data-testid^="audit-row-"]')];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('ATOM_MISSING');
    expect(high.getAttribute('aria-pressed')).toBe('true');
  });

  test('סינון קוד — תת־מחרוזת לא תלוית־רישיות; הממצאים ב-store לא השתנו', () => {
    useEditorStore.getState().setText(SOURCE);
    setResult(FINDINGS);
    const { container } = render(createElement(AuditFindings));
    fireEvent.change(container.querySelector('[data-testid="audit-filter-code"]') as HTMLInputElement, { target: { value: 'AUDIT.LAYOUT' } });
    const rows = [...container.querySelectorAll('[data-testid^="audit-row-"]')];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('ATOM_MISSING');
    // הסינון תצוגתי בלבד — הרשימה ב-store שלמה
    expect(useResultStore.getState().findings).toHaveLength(4);
  });

  test('סינון ללא תוצאות — הודעה מפורשת', () => {
    useEditorStore.getState().setText(SOURCE);
    setResult(FINDINGS);
    const { container } = render(createElement(AuditFindings));
    fireEvent.change(container.querySelector('[data-testid="audit-filter-code"]') as HTMLInputElement, { target: { value: 'zzz' } });
    expect(container.querySelector('[data-testid="audit-empty-filtered"]')).not.toBeNull();
  });

  test('קליק על ממצא עם span — העורך האמיתי בוחר בדיוק את הטווח; מוקד מקור', () => {
    useEditorStore.getState().setText(SOURCE);
    setResult(FINDINGS);
    const { container } = render(createElement('div', null, createElement(AuditFindings), createElement(TextEditor)));
    const row = container.querySelector('[data-testid="audit-row-0"]') as HTMLButtonElement; // ATOM_MISSING span 10..20
    fireEvent.click(row);
    const editor = container.querySelector('[data-testid="source-editor"]') as HTMLTextAreaElement;
    expect(editor.selectionStart).toBe(10);
    expect(editor.selectionEnd).toBe(20);
    const focus = useViewStore.getState().focus;
    expect(focus?.pane).toBe('source');
    expect(focus?.sourceSpan).toEqual({ startUtf16: 10, endUtf16: 20 });
    // pageId נוסף — העמוד נבחר גם הוא (הקשר בפריסה)
    expect(useViewStore.getState().selectedPageId).toBe('p-1');
  });

  test('קליק על ממצא עם pageId בלבד — מוקד פריסה ובחירת עמוד; שום בחירה בעורך', () => {
    useEditorStore.getState().setText(SOURCE);
    setResult(FINDINGS);
    const { container } = render(createElement('div', null, createElement(AuditFindings), createElement(TextEditor)));
    const row = container.querySelector('[data-testid="audit-row-2"]') as HTMLButtonElement; // LINK_PAGE_MISMATCH pageId p-2
    fireEvent.click(row);
    const focus = useViewStore.getState().focus;
    expect(focus?.pane).toBe('layout');
    expect(focus?.pageId).toBe('p-2');
    expect(useViewStore.getState().selectedPageId).toBe('p-2');
    const editor = container.querySelector('[data-testid="source-editor"]') as HTMLTextAreaElement;
    expect(editor.selectionStart).toBe(editor.selectionEnd); // אין טווח — אין בחירה
  });

  test('טריות — עריכה אחרי ריצה: סמן מוצג, הניווט מושהה (disabled) והמוקד לא זז', () => {
    useEditorStore.getState().setText(SOURCE);
    setResult(FINDINGS, true); // עריכה אחרי הריצה ⇐ לא טרי
    const { container } = render(createElement('div', null, createElement(AuditFindings), createElement(TextEditor)));
    expect(container.querySelector('[data-testid="audit-stale"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="audit-stale"]')?.textContent).toContain('אינם עדכניים');
    const row = container.querySelector('[data-testid="audit-row-0"]') as HTMLButtonElement;
    expect(row.disabled).toBe(true);
    fireEvent.click(row); // jsdom לא יורה onClick של disabled — המוקד ממילא לא זז
    expect(useViewStore.getState().focus).toBeNull();
    expect(useViewStore.getState().selectedPageId).toBeNull();
  });

  test('ריצה חדשה אחרי עריכה — הסמן יורד והניווט חוזר', () => {
    useEditorStore.getState().setText(SOURCE);
    setResult(FINDINGS, true);
    setResult(FINDINGS); // ריצה חדשה על המהדורה הנוכחית
    const { container } = render(createElement('div', null, createElement(AuditFindings), createElement(TextEditor)));
    expect(container.querySelector('[data-testid="audit-stale"]')).toBeNull();
    const row = container.querySelector('[data-testid="audit-row-0"]') as HTMLButtonElement;
    expect(row.disabled).toBe(false);
    fireEvent.click(row);
    expect(useViewStore.getState().focus?.pane).toBe('source');
  });

  test('שעת השלב — אין פקד הסרה/השתקה; הסינון אינו מוחק ממצאים', () => {
    useEditorStore.getState().setText(SOURCE);
    setResult(FINDINGS);
    const { container } = render(createElement(AuditFindings));
    const dismissish = container.querySelector('[data-testid*="dismiss"], [data-testid*="ignore"], [data-testid*="remove"], [data-testid*="resolve"]');
    expect(dismissish).toBeNull();
    // סינון לחומרה אחת ואז חזרה ל"הכול" — כל 4 הממצאים חוזרים (לא נמחקו)
    fireEvent.click(container.querySelector('[data-testid="audit-filter-low"]') as HTMLButtonElement);
    fireEvent.click(container.querySelector('[data-testid="audit-filter-all"]') as HTMLButtonElement);
    expect([...container.querySelectorAll('[data-testid^="audit-row-"]')]).toHaveLength(4);
  });

  test('קוד לא מוכר — הקוד עצמו מוצג (הגנת עומק), לא message גולם ולא קריסה', () => {
    useEditorStore.getState().setText(SOURCE);
    setResult([finding({ code: 'audit.text.NOT_IN_CATALOG', severity: 'HIGH' })]);
    const { container } = render(createElement(AuditFindings));
    const row = container.querySelector('[data-testid="audit-row-0"]');
    expect(row?.textContent).toContain('audit.text.NOT_IN_CATALOG');
  });

  test('הממצאים קפואים — הפאנל לא משנה את הרשימה ב-store', () => {
    useEditorStore.getState().setText(SOURCE);
    setResult(FINDINGS);
    render(createElement(AuditFindings));
    const list = useResultStore.getState().findings;
    expect(Object.isFrozen(list)).toBe(true);
    expect(list).toHaveLength(4);
  });
});
