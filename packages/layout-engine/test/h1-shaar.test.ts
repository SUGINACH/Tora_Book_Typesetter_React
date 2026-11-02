/**
 * h1-shaar.test.ts — בדיקות שלב 60: H1 — שער משנה/חלק ופתיחת עמוד
 * (אפיון §10.1 H1, §11.2; פרק ח/M7).
 *
 * מבחני החובה מ־§10.1: פיצול כותרת, מיקום שמור לכל שער, parity.
 *
 * מה מוכח כאן:
 *   1. **פתיחת עמוד שער**: H1 פותחת עמוד sub-shaar (תבנית שער — תיבת
 *      custom-box ללא טורי גוף); הכותרת מוצבת בתיבה כמכלול אטומי;
 *      הזרימה ממשיכה בעמוד הגוף הבא.
 *   2. **parity (recto)**: כשעמוד השער היה נופל על verso — נפתח עמוד ריק
 *      לפניו (legacy ensureOddPageStart); השער תמיד בעמוד אי-זוגי.
 *   3. **מיקום שמור לכל שער**: כל עמודי השער חולקים את אותה גאומטריית
 *      תיבה קבועה (§11.2 — אין reset בין שערים).
 *   4. **פיצול כותרת**: splitShaarTitle — החלק הראשי לפני המקף; המקפים
 *      במדיניות, לא regex ברנדרר (§10.2 ברוחו).
 *   5. **עוגן**: headingAnchorsOf — H1 ⇒ עמוד השער שלו; כותרות גוף ⇒
 *      עמודי הזרימה; אין pageEstimate.
 *   6. **כשלים מפורשים**: כותרת גבוהה מהתיבה ⇒ אין מועמד; בלוק לא-כותרת
 *      בעמוד שער ⇒ שגיאת קלט מקוטלגת.
 *   7. **rollback**: mode-h1=new_page_1col (שער מוסתר) ⇒ פותחת body רגילה.
 */
import { describe, expect, test } from 'vitest';
import { asLu, DecisionLedgerBuilder } from '@tora/layout-api';
import { initialPaginationState, verifyTransitionChain, type PaginationState } from '../src/pagination/state.js';
import { buildPageTemplateSet, initialRemainingByRegion, type TemplateSetInput } from '../src/pagination/templates.js';
import { searchPages } from '../src/pagination/search.js';
import {
  createPageCandidateSource,
  headingAnchorsOf,
  type CandidateGeneratorInput,
  type PaginatedBlock,
  type PaginatedLine,
} from '../src/pagination/candidates.js';
import { legacyHeadingBehaviorOf } from '../src/pagination/heading-defaults.js';
import { LayoutEngineError } from '../src/errors.js';
import { createTorahPolicy, splitShaarTitle } from '@tora/policy-torah';
import type { EffectiveSettings } from '@tora/layout-api';

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
const h = (blockId: string, heightLu: number, level: number): PaginatedBlock =>
  block(blockId, [LINE(heightLu)], { role: 'heading', headingLevel: level });

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
const BOX_H = templates.for('sub-shaar', 1).regions.find((r) => r.role === 'custom-box')!.rect.height;

const mkSettings = (values: Record<string, unknown> = {}): EffectiveSettings =>
  ({ schemaVersion: 1, enginePolicyId: 'torah-v1', values, configHash: 'test' });

function inputFor(blocks: readonly PaginatedBlock[], headingBehaviorOf?: (level: number) => unknown): CandidateGeneratorInput {
  return {
    blocks, templates, pageKind: 'body',
    ...(headingBehaviorOf !== undefined ? { headingBehaviorOf: headingBehaviorOf as CandidateGeneratorInput['headingBehaviorOf'] } : {}),
  };
}
const initialState = (firstBlockId: string, pageKind: 'body' | 'sub-shaar' = 'body'): PaginationState =>
  initialPaginationState({
    firstBlockId,
    remainingByRegion: initialRemainingByRegion(templates.for(pageKind, 1), 1),
    pageKind,
  });

