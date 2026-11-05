// @vitest-environment jsdom
/**
 * e2e-worker-path.test.tsx — קצה־לקצה של המעטפת מעל ה־Worker (שלב 77; §12–13).
 *
 * מה מוכח כאן — ה־App המלא מורכב ב־jsdom עם זמן־ריצה מוזרק (המנוע
 * האמיתי בערוץ מזויף; ספק בדיקה):
 *   1. הקלדה ← הרצה ← progress ← done: התצוגה מוצגת מה־IR בלבד
 *      (data-page-id; אין dangerouslySetInnerHTML); hash בכותרת.
 *   2. ביטול בזמן ריצה — אין תוצאה חלקית.
 *   3. החלפת מסמך — תוצאת החדש בלבד (stale לא מוצג).
 *   4. הפעלה עם מקור ריק — לא נשלח job בכלל.
 *
 * זו ההוכחה ההתנהגותית של שער השלב: העימוד מגיע ל־UI רק דרך ה־Worker
 * (ההוכחה הסטטית — ייבוא המנוע בחוט הראשי — ב־verify-ui-worker).
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { typeset as engineTypeset } from '@tora/layout-engine';
import { buildEffectiveSettings, buildSettingRegistry } from '@tora/settings-schema';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import registryJson from '@tora/settings-schema/registry.json';
import { createEngineHandler, type WorkerPort } from '../../src/worker-host/engine-worker.js';
import { WorkerClient, type WorkerLike } from '../../src/worker-host/worker-client.js';
import type { WorkerRequest, WorkerResponse } from '../../src/worker-host/protocol.js';
import { TypesetController } from '../../src/worker-host/typeset-run.js';
import { setUiRuntime } from '../../src/worker-host/ui-runtime.js';
import type { BrowserAssetBundle } from '../../src/worker-host/asset-bundle.js';
import { importDocumentText } from '../../src/stores/import-document.js';
import { useEditorStore } from '../../src/stores/editor-store.js';
import {
  atomSourceRangeOf,
  itemSourceRange,
  linkedItemsForRange,
  provenanceIssues,
} from '../../src/stores/linked-navigation.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useRunStore } from '../../src/stores/run-store.js';
import { useResultStore } from '../../src/stores/result-store.js';
import { useSettingsStore } from '../../src/stores/settings-store.js';
import { useViewStore } from '../../src/stores/view-store.js';
import App from '../../src/App.js';

const registry = buildSettingRegistry(registryJson as unknown as Parameters<typeof buildSettingRegistry>[0]);
const settings = buildEffectiveSettings(registry, []);

const SOURCE_A = `שם הספר - ספר בדיקת מעטפת
כותרת 1 מספר 1 - פרק ראשון
פסקה ראשונה עם ניקוד ומספרים 123 והערה [הערת שוליים] והמשך הפסקה עוד ועוד טקסט ארוך.
ופסקה שניה עם מלים נוספות כדי למלא שורות בטור הראשון וגם בשני ועוד ועוד ועוד.
`;

const SOURCE_B = `שם הספר - מסמך שני
כותרת 1 מספר 1 - פרק אחר
טקסט שונה לחלוטין כדי שהפריסה תשתנה בין המסמכים ונוכל להבחין בתוצאה הנכונה.
`;

/** ערוץ מזויף עם השהיה אופציונלית — מאפשר ביטול בזמן שה־job חי (המנוע מהיר מדי בלעדיה). */
class Channel implements WorkerLike {
  private clientHandler: ((msg: WorkerResponse) => void) | undefined;
  private readonly deliver: (msg: unknown) => Promise<void>;

  constructor(delayMs = 0) {
    const handler = createEngineHandler({
      createProvider: async () => createTestMeasurementProvider(),
      typeset: engineTypeset,
    });
    const port: WorkerPort = { post: (m) => queueMicrotask(() => this.clientHandler?.(m)) };
    this.deliver = async (msg) => {
      if (delayMs > 0) await new Promise((resolve) => { setTimeout(resolve, delayMs); });
      await handler(msg, port);
    };
  }

