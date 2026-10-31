/**
 * atoms.test.ts — בדיקות גבולות ל־TextAtom, לגזירת ה־AtomId, לפיצול/איחוד
 * ולספר הטרנספורמציות (שלב 15).
 *
 * אסמכתא: אפיון §6.2 · תכנית שלב 15: "אותו קלט נותן אותם ids;
 * splitting/merging נשמר בספר טרנספורמציות".
 */
import { describe, expect, it } from 'vitest';
import {
  ATOM_SCRIPTS,
  BREAK_BEFORE_KINDS,
  MAX_BIDI_LEVEL,
  TRANSFORM_KINDS,
  appendTransform,
  classifyScript,
  computeAtomCoverage,
  deriveAtomId,
  isCombiningMark,
  isTextAtom,
  isTransformRecord,
  ledgerIntegrityIssues,
  makeTextAtom,
  makeTransformRecord,
  mergeAtoms,
  splitAtom,
  transformsTouching,
} from '../src/atoms.js';
import { makeSourceSpan } from '../src/spans.js';
import { ContentModelError, isRegisteredContentModelErrorKey } from '../src/errors.js';
import type { AtomLedger, TextAtom } from '../src/atoms.js';
import type { AtomId } from '../src/spans.js';

const DOC = 'tora-canonical';

function expectAtomError(key: string, fn: () => unknown): void {
  try {
    fn();
    expect.unreachable(`היה צפוי ${key}`);
  } catch (e) {
    expect(e).toBeInstanceOf(ContentModelError);
    const err = e as ContentModelError;
    expect(err.catalogKey).toBe(key);
    expect(isRegisteredContentModelErrorKey(key)).toBe(true);
    for (const p of Object.keys(err.params)) {
      expect(typeof p).toBe('string');
    }
  }
}

describe('deriveAtomId — דטרמיניזם ופורמט', () => {
  it('אותו קלט נותן אותו מזהה — תמיד, בלי מצב', () => {
    const span = makeSourceSpan(DOC, 'body', 10, 20);
    expect(deriveAtomId(span, 0)).toBe(deriveAtomId(span, 0));
    expect(deriveAtomId(span, 3, 'insertion:simulated-page')).toBe(
      deriveAtomId(span, 3, 'insertion:simulated-page'),
    );
  });

  it('הפורמט קבוע: atom:v1|מסמך|זרם|start+end|origin|ordinal', () => {
    const id = deriveAtomId(makeSourceSpan(DOC, 'footnote', 7, 9), 2, 'insertion:demo');
    expect(id).toBe(`atom:v1|${DOC}|footnote|7+9|insertion:demo|2`);
    const srcId = deriveAtomId(makeSourceSpan(DOC, 'body', 0, 1));
    expect(srcId).toBe(`atom:v1|${DOC}|body|0+1|src|0`);
  });

  it('כל גורם זהות משנה את המזהה: מסמך, זרם, התחלה, סוף, סידור, מקור', () => {
    const base = deriveAtomId(makeSourceSpan(DOC, 'body', 5, 9), 0);
    expect(deriveAtomId(makeSourceSpan('other-doc', 'body', 5, 9), 0)).not.toBe(base);
    expect(deriveAtomId(makeSourceSpan(DOC, 'endnote', 5, 9), 0)).not.toBe(base);
    expect(deriveAtomId(makeSourceSpan(DOC, 'body', 4, 9), 0)).not.toBe(base);
    expect(deriveAtomId(makeSourceSpan(DOC, 'body', 5, 8), 0)).not.toBe(base);
    expect(deriveAtomId(makeSourceSpan(DOC, 'body', 5, 9), 1)).not.toBe(base);
    expect(deriveAtomId(makeSourceSpan(DOC, 'body', 5, 9), 0, 'insertion:x')).not.toBe(base);
  });

  it('קידוד מקטעים: | ו־% במסמך או במקור אינם יוצרים התנגשות', () => {
    const a = deriveAtomId(makeSourceSpan('doc|with|pipes', 'body', 0, 1));
    const b = deriveAtomId(makeSourceSpan('doc%7Cwith%7Cpipes', 'body', 0, 1));
    const c = deriveAtomId(makeSourceSpan('doc%257Cwith', 'body', 0, 1));
    expect(new Set([a, b, c]).size).toBe(3);
    expect(a.startsWith('atom:v1|doc%7Cwith%7Cpipes|')).toBe(true);
  });

  it('דחיות: ordinal שלילי/לא־שלם, origin ריק, span לא תקין, אורך חורג', () => {
    const span = makeSourceSpan(DOC, 'body', 0, 1);
    expectAtomError('errors.atom.INVALID_ORDINAL', () => deriveAtomId(span, -1));
    expectAtomError('errors.atom.INVALID_ORDINAL', () => deriveAtomId(span, 1.5));
    expectAtomError('errors.atom.INVALID_ORIGIN', () => deriveAtomId(span, 0, ''));
    expectAtomError('errors.atom.INVALID_ORIGIN', () => deriveAtomId(span, 0, 'bad\u0007origin'));
    expectAtomError('errors.atom.INVALID_SPAN', () => deriveAtomId({ bad: true } as never, 0));
    const longDoc = 'd'.repeat(512); // מסמך חוקי במקסימום — המזהה הנגזר כבר חורג
    expectAtomError('errors.atom.ID_DERIVATION_TOO_LONG', () =>
      deriveAtomId(makeSourceSpan(longDoc, 'body', 0, 1)),
    );
  });
});

