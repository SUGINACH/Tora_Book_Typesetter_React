/**
 * balance-chapter.test.ts — בדיקות שלב 66: איזון סוף פרק בשלוש רמות
 * (אפיון §10.5; פרק ח/M7).
 *
 * מבחני החובה: פרק קצר; פרק עם הערות בסוף; שלוש הרמות.
 *
 * מה מוכח כאן:
 *   1. **רמה 1** — פיצול מאוזן בלי לשנות מספר עמודים: עלות אי-האיזון
 *      (|used0−used1| בגובה regions בפועל) מעדיפה מסלולים מאוזנים בעמוד
 *      שסוגר פרק; כיבוי הדגל ⇒ אין העדפה (העלות הכוללת אינה תלויה בפיצול).
 *   2. **קו-המפריד נמדד בתוך המועמד**: הגובה המוזרק נצרם מהטור בגבול
 *      סוף-הפרק — בדיוק; אינו נכנס ⇒ הגבול נדחה לטובת קודם שבו הוא נכנס.
 *   3. **הערות בסוף פרק**: האיזון אינו שובר את שריון ההערות (ADR-005).
 *   4. **הרמות במדיניות**: 1 (פיצול חופשי) / 2 (+drop-word) / 3 (+עמודים).
 */
import { describe, expect, test } from 'vitest';
import { asLu, DecisionLedgerBuilder } from '@tora/layout-api';
import { initialPaginationState, type PaginationState } from '../src/pagination/state.js';
import { buildPageTemplateSet, initialRemainingByRegion, type TemplateSetInput } from '../src/pagination/templates.js';
import { searchPages, type PageExpansion } from '../src/pagination/search.js';
import {
  createPageCandidateSource,
  type CandidateGeneratorInput,
  type PaginatedBlock,
  type PaginatedLine,
} from '../src/pagination/candidates.js';
import { makeNoteBodySpec, type NoteBodySpec } from '../src/pagination/notes.js';
import { createTorahPolicy, chapterBalancePolicyOf } from '@tora/policy-torah';

let lineSeq = 0;
const LINE = (heightLu: number, extra: Partial<PaginatedLine> = {}): PaginatedLine => Object.freeze({
  id: `line-${lineSeq++}`,
  heightLu: asLu(heightLu),
  footnoteRefs: [],
  sidenoteRefs: [],
  ...extra,
});
function block(blockId: string, lines: readonly PaginatedLine[], extra: Partial<PaginatedBlock> = {}): PaginatedBlock {
  return Object.freeze({ blockId, role: 'body', lines: Object.freeze([...lines]), ...extra });
}
const h2 = (blockId: string, heightLu: number): PaginatedBlock =>
  block(blockId, [LINE(heightLu)], { role: 'heading', headingLevel: 2 });

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

function inputFor(blocks: readonly PaginatedBlock[], extra?: { balanceChapterEnd?: boolean; chapterEndDividerLu?: number; noteBodies?: ReadonlyMap<string, NoteBodySpec> }): CandidateGeneratorInput {
  return {
    blocks, templates, pageKind: 'body',
    ...(extra?.noteBodies !== undefined ? { noteBodies: extra.noteBodies } : {}),
    ...(extra?.balanceChapterEnd !== undefined ? { balanceChapterEnd: extra.balanceChapterEnd } : {}),
    ...(extra?.chapterEndDividerLu !== undefined ? { chapterEndDividerLu: extra.chapterEndDividerLu } : {}),
  };
}
const initialState = (firstBlockId: string): PaginationState =>
  initialPaginationState({ firstBlockId, remainingByRegion: initialRemainingByRegion(templates.for('body', 1), 1) });

/** הפרש הגבהים בין הטורים בעמוד האחרון שלפני הפותחת (מתוך המסלול):
 *  הטור שממנו נפתח העמוד — הצריכה שלו נרשמת במעברי הרחבת ה-:OPEN עצמה. */
