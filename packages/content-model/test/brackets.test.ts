/**
 * brackets.test.ts — בדיקות עץ סוגריים מבני (שלב 19).
 *
 * אסמכתא: אפיון §10.4 ("bracket tree ולא regex לוקאלי"; "סוגר לא סגור
 * מדווח; לא מתוקן בשקט") · תכנית שלב 19: "קינון, סוגריים חוצי
 * שורות/עמודים, קלט פגום".
 *
 * הערת דקדוק חשובה להבנת הבדיקות: תוחמי הערות השוליים הם סוגריים
 * מרובעים [..] והם תחביר (חולצו בשלב 17); סוגריים מרובעים מילוליים
 * נשארים תוכן רק כשאינם מוצלחים כהערה (פתוח בלי סגור/חוצה פסקאות) או
 * בתוך טקסט H7. סוגריים עגולים (..) הם תוכן גוף רגיל.
 */
import { describe, expect, it } from 'vitest';
import { blockExitState, crossingPairs, endsInsideBracket, scanBrackets } from '../src/brackets.js';
import { parseSourceText } from '../src/parser/parse.js';
import { isRegisteredContentModelErrorKey } from '../src/errors.js';

const DOC = 'brackets-test';

describe('scanBrackets — קינון ותוכן', () => {
  it('זוג עגול פשוט בגוף — מזהה, פרוסות, עומק, בלוק אחד', () => {
    const raw = 'כותרת 2 x\n\nלפני (בפנים) אחרי';
    const result = parseSourceText(raw, { documentId: DOC });
    expect(result.brackets.body.pairs.length).toBe(1);
    const pair = result.brackets.body.pairs[0]!;
    expect(pair.kind).toBe('round');
    expect(pair.depth).toBe(1);
    expect(pair.blockIds.length).toBe(1);
    expect(raw.slice(pair.openSpan.startUtf16, pair.openSpan.endUtf16)).toBe('(');
    expect(raw.slice(pair.closeSpan!.startUtf16, pair.closeSpan!.endUtf16)).toBe(')');
    expect(pair.id).toMatch(/^bracket:v1\|/);
    expect(result.brackets.body.issues).toEqual([]);
  });

  it('קינון בין סוגים בתוך שורת H7 (סוגריים מילוליים בזרם הערת הצד) — square שורש, round ילד', () => {
    // הסוגריים בגוף שורת H7 עצמה: מרשם שלב 17 — "לא מחולצים כהערות שוליים — שורת H7 הוסרה לפני שלב הסוגריים"
    const raw = 'כותרת 1 - חלק\nכותרת 7 - הערה [עם (סוגריים) עגולים] בפנים\nפסקה מוצמדת\n\nגוף רגיל';
    const result = parseSourceText(raw, { documentId: DOC });
    const sideNotes = result.brackets.notes.filter((n) => n.kind === 'sidenote');
    expect(sideNotes.length).toBe(1);
    const scan = sideNotes[0]!.scan;
    expect(scan.pairs.length).toBe(2);
    const square = scan.pairs.find((p) => p.kind === 'square');
    const round = scan.pairs.find((p) => p.kind === 'round');
    expect(square).toBeDefined();
    expect(round).toBeDefined();
    expect(round!.depth).toBe(2);
    expect(square!.children.length).toBe(1);
    expect(square!.children[0]!.id).toBe(round!.id);
    expect(scan.maxDepth).toBe(2);
    expect(scan.issues).toEqual([]);
  });

  it('זוג עגול שחוצה הפניית הערה (note-reference) — מבני, בלי להישבר', () => {
    const raw = 'כותרת 2 x\n\nלפני (פתיחה [הערה] המשך) אחרי';
    const result = parseSourceText(raw, { documentId: DOC });
    expect(result.doc.notes.footnotes.length).toBe(1);
    expect(result.brackets.body.pairs.length).toBe(1);
    const pair = result.brackets.body.pairs[0]!;
    expect(pair.kind).toBe('round');
    // פותח לפני ההפניה ונסגר אחריה — ההפניה בין שני התווים
    expect(pair.openSpan.startUtf16).toBeLessThan(pair.closeSpan.startUtf16);
  });

  it('מחסנית פר־סוג — ( [ ) : העגול נסגר, המרובע מדווח כלא-סגור', () => {
    // המרובע פתוח בלי סגירה → לא הערה → מילולי; העגול תוכן
    const raw = 'כותרת 2 x\n\nא ( ב [ ג ) ד';
    const result = parseSourceText(raw, { documentId: DOC });
    const scan = result.brackets.body;
    const round = scan.pairs.find((p) => p.kind === 'round' && p.closeSpan !== undefined);
    const unclosedSquare = scan.pairs.find((p) => p.kind === 'square' && p.closeSpan === undefined);
    expect(round).toBeDefined();
    expect(unclosedSquare).toBeDefined();
    expect(scan.issues.length).toBe(1);
    expect(scan.issues[0]!.kind).toBe('unclosed-open');
    expect(scan.issues[0]!.bracketKind).toBe('square');
    expect(scan.issues[0]!.pairId).toBe(unclosedSquare!.id);
  });
});

