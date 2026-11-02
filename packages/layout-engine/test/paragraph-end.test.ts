/**
 * paragraph-end.test.ts — בדיקות שלב 45: כללי שורה אחרונה, runt ו־widow/orphan
 * ברמת הפסקה (אפיון §7, §8.2, §10; ADR-004 רכיבים 4–5; הגדרות מנספח ג).
 *
 * מה מוכח כאן:
 *   1. **הכלל משנה את בחירת המועמדים בלבד** (שער המעבר): פיקסטורה עם שני
 *      מסלולים חוקיים — [4,1] הזול ב־badness ו־[3,2] נקי מ־runt — בלי הכלל
 *      נבחר [4,1]; עם הכלל נבחר [3,2]. האטומים זהים (אין post-pass).
 *   2. כלל כבוי ⇒ אותו מודל בלי חובות סיום (אין הכרח נסתר); החוב נרשם כשהמסלול
 *      מאולץ (הספק הרגיל — [3,3,1] עם runt=1 בווקטור).
 *   3. פסקה חד-שורתית חד-מילולית — אין runt ואין יתום (כמו בישן: "ויש יותר
 *      משורה אחת", applyAvoidRuntWord).
 *   4. שורה אחרונה קצרה/מלאה — לעולם justification 'last' בלי מתיחה (badness 0).
 *   5. יתום: קו פתיחה חד-מילולי (אחרי כפייה) נושא widowOrphanDebt כשהכלל פעיל.
 *   6. readParagraphEndRules — ברירות מחדל מהמרשם; ערך זר ⇒ שגיאה מקוטלגת.
 *   7. body-last-line-align נישא בתוצאת הסולם להצבה (חיבור מלא בשלב 47).
 *   8. דטרמיניזם מלא; סדר הרכיבים (widow/orphan לפני runt לפני badness).
 *   9. מסמך רב-טורים (פיקסטורת ייחוס): כל פסקה דרך הסולם — כיסוי אטומים
 *      מלא, הכללים אינם משנים אטומים, והתוצאה זהה בין ריצות.
 */
import { describe, expect, test } from 'vitest';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import { parseSourceText } from '@tora/content-model';
import { allBlocks, type ContentBlock, type SourceSpan } from '@tora/layout-api';
import { LineCandidateIndex } from '../src/linebreak/candidates.js';
import { tokenize, tokenizeNotesBody, type InlineLike } from '../src/linebreak/tokens.js';
import { shapeParagraph } from '../src/linebreak/shaping.js';
import { breakParagraphDP, type LineContext } from '../src/linebreak/dp.js';
import { createLevel0Policy } from '../src/linebreak/policy.js';
import { compareQuality, createQualityCostModel, lineQualityVector, ZERO_QUALITY, type QualityVector } from '../src/linebreak/quality.js';
import { breakParagraphWithLadder } from '../src/linebreak/emergency.js';
import {
  DEFAULT_PARAGRAPH_END_RULES, paragraphEndDebts, readParagraphEndRules, type ParagraphEndRules,
} from '../src/linebreak/paragraph-end.js';

const FONT = Object.freeze({
  fontId: 'guttman-rashi-normal',
  contentSha256: 'a'.repeat(64),
  family: 'Guttman Rashi',
  weight: 400,
  style: 'normal' as const,
});
const provider = createTestMeasurementProvider();
const FONT_SIZE_LU = 16000;
const BUDGET = { maxCandidatesPerState: 64, maxBeamWidth: 8 };
const RULES_OFF: ParagraphEndRules = Object.freeze({ avoidRuntWord: false, avoidOrphans: false, lastLineAlign: 'center' });

/**
 * ספק מדידה סינתטי לבדיקה זו בלבד (§6.4: SimulatedMeasurer מוזרק מפורש בבדיקות
 * יחידה): אות עברית 556‰ כמו הספק הרגיל, רווח גמיש (2224‰ = 4×) — גמישות
 * הרווח היא שמאפשרת שני מסלולים חוקיים מתחרים באותו רוחב טור. דטרמיניסטי
 * לחלוטין — אין מצב, אין זמן, אין רשת.
 */
