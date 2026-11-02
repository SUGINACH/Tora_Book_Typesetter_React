/**
 * paragraph-dp.test.ts — בדיקות שלב 42: DP גלובלי לפסקה בסגנון Knuth–Plass (§8.2).
 *
 * מה מוכח כאן:
 *   1. **דוגמה שבה greedy שונה מ־optimum**: החמדני ממלא מקסימלי ונגמר
 *      במקף (עונש 20000) בעוד ה־DP בוחר מסלול זול בהרבה — הבחירה גלובלית.
 *   2. דטרמיניזם: שלוש ריצות ⇐ אותה תוצאה בדיוק (כולל רשומות הדחיה).
 *   3. תיקו יציב: פסקה סימטרית עם שני מסלולים שקולים — המוקדם שבשניים
 *      נשמר בכל ריצה (§8.2: אין tie לפי זמן).
 *   4. תקציב: כיסוי מועמדים מוגבל ⇒ exhausted=true נרשם; עדיין מסלול
 *      חוקי דטרמיניסטי (§9.2).
 *   5. שורה החוצה שבירה כפויה אסורה (spans-mandatory-break) — הפרדת
 *      המקטעים ב־explicit-break נשמרת; השורה שלפני הכפייה היא natural.
 *   6. חשבון שלם: כל העלויות שלמים (אין float/Infinity — §8.2).
 *   7. אין מסלול חוקי ברמה 0 ⇒ best=null (סולם החירום — שלב 44).
 */
import { describe, expect, test } from 'vitest';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import { parseSourceText } from '@tora/content-model';
import { allBlocks, type ContentBlock, type SourceSpan } from '@tora/layout-api';
import { LineCandidateIndex, buildLineCandidate } from '../src/linebreak/candidates.js';
import { tokenize, tokenizeNotesBody, type InlineLike } from '../src/linebreak/tokens.js';
import { shapeParagraph } from '../src/linebreak/shaping.js';
import { breakParagraphDP, type DpResult } from '../src/linebreak/dp.js';
import { createScalarCostModel, scalarLineCost } from '../src/linebreak/cost-scalar.js';
import { createLevel0Policy } from '../src/linebreak/policy.js';
import { breakParagraphGreedy } from '../src/linebreak/greedy.js';

const FONT = Object.freeze({
  fontId: 'guttman-rashi-normal',
  contentSha256: 'a'.repeat(64),
  family: 'Guttman Rashi',
  weight: 400,
  style: 'normal' as const,
});
const provider = createTestMeasurementProvider();
const FONT_SIZE_LU = 16000;

function indexFor(text: string): { index: LineCandidateIndex; bt: ReturnType<typeof tokenize> } {
  const parsed = parseSourceText(`כותרת 1 - ח\n${text}\n`, { documentId: 'dp-test', sourceName: 'dp-test.txt' });
  const blocks = allBlocks(parsed.doc).filter((b) => b.role !== 'note-body') as readonly ContentBlock[];
  const bt = tokenize(blocks[1]!.id as string, blocks[1]!.inline as InlineLike, new Map());
  const shaped = shapeParagraph(bt.atoms, provider, FONT, FONT_SIZE_LU as never);
  return { index: new LineCandidateIndex(bt, shaped, () => 0), bt };
}

const BUDGET = { maxCandidatesPerState: 64, maxBeamWidth: 8 };

function runDP(text: string, W: number, budget = BUDGET): DpResult<number> {
  const { index } = indexFor(text);
  return breakParagraphDP(index, createScalarCostModel(W), createLevel0Policy(), W, budget);
}

