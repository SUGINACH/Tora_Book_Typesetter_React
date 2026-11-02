/**
 * unicode.test.ts — בדיקות נאמנות נוסח ו־Unicode (שלב 18, ADR-007).
 *
 * אסמכתא: אפיון §3.3 ("אין לנרמל נוסח בשקט"), §6.2 · ADR-007 · תכנית
 * שלב 18: "כל תווי הקורפוס נשמרים; מיפוי span נכון גם לאחר טרנספורמציה
 * מותרת" — הטרנספורמציה המותרת היחידה היא view מפורש.
 */
import { describe, expect, it } from 'vitest';
import {
  UNICODE_FIDELITY_RULES,
  UNICODE_NORMALIZATION_FORMS,
  UNICODE_POLICY_VERSION,
  atomFidelityIssues,
  findNormalizationSpans,
  inspectUnicode,
  normalizeView,
  normalizationDetectionInvariantHolds,
} from '../src/unicode.js';
import { parseSourceText } from '../src/parser/parse.js';
import { isRegisteredContentModelErrorKey } from '../src/errors.js';

/** הרצף האמיתי מהקורפוס: בסיס + דגש (U+05BC) + חיריק/צירה (U+05B5) — סדר עברי, לא קנוני. */
const CORPUS_NON_NFC = 'בֵּ';
const CORPUS_PROJECTION = CORPUS_NON_NFC.normalize('NFC'); // בֵּ — נקודות בסדר קודים

describe('findNormalizationSpans — גילוי בלבד, לא תיקון', () => {
  it('טקסט יציב תחת NFC — רשימה ריקה', () => {
    expect(findNormalizationSpans('שלום עליכם', 'NFC')).toEqual([]);
    expect(findNormalizationSpans('', 'NFC')).toEqual([]);
    expect(findNormalizationSpans('plain ASCII 123', 'NFC')).toEqual([]);
  });

  it('הרצף מהקורפוס (ב+דגש+תנועה) מזוהה במדויק', () => {
    const spans = findNormalizationSpans(`א לפני ${CORPUS_NON_NFC} אחרי`, 'NFC');
    expect(spans.length).toBe(1);
    expect(spans[0]?.original).toBe(CORPUS_NON_NFC);
    expect(spans[0]?.projected).toBe(CORPUS_PROJECTION);
    expect(spans[0]?.original).not.toBe(spans[0]?.projected);
    expect(spans[0]?.start).toBe('א לפני '.length);
    expect(spans[0]?.end).toBe(spans[0]?.start + CORPUS_NON_NFC.length);
  });

  it('הגילוי אינו משנה את הקלט — הטקסט נשאר מילולית', () => {
    const text = `גַּדְתָ ${CORPUS_NON_NFC} סוף`;
    const before = text;
    findNormalizationSpans(text, 'NFC');
    findNormalizationSpans(text, 'NFD');
    findNormalizationSpans(text, 'NFKC');
    expect(text).toBe(before);
  });

  it('אינווריאנט מוחלט: ריק ⟺ הטקסט יציב — על קלטים מייצגים', () => {
    const samples = [
      '', 'abc', 'שלום', CORPUS_NON_NFC,
      `x ${CORPUS_NON_NFC} y`, 'café', 'ﬁ', 'שלום\u200Fעליכם',
      String.fromCharCode(0x1100, 0x1161), // Hangul Jamo — כתב מחוץ לטבלה
      'a\u0301b', // לטינית מפורקת
    ];
    for (const text of samples) {
      for (const form of UNICODE_NORMALIZATION_FORMS) {
        expect(normalizationDetectionInvariantHolds(text, form)).toBe(true);
      }
    }
  });

  it('Hangul Jamo — כתב מחוץ לטבלה: קיום מדויק, מיקום ברמת מילה', () => {
    const jamo = String.fromCharCode(0x1100, 0x1161); // L+V מתרכב תחת NFC
    const text = `לפני ${jamo} אחרי`;
    const spans = findNormalizationSpans(text, 'NFC');
    expect(spans.length).toBe(1);
    expect(spans[0]?.start).toBe('לפני '.length);
    expect(spans[0]?.original).toBe(jamo);
  });

  it('צורה לא חוקית נדחית עם קוד קטלוגי', () => {
    expect(() => findNormalizationSpans('x', 'NFX' as never)).toThrowError(
      expect.objectContaining({ catalogKey: 'errors.unicode.INVALID_FORM' }),
    );
    expect(() => normalizeView('x', 'nfc' as never)).toThrowError();
    expect(isRegisteredContentModelErrorKey('errors.unicode.INVALID_FORM')).toBe(true);
  });

  it('NFD מדווח על תווים מרוכבים מראש (é) אך לא נוגע בהם', () => {
    const text = 'café שלום';
    const spans = findNormalizationSpans(text, 'NFD');
    expect(spans.length).toBe(1);
    expect(spans[0]?.original).toBe('é');
    expect(text).toBe('café שלום');
  });
});