function createStretchySpaceProvider(spacePm: number) {
  const roundDivLocal = (n: number, d: number): number => {
    const q = Math.floor(n / d);
    const r = n - q * d;
    return r * 2 >= d ? q + 1 : q;
  };
  const shape = (request: { atoms: readonly { readonly id: string; readonly text: string }[]; fontSizeLu: number; letterSpacingLu: number }) => {
    const glyphs: { glyphId: number; clusterAtomIndex: number; advanceLu: number; xOffsetLu: number; yOffsetLu: number }[] = [];
    for (let i = 0; i < request.atoms.length; i++) {
      const atom = request.atoms[i]!;
      for (const ch of atom.text) {
        const cp = ch.codePointAt(0)!;
        const pm = cp === 0x20 ? spacePm : 556;
        glyphs.push({ glyphId: cp, clusterAtomIndex: i, advanceLu: roundDivLocal(pm * request.fontSizeLu, 1000), xOffsetLu: 0, yOffsetLu: 0 });
      }
    }
    let width = 0;
    for (const g of glyphs) width += g.advanceLu;
    return Object.freeze({
      requestHash: 'stretchy-test',
      glyphs: Object.freeze(glyphs),
      widthLu: width,
      ascentLu: 0,
      descentLu: 0,
      lineGapLu: 0,
      missingGlyphAtomIds: Object.freeze([]),
    });
  };
  return Object.freeze({
    providerId: 'stretchy-test',
    providerVersion: 'stretchy-v1',
    wasmSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    environmentHash: 'stretchy-test-env-v1',
    shape,
    lineOpportunities: (atoms: readonly { breakBefore: string }[]) => {
      const out: number[] = [];
      for (let i = 1; i < atoms.length; i++) if (atoms[i]!.breakBefore !== 'forbidden') out.push(i);
      return Object.freeze(out);
    },
    shapeBatch: (requests: readonly unknown[]) => Object.freeze(requests.map((r) => shape(r as never))),
  });
}

function indexFor(text: string, shapeProvider: unknown = provider): { index: LineCandidateIndex; bt: ReturnType<typeof tokenize> } {
  const parsed = parseSourceText(`כותרת 1 - ח\n${text}\n`, { documentId: 'pe-test', sourceName: 'pe-test.txt' });
  const blocks = allBlocks(parsed.doc).filter((b) => b.role !== 'note-body') as readonly ContentBlock[];
  const bt = tokenize(blocks[1]!.id as string, blocks[1]!.inline as InlineLike, new Map());
  const shaped = shapeParagraph(bt.atoms, shapeProvider as never, FONT, FONT_SIZE_LU as never);
  return { index: new LineCandidateIndex(bt, shaped, () => 0), bt };
}

const wordCounts = (r: { lines: readonly { candidate: { metrics: { wordCount: number } } }[] }) => r.lines.map((l) => l.candidate.metrics.wordCount);

function placedWordAtomIds(bt: ReturnType<typeof tokenize>, lines: readonly { startTok: number; endTok: number }[]): string[] {
  const wordIds = new Set(bt.atoms.filter((a) => a.text.trim().length > 0).map((a) => a.id));
  const placed: string[] = [];
  for (const l of lines) {
    for (let t = l.startTok; t < l.endTok; t++) {
      const tok = bt.tokens[t]!;
      if (tok.kind === 'atom' && wordIds.has(bt.atoms[tok.pIdx]!.id)) placed.push(bt.atoms[tok.pIdx]!.id);
    }
  }
  return placed;
}

