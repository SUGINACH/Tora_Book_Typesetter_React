/**
 * line-candidates.test.ts — בדיקות שלב 41: מועמדי שורה וחישוב רוחב מגליפים (§7, §8.1).
 *
 * מודל האטומים של הפרסר: מילה = אטום אחד; רצף רווחים = אטום אחד; ניקוד
 * בתוך המילה. לכן: שבירה חוקית רק בין אטומים (גבולות UAX #14 שנופלים
 * בדיוק על תחילת אטום), מקף בסוף קו נבדק בתו האחרון של אטום־המילה,
 * ורווחים עוקבים נספרים פר־רווח (ADR-004).
 *
 * מה מוכח כאן:
 *   1. רוחב מחושב מ־glyph advances של הספק — סכום ידני לפי תו.
 *   2. רווחים עוקבים בסוף קו מחוץ לרוחב (trailingSpaceLu), האטומים נשמרים;
 *      NBSP אינו נחתך ואינו נספר.
 *   3. stretch/shrink — חשבון שלם פר־רווח (k·roundDiv(roundDiv(w,k),2)).
 *   4. מילה שנגמרת במקף ⇒ hyphenEnd.
 *   5. נקודות שבירה: UAX #14 ∩ breakBefore של הפרסר; סוף פסקה תמיד קיים;
 *      הזדמנות שנאסרה מסומנת ב־blocked; explicit-break הוא נקודת forced.
 *   6. שער השלב: reconstructMetrics זהה למדידת האינדקס על כל הזוגות.
 *   7. אותם קלטים ⇒ אותו אינדקס (דטרמיניזם).
 */
import { describe, expect, test } from 'vitest';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import { parseSourceText } from '@tora/content-model';
import { allBlocks, type ContentBlock, type SourceSpan } from '@tora/layout-api';
import {
  buildLineBreakPoints,
  buildLineCandidate,
  LineCandidateIndex,
  lineCandidateId,
  reconstructMetrics,
  isTrimmableSpaceText,
} from '../src/linebreak/candidates.js';
import { tokenize, tokenizeNotesBody, type InlineLike } from '../src/linebreak/tokens.js';
import { shapeParagraph } from '../src/linebreak/shaping.js';

const FONT = Object.freeze({
  fontId: 'guttman-rashi-normal',
  contentSha256: 'a'.repeat(64),
  family: 'Guttman Rashi',
  weight: 400,
  style: 'normal' as const,
});

const provider = createTestMeasurementProvider();
const FONT_SIZE_LU = 16000; // 12pt — 1000 LU לפי pt

const SOURCE = `כותרת 1 מספר 1 - פרק ראשון
והנה פסקה עם מילים אחדות למדידת רוחב מדויקת, עם מילה- בפנים ורווחים כפולים  בסוף   וגם NBSP כאן.
ופסקה נוספת קצרה
`;

function bodyBlocks(source: string, documentId: string): readonly ContentBlock[] {
  const parsed = parseSourceText(source, { documentId, sourceName: `${documentId}.txt` });
  return allBlocks(parsed.doc).filter((b) => b.role !== 'note-body') as readonly ContentBlock[];
}

function makeBt(blockIndex: number): ReturnType<typeof tokenize> {
  const blocks = bodyBlocks(SOURCE, 'candidates-test');
  const b = blocks[blockIndex]!;
  return tokenize(b.id as string, b.inline as InlineLike, new Map());
}

// רוחב אטום לפי ספק הבדיקה: אות עברית/לטינית 556‰, רווח 250‰, פיסוק 300‰, ספרה 500‰
function expectedAtomWidthLu(text: string): number {
  let total = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    let pm = 600;
    if (cp >= 0x05d0 && cp <= 0x05ea) pm = 556;
    else if (cp === 0x20) pm = 250;
    else if ([0x2e, 0x2c, 0x3a, 0x3b, 0x21, 0x3f, 0x28, 0x29, 0x5b, 0x5d, 0x2d, 0x05be, 0x05f3, 0x05f4].includes(cp)) pm = 300;
    else if (cp >= 0x30 && cp <= 0x39) pm = 500;
    else if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) pm = 556;
    else if (cp >= 0x0591 && cp <= 0x05c7) pm = 0;
    total += Math.round((pm * FONT_SIZE_LU) / 1000);
  }
  return total;
}