describe('makeTextAtom — בנייה, ברירות מחדל ואכיפה', () => {
  it('ברירות מחדל: כתב מסווג, bidiLevel 0, breakBefore allowed, ordinal 0, ללא origin', () => {
    const atom = makeTextAtom('אָ', makeSourceSpan(DOC, 'body', 0, 2));
    expect(atom.script).toBe('hebrew');
    expect(atom.bidiLevel).toBe(0);
    expect(atom.breakBefore).toBe('allowed');
    expect(atom.ordinal).toBe(0);
    expect(atom.origin).toBeUndefined();
    expect(atom.id).toBe(deriveAtomId(atom.source, 0));
    expect(Object.isFrozen(atom)).toBe(true);
  });

  it('ערכים מפורשים נשמרים; המזהה נגזר גם עבורם', () => {
    const span = makeSourceSpan(DOC, 'sidenote', 3, 4, 'src.xml#p/1');
    const atom = makeTextAtom('x', span, {
      script: 'latin',
      bidiLevel: 2,
      breakBefore: 'required',
      ordinal: 5,
    });
    expect(atom.script).toBe('latin');
    expect(atom.bidiLevel).toBe(2);
    expect(atom.breakBefore).toBe('required');
    expect(atom.ordinal).toBe(5);
    expect(atom.id).toBe(deriveAtomId(span, 5));
    expect(atom.source.importerPath).toBe('src.xml#p/1');
  });

  it('אטום החדרה: origin מפורש עם פרוסה ריקה חוקי; המקור מקודד במזהה', () => {
    const point = makeSourceSpan(DOC, 'body', 12, 12);
    const atom = makeTextAtom('דף', point, { origin: 'insertion:simulated-page' });
    expect(atom.origin).toBe('insertion:simulated-page');
    expect(atom.id).toBe(deriveAtomId(point, 0, 'insertion:simulated-page'));
    expect(atom.id.includes('insertion:simulated-page')).toBe(true);
  });

  it('אטום מקור חייב לכסות את פרוסתו במדויק (תווי UTF-16)', () => {
    expectAtomError('errors.atom.TEXT_SPAN_MISMATCH', () =>
      makeTextAtom('abc', makeSourceSpan(DOC, 'body', 0, 2)),
    );
    expectAtomError('errors.atom.TEXT_SPAN_MISMATCH', () =>
      makeTextAtom('אָ', makeSourceSpan(DOC, 'body', 0, 3)),
    );
    // פרוסה ריקה בלי origin — גם אי־התאמה (טקסט לא ריק מול פרוסה ריקה)
    expectAtomError('errors.atom.TEXT_SPAN_MISMATCH', () =>
      makeTextAtom('a', makeSourceSpan(DOC, 'body', 5, 5)),
    );
  });

  it('דחיות טקסט: ריק, תו בקרה, חצי surrogate', () => {
    const span = makeSourceSpan(DOC, 'body', 0, 3);
    expectAtomError('errors.atom.INVALID_TEXT', () => makeTextAtom('', span));
    expectAtomError('errors.atom.INVALID_TEXT', () => makeTextAtom('a\u0007b', span));
    expectAtomError('errors.atom.INVALID_TEXT', () => makeTextAtom('a\tb', span));
    expectAtomError('errors.atom.INVALID_TEXT', () => makeTextAtom('a\nb', span));
    expectAtomError('errors.atom.INVALID_TEXT', () => makeTextAtom('a\u0085b', span));
    expectAtomError('errors.atom.INVALID_TEXT', () => makeTextAtom('a\uD800', makeSourceSpan(DOC, 'body', 0, 2)));
    expectAtomError('errors.atom.INVALID_TEXT', () => makeTextAtom('\uDC00a', makeSourceSpan(DOC, 'body', 0, 2)));
  });

  it('דחיות שדות: כתב, רמת BiDi, שבירה, סידור, מקור, פרוסה', () => {
    const span = makeSourceSpan(DOC, 'body', 0, 1);
    expectAtomError('errors.atom.INVALID_SCRIPT', () => makeTextAtom('a', span, { script: 'greek' as never }));
    expectAtomError('errors.atom.INVALID_BIDI_LEVEL', () => makeTextAtom('a', span, { bidiLevel: -1 }));
    expectAtomError('errors.atom.INVALID_BIDI_LEVEL', () => makeTextAtom('a', span, { bidiLevel: 1.5 }));
    expectAtomError('errors.atom.INVALID_BIDI_LEVEL', () => makeTextAtom('a', span, { bidiLevel: MAX_BIDI_LEVEL + 1 }));
    expectAtomError('errors.atom.INVALID_BREAK_BEFORE', () => makeTextAtom('a', span, { breakBefore: 'never' as never }));
    expectAtomError('errors.atom.INVALID_ORDINAL', () => makeTextAtom('a', span, { ordinal: -2 }));
    expectAtomError('errors.atom.INVALID_ORIGIN', () => makeTextAtom('a', span, { origin: '' }));
    expectAtomError('errors.atom.INVALID_SPAN', () => makeTextAtom('a', { nope: 1 } as never));
    expect(makeTextAtom('a', span, { bidiLevel: MAX_BIDI_LEVEL }).bidiLevel).toBe(MAX_BIDI_LEVEL);
  });

  it('isTextAtom: אמיתת גזירה — מזהה שלא נגזר מהשדות נדחה', () => {
    const atom = makeTextAtom('א', makeSourceSpan(DOC, 'body', 4, 5));
    expect(isTextAtom(atom)).toBe(true);
    const forged = { ...atom, id: 'atom:v1|other|body|4+5|src|0' } as TextAtom;
    expect(isTextAtom(forged)).toBe(false);
    expect(isTextAtom(null)).toBe(false);
    expect(isTextAtom({ id: atom.id, text: '' })).toBe(false);
  });
});

