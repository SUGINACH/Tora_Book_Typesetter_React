/**
 * h2-opener.test.ts — בדיקות שלב 61: H2 — פותח פרק עם ריווח ועיטורים לפי scope
 * (אפיון §10.1 H2, §11.2; פרק ח/M7).
 *
 * מבחני החובה מ־§10.1/התכנית: ארבעת ה־scopes; טקסט כותרת ארוך; parity.
 *
 * מה מוכח כאן:
 *   1. **measured ornament boxes**: הריווח העליון (h2-top-distance — אחוז
 *      מגובה הטור) והעיטורים (dim-h2-top-h/btm-h — יחס לקו הראשון/האחרון)
 *      נמדדים מהגאומטריה והקווים בפועל ותופסים **בדיוק** את מקומם (שער
 *      השלב) — הגבול שכולל את הכותרת כולל אותם בגובהו.
 *   2. **ארבעת ה־scopes**: none מאפס עיטורים (הריווח נשאר); השאר —
 *      אותם ממדים בדיוק (ההבדל במיקום התיבות — ל-IR/M8; האריתמטיקה זהה).
 *   3. **טקסט ארוך**: כותרת מרובת-קווים — העיטור התחתון נמדד מהקו האחרון;
 *      כותרת שממלאה את העמוד בלי ליווי ⇒ כשל מפורש (אין גלישה שקטה).
 *   4. **parity**: odd-h2=true ⇒ עמודי H2 recto (עמוד ריק לפני verso).
 *   5. **mid-flow**: הריווח נצרם בעמוד שנפתח עבור ה-H2 — לא בעמוד הקודם.
 */
import { describe, expect, test } from 'vitest';
import { asLu, DecisionLedgerBuilder, type EffectiveSettings } from '@tora/layout-api';
import { initialPaginationState, verifyTransitionChain, type PaginationState } from '../src/pagination/state.js';
import { buildPageTemplateSet, initialRemainingByRegion, type TemplateSetInput } from '../src/pagination/templates.js';
import { searchPages } from '../src/pagination/search.js';
import {
  createPageCandidateSource,
  type CandidateGeneratorInput,
  type PaginatedBlock,
  type PaginatedLine,
} from '../src/pagination/candidates.js';
import { legacyHeadingBehaviorOf } from '../src/pagination/heading-defaults.js';
import { LayoutEngineError } from '../src/errors.js';
import { createTorahPolicy, createMinimalPolicy, parsePctDimension, parseEmDimension } from '@tora/policy-torah';

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
  initialPaginationState({
    firstBlockId,
    remainingByRegion: initialRemainingByRegion(templates.for('body', 1), 1),
  });
const runFull = (blocks: readonly PaginatedBlock[], behaviorOf?: (level: number) => unknown) => {
  const src = createPageCandidateSource(inputFor(blocks, behaviorOf));
  return { src, res: searchPages(initialState(blocks[0]!.blockId), src, new DecisionLedgerBuilder('decisions')) };
};