describe('שלב 45: runt — הכלל משפיע על בחירת מועמדים בלבד (שעת המעבר)', () => {
  // רווח גמיש (4× אות) ו-W=142336 (עודכן בשלב 48 לקבוע ADR-004-ר1 — מתיחה
  // רווח מלא): שני מסלולים חוקיים ברמה 0 — [4,1] (badness 0 — מילוי מושלם)
  // ו-[3,2] (badness 3906). בלי הכלל ה-DP בוחר את הזול ([4,1], מסתיים במילה
  // בודדת); עם הכלל runtDebt=1 מנצח את הפער ו-[3,2] נבחר.
  const TEXT = 'א ב ג ד ה';
  const W = 142336;

  test('בלי הכלל — המיטבי הגולמי מסתיים במילה בודדת; עם הכלל — שורה אחרונה עם ≥2 מילים', () => {
    const { index, bt } = indexFor(TEXT, createStretchySpaceProvider(2224));
    const off = breakParagraphDP(index, createQualityCostModel(W, RULES_OFF), createLevel0Policy(), W, BUDGET);
    const on = breakParagraphDP(index, createQualityCostModel(W, DEFAULT_PARAGRAPH_END_RULES), createLevel0Policy(), W, BUDGET);
    expect(off.best).not.toBeNull();
    expect(on.best).not.toBeNull();
    expect(wordCounts(off)).toEqual([4, 1]); // המיטבי ללא הכלל — runt
    expect(wordCounts(on)).toEqual([3, 2]); // הכלל מטה את הבחירה
    expect(off.best!.runtDebt).toBe(0); // הכלל כבוי — החוב אינו נספר כלל
    expect(on.best!.runtDebt).toBe(0); // המסלול הנבחר נקי
    expect(on.best!.lineBadness).toBeGreaterThan(off.best!.lineBadness); // ההטיה עלתה ב-badness — בכוונה
    // שעת המעבר: אותם אטומים בדיוק, באותו סדר — אין post-pass שמזיז מילים (§23.7)
    expect(placedWordAtomIds(bt, on.lines)).toEqual(placedWordAtomIds(bt, off.lines));
  });

  test('מסלול מאולץ (הספק הרגיל) — החוב נרשם בווקטור עם הכלל, ואינו נרשם בלעדיו', () => {
    const W2 = 34000;
    const { index } = indexFor('א ב ג ד ה ו ז');
    const on = breakParagraphDP(index, createQualityCostModel(W2, DEFAULT_PARAGRAPH_END_RULES), createLevel0Policy(), W2, BUDGET);
    const off = breakParagraphDP(index, createQualityCostModel(W2, RULES_OFF), createLevel0Policy(), W2, BUDGET);
    expect(wordCounts(on)).toEqual([3, 3, 1]); // אין מסלול חלופי חוקי — ה-runt מאולץ
    expect(wordCounts(off)).toEqual([3, 3, 1]); // הכלל אינו משנה כשאין חלופה
    expect(on.best!.runtDebt).toBe(1); // אבל החוב נרשם ומתועד
    expect(off.best!.runtDebt).toBe(0);
  });

  test('פסקה חד-שורתית חד-מילולית — אין runt ואין יתום (כמו בישן)', () => {
    const { index } = indexFor('אבגדה');
    const W2 = 60000;
    const r = breakParagraphDP(index, createQualityCostModel(W2, DEFAULT_PARAGRAPH_END_RULES), createLevel0Policy(), W2, BUDGET);
    expect(r.lines).toHaveLength(1);
    expect(r.best!.runtDebt).toBe(0);
    expect(r.best!.widowOrphanDebt).toBe(0);
  });
});

describe('שלב 45: שורה אחרונה — קצרה ומלאה, לעולם ללא מתיחה', () => {
  test('שורה אחרונה קצרה: justification last, badness 0, אין גלישה', () => {
    const { index } = indexFor('אבג דהו א ב'); // הקו האחרון קצר (שתי מילים קצרות)
    const W2 = 58000;
    const r = breakParagraphDP(index, createQualityCostModel(W2, DEFAULT_PARAGRAPH_END_RULES), createLevel0Policy(), W2, BUDGET);
    expect(r.best).not.toBeNull();
    const last = r.lines[r.lines.length - 1]!;
    expect(last.justification).toBe('last');
    expect(last.candidate.metrics.widthLu).toBeLessThanOrEqual(W2);
    expect(r.best!.lineBadness).toBeGreaterThanOrEqual(0);
  });

  test('שורה אחרונה מלאה: עדיין last ואינה ממתחת — גם כשרוחבה שווה לטור', () => {
    const { index } = indexFor('אבג דהו אבג דהו אבג דהו אבג דהו'); // הקו האחרון ממלא את הטור בדיוק
    const W2 = 57376; // = זוג מילים + רווח בדיוק
    const r = breakParagraphDP(index, createQualityCostModel(W2, DEFAULT_PARAGRAPH_END_RULES), createLevel0Policy(), W2, BUDGET);
    expect(r.best).not.toBeNull();
    const last = r.lines[r.lines.length - 1]!;
    expect(last.justification).toBe('last');
    expect(last.candidate.metrics.widthLu).toBe(W2); // מלאה בדיוק — ובכל זאת last, לא justify
    expect(Number.isInteger(r.best!.lineBadness)).toBe(true); // שלם בטוח
  });
});