describe('normalizeView — ההיתר היחיד, עם מיפוי מלא', () => {
  it('טקסט יציב — view זהה עם מיפוי זהות', () => {
    const v = normalizeView('שלום עליכם', 'NFC');
    expect(v.changed).toBe(false);
    expect(v.view).toBe('שלום עליכם');
    expect(v.viewToSource.length).toBe(10);
    expect(v.sourceToView.length).toBe(10);
    expect(v.viewToSource[3]).toBe(3);
    expect(v.changes.length).toBe(0);
  });

  it('view על הרצף מהקורפוס — הפרויקציה נכונה והמיפוי עקבי', () => {
    const prefix = 'א לפני ';
    const text = `${prefix}${CORPUS_NON_NFC} ואחרי`;
    const v = normalizeView(text, 'NFC');
    expect(v.changed).toBe(true);
    expect(v.view).toBe(text.replace(CORPUS_NON_NFC, CORPUS_PROJECTION));
    expect(v.changes.length).toBe(1);
    const ch = v.changes[0] as { start: number; end: number; original: string; projected: string };
    expect(ch.start).toBe(prefix.length);
    expect(ch.original).toBe(CORPUS_NON_NFC);
    // המיפוי: לפני השינוי — 1:1; בתוך הפרוסה שהשתנתה — כל עמדות המקור → ראשית ההקרנה
    expect(v.sourceToView.length).toBe(text.length);
    expect(v.viewToSource.length).toBe(v.view.length);
    for (let i = 0; i < prefix.length; i = i + 1) {
      expect(v.sourceToView[i]).toBe(i);
      expect(v.viewToSource[i]).toBe(i);
    }
    const vp = v.sourceToView[ch.start] as number;
    expect(typeof vp).toBe('number');
    for (let i = ch.start; i < ch.end; i = i + 1) {
      expect(v.sourceToView[i]).toBe(vp);
    }
    for (let j = vp; j < vp + ch.projected.length; j = j + 1) {
      expect(v.viewToSource[j]).toBe(ch.start);
    }
  });

  it('ה־view עצמו מנורמל — ואינו משנה את המקור', () => {
    const text = `x ${CORPUS_NON_NFC} y`;
    const v = normalizeView(text, 'NFC');
    expect(v.view.normalize('NFC')).toBe(v.view);
    expect(text).toBe(`x ${CORPUS_NON_NFC} y`); // המקור לא נפגע
  });

  it('view דטרמיניסטי — אותו קלט, אותה תוצאה', () => {
    const text = `a ${CORPUS_NON_NFC} b`;
    const v1 = normalizeView(text, 'NFC');
    const v2 = normalizeView(text, 'NFC');
    expect(v1).toEqual(v2);
  });

  it('מיפוי על תווים משלימים (מחוץ ל־BMP) — עקבי ברמת יחידות UTF-16', () => {
    const emoji = '😀'; // surrogate pair
    const text = `${emoji} ${CORPUS_NON_NFC} ${emoji}`;
    const v = normalizeView(text, 'NFC');
    expect(v.sourceToView.length).toBe(text.length);
    expect(v.viewToSource.length).toBe(v.view.length);
    // אזור לא-משתנה — מיפוי זהות פר-יחידת UTF-16 (כל חצי זוג לעצמו)
    expect(v.viewToSource[0]).toBe(0);
    expect(v.viewToSource[1]).toBe(1);
  });
});