describe('שלב 41: מועמדי שורה — רוחב מגליפים', () => {
  const bt = makeBt(1); // הפסקה המלאה
  const shaped = shapeParagraph(bt.atoms, provider, FONT, FONT_SIZE_LU as never);
  const index = new LineCandidateIndex(bt, shaped, () => 0);

  test('advance של כל אטום תואם לסכום וקטורי ספק הבדיקה (לא CSS, לא מילה שהומדדה בנפרד)', () => {
    for (let i = 0; i < bt.atoms.length; i++) {
      expect(shaped.advances[i]).toBe(expectedAtomWidthLu(bt.atoms[i]!.text));
    }
  });

  test('רוחב מקטע מלא = סכום advances פחות רווחים עוקבים בסוף', () => {
    const m = index.measure(0, bt.tokens.length);
    let manual = 0;
    for (let t = 0; t < bt.tokens.length; t++) {
      const tok = bt.tokens[t]!;
      if (tok.kind === 'atom') manual += shaped.advances[tok.pIdx] ?? 0;
    }
    expect(m.widthLu).toBe(manual - m.trailingSpaceLu);
  });

  test('רווחים עוקבים בסוף מקטע אינם ברוחב; האטומים לא נמחקים', () => {
    // מצא רצף רווחים כפול ("  ") ומדוד מקטע הנגמר מיד אחריו
    let runTok = -1;
    for (let t = 0; t < bt.tokens.length; t++) {
      const tok = bt.tokens[t]!;
      if (tok.kind === 'atom' && bt.atoms[tok.pIdx]!.text === '  ') { runTok = t; break; }
    }
    expect(runTok).toBeGreaterThan(0);
    const m = index.measure(0, runTok! + 1);
    expect(m.trailingSpaceLu).toBe(shaped.advances[bt.tokens[runTok!]!.kind === 'atom' ? (bt.tokens[runTok!] as { pIdx: number }).pIdx : 0]);
    expect(m.spaceCount).toBeGreaterThan(0); // הרווחים שלפני הרצף נספרים
    expect(bt.tokens[runTok!]!.kind).toBe('atom'); // האטום קיים — לא נמחק
  });

  test('stretch/shrink — חשבון שלם פר־רווח גם לאטומי רצף רווחים', () => {
    const m = index.measure(0, bt.tokens.length);
    let stretch = 0;
    let shrink = 0;
    let spaces = 0;
    for (let t = 0; t < bt.tokens.length; t++) {
      const tok = bt.tokens[t]!;
      if (tok.kind !== 'atom') continue;
      if (!isTrimmableSpaceText(bt.atoms[tok.pIdx]!.text)) continue;
      // רווחים עוקבים בסוף המקטע המלא אינם נספרים — המקטע נגמר ב"כאן." — כולם נספרים
      const k = bt.atoms[tok.pIdx]!.text.length;
      const w = shaped.advances[tok.pIdx] ?? 0;
      const perSpace = Math.round(w / k);
      stretch += k * Math.round(perSpace / 2);
      shrink += k * Math.round(perSpace / 3);
      spaces += k;
    }
    expect(m.spaceCount).toBe(spaces);
    expect(m.stretchLu).toBe(stretch);
    expect(m.shrinkLu).toBe(shrink);
  });

  test('NBSP אינו נחתך ואינו רווח נספר', () => {
    let nbspTok = -1;
    for (let t = 0; t < bt.tokens.length; t++) {
      const tok = bt.tokens[t]!;
      if (tok.kind === 'atom' && bt.atoms[tok.pIdx]!.text === '\u00a0') { nbspTok = t; break; }
    }
    expect(nbspTok).toBeGreaterThanOrEqual(0);
    expect(isTrimmableSpaceText('\u00a0')).toBe(false);
    expect(isTrimmableSpaceText('  ')).toBe(true);
    expect(isTrimmableSpaceText(' \u00a0')).toBe(false);
  });

  test('מילה שנגמרת במקף ⇒ hyphenEnd', () => {
    let hyphenTok = -1;
    for (let t = 0; t < bt.tokens.length; t++) {
      const tok = bt.tokens[t]!;
      if (tok.kind === 'atom' && bt.atoms[tok.pIdx]!.text.endsWith('-')) { hyphenTok = t; break; }
    }
    expect(hyphenTok).toBeGreaterThanOrEqual(0);
    const m = index.measure(0, hyphenTok! + 1);
    expect(m.hyphenEnd).toBe(true);
    expect(index.measure(0, bt.tokens.length).hyphenEnd).toBe(false);
  });

  test('wordCount — מקטע מילה אחת מול מספר מילים', () => {
    const plan = index.breakPlan;
    const first = plan.points[0]!;
    const m1 = index.measure(0, first.tokenIndex);
    expect(m1.wordCount).toBe(1);
    const m2 = index.measure(0, plan.points[2]!.tokenIndex);
    expect(m2.wordCount).toBe(3);
    expect(m1.singleWordWidthLu).toBe(m1.widthLu);
  });
});