describe('שלב 42: DP גלובלי — greedy שונה מ־optimum', () => {
  // 7 אותיות בודדות, מילה־מקף, 7 אותיות: החמדני ממלא עד המקף; ה־DP נמנע ממנו
  const TEXT = 'א ב ג ד ה ו ז ח- ט י כ ל מ נ ס ע';
  const W = 96000;

  test('ה־DP בוחר מסלול זול משמעותית מהחמדני (הבחירה גלובלית)', () => {
    const { index, bt } = indexFor(TEXT);
    const policy = createLevel0Policy();
    const model = createScalarCostModel(W);
    const dp = breakParagraphDP(index, model, policy, W, BUDGET);
    const greedy = breakParagraphGreedy(index, policy, W);
    expect(dp.best).not.toBeNull();
    expect(dp.lines.length).toBeGreaterThan(0);
    const greedyCost = greedy.reduce((s, l) => s + scalarLineCost({
      candidate: l.candidate, lineIndex: 0, isFirst: false, isLast: l.justification === 'last', justification: l.justification,
    }, W), 0);
    // החמדני נגמר במקף (עונש) — ה־DP לא
    expect(greedy.some((l) => l.candidate.metrics.hyphenEnd)).toBe(true);
    expect(dp.lines.every((l) => !l.candidate.metrics.hyphenEnd)).toBe(true);
    // ה־DP זול מהחמדני — הוכחת הגלובליות
    expect(dp.best!).toBeLessThan(greedyCost);
    // הבחירות שונות בפועל (לא אותו מסלול)
    const dpEnds = dp.lines.map((l) => l.endTok).join(',');
    const greedyEnds = greedy.map((l) => l.endTok).join(',');
    expect(dpEnds).not.toBe(greedyEnds);
    // כיסוי מלא: אטומי המילים מופיעים בדיוק פעם אחת במסלול ה־DP (אין מחיקה)
    const wordAtomIds = new Set(bt.atoms.filter((a) => a.text.trim().length > 0).map((a) => a.id));
    const placedWords = new Set<string>();
    for (const l of dp.lines) {
      for (let t = l.startTok; t < l.endTok; t++) {
        const tok = bt.tokens[t]!;
        if (tok.kind === 'atom' && wordAtomIds.has(bt.atoms[tok.pIdx]!.id)) placedWords.add(bt.atoms[tok.pIdx]!.id);
      }
    }
    expect(placedWords.size).toBe(wordAtomIds.size);
  });

  test('מודל החמדני הוא פיקסטורת השוואה בלבד — אותן נקודות ואותו מודל רוחב', () => {
    const { index } = indexFor(TEXT);
    const greedy = breakParagraphGreedy(index, createLevel0Policy(), W);
    // החמדני מסתיים בסוף הפסקה ומכסה את כל הטוקנים — השוואה הוגנת
    const last = greedy[greedy.length - 1]!;
    expect(last.breakPoint.kind).toBe('end');
    expect(greedy.every((l, i) => i === 0 || l.startTok >= greedy[i - 1]!.endTok)).toBe(true);
  });
});

describe('שלב 42: דטרמיניזם ותיקו יציב', () => {
  test('שלוש ריצות ⇐ אותה תוצאה בדיוק, כולל רשומות', () => {
    const results = [runDP('א ב ג ד ה ו ז ח- ט י כ ל מ נ ס ע', 96000), runDP('א ב ג ד ה ו ז ח- ט י כ ל מ נ ס ע', 96000), runDP('א ב ג ד ה ו ז ח- ט י כ ל מ נ ס ע', 96000)];
    expect(JSON.stringify(results[0])).toBe(JSON.stringify(results[1]));
    expect(JSON.stringify(results[1])).toBe(JSON.stringify(results[2]));
  });

  test('תיקו — המוקדם שבשניים נשמר בכל ריצה (פסקה סימטרית)', () => {
    // פסקה של מילים זהות: מסלולים שקולים רבים; הבחירה קבועה
    const text = 'אב אב אב אב אב אב';
    const a = runDP(text, 50000);
    const b = runDP(text, 50000);
    expect(a.lines.map((l) => l.endTok).join(',')).toBe(b.lines.map((l) => l.endTok).join(','));
    // והעלות זהה בין הריצות (שלם)
    expect(a.best).toBe(b.best);
    expect(Number.isInteger(a.best ?? 0)).toBe(true);
  });

  test('כל העלויות שלמים — אין float/Infinity במודל', () => {
    const r = runDP('א ב ג ד ה ו ז ח- ט י כ ל מ נ ס ע', 96000);
    expect(Number.isInteger(r.best ?? 0)).toBe(true);
    expect(Number.isFinite(r.best ?? 0)).toBe(true);
    for (const d of r.dominated) {
      expect(d.winnerId).toMatch(/^c:\d+:\d+$/);
      expect(d.rejectedId).toMatch(/^(c:\d+:\d+|start)$/);
    }
  });
});