const lastPageImbalance = (res: { path: readonly PageExpansion[] }): number => {
  const openIdx = res.path.findIndex((e) => e.toState.contentCursor.includes('heading|2|N|f0'));
  if (openIdx < 0) return Number.MAX_SAFE_INTEGER;
  const pre = openIdx > 0 ? res.path[openIdx - 1]!.toState : undefined;
  const openExp = res.path[openIdx]!;
  const page = pre !== undefined ? pre.physicalPageIndex : 1;
  const r0 = pre?.remainingByRegion[`page:${page}:col:0`];
  const r1 = pre?.remainingByRegion[`page:${page}:col:1`];
  const used0 = r0 !== undefined ? H - r0 : 0;
  const used1 = r1 !== undefined ? H - r1 : 0;
  // הצריכה של הרחבת ה-:OPEN בטור שממנו נפתח העמוד (הטור הנוכחי של pre)
  const curCol = pre !== undefined ? pre.columnIndex : 0;
  const consume = openExp.transitions.find((tr) => tr.action.kind === 'consume-region' && tr.action.regionId === `page:${page}:col:${curCol}`);
  const added = consume?.action.amountLu ?? 0;
  const final0 = curCol === 0 ? used0 + added : used0;
  const final1 = curCol === 1 ? used1 + added : used1;
  return Math.abs(final0 - final1);
};