describe('שלב 41: נקודות שבירה', () => {
  test('UAX #14 ∩ breakBefore של הפרסר; סוף פסקה תמיד קיים; אין כפילויות', () => {
    const bt = makeBt(1);
    const plan = buildLineBreakPoints(bt);
    expect(plan.points.length).toBeGreaterThan(1);
    const end = plan.points.find((p) => p.kind === 'end');
    expect(end).toBeDefined();
    expect(end!.tokenIndex).toBe(bt.tokens.length);
    const seen = new Set(plan.points.map((p) => p.tokenIndex));
    expect(seen.size).toBe(plan.points.length);
    for (const p of plan.points) {
      if (p.kind === 'opportunity' || p.kind === 'mandatory') {
        expect(bt.atoms[p.atomIndex]!.breakBefore).not.toBe('forbidden');
      }
    }
    // חסומה (parser-forbidden) לעולם אינה נקודה
    for (const b of plan.blocked) {
      expect(plan.points.some((p) => p.atomIndex === b.atomIndex)).toBe(false);
    }
  });

  test('שבירה כפויה (explicit-break בגוף הערה חוצת שורות) היא נקודת forced', () => {
    const parsed = parseSourceText('כותרת 1 - ח\nהתחלה [תוכן\nממשיך] סוף.\n', { documentId: 'forced-test', sourceName: 'forced.txt' });
    const fn = parsed.doc.notes.footnotes[0]!;
    expect(fn.block.inline.some((i) => i.kind === 'explicit-break')).toBe(true);
    const src: SourceSpan = fn.block.source ?? { documentId: 'forced-test', stream: 'footnote', startUtf16: 0, endUtf16: 1 } as SourceSpan;
    const bt = tokenizeNotesBody(fn.noteId, 'א', src, fn.block.inline as InlineLike);
    const plan = buildLineBreakPoints(bt);
    const forced = plan.points.filter((p) => p.kind === 'forced');
    expect(forced.length).toBe(1);
    expect(bt.tokens[forced[0]!.tokenIndex]!.kind).toBe('forced');
  });

  test('רווח בין מילים: אין שבירה לפני רווח (LB7) — הנקודות לפני מילים בלבד', () => {
    const bt = makeBt(1);
    const plan = buildLineBreakPoints(bt);
    for (const p of plan.points) {
      if (p.kind !== 'opportunity' && p.kind !== 'mandatory') continue;
      const tok = bt.tokens[p.tokenIndex]!;
      expect(tok.kind).toBe('atom');
      expect(isTrimmableSpaceText(bt.atoms[(tok as { pIdx: number }).pIdx]!.text)).toBe(false);
    }
  });
});

describe('שלב 41: שער — כל candidate ניתן לשחזור', () => {
  test('reconstructMetrics זהה למדידת האינדקס על כל הזוגות החוקיים', () => {
    const bt = makeBt(1);
    const shaped = shapeParagraph(bt.atoms, provider, FONT, FONT_SIZE_LU as never);
    const index = new LineCandidateIndex(bt, shaped, (label) => label.length * 300);
    const plan = index.breakPlan;
    let checked = 0;
    for (const start of plan.points) {
      for (const end of plan.points) {
        if (end.tokenIndex <= start.tokenIndex) continue;
        const m = index.measure(start.tokenIndex, end.tokenIndex);
        const r = reconstructMetrics(bt, shaped, (label) => label.length * 300, start.tokenIndex, end.tokenIndex);
        expect(r).toEqual(m);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  test('מזהה מועמד נגזר מזוג אינדקסי השבירה ומחזורי; טווח האטומים מקושר למקור', () => {
    const bt = makeBt(1);
    const shaped = shapeParagraph(bt.atoms, provider, FONT, FONT_SIZE_LU as never);
    const index = new LineCandidateIndex(bt, shaped, () => 0);
    const bp = index.breakPlan.points[3]!;
    const cand = buildLineCandidate(index, 0, bp);
    expect(cand.id).toBe(`c:0:${bp.tokenIndex}`);
    expect(lineCandidateId(cand.startTok, cand.endTok)).toBe(cand.id);
    expect(cand.firstAtomId).toBe(bt.atoms[0]!.id);
    expect(cand.metrics.widthLu).toBe(index.measure(0, bp.tokenIndex).widthLu);
  });

  test('אותם קלטים ⇒ אותו אינדקס בדיוק (דטרמיניזם)', () => {
    const bt = makeBt(1);
    const shaped = shapeParagraph(bt.atoms, provider, FONT, FONT_SIZE_LU as never);
    const a = new LineCandidateIndex(bt, shaped, () => 0);
    const b = new LineCandidateIndex(bt, shaped, () => 0);
    expect(a.breakPlan.points).toEqual(b.breakPlan.points);
    for (const p of a.breakPlan.points) {
      for (let t = 0; t < p.tokenIndex; t += 2) {
        expect(a.measure(t, p.tokenIndex)).toEqual(b.measure(t, p.tokenIndex));
      }
    }
  });
});