describe('inspectUnicode — מאגר דיווח בלבד', () => {
  it('ספירות מדויקות לכל קטגוריה שננעלה ב־ADR-007', () => {
    const maqaf = 'וְכֹל';
    const text = `שלום ${'בֵּ'} ${'חַי'} ${maqaf} עולם`;
    const inv = inspectUnicode(text);
    expect(inv.policyVersion).toBe(UNICODE_POLICY_VERSION);
    expect(inv.nikudCount).toBeGreaterThan(0);
    expect(inv.maqafCount).toBe(0);
    expect(inv.lengthUtf16).toBe(text.length);
    expect(inv.codePoints).toBe([...text].length);
    expect(inv.loneSurrogates).toEqual([]);
    expect(inv.controlCharacters).toEqual([]);
  });

  it('מקף עברי (U+05BE) וגרש/גרשיים (U+05F3/U+05F4) נספרים ואינם מומרים', () => {
    const text = 'אַל\u05BEתִּקְרָא ל\u05F3גרש ו\u05F4גרשיים';
    const inv = inspectUnicode(text);
    expect(inv.maqafCount).toBe(1);
    expect(inv.gershayimCount).toBe(2);
    expect(text.includes('\u05BE')).toBe(true);
    expect(text.includes("'")).toBe(false); // לא הומר לאפוסטרוף לטיני
  });

  it('RLM נספר בשמו ואינו מוסר', () => {
    const text = 'על פני\u200F רובה';
    const inv = inspectUnicode(text);
    expect(inv.bidiControls['RLM']).toBe(1);
    expect(text.includes('\u200F')).toBe(true);
  });

  it('HTML entity ותגיות — מדווחים ממוקם; התוכן נשאר מילולי', () => {
    const text = 'לפני <b>bold</b> וגם &amp; וגם &#x05D0; בין הטקסט';
    const inv = inspectUnicode(text);
    expect(inv.htmlTagSpans.length).toBe(2); // <b> וגם </b>
    expect(inv.htmlTagSpans[0]?.text).toBe('<b>');
    expect(inv.htmlTagSpans[1]?.text).toBe('</b>');
    expect(inv.htmlEntitySpans.length).toBe(2);
    expect(inv.htmlEntitySpans[0]?.text).toBe('&amp;');
    expect(inv.htmlEntitySpans[1]?.text).toBe('&#x05D0;');
    expect(text.includes('<b>')).toBe(true);
  });

  it('חצי surrogate בודד ותווי בקרה — מדווחים בהיסטים', () => {
    const lone = String.fromCharCode(0xD800);
    const text = `a${lone}b`;
    const inv = inspectUnicode(text);
    expect(inv.loneSurrogates.length).toBe(1);
    expect(inv.loneSurrogates[0]).toBe(1);
    const withCtrl = `x\u0000y`;
    const inv2 = inspectUnicode(withCtrl);
    expect(inv2.controlCharacters).toEqual([1]);
  });

  it('em-space ו־nbsp נספרים (מדיניות שוליים/תוכן — לא נרמול)', () => {
    const text = 'שלום\u2003עולם\u00A0טוב';
    const inv = inspectUnicode(text);
    expect(inv.emSpaceCount).toBe(1);
    expect(inv.nbspCount).toBe(1);
    expect(text.includes('\u2003')).toBe(true);
  });

  it('nonNfcSpans משוקף את findNormalizationSpans(text, NFC)', () => {
    const text = `x ${CORPUS_NON_NFC} y`;
    const inv = inspectUnicode(text);
    expect(inv.nonNfcSpans.length).toBe(1);
    // NFKC וגם NFD מסדרים מחדש ניקוד באותה מחלקת הרכבה — שניהם היו משנים
    expect(inv.nfkcWouldChange).toBe(true);
    expect(inv.nfdWouldChange).toBe(true);
    // טקסט יציב לחלוטין — כל הדגלים כבויים
    const stable = inspectUnicode('שלום עולם');
    expect(stable.nonNfcSpans).toEqual([]);
    expect(stable.nfkcWouldChange).toBe(false);
    expect(stable.nfdWouldChange).toBe(false);
  });

  it('קלט לא מחרוזת נדחה עם קוד קטלוגי', () => {
    expect(() => inspectUnicode(null as never)).toThrowError(
      expect.objectContaining({ catalogKey: 'errors.unicode.INVALID_TEXT' }),
    );
  });
});

