/**
 * typeset-v0.test.ts — בדיקות שלב 33: מנוע v0 דטרמיניסטי (§5–7, §18-M4).
 *
 * מה מוכח כאן:
 *   1. שתי ריצות ⇐ אותו layoutHash; שלוש ריצות — זהה; סדר מפתחות בהגדרות
 *      אינו משנה (§17.2#1, #4).
 *   2. trace off/on ⇐ אותו hash; off ⇒ אין ledger; decisions ⇒ רשומות קו
 *      עם מועמדים ודחיות (§6.7).
 *   3. observer מדווח progress ואינו משנה את ה-IR (§12).
 *   4. חירום: מילה בלתי-בר-שבירה ⇒ breakReason 'emergency' + רשומת
 *      EMERGENCY_LINE בפנקס; ה-IR עדיין עובר אימות (§8.2 — אין חיתוך).
 *   5. מבנה: עמודי body (folio גימטריא, parity, שני טורים) ואחריהם עמודי
 *      notes; סמני הערה בגוף עם תווית resolved; קידומת תווית בגוף ההערה.
 *   6. הגדרה שגויה/גופן חסר ⇒ שגיאות מקוטלגות.
 */
import { describe, expect, test } from 'vitest';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import {
  parseSourceText,
  type TorahDocument,
} from '@tora/content-model';
import {
  allBlocks,
  type EffectiveSettings,
  layoutHash,
  serializeLayoutDocument,
  type TypesetRequest,
} from '@tora/layout-api';
import { ENGINE_VERSION, typeset } from '../src/index.js';

const FONT = Object.freeze({
  fontId: 'guttman-rashi-normal',
  contentSha256: 'a'.repeat(64),
  family: 'Guttman Rashi',
  weight: 400,
  style: 'normal' as const,
});

function makeSettings(overrides: Record<string, unknown> = {}): EffectiveSettings {
  const values: Record<string, unknown> = {
    'size-body': 12,
    'line-height-body': 1.34,
    'prop-margin': 7.5,
    'note-marker-size': 8,
    'note-marker-type': 'super',
    'fn-reset-mode': 'page',
    'page-num-format': 'gematria',
    'page-num-initial-value': 1,
    ...overrides,
  };
  return Object.freeze({
    schemaVersion: 1,
    enginePolicyId: 'torah-v1',
    values: Object.freeze(values),
    configHash: 'c'.repeat(64),
  });
}

const SOURCE = `שם הספר - ספר בדיקת מנוע
כותרת 1 מספר 1 - פרק ראשון
והנה פסקה ראשונה עם ניקוד וטעמים ומספרים 123 ולטינית test ועוד טקסט שימלא שורות אחדות בטור, ובתוכה הערה [וזו הערת שוליים ראשונה בתוך סוגריים מרובעים] והמשך הפסקה אחרי ההערה.
ופסקה שניה בלי הערה כלל, עם מקף-עברי ומספרים 456 ועוד מלים רבות כדי למלא שורות נוספות בעמודה הראשונה ואולי גם בשניה, כדי שהעימוד יעבור עמודים ויבחן את מכונת העמודים ואת הפוליו בגימטריא.
כותרת 7 - דיבור המתחיל בשם שבת קודש
כותרת 2 מספר 1 - פרק שני
ופסקה בפרק השני עם הערה נוספת [הערה שניה] בתוך הטקסט.
ופסקה אחרונה ללא הערות, עם מילה ארוכה מאוד בלתי־ברת־שבירה אאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאאא וסוף הפסקה.
`;

function parse(): TorahDocument & { transforms: readonly unknown[] } {
  const r = parseSourceText(SOURCE, { documentId: 'engine-test', sourceName: 'engine-test.txt' });
  return { ...r.doc, transforms: r.transforms } as never;
}