describe('classifyScript ו־isCombiningMark — סיווג דטרמיניסטי לקורפוס', () => {
  it('עברית: אותיות, ניקוד, טעמים, גרשיים ומקף עברי', () => {
    expect(classifyScript('א')).toBe('hebrew');
    expect(classifyScript('אָ')).toBe('hebrew'); // א + קמץ
    expect(classifyScript('בְּ')).toBe('hebrew'); // ב + שווא
    expect(classifyScript('וַיְדַבֵּר')).toBe('hebrew');
    expect(classifyScript('״')).toBe('hebrew'); // גרשיים U+05F4
    expect(classifyScript('־')).toBe('hebrew'); // מקף עברי U+05BE
    expect(classifyScript('א\u0591')).toBe('hebrew'); // טעם
  });

  it('לטינית, ספרות, פיסוק, רווח ובקרות', () => {
    expect(classifyScript('A')).toBe('latin');
    expect(classifyScript('z')).toBe('latin');
    expect(classifyScript('é')).toBe('latin');
    expect(classifyScript('5')).toBe('number');
    expect(classifyScript('0')).toBe('number');
    expect(classifyScript(',')).toBe('punctuation');
    expect(classifyScript('.')).toBe('punctuation');
    expect(classifyScript(' ')).toBe('punctuation');
    expect(classifyScript('—')).toBe('punctuation'); // קו מפריד U+2014
    expect(classifyScript('…')).toBe('punctuation');
    expect(classifyScript('×')).toBe('punctuation'); // U+00D7 — סימן, לא אות לטינית
    expect(classifyScript('\u200F')).toBe('other'); // RLM — בקרת פורמט
    expect(classifyScript('🎉')).toBe('other');
    expect(classifyScript('')).toBe('other');
  });

  it('isCombiningMark: ניקוד/טעמים בלבד — לא אותיות ולא מפרידים עבריים', () => {
    expect(isCombiningMark(0x05B8)).toBe(true); // קמץ
    expect(isCombiningMark(0x05B0)).toBe(true); // שווא
    expect(isCombiningMark(0x0591)).toBe(true); // טעם
    expect(isCombiningMark(0x05BF)).toBe(true); // רפה
    expect(isCombiningMark(0x05C1)).toBe(true); // נקודת שין
    expect(isCombiningMark(0xFE0F)).toBe(true); // variation selector
    expect(isCombiningMark(0x0301)).toBe(true); // acute
    expect(isCombiningMark(0x05D0)).toBe(false); // א
    expect(isCombiningMark(0x05BE)).toBe(false); // מקף עברי
    expect(isCombiningMark(0x05C0)).toBe(false); // פסק
    expect(isCombiningMark(0x05C3)).toBe(false); // סוף פסוק
    expect(isCombiningMark(0x05F4)).toBe(false); // גרשיים
  });

  it('הסיווג מדלג על תווים משלימים מובילים — הצרור המוביל קובע', () => {
    expect(classifyScript('ָ')).toBe('other'); // קמץ חשוף לבד
    expect(classifyScript('ָא')).toBe('hebrew'); // התו המכריע הראשון
  });
});