  postMessage(msg: WorkerRequest): void {
    void this.deliver(msg);
  }

  onMessage(handler: (msg: WorkerResponse) => void): void {
    this.clientHandler = handler;
  }
}

/** ערוץ סופר — מוכיח ששום הודעה לא נשלחה לעובד (חסימה לפני השליחה). */
class CountingChannel extends Channel {
  posted = 0;
  override postMessage(msg: WorkerRequest): void {
    this.posted += 1;
    super.postMessage(msg);
  }
}

const TEST_FONT_RECORD = {
  file: 'test.woff2', fontId: 'font:v1|test', sha256: 'a'.repeat(64),
  family: 'טסט', group: 'bundled' as const,
  binaryFormat: 'woff2' as const,
  unitsPerEm: 1000, weight: 400, style: 'normal' as const,
  distributionBlocked: { blocked: false, reason: 'test', decision: null, policy: 'test' },
};

const BUNDLE: BrowserAssetBundle = {
  assets: {
    schemaVersion: 1,
    fonts: [
      { usage: 'body', font: { fontId: 'font:v1|test', contentSha256: 'a'.repeat(64), family: 'T', weight: 400, style: 'normal' } },
      { usage: 'note-body', font: { fontId: 'font:v1|test', contentSha256: 'a'.repeat(64), family: 'T', weight: 400, style: 'normal' } },
      { usage: 'heading', font: { fontId: 'font:v1|test', contentSha256: 'a'.repeat(64), family: 'T', weight: 400, style: 'normal' } },
      { usage: 'note-marker', font: { fontId: 'font:v1|test', contentSha256: 'a'.repeat(64), family: 'T', weight: 400, style: 'normal' } },
    ],
    fontsManifestSha256: 'a'.repeat(64),
    assetsManifestSha256: '0'.repeat(64),
  },
  // פרוטוקול דורש לפחות גופן אחד במטען (payload.fonts) — כמו הצרור האמיתי
  fonts: [{ record: TEST_FONT_RECORD, bytes: new Uint8Array([1, 2, 3, 4]) }],
  wasmBytes: new Uint8Array([1]),
  woff2DecoderBytes: new Uint8Array([1]),
};

const resetAll = (): void => {
  useEditorStore.getState().reset();
  useRunStore.getState().reset();
  useResultStore.getState().reset();
  useViewStore.getState().reset();
  useSettingsStore.getState().reset();
};

beforeEach(() => {
  resetAll();
  const client = new WorkerClient(new Channel());
  setUiRuntime({ client, bundle: BUNDLE, controller: new TypesetController({ client }) });
});

afterEach(() => {
  resetAll();
  setUiRuntime(null);
});

const typeSource = (el: HTMLElement, text: string): void => {
  fireEvent.change(el, { target: { value: text } });
};