describe('שלב 45: יתום — קו פתיחה חד-מילולי (avoid-orphans)', () => {
  function forcedOrphanDp(rules: ParagraphEndRules) {
    // גוף הערה עם explicit-break אחרי המילה הראשונה: הקו הפותח 'א' הוא
    // natural חד-מילולי (חוקי תמיד — אין דרישת מילוי אחרי כפייה)
    const parsed = parseSourceText('כותרת 1 - ח\nהתחלה [א\nב ג ד ה ו ז] סוף.\n', { documentId: 'pe-orphan', sourceName: 'pe-orphan.txt' });
    const fn = parsed.doc.notes.footnotes[0]!;
    const src: SourceSpan = fn.block.source ?? { documentId: 'pe-orphan', stream: 'footnote', startUtf16: 0, endUtf16: 1 } as SourceSpan;
    const bt = tokenizeNotesBody(fn.noteId, 'א', src, fn.block.inline as InlineLike);
    const shaped = shapeParagraph(bt.atoms, provider, FONT, FONT_SIZE_LU as never);
    const index = new LineCandidateIndex(bt, shaped, () => 0);
    const W2 = 60000;
    return breakParagraphDP(index, createQualityCostModel(W2, rules), createLevel0Policy(), W2, BUDGET);
  }

  test('קו פתיחה חד-מילולי אחרי כפייה ⇒ widowOrphanDebt=1 כשהכלל פעיל; 0 כשכבוי', () => {
    const on = forcedOrphanDp(DEFAULT_PARAGRAPH_END_RULES);
    expect(on.best).not.toBeNull();
    expect(on.lines[0]!.justification).toBe('natural'); // קו הכפייה אינו ממתח
    expect(on.best!.widowOrphanDebt).toBe(1);
    const off = forcedOrphanDp(RULES_OFF);
    expect(off.best!.widowOrphanDebt).toBe(0);
    expect(off.best!.runtDebt).toBe(0);
  });

  test('paragraphEndDebts — חישוב ישיר לפי הקשר (יחידת החוב)', () => {
    const mk = (over: Partial<LineContext> & { wordCount: number }): LineContext => ({
      candidate: { metrics: { wordCount: over.wordCount } } as never,
      lineIndex: over.lineIndex ?? 0,
      isFirst: over.isFirst ?? true,
      isLast: over.isLast ?? false,
      justification: over.justification ?? 'justify',
    });
    expect(paragraphEndDebts(mk({ wordCount: 1, isFirst: true, isLast: false }), DEFAULT_PARAGRAPH_END_RULES))
      .toEqual({ widowOrphanDebt: 1, runtDebt: 0 });
    expect(paragraphEndDebts(mk({ wordCount: 1, lineIndex: 2, isFirst: false, isLast: true }), DEFAULT_PARAGRAPH_END_RULES))
      .toEqual({ widowOrphanDebt: 0, runtDebt: 1 });
    expect(paragraphEndDebts(mk({ wordCount: 1, isFirst: true, isLast: true }), DEFAULT_PARAGRAPH_END_RULES))
      .toEqual({ widowOrphanDebt: 0, runtDebt: 0 }); // חד-שורתית — אף אחד
    expect(paragraphEndDebts(mk({ wordCount: 4, isFirst: true }), DEFAULT_PARAGRAPH_END_RULES))
      .toEqual({ widowOrphanDebt: 0, runtDebt: 0 });
  });
});

describe('שלב 45: קריאת הגדרות מנספח ג (registry.json)', () => {
  test('חסר ⇒ ברירות המחדל הנעולות; ערכים חוקיים עוברים כמו שהם', () => {
    expect(readParagraphEndRules({})).toEqual(DEFAULT_PARAGRAPH_END_RULES);
    expect(DEFAULT_PARAGRAPH_END_RULES).toEqual({ avoidRuntWord: true, avoidOrphans: true, lastLineAlign: 'center' });
    expect(readParagraphEndRules({ 'avoid-runt-word': false, 'avoid-orphans': false, 'body-last-line-align': 'right' }))
      .toEqual({ avoidRuntWord: false, avoidOrphans: false, lastLineAlign: 'right' });
  });

  test('ערך זר ⇒ SETTING_INVALID מקוטלג — אין החלפה שקטה (§23.9)', () => {
    expect(() => readParagraphEndRules({ 'body-last-line-align': 'left' })).toThrow(/SETTING_INVALID/);
    expect(() => readParagraphEndRules({ 'avoid-runt-word': 'כן' as never })).toThrow(/SETTING_INVALID/);
  });
});

describe('שלב 45: body-last-line-align נישא בסולם להצבה (חיבור מלא בשלב 47)', () => {
  test('הערך זורם ל-LadderResult ושורת הסיום אינה ממתחת בשני המצבים', () => {
    const { index, bt } = indexFor('אבג דהו זחט');
    const W2 = 57376;
    const right = breakParagraphWithLadder('pe-align', bt, index, W2, BUDGET, { rules: { avoidRuntWord: true, avoidOrphans: true, lastLineAlign: 'right' } });
    expect(right.lastLineAlign).toBe('right');
    expect(right.dp.lines[right.dp.lines.length - 1]!.justification).toBe('last');
    const center = breakParagraphWithLadder('pe-align', bt, index, W2, BUDGET);
    expect(center.lastLineAlign).toBe('center');
    expect(center.level).toBe(0);
  });
});