describe('splitAtom — גבולות חוקיים בלבד', () => {
  const parentSpan = makeSourceSpan(DOC, 'body', 10, 14); // 'אָבג' — 4 יחידות UTF-16
  const parent = makeTextAtom('אָבג', parentSpan, { bidiLevel: 1, breakBefore: 'required', ordinal: 2 });

  it('פיצול בגבול צרור: הבנים מכסים את האב, יורשים סידור/כיוון; הימני forbidden', () => {
    const { left, right, record } = splitAtom(parent, 2);
    expect(left.text).toBe('אָ');
    expect(right.text).toBe('בג');
    expect(left.source.startUtf16).toBe(10);
    expect(left.source.endUtf16).toBe(12);
    expect(right.source.startUtf16).toBe(12);
    expect(right.source.endUtf16).toBe(14);
    expect(left.bidiLevel).toBe(1);
    expect(right.bidiLevel).toBe(1);
    expect(left.breakBefore).toBe('required'); // ירושה מהאב
    expect(right.breakBefore).toBe('forbidden'); // פיצול provenance אינו הזדמנות שבירה
    expect(left.ordinal).toBe(2);
    expect(right.ordinal).toBe(2);
    expect(record.kind).toBe('split');
    expect([...record.from]).toEqual([parent.id]);
    expect([...record.to]).toEqual([left.id, right.id]);
    expect(record.detail?.at).toBe(2);
  });

  it('אין פיצול בין בסיס לניקוד שלו, לא באמצע surrogate ולא אחרי ZWJ', () => {
    expectAtomError('errors.atom.SPLIT_MID_GRAPHEME', () => splitAtom(parent, 1)); // לפני הקמץ
    const emoji = makeTextAtom('🎉x', makeSourceSpan(DOC, 'body', 0, 3));
    expectAtomError('errors.atom.SPLIT_MID_SURROGATE', () => splitAtom(emoji, 1));
    expect(splitAtom(emoji, 2).left.text).toBe('🎉');
    const zwj = makeTextAtom('א\u200Dב', makeSourceSpan(DOC, 'body', 0, 3));
    expectAtomError('errors.atom.SPLIT_MID_GRAPHEME', () => splitAtom(zwj, 2));
  });

  it('גבולות נקודת הפיצול ואטום החדרה', () => {
    expectAtomError('errors.atom.SPLIT_OUT_OF_RANGE', () => splitAtom(parent, 0));
    expectAtomError('errors.atom.SPLIT_OUT_OF_RANGE', () => splitAtom(parent, 4));
    expectAtomError('errors.atom.SPLIT_OUT_OF_RANGE', () => splitAtom(parent, -1));
    expectAtomError('errors.atom.SPLIT_OUT_OF_RANGE', () => splitAtom(parent, 1.5));
    const insertion = makeTextAtom('בד', makeSourceSpan(DOC, 'body', 5, 5), { origin: 'insertion:demo' });
    expectAtomError('errors.atom.SPLIT_EMPTY_SPAN', () => splitAtom(insertion, 1));
    expectAtomError('errors.atom.NOT_AN_ATOM', () => splitAtom({ fake: true } as never, 1));
  });
});