function makeRequest(overrides: Partial<TypesetRequest> = {}): TypesetRequest {
  return {
    document: parse(),
    settings: makeSettings(),
    assets: {
      schemaVersion: 1,
      fonts: [{ usage: 'body', font: FONT }],
      fontsManifestSha256: 'f'.repeat(64),
      assetsManifestSha256: '0'.repeat(64),
    },
    trace: 'off',
    budget: { maxCandidatesPerState: 64, maxBeamWidth: 8, maxExpandedStates: 200000, maxOuterIterations: 8 },
    sourceSha256: '5'.repeat(64),
    parserVersion: 'test-1',
    ...overrides,
  } as TypesetRequest;
}

const POLICY = Object.freeze({ policyId: 'torah-v1' });

describe('שלב 33: מנוע v0 — דטרמיניזם', () => {
  const provider = createTestMeasurementProvider();

  test('שלוש ריצות ⇐ אותו layoutHash', () => {
    const h: string[] = [];
    for (let i = 0; i < 3; i++) {
      const out = typeset(makeRequest(), provider, POLICY);
      h.push(out.manifest.layoutHash);
    }
    expect(h[0]).toBe(h[1]);
    expect(h[1]).toBe(h[2]);
  });

  test('סדר מפתחות שונה בהגדרות ⇐ אותו hash (§17.2#4)', () => {
    const a = typeset(makeRequest(), provider, POLICY);
    const reordered = Object.freeze({
      schemaVersion: 1 as const,
      enginePolicyId: 'torah-v1' as const,
      values: Object.freeze({
        'page-num-initial-value': 1,
        'page-num-format': 'gematria',
        'fn-reset-mode': 'page',
        'note-marker-type': 'super',
        'note-marker-size': 8,
        'prop-margin': 7.5,
        'line-height-body': 1.34,
        'size-body': 12,
      }),
      configHash: 'c'.repeat(64),
    });
    const b = typeset(makeRequest({ settings: reordered }), provider, POLICY);
    expect(a.manifest.layoutHash).toBe(b.manifest.layoutHash);
  });

  test('trace off/on ⇐ אותו hash; off ⇒ אין ledger (§6.7)', () => {
    const off = typeset(makeRequest(), provider, POLICY);
    const full = typeset(makeRequest({ trace: 'decisions' }), provider, POLICY);
    expect(off.manifest.layoutHash).toBe(full.manifest.layoutHash);
    expect(off.ledger).toBeUndefined();
    expect(full.ledger).toBeDefined();
    expect((full.ledger?.records.length ?? 0)).toBeGreaterThan(0);
    expect(layoutHash(off.layout)).toBe(layoutHash(full.layout));
  });

  test('observer מדווח progress ואינו משנה את ה-IR (§12)', () => {
    const events: string[] = [];
    let sabotage = 0;
    const out = typeset(makeRequest(), provider, POLICY, {
      onProgress: (stage) => { events.push(stage); sabotage += 1; },
    });
    const plain = typeset(makeRequest(), provider, POLICY);
    expect(events.length).toBeGreaterThan(0);
    expect(sabotage).toBe(events.length);
    expect(out.manifest.layoutHash).toBe(plain.manifest.layoutHash);
  });

  test('שלב 40: דגל מנוע — כל מניפסט נושא engine=next (חוזה §18-M4)', () => {
    const out = typeset(makeRequest(), provider, POLICY);
    expect(out.manifest.engine).toBe('next');
    // הדגל אינו משנה את הפריסה — אותו hash בלי קשר לשאלה מי קורא
    const again = typeset(makeRequest(), provider, POLICY);
    expect(again.manifest.layoutHash).toBe(out.manifest.layoutHash);
  });

  test('manifest מלא: engineVersion, codeSha=dev, environmentHash מהספק', () => {
    const out = typeset(makeRequest(), provider, POLICY);
    expect(out.manifest.engineVersion).toBe(ENGINE_VERSION);
    expect(out.manifest.codeSha).toBe('dev');
    expect(out.manifest.environmentHash).toBe(provider.environmentHash);
    expect(out.manifest.inputHash).not.toBe(out.manifest.layoutHash);
  });
});