describe('scanBrackets — חציית בלוקים (continuation)', () => {
  it('זוג שנפתח בפסקה אחת ונסגר בשנייה — blockIds מלא ומצבי גבול מדויקים', () => {
    const raw = 'כותרת 2 x\n\nפסקה ראשונה פותחת ( ונשארת פתוחה\n\nפסקה שנייה סוגרת ) וממשיכה';
    const result = parseSourceText(raw, { documentId: DOC });
    const scan = result.brackets.body;
    expect(scan.pairs.length).toBe(1);
    const pair = scan.pairs[0]!;
    expect(pair.blockIds.length).toBe(2); // חוצה שתי פסקאות (הכותרת לא נספרת — אין בה סוגריים)
    expect(crossingPairs(scan).length).toBe(1);
    // מצבי הגבול של שני הבלוקים הרלוונטיים (הכותרת היא blockStates[0])
    const opener = scan.blockStates.find((s) => s.openedWithin.length === 1)!;
    const closer = scan.blockStates.find((s) => s.closedWithin.length === 1)!;
    expect(opener).toBeDefined();
    expect(closer).toBeDefined();
    expect(opener.openAtStart).toEqual([]);
    expect(opener.openAtEnd.length).toBe(1);
    expect(opener.closedWithin).toEqual([]);
    expect(closer.openAtStart.length).toBe(1);
    expect(closer.openAtStart[0]).toBe(opener.openAtEnd[0]);
    expect(closer.openAtEnd).toEqual([]);
    expect(endsInsideBracket(scan)).toBe(false);
    // שאילתת היציאה לפי מזהה בלוק — הממשק שהמנוע יצרוך
    expect(blockExitState(scan, opener.blockId)!.openAtEnd.length).toBe(1);
    expect(blockExitState(scan, 'missing')).toBeUndefined();
    // הזוג מקיף בדיוק את שני הבלוקים הללו
    expect(pair.blockIds).toEqual([opener.blockId, closer.blockId]);
  });

  it('זרימה שמסתיימת בתוך סוגריים — endsInsideBracket אמת; המשך לעמוד הבא', () => {
    const raw = 'כותרת 2 x\n\nפותח ( ולא סוגר עד הסוף';
    const result = parseSourceText(raw, { documentId: DOC });
    const scan = result.brackets.body;
    expect(scan.issues.length).toBe(1);
    expect(scan.issues[0]!.kind).toBe('unclosed-open');
    expect(endsInsideBracket(scan)).toBe(true);
    const last = scan.blockStates.at(-1)!;
    expect(last.openAtEnd.length).toBe(1);
  });

  it('מרובעים שלא נסגרים — המקרה של protectParens הישן: מילוליים בגוף, מדווחים כלא-סגורים', () => {
    // החילוץ במרשם שלב 17 מזווג [..] על הטקסט המחובר כולו — מרובעים תואמים
    // תמיד הופכים להערה; המקרה המילולי היחיד הוא פתיחה בלי סגירה (hasOpenBracket הישן)
    const raw = 'כותרת 2 x\n\nפסקה ראשונה פותחת [ ולא נסגרת\n\nפסקה שנייה בלי סוגריים בכלל';
    const result = parseSourceText(raw, { documentId: DOC });
    expect(result.doc.notes.footnotes.length).toBe(0); // לא הערה — פתוח בלי סגירה
    const scan = result.brackets.body;
    const square = scan.pairs.find((p) => p.kind === 'square');
    expect(square).toBeDefined();
    expect(square!.closeSpan).toBeUndefined(); // לא נסגר — לא "הושלם" בשקט
    expect(scan.issues.length).toBe(1);
    expect(scan.issues[0]!.kind).toBe('unclosed-open');
    expect(endsInsideBracket(scan)).toBe(true);
    // המשך מבני למנוע: הבלוק שפתח יוצא עם סוגר פתוח — מצב ה־stack של §10.4
    const opener = scan.blockStates.find((s) => s.openedWithin.length === 1)!;
    expect(opener.openAtEnd.length).toBe(1);
    expect(opener.blockId).toBe(square!.blockIds[0]);
  });
});