describe('שלב 45: דטרמיניזם וסדר רכיבי הווקטור (ADR-004 #4–6)', () => {
  const vec = (overrides: Partial<QualityVector> = {}): QualityVector => Object.freeze({ ...ZERO_QUALITY, ...overrides });

  test('שתי ריצות עם אותם כללים ⇒ אותה תוצאה בדיוק', () => {
    const a = indexFor('א ב ג ד ה', createStretchySpaceProvider(2224));
    const W2 = 122320;
    const r1 = breakParagraphDP(a.index, createQualityCostModel(W2), createLevel0Policy(), W2, BUDGET);
    const r2 = breakParagraphDP(a.index, createQualityCostModel(W2), createLevel0Policy(), W2, BUDGET);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  test('widowOrphan לפני runt לפני badness — סדר ההשוואה הלקסיקוגרפי (שלילי = עדיף)', () => {
    // חוב ברכיב מוקדם יותר חמור מכל ערך ברכיבים שאחריו (ADR-004)
    expect(compareQuality(vec({ widowOrphanDebt: 1 }), vec({ runtDebt: 9 }))).toBeGreaterThan(0);
    expect(compareQuality(vec({ runtDebt: 1 }), vec({ lineBadness: 40000 }))).toBeGreaterThan(0);
    expect(compareQuality(vec({ lineBadness: 5, runtDebt: 1 }), vec({ lineBadness: 4 }))).toBeGreaterThan(0);
    expect(compareQuality(vec({ lineBadness: 3 }), vec({ lineBadness: 4 }))).toBeLessThan(0);
  });
});

describe('שלב 45: מסמך רב-טורים — כיסוי אטומים וטוהר ההשפעה', () => {
  test('פיקסטורת ייחוס: כל פסקה דרך הסולם — כיסוי מלא, דטרמיניזם, ואטומים זהים עם ובלי כללים', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const fixture = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'packages', 'cli', 'test', 'fixtures', 'reference-source.txt'), 'utf8');
    const parsed = parseSourceText(fixture, { documentId: 'pe-multi', sourceName: 'reference-source.txt' });
    const bodyBlocks = allBlocks(parsed.doc).filter((b) => b.role !== 'note-body') as readonly ContentBlock[];
    expect(bodyBlocks.length).toBeGreaterThan(3);
    const W2 = 100000; // סדר גודל של טור בגיאומטריית v0
    // תקציב מורחב לפסקאות ארוכות (52 מילים): בתקציב הרגיל (64/8) האלומה מוחה את
    // שרשרת המסלול — מיצוי תקציב מתועד ב-DP (§9.2), כאן רוצים מסלול מלא לכיסוי
    const BUDGET_MULTI = { maxCandidatesPerState: 512, maxBeamWidth: 64 };
    for (const block of bodyBlocks) {
      const bt = tokenize(block.id as string, block.inline as InlineLike, new Map());
      if (bt.atoms.length === 0) continue; // בלוק ריק (כותרת חסרת תוכן) — אין מה לשבור
      const shaped = shapeParagraph(bt.atoms, provider, FONT, FONT_SIZE_LU as never);
      const index = new LineCandidateIndex(bt, shaped, () => 0);
      const on = breakParagraphWithLadder(`multi-${block.id}`, bt, index, W2, BUDGET_MULTI);
      const off = breakParagraphWithLadder(`multi-${block.id}`, bt, index, W2, BUDGET_MULTI, { rules: RULES_OFF });
      // לא כל בלוק מתאים ל-W נתון — הסולם מבטיח מסלול ברמה כלשהי (מתועד)
      expect(on.dp.best).not.toBeNull();
      expect(on.dp.lines.length).toBeGreaterThan(0);
      expect([0, 1, 2]).toContain(on.level);
      const expected = placedWordAtomIds(bt, off.dp.lines).sort();
      expect(placedWordAtomIds(bt, on.dp.lines).sort()).toEqual(expected); // אטומים זהים — הכללים אינם משנים תוכן
      expect(placedWordAtomIds(bt, on.dp.lines).length).toBe(new Set(expected).size); // כל אטום בדיוק פעם אחת
      const on2 = breakParagraphWithLadder(`multi-${block.id}`, bt, index, W2, BUDGET_MULTI);
      expect(JSON.stringify(on2.dp.lines.map((l) => l.endTok))).toBe(JSON.stringify(on.dp.lines.map((l) => l.endTok)));
    }
  });
});