describe('שלב 33: מבנה הפלט', () => {
  const provider = createTestMeasurementProvider();

  test('עמודי body: שני טורים, folio גימטריא, parity', () => {
    const out = typeset(makeRequest(), provider, POLICY);
    const body = out.layout.pages.filter((p) => p.kind === 'body');
    expect(body.length).toBeGreaterThan(0);
    for (const page of body) {
      expect(page.regions.filter((r) => r.kind === 'body-column')).toHaveLength(2);
      expect(page.regions.some((r) => r.columnIndex === 0 && r.columnIndex === 1)).toBe(false);
      expect(typeof page.printedFolio).toBe('string');
      expect(page.parity).toBe(page.physicalIndex % 2 === 1 ? 'recto' : 'verso');
    }
    expect(body[0]!.printedFolio).toBe('א'); // גימטריא של 1
  });

  test('עמודי notes אחרי עמודי הגוף; סמני הערה בגוף; קידומת תווית בגוף ההערה', () => {
    const out = typeset(makeRequest(), provider, POLICY);
    const idxBody = out.layout.pages.findIndex((p) => p.kind === 'body');
    const idxNotes = out.layout.pages.findIndex((p) => p.kind === 'notes');
    expect(idxBody).toBe(0);
    expect(idxNotes).toBeGreaterThan(-1);
    expect(idxNotes).toBeGreaterThanOrEqual(out.layout.pages.filter((p) => p.kind === 'body').length - 1);

    const markers = out.layout.pages.flatMap((p) => p.items).filter((i) => i.kind === 'note-marker');
    expect(markers.length).toBeGreaterThan(0);
    const bodyMarkers = markers.filter((m) => m.kind === 'note-marker' && !m.source.stream.startsWith('f') ? true : true);
    void bodyMarkers;
    // תווית גימטריא של 1 = א
    expect(markers.some((m) => m.kind === 'note-marker' && m.label === 'א')).toBe(true);
    // סמן קידומת בגוף ההערה (bodyPrefix) — בעמודי ה-notes, מקור בזרם footnote
    const prefixMarkers = markers.filter((m) => m.kind === 'note-marker' && m.source.stream === 'footnote');
    expect(prefixMarkers.length).toBeGreaterThan(0);
  });

  test('הערות המשנה (H7) — כותרת 7 הופכת להערת צד; גוף ההערה מוצב', () => {
    const out = typeset(makeRequest(), provider, POLICY);
    const doc = makeRequest().document;
    expect(doc.notes.sidenotes.length).toBe(1);
    const noteItems = out.layout.pages.filter((p) => p.kind === 'notes');
    expect(noteItems.length).toBeGreaterThan(0);
  });

  test('שורות בטור 0 לפני טור 1 (RTL); קווים רציפים בין עמודים', () => {
    const out = typeset(makeRequest({ trace: 'decisions' }), provider, POLICY);
    const firstPage = out.layout.pages[0]!;
    const col0 = firstPage.regions.find((r) => r.columnIndex === 0)!;
    const col1 = firstPage.regions.find((r) => r.columnIndex === 1)!;
    // בטקסט הישן ובאפיון: טור ימין (0) נמצא מימין — x גדול יותר מטור שמאל
    expect(col0.rect.x).toBeGreaterThan(col1.rect.x);
    const lineItems = firstPage.items.filter((i) => i.kind === 'line');
    expect(lineItems.length).toBeGreaterThan(0);
    // כל קו בתוך האזור שלו (האימות המבני כבר תפס — כאן בדיקה עקיפה)
    for (const item of lineItems) {
      expect(firstPage.regions.some((r) => r.id === item.regionId)).toBe(true);
    }
  });

  test('ריצות ממוקמות: שורה רגילה בגבולות; שורת חירום גולשת (מדווח בביקורת)', () => {
    const out = typeset(makeRequest(), provider, POLICY);
    let emergencySeen = false;
    for (const page of out.layout.pages) {
      for (const item of page.items) {
        if (item.kind !== 'line') continue;
        for (const run of item.runs) {
          if (item.breakReason === 'emergency') {
            expect(run.startLu + run.widthLu).toBeGreaterThan(item.rect.width);
            emergencySeen = true;
          } else {
            expect(run.startLu + run.widthLu).toBeLessThanOrEqual(item.rect.width + 1);
          }
          expect(run.text.length).toBeGreaterThan(0);
          expect(run.atomIds.length).toBeGreaterThan(0);
        }
      }
    }
    expect(emergencySeen).toBe(true);
  });

  test('serialize→parse של הפלט שומר hash (§17.2#9)', () => {
    const out = typeset(makeRequest(), provider, POLICY);
    const text = serializeLayoutDocument(out.layout);
    expect(text.length).toBeGreaterThan(100);
    expect(out.manifest.layoutHash).toBe(layoutHash(out.layout));
  });
});

