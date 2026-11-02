/**
 * h456-escort.test.ts — בדיקות שלב 63: H4–H6 — כותרות inline וליווי (escort)
 * (אפיון §10.1, §14.2; פרק ח/M7).
 *
 * מבחני החובה: שבירה בתחילת/סוף טור; כל שילובי הליווי; letter-spacing.
 *
 * מה מוכח כאן:
 *   1. **ליווי לפי רמה**: דרישת הליווי מגיע מההתנהגות המוזרקת (לא ערך
 *      אחיד) — H4 עם escort 3 נבדק בפועל.
 *   2. **אף כותרת לא נשארת תלויה**: מבקר hangingHeadingsOf על מסלולים
 *      עם כל שילובי הליווי — ריק תמיד (שער השלב).
 *   3. **כותרת בסוף מסמך**: חריג קץ-מסמך — הגבול האחרון חוקי גם בלי
 *      ליווי (בלי זאת מסמך המסתיים בכותרת נתקע; תוקן בשלב).
 *   4. **שבירה בתחילת/סוף טור**: H4 בראש טור עם ליווי; H4 בסוף טור
 *      עוברת טור עם הליווי כמכלול.
 *   5. **סגנון inline**: המדיניות נושאת את מטא-דאטת המדידה (f-h4/s-h4).
 */
import { describe, expect, test } from 'vitest';
import { asLu, DecisionLedgerBuilder, type EffectiveSettings } from '@tora/layout-api';
import { initialPaginationState, type PaginationState } from '../src/pagination/state.js';
import { buildPageTemplateSet, initialRemainingByRegion, type TemplateSetInput } from '../src/pagination/templates.js';
import { searchPages } from '../src/pagination/search.js';
import {
  createPageCandidateSource,
  hangingHeadingsOf,
  type CandidateGeneratorInput,
  type PaginatedBlock,
  type PaginatedLine,
} from '../src/pagination/candidates.js';
import { createTorahPolicy, legacyHeadingBehaviorOf } from '@tora/policy-torah';

let lineSeq = 0;
const LINE = (heightLu: number): PaginatedLine => Object.freeze({
  id: `line-${lineSeq++}`,
  heightLu: asLu(heightLu),
  footnoteRefs: [],
  sidenoteRefs: [],
});
function block(blockId: string, lines: readonly PaginatedLine[], extra: Partial<PaginatedBlock> = {}): PaginatedBlock {
  return Object.freeze({ blockId, role: 'body', lines: Object.freeze([...lines]), ...extra });
}
const heading = (blockId: string, lineHeights: readonly number[], level: number): PaginatedBlock =>
  block(blockId, lineHeights.map((h) => LINE(h)), { role: 'heading', headingLevel: level });

const templates = buildPageTemplateSet({
  geometry: {
    pageWidth: asLu(4000000), pageHeight: asLu(5600000), margin: asLu(160000),
    mainX: asLu(400000), mainWidth: asLu(3200000), columnWidth: asLu(1520000),
    columnGap: asLu(160000), contentTop: asLu(160000), contentBottom: asLu(5440000),
  },
  headerHeightLu: asLu(0),
  footerHeightLu: asLu(0),
  columns: 2,
  footnoteColumns: 1,
  folioPosition: 'bottom_center',
  showFolio: false,
  sidenoteWidthLu: null,
} satisfies TemplateSetInput);
const H = templates.for('body', 1).regions.find((r) => r.role === 'body-column' && r.columnIndex === 0)!.rect.height;

const mkSettings = (values: Record<string, unknown> = {}): EffectiveSettings =>
  ({ schemaVersion: 1, enginePolicyId: 'torah-v1', values, configHash: 'test' });

function inputFor(blocks: readonly PaginatedBlock[], behaviorOf?: (level: number) => unknown): CandidateGeneratorInput {
  return {
    blocks, templates, pageKind: 'body',
    ...(behaviorOf !== undefined ? { headingBehaviorOf: behaviorOf as CandidateGeneratorInput['headingBehaviorOf'] } : {}),
  };
}
const initialState = (firstBlockId: string): PaginationState =>
  initialPaginationState({ firstBlockId, remainingByRegion: initialRemainingByRegion(templates.for('body', 1), 1) });