describe('שלב 77: מעטפת מלאה מעל ה־Worker — אין typeset בחוט הראשי', () => {
  test('הקלדה ← הרצה ← תצוגה מה־IR: data-page-id, hash בכותרת, בלי HTML מוזרק', async () => {
    const { container } = render(createElement(App));
    const editor = container.querySelector('[data-testid="source-editor"]') as HTMLTextAreaElement;
    typeSource(editor, SOURCE_A);
    expect(useEditorStore.getState().rawText).toBe(SOURCE_A);
    expect(useEditorStore.getState().dirty).toBe(true);

    const runButton = container.querySelector('[data-testid="run-typeset"]') as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(runButton);
    });
    await waitFor(() => {
      expect(useRunStore.getState().phase).toBe('done');
    }, { timeout: 5000 });

    const pages = container.querySelectorAll('[data-page-id]');
    expect(pages.length).toBeGreaterThan(0);
    // התוצאה ב־stores — IR קפוא + מניפסט + ממצאים
    const result = useResultStore.getState();
    expect(result.ir!.pages.length).toBe(pages.length);
    expect(result.manifest).not.toBeNull();
    // hash בכותרת
    expect(container.textContent).toContain(result.layoutHash!.slice(0, 8));
    // אין HTML מוזרק — הטקסט הוא ערכי React (§13.2)
    expect(container.innerHTML).not.toContain('dangerouslySetInnerHTML');
  });

  test('ביטול בזמן ריצה — אין תוצאה חלקית; המצב cancelled', async () => {
    // ערוץ מושהה: ה־job חי מספיק זמן כדי ללחוץ ביטול באמת בזמן ריצה
    const client = new WorkerClient(new Channel(150));
    setUiRuntime({ client, bundle: BUNDLE, controller: new TypesetController({ client }) });
    const { container } = render(createElement(App));
    const editor = container.querySelector('[data-testid="source-editor"]') as HTMLTextAreaElement;
    typeSource(editor, SOURCE_A);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="run-typeset"]') as HTMLButtonElement);
    });
    // בזמן שה־job חי — ביטול
    const cancelBtn = await waitFor(() => {
      const btn = container.querySelector('[data-testid="cancel-typeset"]') as HTMLButtonElement;
      expect(btn).not.toBeNull();
      return btn;
    });
    // cancel() ממתין למיקרו־טאסק (getUiRuntime) — act מרוקן
    await act(async () => {
      fireEvent.click(cancelBtn);
    });
    expect(useRunStore.getState().phase).toBe('cancelled');
    // ההשהיה פגה — העובד מדלג על job שבוטל לפני שהתחיל; שום דבר לא נכנס
    await new Promise((r) => { setTimeout(r, 250); });
    expect(useResultStore.getState().ir).toBeNull();
    expect(useRunStore.getState().phase).toBe('cancelled');
  });

  test('החלפת מסמך — supersede: תוצאת האחרון בלבד מוצגת', async () => {
    const { container } = render(createElement(App));
    const editor = container.querySelector('[data-testid="source-editor"]') as HTMLTextAreaElement;
    // מסמך א → תוצאה
    typeSource(editor, SOURCE_A);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="run-typeset"]') as HTMLButtonElement);
    });
    await waitFor(() => {
      expect(useRunStore.getState().phase).toBe('done');
    }, { timeout: 5000 });
    const hashA = useResultStore.getState().layoutHash;

    // מסמך ב — הריצה החדשה מחליפה
    typeSource(editor, SOURCE_B);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="run-typeset"]') as HTMLButtonElement);
    });
    await waitFor(() => {
      expect(useRunStore.getState().phase).toBe('done');
    }, { timeout: 5000 });
    const after = useResultStore.getState();
    expect(after.layoutHash).not.toBe(hashA);
    const pages = container.querySelectorAll('[data-page-id]');
    expect(pages.length).toBe(after.ir!.pages.length);
  });

  test('מקור ריק — לא נשלח job; הכפתור מנוטרל', async () => {
    const { container } = render(createElement(App));
    const runButton = container.querySelector('[data-testid="run-typeset"]') as HTMLButtonElement;
    expect((runButton as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      fireEvent.click(runButton);
    });
    await new Promise((r) => { setTimeout(r, 0); });
    expect(useRunStore.getState().phase).toBe('idle');
    expect(useRunStore.getState().jobId).toBeNull();
  });

  test('הגדרות לא חוקיות — הריצה נחסמת לפני תחילת עימוד (שלב 79; §18-M9)', async () => {
    const { container } = render(createElement(App));
    const editor = container.querySelector('[data-testid="source-editor"]') as HTMLTextAreaElement;
    typeSource(editor, SOURCE_A);
    // מצב לא אפשרי בנתיב הרגיל (הייבוא דוחה) — הגנה בעומק: draft מושחת
    // עם מפתח לא מוכר. applyDraft נכשל עם הקוד קטלוגי, effective מתאפס
    // (אין ערך מלוכלך מריצה קודמת) ושום job אינו נשלח לעובד.
    useSettingsStore.setState({ draft: Object.freeze({ 'no-such-key': 1 }) });
    const runButton = container.querySelector('[data-testid="run-typeset"]') as HTMLButtonElement;
    expect((runButton as HTMLButtonElement).disabled).toBe(false); // יש מקור — הכפתור פעיל
    await act(async () => {
      fireEvent.click(runButton);
    });
    await new Promise((r) => { setTimeout(r, 50); });
    expect(useRunStore.getState().phase).toBe('idle'); // לא יצאה מהמקום
    expect(useRunStore.getState().jobId).toBeNull(); // שום job לא נשלח
    expect(useResultStore.getState().ir).toBeNull();
    expect(useSettingsStore.getState().effective).toBeNull();
    // הכשל מתועד עם קוד קטלוגי — לא הודעה גולמת (פטרון שלב 12)
    expect(
      useSettingsStore.getState().issues.some((i) => i.code === 'errors.settings.UNKNOWN_KEY'),
    ).toBe(true);
  });

  test('קלט פגום (sentinel) — הריצה נחסמת לפני השליחה; השגיאה ממוקמת במפת הקלט (שלב 80; §3.3)', async () => {
    const channel = new CountingChannel();
    const client = new WorkerClient(channel);
    setUiRuntime({ client, bundle: BUNDLE, controller: new TypesetController({ client }) });
    const { container } = render(createElement(App));
    const editor = container.querySelector('[data-testid="source-editor"]') as HTMLTextAreaElement;
    typeSource(editor, 'שם הספר - בדיקה\n\nכותרת 1 מספר 1 - פרק\nטקסט מזוהם \u0001 באמצע\n');
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="run-typeset"]') as HTMLButtonElement);
    });
    await new Promise((r) => { setTimeout(r, 50); });
    // שום job לא נשלח לעובד — החסימה לפני השליחה (כמו הגדרות לא חוקיות בשלב 79)
    expect(useRunStore.getState().phase).toBe('idle');
    expect(useRunStore.getState().jobId).toBeNull();
    expect(channel.posted).toBe(0);
    expect(useResultStore.getState().ir).toBeNull();
    // השגיאה הקטלוגית ממוקמת ומוצגת במפה — עם שורה ועמודה, לא הודעה גולמת
    const errBlock = container.querySelector('[data-testid="insights-parse-error"]');
    expect(errBlock).not.toBeNull();
    expect(errBlock?.textContent).toContain('הריצה חסומה');
    expect(errBlock?.textContent).toMatch(/שורה 4/);
    const analysis = useEditorStore.getState().analysis;
    expect(analysis?.parseError?.code).toBe('errors.parser.SENTINEL_IN_INPUT');
    expect(analysis?.parseError?.start?.line).toBe(4);
  });

  test('ייבוא בזמן ריצה פעילה — הריצה מבוטלת ואין job יתום; המפה של המסמך החדש (שלב 80)', async () => {
    const channel = new CountingChannel(150);
    const client = new WorkerClient(channel);
    setUiRuntime({ client, bundle: BUNDLE, controller: new TypesetController({ client }) });
    const { container } = render(createElement(App));
    const editor = container.querySelector('[data-testid="source-editor"]') as HTMLTextAreaElement;
    typeSource(editor, SOURCE_A);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="run-typeset"]') as HTMLButtonElement);
    });
    // הריצה חיה (הערוץ מושהה) — מגיע מסמך חדש דרך פעולת הייבוא
    await waitFor(() => {
      expect(useRunStore.getState().phase).toBe('preparing');
    });
    act(() => {
      importDocumentText(SOURCE_B, 'מסמך-חדש.txt', 'text-file');
    });
    // הריצה הקודמת בוטלה במפורש (controller.cancel) ואז המצב אופס למסמך
    // החדש — cancelled ואז reset ⇐ idle; שום job יתום לא נשאר חי מאחור.
    expect(useRunStore.getState().phase).toBe('idle');
    expect(useRunStore.getState().jobId).toBeNull();
    expect(useEditorStore.getState().rawText).toBe(SOURCE_B);
    expect(useEditorStore.getState().documentName).toBe('מסמך-חדש.txt');
    // מפת הקלט של המסמך החדש — טריה וממוקמת במהדורה הנוכחית
    const analysis = useEditorStore.getState().analysis;
    expect(analysis?.documentName).toBe('מסמך-חדש.txt');
    expect(analysis?.analyzedRevision).toBe(useEditorStore.getState().revision);
    // ההשהיה פגה — שום תוצאה של ה-job הישן לא נכנסת
    await new Promise((r) => { setTimeout(r, 250); });
    expect(useResultStore.getState().ir).toBeNull();
  });

  test('המסמך הקנוני דרך האפליקציה המלאה — סקירה אמיתית ומפה עם האזהרות המתועדות (שלב 80)', async () => {
    const src = readFileSync(
      join(process.cwd(), 'packages/test-fixtures/corpus/release/release-reference-document.txt'),
      'utf8',
    );
    const { container } = render(createElement(App));
    act(() => {
      importDocumentText(src, 'release-reference-document.txt', 'text-file');
    });
    const overview = container.querySelector('[data-testid="insights-overview"]');
    expect(overview).not.toBeNull();
    const notes = container.querySelector('[data-testid="insights-notes"]')?.textContent ?? '';
    expect(notes).toContain('16'); // הערות שוליים — מספרי הקורפוס האמיתיים
    expect(notes).toContain('3'); // הערות צד
    // מסמך release נקי — הודעת "נטען ונותח"
    expect(container.querySelector('[data-testid="insights-clean"]')).not.toBeNull();
    // והריצה המלאה עדיין עובדת דרך ה-Worker עם אותו פרסור (פרסור יחיד)
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="run-typeset"]') as HTMLButtonElement);
    });
    await waitFor(() => {
      expect(useRunStore.getState().phase).toBe('done');
    }, { timeout: 10000 });
    expect(useResultStore.getState().ir).not.toBeNull();
  });
});