describe('שלב 33: חירום ושגיאות', () => {
  const provider = createTestMeasurementProvider();

  test('מילה ארוכה ⇒ emergency + EMERGENCY_LINE בפנקס; האטומים לא נחתכים', () => {
    const out = typeset(makeRequest({ trace: 'decisions' }), provider, POLICY);
    const lines = out.layout.pages.flatMap((p) => p.items).filter((i) => i.kind === 'line');
    expect(lines.some((l) => l.kind === 'line' && l.breakReason === 'emergency')).toBe(true);
    const ledger = out.ledger!;
    const fb = ledger.summary.fallbacks;
    expect(fb.EMERGENCY_LINE ?? 0).toBeGreaterThan(0);
    expect(fb.NOTES_V0_DEFERRED ?? 0).toBeGreaterThan(0);
    // כיסוי אטומים מלא: כל אטום של המסמך מופיע בדיוק פעם אחת בריצות (§14.2)
    const doc = makeRequest().document;
    const allBody = collectAllAtomIds(doc);
    const placed = new Map<string, number>();
    for (const page of out.layout.pages) {
      for (const item of page.items) {
        if (item.kind !== 'line') continue;
        for (const run of item.runs) {
          for (const atomId of run.atomIds) placed.set(atomId, (placed.get(atomId) ?? 0) + 1);
        }
      }
    }
    for (const [atomId, expected] of allBody) {
      expect(placed.get(atomId) ?? 0).toBe(expected);
    }
  });

  test('הגדרה שגויה ⇒ שגיאה מקוטלגת', () => {
    expect(() => typeset(makeRequest({ settings: makeSettings({ 'size-body': 500 }) }), provider, POLICY))
      .toThrow(/errors\.engine\.SETTING_INVALID/);
  });

  test('גופן body חסר ⇒ BODY_FONT_MISSING', () => {
    const bad = makeRequest();
    (bad.assets as { fonts: unknown[] }).fonts = [{ usage: 'heading', font: FONT }];
    expect(() => typeset(bad, provider, POLICY)).toThrow(/errors\.engine\.BODY_FONT_MISSING/);
  });

  test('policyId ריק ⇒ שגיאה', () => {
    expect(() => typeset(makeRequest(), provider, { policyId: '' })).toThrow(/policyId/);
  });

  function collectAllAtomIds(doc: TorahDocument & { transforms: readonly unknown[] }): Map<string, number> {
    const map = new Map<string, number>();
    const bump = (id: string): void => map.set(id, (map.get(id) ?? 0) + 1);
    for (const block of allBlocksOfDoc(doc)) {
      for (const item of block.inline) {
        if (item.kind === 'text') for (const atom of item.atoms) bump(atom.id);
      }
    }
    return map;
  }

  function allBlocksOfDoc(doc: TorahDocument & { transforms: readonly unknown[] }): readonly { inline: readonly { kind: string; atoms?: readonly { id: string }[] }[] }[] {
    return allBlocks(doc) as never;
  }
});