const runFull = (blocks: readonly PaginatedBlock[], behaviorOf?: (level: number) => unknown) => {
  const src = createPageCandidateSource(inputFor(blocks, behaviorOf));
  const res = searchPages(initialState(blocks[0]!.blockId), src, new DecisionLedgerBuilder('decisions'));
  const first = initialState(blocks[0]!.blockId);
  return { src, res, first, hanging: hangingHeadingsOf(first, res.path, blocks, (l) => (behaviorOf ? (behaviorOf(l) as { escortLines: number }).escortLines : legacyHeadingBehaviorOf(l).escortLines)) };
};

describe('שלב 63 — H4–H6 כותרות inline וליווי (§10.1)', () => {
  const lineH = Math.floor(H / 10);

  test('ליווי לפי רמה: H4 עם escort 3 מההתנהגות המוזרקת — נאכף בפועל', () => {
    const blocks = [
      block('body|0', [LINE(lineH)]),
      heading('heading|4|A', [lineH], 4),
      block('body|1', Array.from({ length: 6 }, () => LINE(lineH))),
    ];
    const custom = (level: number) => (level === 4
      ? { flowRole: 'inline' as const, forcePageBreak: false, escortLines: 3 }
      : legacyHeadingBehaviorOf(level));
    const src = createPageCandidateSource(inputFor(blocks, custom));
    const exps = src.expansions(initialState('body|0'));
    // גבול אחרי H4 עם 0/1/2 קווי גוף — אסור (escort 3); אחרי 3 — חוקי
    for (const frag of [0, 1, 2]) {
      expect(exps.some((e) => e.candidateId.endsWith(`body|1@${frag}`)), `body|1@${frag} אסור`).toBe(false);
    }
    expect(exps.some((e) => e.candidateId.endsWith('body|1@3')), 'body|1@3 חוקי').toBe(true);
    // ברירת המחדל של H4 — escort 2
    const srcDefault = createPageCandidateSource(inputFor(blocks));
    const expsDefault = srcDefault.expansions(initialState('body|0'));
    expect(expsDefault.some((e) => e.candidateId.endsWith('body|1@1')), 'ברירת מחדל: @1 אסור (escort 2)').toBe(false);
    expect(expsDefault.some((e) => e.candidateId.endsWith('body|1@2')), 'ברירת מחדל: @2 חוקי').toBe(true);
  });

  test('אף כותרת לא נשארת תלויה — מבקר ריק על כל שילובי הליווי (שער השלב)', () => {
    const policy = createTorahPolicy(mkSettings());
    const cases: readonly PaginatedBlock[][] = [
      // H4 באמצע זרימה
      [block('body|1', Array.from({ length: 8 }, () => LINE(lineH))), heading('heading|4|B', [lineH], 4), block('body|2', Array.from({ length: 8 }, () => LINE(lineH)))],
      // H4 סמוך לסוף טור — עוברת טור עם הליווי
      [block('body|1', Array.from({ length: 9 }, () => LINE(lineH))), heading('heading|4|C', [lineH], 4), block('body|2', Array.from({ length: 9 }, () => LINE(lineH)))],
      // H5+H6 רצופות
      [block('body|1', Array.from({ length: 5 }, () => LINE(lineH))), heading('heading|5|D', [lineH], 5), heading('heading|6|E', [lineH], 6), block('body|2', Array.from({ length: 5 }, () => LINE(lineH)))],
      // H4 לפני פותחת עמוד (חריג פתיחה כפויה)
      [block('body|1', Array.from({ length: 4 }, () => LINE(lineH))), heading('heading|4|F', [lineH], 4), heading('heading|2|G', [lineH], 2), block('body|2', Array.from({ length: 4 }, () => LINE(lineH)))],
      // מסמך המסתיים בכותרת
      [block('body|1', Array.from({ length: 4 }, () => LINE(lineH))), heading('heading|4|LAST', [lineH], 4)],
    ];
    for (const [i, blocks] of cases.entries()) {
      const { res, hanging } = runFull(blocks, policy.headingBehaviorOf);
      expect(res.status, `מקרה ${i}: complete`).toBe('complete');
      expect(hanging, `מקרה ${i}: אין כותרת תלויה`).toEqual([]);
    }
  });

  test('כותרת בסוף מסמך: הגבול האחרון חוקי בלי ליווי (חריג קץ-מסמך; תוקן בשלב)', () => {
    const blocks = [
      block('body|1', Array.from({ length: 4 }, () => LINE(lineH))),
      heading('heading|5|END', [lineH], 5),
    ];
    // בלי החריג הזה ההליכה הייתה נתקעת: אף גבול חוקי אחרי הכותרת
    const { res } = runFull(blocks);
    expect(res.status).toBe('complete');
    expect(res.finalState.contentCursor).toContain('heading|5|END|f1');
    // והמבקר: כותרת בקצה המסמך אינה "תלויה" (אין טור/עמוד אחריה)
    const { hanging } = runFull(blocks);
    expect(hanging).toEqual([]);
  });

  test('שבירה בתחילת טור: H4 נותרת עם הליווי שלה בראש הטור הבא', () => {
    const blocks = [
      block('body|1', Array.from({ length: 9 }, () => LINE(lineH))), // טור 0 מלא כמעט
      heading('heading|4|H', [lineH], 4),
      block('body|2', Array.from({ length: 9 }, () => LINE(lineH))),
    ];
    const { res, hanging } = runFull(blocks);
    expect(res.status).toBe('complete');
    expect(hanging).toEqual([]);
    // ההרחבה שצרכה את ה-H4 כוללת ≥2 קווי גוף אחריה (אותו טור) או שה-H4
    // פתחה טור חדש עם הליווי — המבקר כבר מוכיח; כאן: הכיסוי מלא
    const last = blocks[blocks.length - 1]!;
    expect(res.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
  });

  test('סגנון inline במדיניות: H4–H6 נושאות גופן/גודל מההגדרות (למדידה); ליווי לפי רמה', () => {
    const policy = createTorahPolicy(mkSettings({ 'f-h4': 'David', 's-h4': '14' }));
    expect(policy.headingBehaviorOf(4).inlineStyle).toEqual({ font: 'David', size: '14' });
    expect(policy.headingBehaviorOf(5).inlineStyle).toEqual({ font: "'AlphaLight', 'David Libre', serif", size: '11.5' });
    expect(policy.headingBehaviorOf(6).inlineStyle).toEqual({ font: "'Noto Serif Hebrew', serif", size: '10.5' });
    // ליווי לכל רמות ה-inline: 2 (ברירת מחדל); H7 — 0 (זרם צד, לא בלוק גוף)
    for (const level of [4, 5, 6]) expect(policy.headingBehaviorOf(level).escortLines).toBe(2);
    expect(policy.headingBehaviorOf(7).escortLines).toBe(0);
    // הכול דרך ההתנהגות — המנוע אינו מכיר את הרמות (שער 58 מתקיים)
    expect(policy.headingBehaviorOf(4).flowRole).toBe('inline');
  });

  test('דטרמיניזם וכיסוי על זרימה עשירת כותרות inline; המבקר ריק', () => {
    const blocks = [
      block('body|1', Array.from({ length: 10 }, () => LINE(lineH))),
      heading('heading|4|X', [lineH], 4),
      block('body|2', Array.from({ length: 6 }, () => LINE(lineH))),
      heading('heading|5|Y', [lineH], 5),
      block('body|3', Array.from({ length: 6 }, () => LINE(lineH))),
      heading('heading|6|Z', [lineH], 6),
      block('body|4', Array.from({ length: 8 }, () => LINE(lineH))),
    ];
    const { res, hanging, first } = runFull(blocks);
    expect(res.status).toBe('complete');
    expect(hanging).toEqual([]);
    const once = () => JSON.stringify(res.path.map((e) => e.candidateId));
    const again = () => {
      const src = createPageCandidateSource(inputFor(blocks));
      return JSON.stringify(searchPages(first, src, new DecisionLedgerBuilder('decisions')).path.map((e) => e.candidateId));
    };
    expect(once()).toBe(again());
    void first;
  });
});