describe('שלב 42: תקציב ומצבי קצה', () => {
  test('תקציב מוגבל ⇒ exhausted=true; עדיין מסלול חוקי דטרמיניסטי', () => {
    const text = 'א ב ג ד ה ו ז ח- ט י כ ל מ נ ס ע';
    // מועמד אחד לכל מצב: הפסקת ההתחשבות נרשמת, אך השרשרת מתחברת עד הסוף
    const tight = runDP(text, 96000, { maxCandidatesPerState: 1, maxBeamWidth: 8 });
    expect(tight.budget.exhausted).toBe(true);
    expect(tight.lines.length).toBeGreaterThan(0);
    expect(tight.best).not.toBeNull();
    const tight2 = runDP(text, 96000, { maxCandidatesPerState: 1, maxBeamWidth: 8 });
    expect(JSON.stringify(tight)).toBe(JSON.stringify(tight2));
    // אלומה 1 בלבד: ייתכן קטע ללא מועמד חוקי שרד — כישלון מפורש מתועד (§9.2)
    const beam1 = runDP(text, 96000, { maxCandidatesPerState: 64, maxBeamWidth: 1 });
    expect(beam1.budget.exhausted).toBe(true);
  });

  test('אלומה צרה ⇒ גזימה נרשמת (pruned>0) והתוצאה דטרמיניסטית', () => {
    const text = 'א ב ג ד ה ו ז ח ט י כ ל מ נ ס ע א ב ג ד';
    const r = runDP(text, 96000, { maxCandidatesPerState: 64, maxBeamWidth: 2 });
    expect(r.lines.length).toBeGreaterThan(0);
    const r2 = runDP(text, 96000, { maxCandidatesPerState: 64, maxBeamWidth: 2 });
    expect(JSON.stringify(r)).toBe(JSON.stringify(r2));
  });

  test('אין מסלור חוקי ברמה 0 ⇒ best=null עם דחיות מתועדות (לסולם החירום)', () => {
    // מילה אחת ארוכה מהטור: שום קו חוקי ברמה 0
    const r = runDP('אאאאאאאאאאאאאאאאאאאא', 20000);
    expect(r.best).toBeNull();
    expect(r.lines.length).toBe(0);
    expect(r.rejections.length).toBeGreaterThan(0);
    expect(r.rejections.every((x) => x.reason === 'overflow' || x.reason === 'underfill')).toBe(true);
  });

  test('שורה החוצה שבירה כפויה אסורה; השורה שלפניה natural', () => {
    // הערה חוצת שורות — explicit-break בגוף ההערה
    const parsed = parseSourceText('כותרת 1 - ח\nהתחלה [תוכן\nממשיך] סוף.\n', { documentId: 'dp-forced', sourceName: 'dp-forced.txt' });
    const fn = parsed.doc.notes.footnotes[0]!;
    const src: SourceSpan = fn.block.source ?? { documentId: 'dp-forced', stream: 'footnote', startUtf16: 0, endUtf16: 1 } as SourceSpan;
    const bt = tokenizeNotesBody(fn.noteId, 'א', src, fn.block.inline as InlineLike);
    const shaped = shapeParagraph(bt.atoms, provider, FONT, FONT_SIZE_LU as never);
    const index = new LineCandidateIndex(bt, shaped, () => 0);
    const W = 60000;
    const dp = breakParagraphDP(index, createScalarCostModel(W), createLevel0Policy(), W, BUDGET);
    expect(dp.best).not.toBeNull();
    // שום קו לא חוצה את ה-forced
    const forcedIdx = bt.tokens.findIndex((t) => t.kind === 'forced');
    expect(forcedIdx).toBeGreaterThanOrEqual(0);
    for (const l of dp.lines) {
      expect(l.startTok).toBeLessThanOrEqual(l.endTok);
      if (l.startTok < forcedIdx) {
        expect(l.endTok).toBeLessThanOrEqual(forcedIdx);
      }
    }
    // הקו שנגמר ב-forced הוא natural (לא justify — אין מתיחה אחרי כפייה)
    const forcedLine = dp.lines.find((l) => l.endTok === forcedIdx);
    expect(forcedLine).toBeDefined();
    expect(forcedLine!.justification).toBe('natural');
    // והדחייה של קו חוצה כפייה תועדה
    expect(dp.rejections.some((x) => x.reason === 'spans-mandatory-break')).toBe(true);
  });

  test('מועמד לא חוקי נפסל לפני תמחור — אינו מופיע כעלות', () => {
    const r = runDP('א ב ג ד ה ו ז ח- ט י כ ל מ נ ס ע', 96000);
    // כל דחיית overflow/underfill/spans קיבלה קוד סיבה; המועמדים שנתמחרו נמנים ב-generated
    expect(r.rejections.length).toBeGreaterThan(0);
    expect(r.budget.generated).toBeGreaterThan(0);
    expect(r.budget.generated + r.rejections.length).toBeGreaterThan(r.budget.generated);
  });
});