describe('mergeAtoms — איחוד סמוכים ו־round-trip מלא', () => {
  it('merge(split(x)) מחזיר את x במדויק — כולל המזהה', () => {
    const span = makeSourceSpan(DOC, 'body', 100, 105, 'word/document.xml#run/2'); // 'אָבגד' — 5 יחידות
    const x = makeTextAtom('אָבגד', span, { bidiLevel: 1, breakBefore: 'required', ordinal: 4 });
    const { left, right } = splitAtom(x, 3);
    const { merged, record } = mergeAtoms(left, right, { reason: 'docx-run-merge' });
    expect(merged.id).toBe(x.id);
    expect(merged.text).toBe(x.text);
    expect(merged.source).toEqual(x.source);
    expect(merged.script).toBe(x.script);
    expect(merged.bidiLevel).toBe(x.bidiLevel);
    expect(merged.breakBefore).toBe(x.breakBefore);
    expect(merged.ordinal).toBe(x.ordinal);
    expect(merged.origin).toBe(x.origin);
    expect(record.kind).toBe('merge');
    expect([...record.from]).toEqual([left.id, right.id]);
    expect([...record.to]).toEqual([merged.id]);
    expect(record.reason).toBe('docx-run-merge');
  });

  it('איחוד שני אטומי החדרה באותה נקודה', () => {
    const point = makeSourceSpan(DOC, 'body', 50, 50);
    const a = makeTextAtom('א', point, { origin: 'insertion:demo', ordinal: 0 });
    const b = makeTextAtom('ב', point, { origin: 'insertion:demo', ordinal: 1 });
    const { merged } = mergeAtoms(a, b);
    expect(merged.text).toBe('אב');
    expect(merged.source.startUtf16).toBe(50);
    expect(merged.source.endUtf16).toBe(50);
    expect(merged.origin).toBe('insertion:demo');
    expect(merged.ordinal).toBe(0); // המוביל קובע
  });

  it('דחיות: מרווח, זרם/מסמך אחר, מקור מעורב, רמת BiDi שונה', () => {
    const a = makeTextAtom('אב', makeSourceSpan(DOC, 'body', 10, 12));
    const withGap = makeTextAtom('גד', makeSourceSpan(DOC, 'body', 13, 15));
    expectAtomError('errors.atom.MERGE_NOT_ADJACENT', () => mergeAtoms(a, withGap));
    const otherStream = makeTextAtom('גד', makeSourceSpan(DOC, 'footnote', 12, 14));
    expectAtomError('errors.atom.MERGE_NOT_ADJACENT', () => mergeAtoms(a, otherStream));
    const otherDoc = makeTextAtom('גד', makeSourceSpan('other', 'body', 12, 14));
    expectAtomError('errors.atom.MERGE_NOT_ADJACENT', () => mergeAtoms(a, otherDoc));
    const inserted = makeTextAtom('גד', makeSourceSpan(DOC, 'body', 12, 12), { origin: 'insertion:demo' });
    expectAtomError('errors.atom.MERGE_INCOMPATIBLE_ORIGIN', () => mergeAtoms(a, inserted));
    const bidi2 = makeTextAtom('גד', makeSourceSpan(DOC, 'body', 12, 14), { bidiLevel: 2 });
    expectAtomError('errors.atom.MERGE_INCOMPATIBLE_BIDI', () => mergeAtoms(a, bidi2));
    // כיוון הפוך — b לפני a — אינו סמיכות חוקית
    const before = makeTextAtom('גד', makeSourceSpan(DOC, 'body', 8, 10));
    expectAtomError('errors.atom.MERGE_NOT_ADJACENT', () => mergeAtoms(a, before));
  });
});