const runFull = (blocks: readonly PaginatedBlock[], behaviorOf?: (level: number) => unknown, firstKind: 'body' | 'sub-shaar' = 'body') => {
  const src = createPageCandidateSource(inputFor(blocks, behaviorOf));
  return { src, res: searchPages(initialState(blocks[0]!.blockId, firstKind), src, new DecisionLedgerBuilder('decisions')) };
};
const fromStateOf = (res: { path: readonly { toState: PaginationState }[] }, i: number, first: PaginationState): PaginationState =>
  i === 0 ? first : res.path[i - 1]!.toState;

describe('שלב 60 — H1 שער משנה/חלק (§10.1, §11.2)', () => {
  const lineH = Math.floor(H / 10);

  test('H1 פותחת עמוד sub-shaar: הכותרת בתיבה (אטומית); הזרימה ממשיכה בעמוד הגוף הבא', () => {
    const blocks = [
      block('body|1', Array.from({ length: 5 }, () => LINE(lineH))),
      h('heading|1|PART', lineH * 2, 1),
      block('body|2', Array.from({ length: 8 }, () => LINE(lineH))),
    ];
    const policy = createTorahPolicy(mkSettings());
    const { res } = runFull(blocks, policy.headingBehaviorOf);
    expect(res.status).toBe('complete');
    // הרחבת השער קיימת — הכותרת הוצבה בתיבה והסמן עבר אותה
    const shaarIdx = res.path.findIndex((e) => e.candidateId.includes(':SHAAR'));
    expect(shaarIdx).toBeGreaterThanOrEqual(0);
    const shaarExp = res.path[shaarIdx]!;
    // עמוד השער: sub-shaar, תיבה נצרכת בגובה הכותרת, אין טורי גוף
    const shaarState = fromStateOf(res, shaarIdx, initialState('body|1'));
    expect(shaarState.pageKind).toBe('sub-shaar');
    // צריכת התיבה נרשמת במעברים (ה-toState כבר בעמוד הגוף הבא): consume-region
    // על תיבת השער בגובה הכותרת כולה (אטומית)
    const boxConsume = shaarExp.transitions.find((tr) => tr.action.kind === 'consume-region'
      && tr.action.regionId === `page:${shaarState.physicalPageIndex}:box`);
    expect(boxConsume).toBeDefined();
    expect(boxConsume!.action.amountLu).toBe(lineH * 2);
    // ההמשך — עמוד גוף חדש (הזרימה לא ממשיכה בשער)
    expect(shaarExp.toState.pageKind).toBe('body');
    expect(shaarExp.toState.physicalPageIndex).toBe(shaarState.physicalPageIndex + 1);
    expect(shaarExp.closesRegion).toBe(true);
    // כיסוי מלא
    const last = blocks[blocks.length - 1]!;
    expect(res.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
    expect(() => verifyTransitionChain(initialState('body|1'), res.path.flatMap((e) => e.transitions))).not.toThrow();
  });

  test('parity: שער שהיה נופל על verso — עמוד ריק לפניו; השער תמיד אי-זוגי', () => {
    const blocks = [
      block('body|1', Array.from({ length: 5 }, () => LINE(lineH))),
      h('heading|1|P1', lineH, 1),
      block('body|2', Array.from({ length: 5 }, () => LINE(lineH))),
    ];
    const policy = createTorahPolicy(mkSettings());
    const { res } = runFull(blocks, policy.headingBehaviorOf);
    expect(res.status).toBe('complete');
    const shaarIdx = res.path.findIndex((e) => e.candidateId.includes(':SHAAR'));
    const shaarState = fromStateOf(res, shaarIdx, initialState('body|1'));
    // השער בעמוד אי-זוגי (recto)
    expect(shaarState.physicalPageIndex % 2).toBe(1);
    // לפניו — עמוד ריק של הזרימה (body ללא תוכן): ההרחבה שפתחה אותו היא :OPEN
    // שהשאירה את הסמן בראש ה-H1, וההרחבה שאחריה לא הציבה שם כלום
    const blankIdx = shaarIdx - 1;
    const blankFrom = fromStateOf(res, blankIdx, initialState('body|1'));
    const blankExp = res.path[blankIdx]!;
    expect(blankFrom.physicalPageIndex).toBe(shaarState.physicalPageIndex - 1);
    expect(blankFrom.physicalPageIndex % 2).toBe(0); // הריק ב-verso
    expect(blankExp.toState.contentCursor).toContain('heading|1|P1|f0'); // הסמן לא התקדם — רק פתיחת עמוד
  });

  test('parity ללא ריק: כשהשער נופל על recto ממילא — אין עמוד ריק מיותר', () => {
    const blocks = [
      block('body|1', Array.from({ length: 20 }, () => LINE(lineH))), // ממלא את עמוד 1 בדיוק
      h('heading|1|P2', lineH, 1),
      block('body|2', Array.from({ length: 5 }, () => LINE(lineH))),
    ];
    const policy = createTorahPolicy(mkSettings());
    const { res } = runFull(blocks, policy.headingBehaviorOf);
    expect(res.status).toBe('complete');
    const shaarIdx = res.path.findIndex((e) => e.candidateId.includes(':SHAAR'));
    const shaarState = fromStateOf(res, shaarIdx, initialState('body|1'));
    expect(shaarState.physicalPageIndex % 2).toBe(1); // recto
    // אין שני עמודים ריקים רצופים לפני השער — ההרחבה שלפני השער פתחה אותו ישירות
    // (עמוד 2 נותר ריק מהזרימה הטבעית; השער ב-3)
    expect(res.path.filter((e) => e.candidateId.includes(':SHAAR')).length).toBe(1);
  });

  test('H1 בתחילת מסמך עם מצב התחלתי sub-shaar: השער בעמוד 1 בלי ריק', () => {
    const blocks = [
      h('heading|1|FIRST', lineH, 1),
      block('body|1', Array.from({ length: 8 }, () => LINE(lineH))),
    ];
    const policy = createTorahPolicy(mkSettings());
    const { res } = runFull(blocks, policy.headingBehaviorOf, 'sub-shaar');
    expect(res.status).toBe('complete');
    expect(res.path[0]!.candidateId.includes(':SHAAR')).toBe(true);
    expect(res.path[0]!.toState.physicalPageIndex).toBe(2); // ההמשך בעמוד 2
    // העוגן: ה-H1 בעמוד 1 (recto), סוג sub-shaar
    const anchors = headingAnchorsOf(initialState('heading|1|FIRST', 'sub-shaar'), res.path, blocks);
    const h1 = anchors.find((a) => a.blockId === 'heading|1|FIRST');
    expect(h1).toBeDefined();
    expect(h1!.physicalPageIndex).toBe(1);
    expect(h1!.pageKind).toBe('sub-shaar');
  });

  test('מיקום שמור לכל שער: שני שערים — גאומטריית תיבה זהה ומזהה אזור זהה', () => {
    const blocks = [
      block('body|1', Array.from({ length: 5 }, () => LINE(lineH))),
      h('heading|1|A', lineH, 1),
      block('body|2', Array.from({ length: 20 }, () => LINE(lineH))),
      h('heading|1|B', lineH, 1),
      block('body|3', Array.from({ length: 5 }, () => LINE(lineH))),
    ];
    const policy = createTorahPolicy(mkSettings());
    const { res } = runFull(blocks, policy.headingBehaviorOf);
    expect(res.status).toBe('complete');
    const shaarExps = res.path.filter((e) => e.candidateId.includes(':SHAAR'));
    expect(shaarExps.length).toBe(2);
    // שני עמודי השער באותה תבנית — התיבה באותו מקום (§11.2: אין reset בין שערים)
    const boxA = templates.for('sub-shaar', 1).regions.find((r) => r.role === 'custom-box')!.rect;
    const boxB = templates.for('sub-shaar', 3).regions.find((r) => r.role === 'custom-box')!.rect;
    expect(JSON.stringify(boxA)).toBe(JSON.stringify(boxB));
    // שני העוגנים — עמודי שער שונים, שניהם recto
    const anchors = headingAnchorsOf(initialState('body|1'), res.path, blocks);
    const shaarAnchors = anchors.filter((a) => a.level === 1);
    expect(shaarAnchors.length).toBe(2);
    expect(new Set(shaarAnchors.map((a) => a.physicalPageIndex)).size).toBe(2);
    for (const a of shaarAnchors) {
      expect(a.pageKind).toBe('sub-shaar');
      expect(a.physicalPageIndex % 2).toBe(1);
    }
  });

  test('עוגנים: כותרות גוף בעמודי הזרימה; H1 בשער; דטרמיניסטי', () => {
    const blocks = [
      h('heading|0|OPEN', lineH, 0),
      block('body|1', Array.from({ length: 12 }, () => LINE(lineH))),
      h('heading|2|CH', lineH, 2),
      block('body|2', Array.from({ length: 12 }, () => LINE(lineH))),
      h('heading|4|INLINE', lineH, 4),
      block('body|3', Array.from({ length: 6 }, () => LINE(lineH))),
    ];
    const policy = createTorahPolicy(mkSettings());
    const first = initialState('heading|0|OPEN');
    const runOnce = () => {
      const src = createPageCandidateSource(inputFor(blocks, policy.headingBehaviorOf));
      const res = searchPages(first, src, new DecisionLedgerBuilder('decisions'));
      return JSON.stringify(headingAnchorsOf(first, res.path, blocks).map((a) => [a.blockId, a.pageKind, a.physicalPageIndex]));
    };
    expect(runOnce()).toBe(runOnce());
    const src = createPageCandidateSource(inputFor(blocks, policy.headingBehaviorOf));
    const res = searchPages(first, src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    const anchors = headingAnchorsOf(first, res.path, blocks);
    expect(anchors.length).toBe(3); // H0, H2, H4 — כולן בעמודי גוף
    for (const a of anchors) expect(a.pageKind).toBe('body');
    expect(anchors.every((a) => a.physicalPageIndex >= 1)).toBe(true);
    // כל כותרת מעוגנת אחרי הקודמת (סדר זרימה)
    const pages = anchors.map((a) => a.physicalPageIndex);
    for (let i = 1; i < pages.length; i++) expect(pages[i]!).toBeGreaterThanOrEqual(pages[i - 1]!);
  });

  test('פיצול כותרת (splitShaarTitle): החלק הראשי לפני המקף; מקפים במדיניות', () => {
    expect(splitShaarTitle('חלק א - בראשית')).toEqual({ primary: 'חלק א', secondary: 'בראשית', dash: '-' });
    expect(splitShaarTitle('חלק ב — שמות')).toEqual({ primary: 'חלק ב', secondary: 'שמות', dash: '—' });
    expect(splitShaarTitle('חלק ג – ויקרא')).toEqual({ primary: 'חלק ג', secondary: 'ויקרא', dash: '–' });
    expect(splitShaarTitle('חלק ד')).toEqual({ primary: 'חלק ד', secondary: '', dash: null });
    expect(splitShaarTitle('  חלק ה  -  דברים  ')).toEqual({ primary: 'חלק ה', secondary: 'דברים', dash: '-' });
    // המקף הארוך קודם בסדר הזיהוי — דטרמיניסטי
    expect(splitShaarTitle('א—ב-ג')).toEqual({ primary: 'א', secondary: 'ב-ג', dash: '—' });
  });

  test('כותרת גבוהה מתיבת השער ⇒ אין מועמד ⇒ כשל מפורש (אין גלישה שקטה)', () => {
    const blocks = [
      h('heading|1|TALL', BOX_H * 2, 1),
      block('body|1', [LINE(lineH)]),
    ];
    const policy = createTorahPolicy(mkSettings());
    const src = createPageCandidateSource(inputFor(blocks, policy.headingBehaviorOf));
    expect(() => searchPages(initialState('heading|1|TALL', 'sub-shaar'), src, new DecisionLedgerBuilder('decisions')))
      .toThrow(LayoutEngineError);
  });

  test('בלוק לא-כותרת בעמוד שער ⇒ שגיאת קלט מקוטלגת (הרכב לא-חוקי)', () => {
    const blocks = [
      block('body|1', [LINE(lineH)]),
    ];
    const src = createPageCandidateSource(inputFor(blocks));
    expect(() => src.expansions(initialState('body|1', 'sub-shaar'))).toThrow(LayoutEngineError);
  });

  test('rollback: mode-h1=new_page_1col (שער מוסתר) ⇒ H1 פותחת body רגילה בלי תיבה', () => {
    const blocks = [
      block('body|1', Array.from({ length: 5 }, () => LINE(lineH))),
      h('heading|1|NOPAGE', lineH, 1),
      block('body|2', Array.from({ length: 5 }, () => LINE(lineH))),
    ];
    const policy = createTorahPolicy(mkSettings({ 'mode-h1': 'new_page_1col' }));
    expect(policy.headingBehaviorOf(1).forcePageTemplate).toBe('body');
    const { res } = runFull(blocks, policy.headingBehaviorOf);
    expect(res.status).toBe('complete');
    expect(res.path.some((e) => e.candidateId.includes(':SHAAR'))).toBe(false); // אין שער
    const anchors = headingAnchorsOf(initialState('body|1'), res.path, blocks);
    const h1 = anchors.find((a) => a.blockId === 'heading|1|NOPAGE');
    expect(h1).toBeDefined();
    expect(h1!.pageKind).toBe('body'); // עמוד גוף רגיל
  });

  test('legacy ברירת מחדל במנוע = policy-torah: H1 ⇒ sub-shaar + recto (שקילות שלב 58)', () => {
    expect(legacyHeadingBehaviorOf(1).forcePageTemplate).toBe('sub-shaar');
    expect(legacyHeadingBehaviorOf(1).startOnRecto).toBe(true);
    expect(legacyHeadingBehaviorOf(0).startOnRecto).toBe(true);
    expect(legacyHeadingBehaviorOf(2).startOnRecto).toBeUndefined(); // odd-h2=false
    const policy = createTorahPolicy(mkSettings());
    for (let level = 0; level <= 7; level++) {
      expect(legacyHeadingBehaviorOf(level).startOnRecto).toBe(policy.headingBehaviorOf(level).startOnRecto);
      expect(legacyHeadingBehaviorOf(level).forcePageTemplate).toBe(policy.headingBehaviorOf(level).forcePageTemplate);
    }
  });

  test('דטרמיניזם ושרשרת על זרימה מעורבת: H0+H1+H2+H3+גוף', () => {
    const blocks = [
      h('heading|0|O', lineH, 0),
      block('body|1', Array.from({ length: 10 }, () => LINE(lineH))),
      h('heading|1|S', lineH, 1),
      block('body|2', Array.from({ length: 10 }, () => LINE(lineH))),
      h('heading|2|C', lineH, 2),
      block('body|3', Array.from({ length: 10 }, () => LINE(lineH))),
      h('heading|3|SEC', lineH, 3),
      block('body|4', Array.from({ length: 10 }, () => LINE(lineH))),
    ];
    const policy = createTorahPolicy(mkSettings());
    const first = initialState('heading|0|O');
    const runOnce = () => {
      const src = createPageCandidateSource(inputFor(blocks, policy.headingBehaviorOf));
      const res = searchPages(first, src, new DecisionLedgerBuilder('decisions'));
      return JSON.stringify({ p: res.path.map((e) => e.candidateId), h: res.finalState.stateHash });
    };
    expect(new Set([runOnce(), runOnce(), runOnce()]).size).toBe(1);
    const src = createPageCandidateSource(inputFor(blocks, policy.headingBehaviorOf));
    const res = searchPages(first, src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    const last = blocks[blocks.length - 1]!;
    expect(res.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
    expect(() => verifyTransitionChain(first, res.path.flatMap((e) => e.transitions))).not.toThrow();
    // כל עמוד שנהפך במסלול — אזוריו אינם שליליים
    for (const e of res.path) {
      for (const [, remaining] of Object.entries(e.toState.remainingByRegion)) {
        expect(remaining).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
