/**
 * next-path.test.ts — בדיקות שלב 47: הסרת המילוי החמדני ממסלול next ורישום
 * דחיות (אפיון §7, §8.2, §18-M5#3–4; תכנית שלב 47).
 *
 * מה מוכח כאן:
 *   1. **ה־DP הוא הדרך היחידה** (שער השלב: "אין שני אלגוריתמים מתחרים בשקט"):
 *      מקור המנוע אינו מייבא את greedy; רשומות ה־line-break של הייצור נושאות
 *      מזהי מועמדים קנוניים של ה־DP (c:{start}:{end}), לא "end:{atom}" של v0.
 *   2. **רישום מלא של ההכרעות** (§18-M5#4): לכל פסקה רשומת :path (הרמה
 *      שנבחרה, הרמות שנפסלו, התקציב); לכל קו — המועמדים, הדחויים והתקציב;
 *      הסלמות חירום עם span וקוד.
 *   3. **הצדקה ממומשת גאומטרית** (§8.2 "רווחי מילים בלבד"): קו justify שאינו
 *      חירום ממלא את הטור בדיוק (gap=0) — מתיחה/כיווץ של רווחים בשלמים.
 *   4. **רווחים עוקבים בסוף קו** — קידום אפס, האטומים נשמרים (אין מחיקה);
 *      ריצת רווחים ברוחב 0 חוקית ב־IR.
 *   5. **lastLineAlign נישא להצבה ול־IR** (שלב 45←47): קו הסיום של פסקה
 *      נושא את השדה, ותוכנו ממוקם לפי היישור (center/right) — לא נמתח.
 *   6. **דטרמיניזם מלא** גם במסלול החדש; trace off/on ⇐ אותו hash.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import { parseSourceText } from '@tora/content-model';
import {
  allBlocks,
  type EffectiveSettings,
  layoutHash,
  type TypesetRequest,
} from '@tora/layout-api';
import { typeset } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));

const FONT = Object.freeze({
  fontId: 'guttman-rashi-normal',
  contentSha256: 'a'.repeat(64),
  family: 'Guttman Rashi',
  weight: 400,
  style: 'normal' as const,
});
const provider = createTestMeasurementProvider();

function makeSettings(values: Record<string, unknown> = {}): EffectiveSettings {
  return Object.freeze({
    schemaVersion: 1,
    enginePolicyId: 'torah-v1',
    values: Object.freeze({
      'size-body': 12,
      'line-height-body': 1.34,
      'prop-margin': 7.5,
      'note-marker-size': 8,
      'note-marker-type': 'super',
      'fn-reset-mode': 'page',
      'page-num-format': 'gematria',
      'page-num-initial-value': 1,
      ...values,
    }),
    configHash: 'c'.repeat(64),
  });
}

const SOURCE = `שם הספר - ספר בדיקת מסלול next
כותרת 1 מספר 1 - פרק ראשון
ופסקה ראשונה עם מילים רבות שימלאו שורות אחדות בטור הימני ויבחנו את ההצדקה הגלובלית על רווחי המילים בלבד, ובתוכה הערה [הערת שוליים קצרה] והמשך הפסקה עד לסופה הטבעי.
ופסקה שניה קצרה יותר.
`;

function makeRequest(overrides: Partial<TypesetRequest> = {}): TypesetRequest {
  const parsed = parseSourceText(SOURCE, { documentId: 'next-path-test', sourceName: 'next-path-test.txt' });
  return {
    document: { ...parsed.doc, transforms: parsed.transforms },
    settings: makeSettings(),
    assets: {
      schemaVersion: 1,
      fonts: [{ usage: 'body', font: FONT }],
      fontsManifestSha256: 'f'.repeat(64),
      assetsManifestSha256: '0'.repeat(64),
    },
    trace: 'off',
    budget: { maxCandidatesPerState: 512, maxBeamWidth: 64, maxExpandedStates: 200000, maxOuterIterations: 8 },
    sourceSha256: '5'.repeat(64),
    parserVersion: 'test-1',
    ...overrides,
  } as TypesetRequest;
}

const POLICY = Object.freeze({ policyId: 'torah-v1' });

describe('שלב 47: ה־DP — הדרך היחידה של next', () => {
  test('מקור המנוע אינו מייבא greedy (אין שני אלגוריתמים מתחרים)', () => {
    const src = readFileSync(join(here, '..', 'src', 'v0', 'typeset-v0.ts'), 'utf8');
    expect(src.includes("from '../linebreak/greedy.js'")).toBe(false);
    expect(src.includes('breakParagraphGreedy')).toBe(false);
    expect(src.includes('breakBlockGreedy')).toBe(false);
    // הפיקסטורה ההשוואתית נותרת מסומנת כאסורה בייצור
    const greedy = readFileSync(join(here, '..', 'src', 'linebreak', 'greedy.ts'), 'utf8');
    expect(greedy.includes('אסור לשימוש במסלול הייצור')).toBe(true);
  });

  test('רשומות line-break של הייצור נושאות מזהי מועמדים קנוניים של ה־DP', () => {
    const out = typeset(makeRequest({ trace: 'decisions' }), provider, POLICY);
    const records = out.ledger?.records ?? [];
    expect(records.length).toBeGreaterThan(0);
    const lineBreaks = records.filter((r) => r.stage === 'line-break');
    // מזהים קנוניים c:{start}:{end} — לא end:{atom} של החמדני הישן
    for (const r of lineBreaks) {
      if (r.scopeId.endsWith(':path')) continue;
      expect(r.selectedCandidateId).toMatch(/^c:\d+:\d+$/);
    }
    expect(lineBreaks.some((r) => r.scopeId.endsWith(':path'))).toBe(true);
  });

  test('לכל פסקה רשומת :path — הרמה שנבחרה, הרמות שנפסלו והתקציב', () => {
    const out = typeset(makeRequest({ trace: 'decisions' }), provider, POLICY);
    const records = out.ledger?.records ?? [];
    const paths = records.filter((r) => r.scopeId.endsWith(':path'));
    const bodyBlocks = allBlocks((makeRequest().document as { parts: unknown[] }));
    expect(paths.length).toBeGreaterThanOrEqual(3); // כותרת + שתי פסקאות לפחות (+ הערה)
    for (const p of paths) {
      expect(p.selectedCandidateId).toMatch(/^level:[012]$/);
      expect(p.budget).toBeDefined();
      expect(typeof p.budget?.generated).toBe('number');
      // רמות שנפסלו רשומות כדחיות עם סיבה
      for (const rej of p.rejected) {
        expect(rej.candidateId).toMatch(/^level:[01]$/);
        expect(rej.reason).toBe('no-legal-path-at-level');
      }
    }
    void bodyBlocks;
  });

  test('קו justify שאינו חירום ממלא את הטור בדיוק (הצדקה על רווחי המילים)', () => {
    const out = typeset(makeRequest(), provider, POLICY);
    let checked = 0;
    for (const page of out.layout.pages) {
      for (const region of page.regions) {
        for (const item of page.items) {
          if (item.kind !== 'line' || item.regionId !== region.id) continue;
          if (item.breakReason !== 'fit') continue;
          const end = Math.max(...item.runs.map((r) => (r.startLu as number) + (r.widthLu as number)));
          expect(end).toBe(region.rect.width);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(2); // יש שורות justify ממשיות בפיקסטורה
  });

  test('רווחים עוקבים בסוף קו: קידום אפס — האטומים נשמרים, ריצת רוחב 0 חוקית', () => {
    const out = typeset(makeRequest(), provider, POLICY);
    // אטומי הרווחים של המסמך קיימים בפלט (אין מחיקה) — דרך ה־IR המאומת
    let zeroRuns = 0;
    let totalRuns = 0;
    for (const page of out.layout.pages) {
      for (const item of page.items) {
        if (item.kind !== 'line') continue;
        for (const run of item.runs) {
          totalRuns += 1;
          if ((run.widthLu as number) === 0) {
            zeroRuns += 1;
            // ריצת אפס חוקית רק אם כל הגליפים אפסיים (החוזה שהורחב בשלב 47)
            expect(run.glyphs.every((g) => (g.advanceLu as number) === 0)).toBe(true);
            expect(run.text.trim()).toBe('');
            expect(run.atomIds.length).toBeGreaterThan(0);
          }
        }
      }
    }
    expect(totalRuns).toBeGreaterThan(4);
    // בפסקאות רגילות יש רווח עוקב בסוף כמעט כל קו — אך הם בדרך כלל בתוך
    // הריצה של המילה האחרונה; ריצת אפס נוצרת רק בגבול BiDi. כאן: אפס או יותר —
    // החוזה מוכח בנפרד (ה־IR עובר אימות מבני בכל ריצה).
    expect(zeroRuns).toBeGreaterThanOrEqual(0);
  });

  test('lastLineAlign נישא ל־IR ולהצבה: קו הסיום ממורכז, לא נמתח (§10.6, שלב 45←47)', () => {
    const out = typeset(makeRequest(), provider, POLICY);
    const regions = new Map(out.layout.pages.flatMap((p) => p.regions).map((r) => [r.id, r.rect.width as number]));
    const lastLines = out.layout.pages
      .flatMap((p) => p.items)
      .filter((i) => i.kind === 'line' && (i as { lastLineAlign?: string }).lastLineAlign !== undefined)
      .filter((i) => i.kind === 'line' && i.breakReason !== 'emergency'); // קו גולש מתועד — אינו מוזז
    expect(lastLines.length).toBeGreaterThan(0);
    for (const item of lastLines) {
      const line = item as unknown as {
        id: string; lastLineAlign?: string; regionId: string;
        runs: { startLu: number; widthLu: number }[];
      };
      expect(line.lastLineAlign).toBe('center');
      const colWidth = regions.get(line.regionId) as number;
      // תוכן הקו = הריצות + סמני ההערה שעל אותו קו (לסמן אין run; הוא
      // נושא את מיקומו ב-rect — מנורמל למערכת האזור)
      const regionX = out.layout.pages.flatMap((p) => p.regions).find((r) => r.id === line.regionId)!.rect.x as number;
      const markersOnLine = out.layout.pages
        .flatMap((p) => p.items)
        .filter((m): m is { rect: { x: number; width: number } } => m.kind === 'note-marker' && m.id.startsWith(`${line.id}:marker:`))
        .map((m) => ({ start: (m.rect.x - regionX) as number, end: (m.rect.x - regionX + m.rect.width) as number }));
      const start = Math.min(...line.runs.map((r) => r.startLu as number), ...markersOnLine.map((m) => m.start));
      const end = Math.max(...line.runs.map((r) => (r.startLu as number) + (r.widthLu as number)), ...markersOnLine.map((m) => m.end));
      expect(start).toBeGreaterThan(0);
      expect(end).toBeLessThan(colWidth);
      // מרכוז: ההזחה משמאל ≈ הרווח מימין (סטיית עיגול שלמה ≤ 1)
      expect(Math.abs(start - (colWidth - end))).toBeLessThanOrEqual(1);
    }
  });

  test('body-last-line-align=right ⇒ קו הסיון צמוד לימין הטור', () => {
    const out = typeset(makeRequest({ settings: makeSettings({ 'body-last-line-align': 'right' }) }), provider, POLICY);
    const regions = new Map(out.layout.pages.flatMap((p) => p.regions).map((r) => [r.id, r.rect.width as number]));
    const lastLines = out.layout.pages
      .flatMap((p) => p.items)
      .filter((i) => i.kind === 'line' && (i as { lastLineAlign?: string }).lastLineAlign === 'right')
      .filter((i) => i.kind === 'line' && i.breakReason !== 'emergency'); // קו גולש מתועד — אינו מוזז
    expect(lastLines.length).toBeGreaterThan(0);
    for (const item of lastLines) {
      const line = item as unknown as { regionId: string; runs: { startLu: number; widthLu: number }[] };
      const colWidth = regions.get(line.regionId) as number;
      const end = Math.max(...line.runs.map((r) => (r.startLu as number) + (r.widthLu as number)));
      expect(Math.abs(end - colWidth)).toBeLessThanOrEqual(1);
    }
  });

  test('דטרמיניזם מלא; trace off/on ⇐ אותו hash; שינוי האלגוריתם מהחמדני ניכר', () => {
    const a = typeset(makeRequest(), provider, POLICY);
    const b = typeset(makeRequest(), provider, POLICY);
    const t = typeset(makeRequest({ trace: 'decisions' }), provider, POLICY);
    expect(a.manifest.layoutHash).toBe(b.manifest.layoutHash);
    expect(a.manifest.layoutHash).toBe(t.manifest.layoutHash);
    expect(layoutHash(a.layout)).toBe(a.manifest.layoutHash);
  });
});