describe('ספר טרנספורמציות — רשומות, שלמות ושאילתות', () => {
  it('משפחות הרשומות: split/merge מהפעולות; insert/suppress/reorder/bidi ידניות', () => {
    const span = makeSourceSpan(DOC, 'body', 0, 2);
    const x = makeTextAtom('אב', span);
    const { left, right, record: splitRec } = splitAtom(x, 1);
    const { merged, record: mergeRec } = mergeAtoms(left, right);
    const insRec = makeTransformRecord('insert', [], [merged.id], 'editorial-note-removal');
    const supRec = makeTransformRecord('suppress', [left.id], [], 'suppressed-bracket');
    const reorderRec = makeTransformRecord('reorder', [left.id, right.id], [right.id, left.id], 'reorder-demo');
    const bidiRec = makeTransformRecord('bidi', [x.id], [x.id], 'bidi-view');
    expect(splitRec.kind).toBe('split');
    expect(insRec.kind).toBe('insert');
    expect(supRec.kind).toBe('suppress');
    expect(reorderRec.kind).toBe('reorder');
    expect(bidiRec.kind).toBe('bidi');
  });

  it('דחיות רשומה: סוג לא קיים, צדדים ריקים, מזהה רע, סיבה ריקה, כפילות', () => {
    const id = deriveAtomId(makeSourceSpan('d', 'body', 0, 1));
    expectAtomError('errors.atom.INVALID_TRANSFORM', () =>
      makeTransformRecord('explode' as never, [id], [id], 'r'),
    );
    expectAtomError('errors.atom.INVALID_TRANSFORM', () => makeTransformRecord('split', [], [], 'r'));
    expectAtomError('errors.atom.INVALID_TRANSFORM', () => makeTransformRecord('insert', [id], [id], 'r'));
    expectAtomError('errors.atom.INVALID_TRANSFORM', () => makeTransformRecord('suppress', [id], [id], 'r'));
    expectAtomError('errors.atom.INVALID_TRANSFORM', () => makeTransformRecord('merge', [], [id], 'r'));
    expectAtomError('errors.atom.INVALID_TRANSFORM', () => makeTransformRecord('split', ['' as unknown as AtomId], [id], 'r'));
    expectAtomError('errors.atom.INVALID_TRANSFORM', () => makeTransformRecord('split', [id, id], [id], 'r'));
    expectAtomError('errors.atom.INVALID_TRANSFORM', () => makeTransformRecord('split', [id], [id], ''));
    expectAtomError('errors.atom.INVALID_TRANSFORM', () =>
      makeTransformRecord('split', [id], [id], 'r', { bad: { nested: 1 } as never }),
    );
  });

  it('appendTransform: בלתי־הפיך וקפוא; transformsTouching מוצא לפי מקור ויעד', () => {
    const x = makeTextAtom('אב', makeSourceSpan(DOC, 'body', 0, 2));
    const { left, right, record } = splitAtom(x, 1);
    let ledger: AtomLedger = [];
    ledger = appendTransform(ledger, record);
    const before = ledger.length;
    appendTransform(ledger, record); // לא משנה את הספר המקורי
    expect(ledger.length).toBe(before);
    expect(transformsTouching(ledger, x.id)).toHaveLength(1);
    expect(transformsTouching(ledger, left.id)).toHaveLength(1);
    expect(transformsTouching(ledger, right.id)).toHaveLength(1);
    const unrelated = deriveAtomId(makeSourceSpan(DOC, 'body', 99, 100));
    expect(transformsTouching(ledger, unrelated)).toHaveLength(0);
    expect(isTransformRecord(record)).toBe(true);
    expect(isTransformRecord({ kind: 'nope' })).toBe(false);
  });

  it('ledgerIntegrityIssues: round-trip נקי; לידה כפולה ומקור שלא נולד — נתפסים', () => {
    const x = makeTextAtom('אבג', makeSourceSpan(DOC, 'body', 20, 23));
    const { left, right, record: splitRec } = splitAtom(x, 1);
    const { merged, record: mergeRec } = mergeAtoms(left, right);
    const clean: AtomLedger = [splitRec, mergeRec];
    expect(ledgerIntegrityIssues(clean, [x.id])).toEqual([]);
    // אותה לידה פעמיים
    const doubleBirth: AtomLedger = [splitRec, splitRec];
    const issues = ledgerIntegrityIssues(doubleBirth, [x.id]);
    expect(issues.map((i) => i.code)).toContain('DOUBLE_BIRTH');
    // מקור שלא נולד ואינו אטום מקור מקורי
    const ghost = deriveAtomId(makeSourceSpan(DOC, 'body', 500, 501));
    const orphanRec = makeTransformRecord('suppress', [ghost], [], 'ghost-suppress');
    const orphanIssues = ledgerIntegrityIssues([orphanRec], [x.id]);
    expect(orphanIssues.map((i) => i.code)).toEqual(['UNBORN_SOURCE']);
    expect(orphanIssues[0]?.atomId).toBe(ghost);
  });
});