describe('scanBrackets — קלט פגום (דיווח בלבד)', () => {
  it('סגירה בלי פתיחה — stray-close מדווח; שום תיקון', () => {
    const raw = 'כותרת 2 x\n\nטקסט רגיל ) וממשיך';
    const result = parseSourceText(raw, { documentId: DOC });
    const scan = result.brackets.body;
    expect(scan.pairs.length).toBe(0);
    expect(scan.issues.length).toBe(1);
    expect(scan.issues[0]!.kind).toBe('stray-close');
    expect(raw.slice(scan.issues[0]!.span.startUtf16, scan.issues[0]!.span.endUtf16)).toBe(')');
  });

  it('פתיחה בלי סגירה + אבחנת פרסר ממוקמת — WARN_UNCLOSED_BRACKET', () => {
    const raw = 'כותרת 2 x\n\nפותח ( בלי סגירה';
    const result = parseSourceText(raw, { documentId: DOC });
    const diag = result.diagnostics.find((d) => d.code === 'errors.parser.WARN_UNCLOSED_BRACKET');
    expect(diag).toBeDefined();
    expect(diag!.start).toBeDefined();
    expect(diag!.severity).toBe('warning');
    expect(isRegisteredContentModelErrorKey('errors.parser.WARN_UNCLOSED_BRACKET')).toBe(true);
  });

  it('סגירה בלי פתיחה + אבחנת פרסר — WARN_STRAY_CLOSE_BRACKET', () => {
    const raw = 'כותרת 2 x\n\nרגיל ] וממשיך';
    const result = parseSourceText(raw, { documentId: DOC });
    const diag = result.diagnostics.find((d) => d.code === 'errors.parser.WARN_STRAY_CLOSE_BRACKET');
    expect(diag).toBeDefined();
    expect(isRegisteredContentModelErrorKey('errors.parser.WARN_STRAY_CLOSE_BRACKET')).toBe(true);
  });

  it('תוחמי הערה בעצמם אינם נספרים — תחביר, לא תוכן', () => {
    const raw = 'כותרת 2 x\n\nלפני [תוכן הערה] אחרי';
    const result = parseSourceText(raw, { documentId: DOC });
    expect(result.doc.notes.footnotes.length).toBe(1);
    expect(result.brackets.body.pairs.length).toBe(0);
    expect(result.brackets.body.issues).toEqual([]);
    // וגוף ההערה עצמו נסרק — בלי סוגריים בתוכו
    expect(result.brackets.notes.length).toBe(1);
    expect(result.brackets.notes[0]!.scan.pairs.length).toBe(0);
  });

  it('סוגריים בתוך גוף הערה — נסרקים בזרם ההערה בלבד', () => {
    const raw = 'כותרת 2 x\n\nלפני [הערה עם (סוגריים) עגולים] אחרי';
    const result = parseSourceText(raw, { documentId: DOC });
    expect(result.doc.notes.footnotes.length).toBe(1);
    const fnScan = result.brackets.notes[0]!.scan;
    expect(fnScan.stream).toBe('footnote');
    expect(fnScan.pairs.length).toBe(1);
    expect(fnScan.pairs[0]!.kind).toBe('round');
    expect(result.brackets.body.pairs.length).toBe(0); // לא דלף לגוף
  });
});

describe('scanBrackets — דטרמיניזם ואינווריאנטים', () => {
  it('סריקה עצמאית שווה לזו שבתוצאת הפרסור — ביט-ביט', () => {
    const raw = 'כותרת 2 x\n\nא (ב [ג] ד) ה\n\nפסקה [עוד (עמוק) פנימי] סוף';
    const result = parseSourceText(raw, { documentId: DOC });
    const again = scanBrackets(result.doc);
    expect(again).toEqual(result.brackets);
  });

  it('אותו קלט — אותה תוצאה בשתי פרסורים', () => {
    const raw = 'כותרת 2 x\n\nא (ב) ג [ד] ה';
    const r1 = parseSourceText(raw, { documentId: DOC });
    const r2 = parseSourceText(raw, { documentId: DOC });
    expect(r1.brackets).toEqual(r2.brackets);
  });

  it('חשבונאות: מספר הפתיחות = זוגות סגורים + פתוחים; כל זוג מופיע פעם אחת', () => {
    const raw = 'כותרת 2 x\n\n(א (ב) ג) (ד [ה) ו]';
    const result = parseSourceText(raw, { documentId: DOC });
    const scan = result.brackets.body;
    const ids = scan.pairs.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length); // אין כפילויות
    const closed = scan.pairs.filter((p) => p.closeSpan !== undefined).length;
    const unclosed = scan.pairs.filter((p) => p.closeSpan === undefined).length;
    expect(closed + unclosed).toBe(scan.pairs.length);
    expect(scan.issues.filter((i) => i.kind === 'unclosed-open').length).toBe(unclosed);
  });

  it('קלט ללא סוגריים בכלל — ריק, בלי בעיות', () => {
    const raw = 'כותרת 2 x\n\nטקסט רגיל לחלוטין בלי סוגריים';
    const result = parseSourceText(raw, { documentId: DOC });
    expect(result.brackets.body.pairs).toEqual([]);
    expect(result.brackets.body.issues).toEqual([]);
    expect(result.brackets.body.maxDepth).toBe(0);
    expect(result.brackets.body.blockStates.every((s) => s.openAtEnd.length === 0)).toBe(true);
  });
});