describe('שלב 61 — H2 ריווח ועיטורים לפי scope (§10.1, §11.2)', () => {
  const lineH = Math.floor(H / 10);
  const BEFORE = Math.round(0.22 * H);
  const TOP = Math.round(1.25 * lineH);
  const BTM = Math.round(1.25 * lineH);

  test('measured boxes: הריווח והעיטורים נצרכים בדיוק — לפני הקו הראשון ואחרי האחרון', () => {
    const blocks = [
      heading('heading|2|C', [lineH], 2),
      block('body|1', Array.from({ length: 4 }, () => LINE(lineH))),
    ];
    const { src, res } = runFull(blocks); // ברירת מחדל — H2 עם ריווח 22% + עיטורים
    expect(res.status).toBe('complete');
    const exps = src.expansions(initialState('heading|2|C'));
    // הגבול אחרי שני קווי ליווי: גובהו = ריווח + עיטור-עליון + הכותרת + עיטור-תחתון + 2 קווים
    const at2 = exps.find((e) => e.candidateId.endsWith('body|1@2'))!;
    expect(at2).toBeDefined();
    const expectedUsed = BEFORE + TOP + lineH + BTM + 2 * lineH;
    expect(at2.toState.remainingByRegion['page:1:col:0']).toBe(H - expectedUsed);
    // המעבר מתעד את הצריכה המדויקת (consume-region)
    const consume = at2.transitions.find((tr) => tr.action.kind === 'consume-region' && tr.action.regionId === 'page:1:col:0')!;
    expect(consume.action.amountLu).toBe(expectedUsed);
    expect(() => verifyTransitionChain(initialState('heading|2|C'), res.path.flatMap((e) => e.transitions))).not.toThrow();
  });

  test('ארבעת ה־scopes: none מאפס עיטורים; שאר — אותם ממדים; המדיניות מתעדת scope', () => {
    const blocks = [
      heading('heading|2|S', [lineH], 2),
      block('body|1', Array.from({ length: 4 }, () => LINE(lineH))),
    ];
    const mk = (scope: string) => createTorahPolicy(mkSettings({ 'h2-orn-scope': scope })).headingBehaviorOf;
    // none — אין עיטורים; הריווח העליון נשאר (אינו עיטור)
    const expsNone = createPageCandidateSource(inputFor(blocks, mk('none'))).expansions(initialState('heading|2|S'));
    const at2None = expsNone.find((e) => e.candidateId.endsWith('body|1@2'))!;
    expect(at2None.toState.remainingByRegion['page:1:col:0']).toBe(H - (BEFORE + lineH + 2 * lineH));
    // both / siman_only / title_only — אותה אריתמטיקה בדיוק (מיקום התיבות — ל-IR/M8)
    for (const scope of ['both', 'siman_only', 'title_only']) {
      const exps = createPageCandidateSource(inputFor(blocks, mk(scope))).expansions(initialState('heading|2|S'));
      const at2 = exps.find((e) => e.candidateId.endsWith('body|1@2'))!;
      expect(at2.toState.remainingByRegion['page:1:col:0'], scope).toBe(H - (BEFORE + TOP + lineH + BTM + 2 * lineH));
    }
    // המדיניות מתעדת את ה-scope בהתנהגות (לרישום ול-IR)
    for (const scope of ['both', 'siman_only', 'title_only', 'none']) {
      const b = createTorahPolicy(mkSettings({ 'h2-orn-scope': scope })).headingBehaviorOf(2);
      expect(b.ornaments?.scope, scope).toBe(scope);
    }
  });

  test('טקסט כותרת ארוך: מרובת-קווים — העיטור התחתון נמדד מהקו האחרון; מדויק', () => {
    const first = Math.floor(H / 20);   // קו ראשון נמוך (שורת סימן)
    const rest = Math.floor(H / 12);    // קווי כותרת גבוהים יותר
    const blocks = [
      heading('heading|2|LONG', [first, rest, rest], 2),
      block('body|1', Array.from({ length: 6 }, () => LINE(lineH))),
    ];
    const { res } = runFull(blocks);
    expect(res.status).toBe('complete');
    const btmFromLast = Math.round(1.25 * rest);
    const topFromFirst = Math.round(1.25 * first);
    const h2Total = BEFORE + topFromFirst + first + 2 * rest + btmFromLast;
    expect(h2Total).toBeLessThan(H); // נכנס עם ליווי
    const last = blocks[blocks.length - 1]!;
    expect(res.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
  });

  test('כותרת שממלאת את העמוד בלי ליווי ⇒ כשל מפורש (אין גלישה שקטה; אין חירום לכותרות)', () => {
    const blocks = [
      heading('heading|2|BIG', Array.from({ length: 5 }, () => lineH), 2), // 0.5H + 0.47H = 0.97H — אין מקום ל-2 קווי ליווי
      block('body|1', Array.from({ length: 4 }, () => LINE(lineH))),
    ];
    // ליווי 2 (המדיניות התורנית; ברירת המחדל של המחולל הגנרי — 0): הגבול
    // בסוף הכותרת והגבול אחרי קו גוף אחד — שניהם לא-חוקיים; שום גבול חוקי
    // לא נותר ⇒ תקוע ⇒ כשל מפורש
    const src = createPageCandidateSource({ ...inputFor(blocks), policy: { headingEscortLines: 2 } });
    expect(() => searchPages(initialState('heading|2|BIG'), src, new DecisionLedgerBuilder('decisions')))
      .toThrow(LayoutEngineError);
  });

  test('mid-flow: הריווח נצרם בעמוד שנפתח עבור ה-H2 — לא בעמוד הקודם', () => {
    const blocks = [
      block('body|1', Array.from({ length: 5 }, () => LINE(lineH))),
      heading('heading|2|M', [lineH], 2),
      block('body|2', Array.from({ length: 5 }, () => LINE(lineH))),
    ];
    const { res } = runFull(blocks);
    expect(res.status).toBe('complete');
    const openIdx = res.path.findIndex((e) => e.candidateId.endsWith('heading|2|M@0:OPEN'));
    expect(openIdx).toBeGreaterThanOrEqual(0);
    // העמוד החדש נפתח מלא; ה-H2 מוצבת בו עם הריווח (ההרחבה שאחרי הפתיחה כוללת את ה-extras)
    const placed = res.path[openIdx + 1]!;
    expect(placed.toState.physicalPageIndex).toBe(2);
    // צריכת הטור של ההרחבה שהציבה את ה-H2 כוללת ריווח+עיטורים+כותרת+ליווי
    const consume = placed.transitions.find((tr) => tr.action.kind === 'consume-region' && tr.action.regionId === 'page:2:col:0');
    expect(consume).toBeDefined();
    expect(consume!.action.amountLu).toBeGreaterThanOrEqual(BEFORE + TOP + lineH + BTM);
  });

  test('parity: odd-h2=true ⇒ עמודי H2 recto (עמוד ריק לפני verso); ברירת המחדל — ללא כפייה', () => {
    const blocks = [
      block('body|1', Array.from({ length: 5 }, () => LINE(lineH))),
      heading('heading|2|R', [lineH], 2),
      block('body|2', Array.from({ length: 5 }, () => LINE(lineH))),
    ];
    // ברירת מחדל (odd-h2=false): ה-H2 יכולה להיפתח ב-verso (עמוד 2)
    const { res: resDefault } = runFull(blocks);
    expect(resDefault.status).toBe('complete');
    // odd-h2=true: העמוד של ה-H2 חייב אי-זוגי
    const rectoPolicy = createTorahPolicy(mkSettings({ 'odd-h2': true }));
    const { res: resRecto } = runFull(blocks, rectoPolicy.headingBehaviorOf);
    expect(resRecto.status).toBe('complete');
    const h2PageIdx = resRecto.path.findIndex((e, i) => {
      const from = i === 0 ? initialState('body|1') : resRecto.path[i - 1]!.toState;
      return from.contentCursor.includes('heading|2|R|f0') && e.toState.contentCursor.includes('body|2');
    });
    expect(h2PageIdx).toBeGreaterThanOrEqual(0);
    const h2From = h2PageIdx === 0 ? initialState('body|1') : resRecto.path[h2PageIdx - 1]!.toState;
    expect(h2From.physicalPageIndex % 2).toBe(1); // recto
    expect(h2From.pageKind).toBe('body');
  });

  test('פרוס ממדים: parsePctDimension/parseEmDimension — ערכי legacy; פסול ⇒ ברירת מחדל', () => {
    expect(parsePctDimension('22%', 0.5)).toBe(0.22);
    expect(parsePctDimension('0%', 0.5)).toBe(0);
    expect(parsePctDimension('100%', 0.5)).toBe(1);
    expect(parsePctDimension('garbage', 0.5)).toBe(0.5);
    expect(parsePctDimension(undefined, 0.5)).toBe(0.5);
    expect(parsePctDimension('150%', 0.5)).toBe(0.5); // מחוץ לטווח ⇒ ברירת מחדל
    expect(parseEmDimension('1.25em', 2)).toBe(1.25);
    expect(parseEmDimension('0em', 2)).toBe(0);
    expect(parseEmDimension('3x', 2)).toBe(2);
    expect(parseEmDimension(undefined, 2)).toBe(2);
  });

  test('הגדרות משנות מדידה: h2-top-distance/dim-h2-top-h/dim-h2-btm-h נקראים בפועל', () => {
    const blocks = [
      heading('heading|2|X', [lineH], 2),
      block('body|1', Array.from({ length: 4 }, () => LINE(lineH))),
    ];
    const custom = createTorahPolicy(mkSettings({
      'h2-top-distance': '10%',
      'dim-h2-top-h': '2em',
      'dim-h2-btm-h': '0.5em',
    }));
    const b = custom.headingBehaviorOf(2);
    expect(b.openerSpacing).toEqual({ spaceBeforePct: 0.1, ornamentTopEm: 2, ornamentBottomEm: 0.5 });
    const exps = createPageCandidateSource(inputFor(blocks, custom.headingBehaviorOf)).expansions(initialState('heading|2|X'));
    const at2 = exps.find((e) => e.candidateId.endsWith('body|1@2'))!;
    const expected = Math.round(0.1 * H) + Math.round(2 * lineH) + lineH + Math.round(0.5 * lineH) + 2 * lineH;
    expect(at2.toState.remainingByRegion['page:1:col:0']).toBe(H - expected);
  });

  test('שקילות מנוע↔policy ל-H2 (כולל openerSpacing); מזהה קנוני כולל את הממדים', () => {
    const engineB = legacyHeadingBehaviorOf(2);
    const policyB = createTorahPolicy(mkSettings()).headingBehaviorOf(2);
    expect(engineB.openerSpacing).toEqual(policyB.openerSpacing);
    expect(engineB.openerSpacing).toEqual({ spaceBeforePct: 0.22, ornamentTopEm: 1.25, ornamentBottomEm: 1.25 });
    // מינימלית — אין ריווח (inline לא פותחת)
    const minimal = createMinimalPolicy(mkSettings());
    expect(minimal.headingBehaviorOf(2).openerSpacing).toBeUndefined();
  });

  test('דטרמיניזם ושרשרת על פרק מרובה H2', () => {
    const blocks = [
      heading('heading|2|A', [lineH], 2),
      block('body|1', Array.from({ length: 10 }, () => LINE(lineH))),
      heading('heading|2|B', [lineH, lineH], 2),
      block('body|2', Array.from({ length: 10 }, () => LINE(lineH))),
    ];
    const first = initialState('heading|2|A');
    const runOnce = () => {
      const src = createPageCandidateSource(inputFor(blocks));
      const res = searchPages(first, src, new DecisionLedgerBuilder('decisions'));
      return JSON.stringify({ p: res.path.map((e) => e.candidateId), h: res.finalState.stateHash });
    };
    expect(new Set([runOnce(), runOnce(), runOnce()]).size).toBe(1);
    const src = createPageCandidateSource(inputFor(blocks));
    const res = searchPages(first, src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    expect(() => verifyTransitionChain(first, res.path.flatMap((e) => e.transitions))).not.toThrow();
    const last = blocks[blocks.length - 1]!;
    expect(res.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
  });
});