describe('computeAtomCoverage — כיסוי אטומים בלי רינדור', () => {
  /** בונה אטומים מפרוסות מילה/רווח של טקסט — כמו שהפרסר (שלב 17) יעשה. */
  function atomsForText(text: string, documentId: string, stream: 'body' | 'footnote' = 'body'): TextAtom[] {
    const atoms: TextAtom[] = [];
    let i = 0;
    while (i < text.length) {
      let j = i;
      const isSpace = text.charCodeAt(i) === 0x20;
      while (j < text.length && (text.charCodeAt(j) === 0x20) === isSpace) j++;
      atoms.push(makeTextAtom(text.slice(i, j), makeSourceSpan(documentId, stream, i, j)));
      i = j;
    }
    return atoms;
  }

  it('פסוק עברי מלא (ניקוד+טעמים+גרשיים+ספרות): כיסוי 100% בלי שום רינדור', () => {
    const verse = 'וַיְדַבֵּר יְהוָה אֶל מֹשֶׁה לֵּאמֹר: א׳ בראשית ב׳ ב׳׳ 17:23';
    const atoms = atomsForText(verse, DOC);
    const report = computeAtomCoverage(atoms, verse.length, DOC, 'body');
    expect(report.ok).toBe(true);
    expect(report.coveredLength).toBe(verse.length);
    expect(report.gaps).toHaveLength(0);
    expect(report.overlaps).toHaveLength(0);
    expect(report.duplicateIds).toHaveLength(0);
    expect(atoms.length).toBeGreaterThan(10); // באמת מרובה אטומים
  });

  it('דטרמיניזם: בנייה כפולה ובסדר הפוך — אותם מזהים לכל עמדה', () => {
    const verse = 'אָמַר רַבָּא אִי הָכִי';
    const once = atomsForText(verse, DOC);
    const twice = atomsForText(verse, DOC);
    expect(once.map((a) => a.id)).toEqual(twice.map((a) => a.id));
    // בנייה מחדש בסדר הפוך: המזהה של כל עמדה זהה — אין תלות בסדר הריצה
    const pieces = once.map((a) => ({ text: a.text, source: a.source }));
    const backward = [...pieces].reverse().map((p) => makeTextAtom(p.text, p.source));
    for (let i = 0; i < pieces.length; i++) {
      const forwardId = once[i]?.id;
      const backwardId = backward[pieces.length - 1 - i]?.id;
      expect(backwardId).toBe(forwardId);
    }
  });

  it('רווחים: חור באמצע וזנב חסר — מדווחים במדויק', () => {
    const atoms = [
      makeTextAtom('אב', makeSourceSpan(DOC, 'body', 0, 2)),
      makeTextAtom('גד', makeSourceSpan(DOC, 'body', 5, 7)),
    ];
    const report = computeAtomCoverage(atoms, 10, DOC, 'body');
    expect(report.ok).toBe(false);
    expect(report.gaps.map((g) => [g.startUtf16, g.endUtf16])).toEqual([[2, 5], [7, 10]]);
    expect(report.coveredLength).toBe(4);
  });

  it('חפיפה וכפילות מזהה', () => {
    const a = makeTextAtom('אב', makeSourceSpan(DOC, 'body', 0, 2));
    const b = makeTextAtom('ב', makeSourceSpan(DOC, 'body', 1, 2));
    const overlapReport = computeAtomCoverage([a, b], 2, DOC, 'body');
    expect(overlapReport.ok).toBe(false);
    expect(overlapReport.overlaps).toHaveLength(1);
    expect(overlapReport.overlaps[0]?.[0]).toEqual(a.source);
    expect(overlapReport.overlaps[0]?.[1]).toEqual(b.source);
    const dup = makeTextAtom('אב', makeSourceSpan(DOC, 'body', 0, 2));
    const dupReport = computeAtomCoverage([a, dup], 2, DOC, 'body');
    expect(dupReport.ok).toBe(false);
    expect(dupReport.duplicateIds).toEqual([a.id]);
  });

  it('החדרות, זרם זר וחריגת גבול', () => {
    const body = makeTextAtom('אב', makeSourceSpan(DOC, 'body', 0, 2));
    const insertion = makeTextAtom('דף', makeSourceSpan(DOC, 'body', 1, 1), { origin: 'insertion:page' });
    const foreign = makeTextAtom('גד', makeSourceSpan(DOC, 'footnote', 0, 2));
    const report = computeAtomCoverage([body, insertion, foreign], 2, DOC, 'body');
    expect(report.ok).toBe(true); // החדרה וזרם זר אינם פוסלים כיסוי
    expect(report.insertedAtoms).toEqual([insertion.id]);
    expect(report.outOfStream).toEqual([foreign.id]);
    const beyond = makeTextAtom('אבג', makeSourceSpan(DOC, 'body', 0, 3));
    const beyondReport = computeAtomCoverage([beyond], 2, DOC, 'body');
    expect(beyondReport.ok).toBe(false);
    expect(beyondReport.outOfRange).toEqual([beyond.id]);
  });

  it('דחיות קלט: אורך שלילי/לא־שלם, מסמך ריק', () => {
    const atoms = [makeTextAtom('א', makeSourceSpan(DOC, 'body', 0, 1))];
    expectAtomError('errors.atom.COVERAGE_INVALID_LENGTH', () => computeAtomCoverage(atoms, -1, DOC, 'body'));
    expectAtomError('errors.atom.COVERAGE_INVALID_LENGTH', () => computeAtomCoverage(atoms, 1.5, DOC, 'body'));
    expectAtomError('errors.span.INVALID_DOCUMENT_ID', () => computeAtomCoverage(atoms, 1, '', 'body'));
    // מסמך ריק לגמרי: כיסוי תקין כשאין אטומים ואין ציפייה
    expect(computeAtomCoverage([], 0, DOC, 'body').ok).toBe(true);
  });
});