describe('UNICODE_FIDELITY_RULES — מדיניות מכונה־קריאה', () => {
  it('כל הקטגוריות שננעלו ב־ADR-007 סעיף 4 קיימות', () => {
    const categories = UNICODE_FIDELITY_RULES.map((r) => r.category);
    expect(categories).toEqual([
      'nikud', 'taamim', 'kri-ktiv', 'maqaf', 'gershayim', 'bidi-controls',
      'html-entities', 'html-tags', 'edge-whitespace', 'bom', 'normalization',
    ]);
  });

  it('אף מדיניות אינה "מתקנת" — preserve/literal/report בלבד', () => {
    for (const rule of UNICODE_FIDELITY_RULES) {
      expect(['preserve', 'preserve-attached', 'whitespace-edge-syntax', 'literal-content-with-warning', 'report-only']).toContain(rule.policy);
      expect(rule.adrSection).toMatch(/^ADR-007/);
    }
  });
});

describe('atomFidelityIssues — נאמנות ברמת האטום', () => {
  const DOC = 'fidelity-test';

  it('פרסור מלא — אפס בעיות: כל אטום שווה לפרוסת המקור', () => {
    const raw = [
      'כותרת 2 שלום',
      '',
      'גוף ראשון עם ניקוד בֵּ ובתוכו (הערת שוליים) ממשיך',
      '(גוף ההערה עצמה)',
      'שורה אחרונה',
    ].join('\n');
    const result = parseSourceText(raw, { documentId: DOC });
    expect(result.coverage.ok).toBe(true);
    expect(atomFidelityIssues(raw, result.doc)).toEqual([]);
  });

  it('הרצף מהקורפוס (non-NFC) עובר מילולית דרך הפרסר', () => {
    const raw = `כותרת 2 בדיקה\n\nגוף עם ${CORPUS_NON_NFC} בפנים`;
    const result = parseSourceText(raw, { documentId: DOC });
    expect(result.coverage.ok).toBe(true);
    expect(atomFidelityIssues(raw, result.doc)).toEqual([]);
    // האטום שמכיל את הרצף — הטקסט שלו מילולי, לא מנורמל
    let found = false;
    for (const block of result.doc.parts.flatMap((p) => p.simanim.flatMap((s) => s.blocks))) {
      for (const item of block.inline) {
        if (item.kind !== 'text') continue;
        for (const atom of item.atoms) {
          if (atom.text.includes(CORPUS_NON_NFC)) found = true;
        }
      }
    }
    expect(found).toBe(true);
  });

  it('מסמך מפוברק עם אטום שקר על המקור — נתפס', () => {
    const raw = 'כותרת 2 x\n\nגוף';
    const result = parseSourceText(raw, { documentId: DOC });
    // זיוף ידני: החלפת הטקסט של אטום מקור בנורמל שלו
    const doc = structuredClone(result.doc) as typeof result.doc;
    outer: for (const part of doc.parts) {
      for (const siman of part.simanim) {
        for (const block of siman.blocks) {
          for (const item of block.inline) {
            if (item.kind !== 'text') continue;
            for (const atom of item.atoms) {
              if (atom.origin === undefined && atom.text.length > 0) {
                (atom as { text: string }).text = atom.text.normalize('NFC') === atom.text ? `${atom.text}!` : atom.text.normalize('NFC');
                break outer;
              }
            }
          }
        }
      }
    }
    const issues = atomFidelityIssues(raw, doc);
    expect(issues.length).toBe(1);
    expect(issues[0]?.kind).toBe('atom-text-mismatch');
  });

  it('RLM בתוך גוף — נשמר באטום מילולית', () => {
    const raw = 'כותרת 2 x\n\nעל פני\u200F רובה';
    const result = parseSourceText(raw, { documentId: DOC });
    expect(atomFidelityIssues(raw, result.doc)).toEqual([]);
    let rlmAtom = false;
    for (const block of result.doc.parts.flatMap((p) => p.simanim.flatMap((s) => s.blocks))) {
      for (const item of block.inline) {
        if (item.kind === 'text') {
          for (const atom of item.atoms) {
            if (atom.text.includes('\u200F')) rlmAtom = true;
          }
        }
      }
    }
    expect(rlmAtom).toBe(true);
  });
});
