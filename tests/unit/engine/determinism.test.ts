import { describe, it, expect } from 'vitest';
import { parseDocument } from '../../../src/parser';
import { typesetDocument } from '../../../src/worker/engine/typeset-document';
import { SimulatedMeasurer } from '../../../src/worker/measurement/text-metrics';
import { fnv1a32 } from '../../../src/worker/inputs/fnv-hash';
import { defaultSettings } from '../../../src/lib/default-settings';

const SAMPLE_TEXT = `שם הספר - ספר בדיקה
נושא - בדיקת עימוד
שם המחבר - מחבר בדיקה
מקום ושנת הוצאה - ירושלים תשפ"ו
שמירת זכויות - כל הזכויות שמורות
פרטי הוצאה לאור - הוצאת בדיקה
פרטי קשר - 052-0000000
פרטים נוספים - לבדיקה בלבד

כותרת 1 - חלק ראשון
כותרת 2 מספר 1 - הקדמה
כותרת 3 - מבוא
זוהי פסקה ראשונה לבדיקת העימוד. יש בה מספר משפטים כדי למלא שורות בטור. ועוד טקסט להוסיך ולמלא.
זוהי פסקה שנייה לבדיקת העימוד. גם היא מכילה מספר משפטים כדי למלא שורות בטור. ועוד טקסט להוסיך.

כותרת 2 מספר 2 - פרק שני
זוהי פסקה בפרק השני. יש בה [הערת שוליים] טקסט עם הערה.
זוהי פסקה נוספת בפרק השני. אין בה הערות.`;

const measurer = new SimulatedMeasurer();

describe('Determinism — referential transparency & no side effects', () => {
  it('parseDocument: אותו קלט → אותו sourceHash', () => {
    const doc1 = parseDocument(SAMPLE_TEXT, defaultSettings);
    const doc2 = parseDocument(SAMPLE_TEXT, defaultSettings);
    expect(doc1.sourceHash).toBe(doc2.sourceHash);
  });

  it('parseDocument: אותו AST (deep equal)', () => {
    const doc1 = parseDocument(SAMPLE_TEXT, defaultSettings);
    const doc2 = parseDocument(SAMPLE_TEXT, defaultSettings);
    // השוואת מבנה ה-AST (ללת ה-sourceHash שהוא זהה ממילא)
    const { sourceHash: _sh1, ...ast1 } = doc1;
    const { sourceHash: _sh2, ...ast2 } = doc2;
    expect(JSON.stringify(ast1)).toBe(JSON.stringify(ast2));
  });

  it('typesetDocument: אותו hash פלט בשתי ריצות', () => {
    const doc = parseDocument(SAMPLE_TEXT, defaultSettings);
    const result1 = typesetDocument(doc, defaultSettings, measurer);
    const result2 = typesetDocument(doc, defaultSettings, measurer);

    const hash1 = fnv1a32(result1.pages.map((p) => p.html).join(''));
    const hash2 = fnv1a32(result2.pages.map((p) => p.html).join(''));

    expect(hash1).toBe(hash2);
  });

  it('typesetDocument: אותו מספר עמודים בשתי ריצות', () => {
    const doc = parseDocument(SAMPLE_TEXT, defaultSettings);
    const result1 = typesetDocument(doc, defaultSettings, measurer);
    const result2 = typesetDocument(doc, defaultSettings, measurer);
    expect(result1.pages.length).toBe(result2.pages.length);
  });

  it('typesetDocument: אותו ממצאים בשתי ריצות', () => {
    const doc = parseDocument(SAMPLE_TEXT, defaultSettings);
    const result1 = typesetDocument(doc, defaultSettings, measurer);
    const result2 = typesetDocument(doc, defaultSettings, measurer);
    expect(JSON.stringify(result1.findings)).toBe(JSON.stringify(result2.findings));
  });

  it('parser: מזהי צמתים דטרמיניסטיים (ללא random)', () => {
    const doc1 = parseDocument(SAMPLE_TEXT, defaultSettings);
    const doc2 = parseDocument(SAMPLE_TEXT, defaultSettings);

    const ids1 = collectIds(doc1.root);
    const ids2 = collectIds(doc2.root);
    expect(ids1).toEqual(ids2);
  });
});

function collectIds(nodes: any[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.id) ids.push(node.id);
    if (node.children) ids.push(...collectIds(node.children));
  }
  return ids;
}