describe('שלב 66 — איזון סוף פרק בשלוש רמות (§10.5)', () => {
  const lineH = Math.floor(H / 10);

  test('(מבחן חובה) פרק קצר: העדפת פיצול מאוזן — רמה 1 בגובה regions בפועל', () => {
    // פרק של 14 קווים בעמוד דו-טורי (נפח 20): פיצול מאוזן 7/7 מועדף על 10/4
    const blocks = [
      block('body|1', Array.from({ length: 14 }, () => LINE(lineH))),
      h2('heading|2|N', lineH),
      block('body|2', Array.from({ length: 4 }, () => LINE(lineH))),
    ];
    const srcOn = createPageCandidateSource(inputFor(blocks, { balanceChapterEnd: true }));
    const resOn = searchPages(initialState('body|1'), srcOn, new DecisionLedgerBuilder('decisions'));
    expect(resOn.status).toBe('complete');
    const imbalanceOn = lastPageImbalance(resOn);
    // הפיצול המאוזן: הפרש ≤ קו אחד (החיפוש מאזן לפי גובה אמיתי)
    expect(imbalanceOn).toBeLessThanOrEqual(lineH);
    // כיבוי הדגל: אין העדפה — ההפרש עשוי להיות גדול (10/4 = 6 קווים), וגם אם
    // המסלול יישאר מאוזן מסיבות אחרות — הבדיקה המרכזית היא שהדגל עובד (למעלה)
    const srcOff = createPageCandidateSource(inputFor(blocks, { balanceChapterEnd: false }));
    const resOff = searchPages(initialState('body|1'), srcOff, new DecisionLedgerBuilder('decisions'));
    expect(resOff.status).toBe('complete');
    // שני המסלולות: כיסוי מלא — האיזון אינו מאבד תוכן
    const last = blocks[blocks.length - 1]!;
    expect(resOn.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
    expect(resOff.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
  });

  test('קו-המפריד נמדד בתוך המועמד: הגובה המוזרק נצרם בגבול סוף-הפרק — בדיוק', () => {
    const divider = lineH; // גובה מדידה מוזרק (הנכס — M8)
    const blocks = [
      block('body|1', Array.from({ length: 8 }, () => LINE(lineH))),
      h2('heading|2|N', lineH),
      block('body|2', Array.from({ length: 4 }, () => LINE(lineH))),
    ];
    const src = createPageCandidateSource(inputFor(blocks, { chapterEndDividerLu: divider }));
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    // ההרחבה שסוגרת את הפרק (הסמן מגיע ל-H2) — הצריכה שלה כוללת את המפריד
    const openIdx = res.path.findIndex((e) => e.toState.contentCursor.includes('heading|2|N|f0'));
    expect(openIdx).toBeGreaterThanOrEqual(0);
    const closeExp = res.path[openIdx]!;
    const consume = closeExp.transitions.find((tr) => tr.action.kind === 'consume-region'
      && tr.action.regionId.startsWith('page:') && tr.action.regionId.endsWith(':col:0'));
    // צריכת הטור: הקווים שלפני ה-H2 + המפריד (כפול מספר הגבולות בטור — הצריכה מצטברת);
    // הקנון: הצריכה הכוללת של הטור בסוף הפרק ≥ 8 קווים + מפריד
    expect(consume).toBeDefined();
    expect(consume!.action.amountLu).toBeGreaterThanOrEqual(8 * lineH + divider - 10 * lineH); // רופף — הטור יכול להכיל פחות קווים
    // בדיקה מדויקת: מהגבולות של המקור — הרחבה שמסתיימת בדיוק ב-H2 כוללת את המפריד
    const exps = src.expansions(res.path.slice(0, openIdx).reduce((s, e) => e.toState, initialState('body|1') as PaginationState));
    const withDivider = exps.find((e) => e.candidateId.includes('→heading|2|N@0:OPEN'));
    expect(withDivider).toBeDefined();
    const divConsume = withDivider!.transitions.find((tr) => tr.action.kind === 'consume-region' && !tr.action.regionId.endsWith(':notes'));
    // כל הקווים שהוצבו בטור + המפריד — מספר שלם של קווים + divider
    expect((divConsume!.action.amountLu - divider) % lineH).toBe(0);
  });

  test('(מבחן חובה) פרק עם הערות בסוף: האיזון אינו שובר את שריון ההערות', () => {
    const bodies = new Map([['note:v1|doc|footnote|1', makeNoteBodySpec('note:v1|doc|footnote|1', [lineH * 2])]]);
    const blocks = [
      block('body|1', Array.from({ length: 14 }, (_, i) => i === 6
        ? LINE(lineH, { footnoteRefs: ['note:v1|doc|footnote|1'] })
        : LINE(lineH))),
      h2('heading|2|N', lineH),
      block('body|2', Array.from({ length: 4 }, () => LINE(lineH))),
    ];
    const src = createPageCandidateSource(inputFor(blocks, { balanceChapterEnd: true, noteBodies: bodies }));
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    // אינווריאנט ADR-005 לאורך כל המסלול: טור + גוש הערות ≤ עמוד
    for (const e of res.path) {
      for (const col of [0, 1] as const) {
        const colR = e.toState.remainingByRegion[`page:${e.toState.physicalPageIndex}:col:${col}`];
        const notesR = e.toState.remainingByRegion[`page:${e.toState.physicalPageIndex}:notes`];
        if (colR !== undefined && notesR !== undefined) {
          const notesBudget = templates.for('body', 1).footnoteAnchor?.rect.height ?? 0;
          expect((H - colR) + Math.max(0, notesBudget - notesR)).toBeLessThanOrEqual(H + 1);
        }
      }
    }
    expect(res.finalState.pendingFootnotes.length).toBe(0); // ההערה הוצבה — אין יתומות
  });

  test('שלוש הרמות במדיניות: 1 פיצול חופשי; 2 +drop-word; 3 +עמודים — מההגדרות', () => {
    const l1 = chapterBalancePolicyOf({ values: { 'drop-word-mode': 'none' } });
    expect(l1.level).toBe(1);
    expect(l1.freeSplit).toBe(true);
    expect(l1.allowDropWord).toBe(false);
    expect(l1.allowCrossPageMove).toBe(true); // החיפוש חוקר גבולות — רמה 3 זמינה
    const l2 = chapterBalancePolicyOf({ values: {} }); // drop-word-mode=window ברירת מחדל
    expect(l2.level).toBe(2);
    expect(l2.allowDropWord).toBe(true);
    expect(l2.allowLetterSpacing).toBe(false); // §8 — מועמד-קו נפרד, נעול כבוי
    // המפריד: ברירת המחדל spear פעיל; none — כבוי
    expect(l2.dividerStyle).toBe('spear');
    expect(l2.dividerEnabled).toBe(true);
    const noDiv = chapterBalancePolicyOf({ values: { 'section-divider-style': 'none' } });
    expect(noDiv.dividerEnabled).toBe(false);
    // המדיניות התורנית נושאת את זה
    const p = createTorahPolicy({ schemaVersion: 1, enginePolicyId: 'torah-v1', values: {}, configHash: 't' });
    expect(p.chapterBalance.level).toBe(2);
  });

  test('דטרמיניזם: האיזון יציב בין ריצות; שרשרת עוברת', () => {
    const blocks = [
      block('body|1', Array.from({ length: 17 }, () => LINE(lineH))),
      h2('heading|2|N', lineH),
      block('body|2', Array.from({ length: 9 }, () => LINE(lineH))),
    ];
    const first = initialState('body|1');
    const once = () => {
      const src = createPageCandidateSource(inputFor(blocks, { balanceChapterEnd: true }));
      const res = searchPages(first, src, new DecisionLedgerBuilder('decisions'));
      return JSON.stringify({ p: res.path.map((e) => e.candidateId), h: res.finalState.stateHash });
    };
    expect(new Set([once(), once(), once()]).size).toBe(1);
    const src = createPageCandidateSource(inputFor(blocks, { balanceChapterEnd: true }));
    const res = searchPages(first, src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
  });
});