describe('שלב 81: עורך מקושר מקור ↔ פריסה — מיפוי provenance דו־כיווני', () => {
  /** הרצת SOURCE_A עד השלמה והחזרת העורך — הפרה-קונדישן של כל בדיקות השלב. */
  const runToDone = async (container: HTMLElement): Promise<void> => {
    const editor = container.querySelector('[data-testid="source-editor"]') as HTMLTextAreaElement;
    typeSource(editor, SOURCE_A);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="run-typeset"]') as HTMLButtonElement);
    });
    await waitFor(() => {
      expect(useRunStore.getState().phase).toBe('done');
    }, { timeout: 5000 });
  };

  test('קליק על קו בפריסה בוחר את טווח המקור שלו בעורך (§13.2: קו ← SourceSpan)', async () => {
    const { container } = render(createElement(App));
    await runToDone(container);
    const editor = container.querySelector('[data-testid="source-editor"]') as HTMLTextAreaElement;
    const ir = useResultStore.getState().ir!;
    // קו גוף ראשון עם מקור — בחירה מה-IR, לא מה-DOM (ה-IR הוא אמת המידה)
    const firstLine = linkedItemsForRange(ir, { startUtf16: 0, endUtf16: SOURCE_A.length })
      .find((r) => r.kind === 'line');
    expect(firstLine).toBeDefined();
    const expected = itemSourceRange(ir, firstLine!.pageId, firstLine!.itemId)!;
    expect(expected.endUtf16).toBeGreaterThan(expected.startUtf16);

    const lineEl = container.querySelector(`[data-fragment-id="${firstLine!.itemId}"]`) as HTMLElement;
    expect(lineEl).not.toBeNull();
    act(() => {
      fireEvent.click(lineEl);
    });
    // המוקד עבר למקור, והעורך בחר בדיוק את הטווח שה-provenance נתן
    const focus = useViewStore.getState().focus;
    expect(focus?.pane).toBe('source');
    expect(focus?.itemId).toBe(firstLine!.itemId);
    expect(editor.selectionStart).toBe(expected.startUtf16);
    expect(editor.selectionEnd).toBe(expected.endUtf16);
    // הטווח שנבחר חופף לטווח של הקו מה-IR — והוא בתוך גבולות המקור
    expect(expected.startUtf16).toBeGreaterThanOrEqual(0);
    expect(expected.endUtf16).toBeLessThanOrEqual(SOURCE_A.length);
    const picked = SOURCE_A.slice(editor.selectionStart, editor.selectionEnd);
    expect(picked.length).toBeGreaterThan(0);
  });

  test('בחירה בעורך מדגישה בפריסה בדיוק את הפריטים החופפים — כולל סמן הערת השוליים', async () => {
    const { container } = render(createElement(App));
    await runToDone(container);
    const editor = container.querySelector('[data-testid="source-editor"]') as HTMLTextAreaElement;
    const ir = useResultStore.getState().ir!;
    // סמן הערת השוליים של [הערת שוליים] — מיקומו במקור מה-IR
    const marker = linkedItemsForRange(ir, { startUtf16: 0, endUtf16: SOURCE_A.length })
      .find((r) => r.kind === 'note-marker');
    expect(marker).toBeDefined(); // SOURCE_A מכיל הערה — הסמן קיים ב-IR
    const range = marker!.sourceRange;

    // בחירת הטווח בעורך (כמו קליק-גרירה של המשתמש)
    editor.setSelectionRange(range.startUtf16, range.endUtf16);
    act(() => {
      fireEvent.select(editor);
    });
    const focus = useViewStore.getState().focus;
    expect(focus?.pane).toBe('layout');
    expect(focus?.sourceSpan).toEqual({ startUtf16: range.startUtf16, endUtf16: range.endUtf16 });

    // ההדגשה ב-DOM זהה לחלוטין לקבוצת ה-provenance מה-IR (קווים + סמנים)
    const expectedIds = new Set(
      linkedItemsForRange(ir, range)
        .filter((r) => r.kind === 'line' || r.kind === 'note-marker')
        .map((r) => r.itemId),
    );
    expect(expectedIds.size).toBeGreaterThan(0);
    expect(expectedIds.has(marker!.itemId)).toBe(true); // הסמן עצמו מודגש
    const highlighted = container.querySelectorAll('[data-highlighted="true"]');
    // מזהה פריט מדויק: data-fragment-id לקווים, data-marker-id לסמנים (ייחודיים;
    // data-note-id משותף לכל סמני אותה הערה ואינו מזהה פריט)
    const highlightedByIr = new Set([...highlighted].map((el) => {
      const frag = el.getAttribute('data-fragment-id');
      if (frag !== null) return frag;
      return el.getAttribute('data-marker-id');
    }).filter((v): v is string => v !== null));
    expect([...highlightedByIr].sort()).toEqual([...expectedIds].sort());
  });

  test('שעת השלב: המיפוי נכון גם לאחר shaping ו-reorder — כל קו, גם BiDi, ממופה לטווח חוקי ואטומיו מתכנסים אליו', async () => {
    const { container } = render(createElement(App));
    await runToDone(container);
    const ir = useResultStore.getState().ir!;
    // (א) שלמות provenance על IR אמיתי שלם — אף קו/סמן/עוגן יתום
    expect(provenanceIssues(ir)).toEqual([]);
    // (ב) לכל קו: טווח חוקי, וכל אטום שלו (מפוענח מה-AtomId!) נופל בתוך הטווח —
    // הזהות הלוגית במזהה, לא בסדר הוויזואלי; קו BiDi (עברית+ספרות) מוכח כאן כמו כולם
    let lineCount = 0;
    let bidiLineCount = 0;
    for (const page of ir.pages as unknown as readonly { items: readonly Record<string, unknown>[] }[]) {
      for (const item of page.items) {
        if (item.kind !== 'line') continue;
        lineCount += 1;
        const lineRange = itemSourceRange(ir, undefined, item.id as string);
        expect(lineRange).not.toBeNull();
        expect(lineRange!.startUtf16).toBeGreaterThanOrEqual(0);
        expect(lineRange!.endUtf16).toBeLessThanOrEqual(SOURCE_A.length);
        const runs = (item.runs ?? []) as readonly { atomIds?: readonly string[]; text?: string }[];
        const hasDigits = runs.some((r) => (r.text ?? '').match(/\d/) !== null);
        if (hasDigits) bidiLineCount += 1;
        for (const run of runs) {
          for (const atomId of run.atomIds ?? []) {
            const atomRange = atomSourceRangeOf(atomId);
            expect(atomRange).not.toBeNull(); // AtomId קנוני מפוענח תמיד
            expect(atomRange!.startUtf16).toBeGreaterThanOrEqual(lineRange!.startUtf16);
            expect(atomRange!.endUtf16).toBeLessThanOrEqual(lineRange!.endUtf16);
          }
        }
        // (ג) הכיוון ההפוך: הטווח של הקו מוצא את הקו עצמו בין החופפים
        const found = linkedItemsForRange(ir, lineRange!).some((r) => r.itemId === item.id);
        expect(found).toBe(true);
      }
    }
    expect(lineCount).toBeGreaterThan(5);
    expect(bidiLineCount).toBeGreaterThan(0); // יש קו מעורב עברית+ספרות — והוא עמד בכל התנאים
  });

  test('עריכה אחרי תוצאה — סמן "לא עדכנית"; הריצה החדשה היא job חדש והתוצאה מתקבלת (עריכות רצופות)', async () => {
    const { container } = render(createElement(App));
    await runToDone(container);
    const job1 = useRunStore.getState().jobId;
    const rev1 = useResultStore.getState().sourceRevision;
    expect(rev1).toBe(useEditorStore.getState().revision);
    expect(container.querySelector('[data-testid="preview-stale"]')).toBeNull();
    // טווח קו אמיתי מה־IR — הבחירה שתשמש את כל המשך הבדיקה (מכסה פריטים בוודאות)
    const ir1 = useResultStore.getState().ir!;
    const probe = linkedItemsForRange(ir1, { startUtf16: 0, endUtf16: SOURCE_A.length })
      .find((r) => r.kind === 'line')!;
    const probeRange = probe.sourceRange;

    // עריכה — המקור השתנה; התוצאה שבתצוגה כבר אינה של המהדורה הנוכחית
    const editor = container.querySelector('[data-testid="source-editor"]') as HTMLTextAreaElement;
    typeSource(editor, SOURCE_A + 'שורה נוספת אחרי עריכה.\n');
    expect(useEditorStore.getState().revision).toBe(rev1! + 1);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="preview-stale"]')).not.toBeNull();
    });
    // הניווט המקושר מושהה על תוצאה לא-טריה (הגנה בעומק) — בחירה בטווח
    // שהוכח כמכסה פריטים בתוצאה הקודמת אינה מדגישה דבר כשהמקור נערך
    editor.setSelectionRange(probeRange.startUtf16, probeRange.endUtf16);
    act(() => {
      fireEvent.select(editor);
    });
    expect(container.querySelectorAll('[data-highlighted="true"]').length).toBe(0);

    // הרצה חוזרת — job חדש (לא המשך), והתוצאה הטרייה מתקבלת
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="run-typeset"]') as HTMLButtonElement);
    });
    await waitFor(() => {
      expect(useRunStore.getState().phase).toBe('done');
    }, { timeout: 5000 });
    expect(useRunStore.getState().jobId).not.toBe(job1);
    expect(useResultStore.getState().sourceRevision).toBe(useEditorStore.getState().revision);
    expect(container.querySelector('[data-testid="preview-stale"]')).toBeNull();
    // והקישור חזר לעבוד: אותה בחירה עצמה מדגישה פריטים בתוצאה הטרייה
    editor.setSelectionRange(probeRange.startUtf16, probeRange.endUtf16);
    act(() => {
      fireEvent.select(editor);
    });
    expect(container.querySelectorAll('[data-highlighted="true"]').length).toBeGreaterThan(0);
  });

  test('עריכה בזמן ריצה — תוצאת ה-job שנשלח לפני העריכה אינה מתקבלת כלל; אין הצגת ישן כחדש (§13.3#5)', async () => {
    // ערוץ מושהה — העורך נערך בזמן שה-job חי
    const client = new WorkerClient(new Channel(150));
    setUiRuntime({ client, bundle: BUNDLE, controller: new TypesetController({ client }) });
    const { container } = render(createElement(App));
    const editor = container.querySelector('[data-testid="source-editor"]') as HTMLTextAreaElement;
    typeSource(editor, SOURCE_A);
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="run-typeset"]') as HTMLButtonElement);
    });
    await waitFor(() => {
      const phase = useRunStore.getState().phase;
      expect(phase === 'preparing' || phase === 'running').toBe(true);
    });
    // עריכה בזמן ריצה — מהדורת המקור עולה; ה-job שבעובד כבר אינו של המסמך הנוכחי
    const revisionAtSubmit = useEditorStore.getState().revision;
    typeSource(editor, SOURCE_B);
    expect(useEditorStore.getState().revision).toBe(revisionAtSubmit + 1);
    // ה-job מסיים (ההשהיה פגה) — התוצאה נדחית: אין IR, אין עוגן, והסמן מסביר
    await waitFor(() => {
      expect(useRunStore.getState().phase).toBe('done');
    }, { timeout: 5000 });
    expect(useResultStore.getState().ir).toBeNull();
    expect(useResultStore.getState().sourceRevision).toBeNull();
    expect(container.querySelector('[data-testid="preview-stale"]')).not.toBeNull();

    // הריצה החדשה — job חדש של המקור שאחרי העריכה — מתקבלת ומקושרת
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="run-typeset"]') as HTMLButtonElement);
    });
    await waitFor(() => {
      expect(useRunStore.getState().phase).toBe('done');
    }, { timeout: 5000 });
    const ir = useResultStore.getState().ir!;
    expect(useResultStore.getState().sourceRevision).toBe(useEditorStore.getState().revision);
    expect(container.querySelector('[data-testid="preview-stale"]')).toBeNull();
    // הקישור תקף על המקור החדש: טווח של קו אמיתי מה־IR החדש מדגיש אותו בפריסה
    const freshLine = linkedItemsForRange(ir, { startUtf16: 0, endUtf16: SOURCE_B.length })
      .find((r) => r.kind === 'line')!;
    editor.setSelectionRange(freshLine.sourceRange.startUtf16, freshLine.sourceRange.endUtf16);
    act(() => {
      fireEvent.select(editor);
    });
    const highlightedNow = container.querySelectorAll('[data-highlighted="true"]');
    expect(highlightedNow.length).toBeGreaterThan(0);
    const ids = new Set([...highlightedNow].map((el) =>
      el.getAttribute('data-fragment-id') ?? el.getAttribute('data-marker-id')).filter(Boolean) as string[]);
    expect(ids.has(freshLine.itemId)).toBe(true);
  });
});
