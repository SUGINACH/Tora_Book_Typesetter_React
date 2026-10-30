/**
 * בדיקות יחידה למודול היחידות (שלב 9; ADR-001).
 * כיסוי: המרות מדויקות (עם אורקל BigInt עצמאי), עיגול שלילי, גבולות safe integer,
 * עלויות בסקייל קבוע, ומלבנים.
 */
import { describe, expect, it } from 'vitest';
import {
  A4, COST_SCALE, FontUnit, LayoutUnit, MM_DENOMINATOR, MM_NUMERATOR, Rect,
  UnitsError, asFontUnit, asLu, costToNumber, fontUnitsToLu, luToPt, makeCost,
  mmToLu, ptToLu, rectBottom, rectRight, roundDiv, safeAdd, safeMul, safeSub,
} from '../src/units';

/** אורקל עצמאי: עיגול חצי-כלפי-∞ בחישוב BigInt מלא (בלי לסמוך על המימוש הנבדק). */
function oracleRoundDiv(n: bigint, d: bigint): bigint {
  const q = (n - (((n % d) + d) % d)) / d; // מנה-רצפה
  const r = ((n % d) + d) % d; // שארית בטווח [0, d)
  return r * 2n >= d ? q + 1n : q;
}

function oracleMmToLu(mm: number): number {
  const um = BigInt(Math.round(mm * 1000));
  return Number(oracleRoundDiv(um * BigInt(MM_NUMERATOR), BigInt(1000 * MM_DENOMINATOR)));
}

describe('roundDiv — עיגול מרוכז, מוגדר לשליליים (ADR-001 §4)', () => {
  it('טבלת ערכים מחייבת, כולל גבולות חצי', () => {
    expect(roundDiv(5, 2)).toBe(3); // 2.5 → חצי כלפי ∞
    expect(roundDiv(-5, 2)).toBe(-2); // -2.5 → חצי כלפי ∞ (לא away-from-zero!)
    expect(roundDiv(4, 2)).toBe(2);
    expect(roundDiv(-4, 2)).toBe(-2);
    expect(roundDiv(3, 2)).toBe(2);
    expect(roundDiv(-3, 2)).toBe(-1);
    expect(roundDiv(1, 2)).toBe(1);
    expect(roundDiv(-1, 2)).toBe(0);
    expect(roundDiv(0, 7)).toBe(0);
    expect(roundDiv(-1, 7)).toBe(0);
    expect(roundDiv(-6, 3)).toBe(-2);
    expect(roundDiv(7, 3)).toBe(2);
    expect(roundDiv(-7, 3)).toBe(-2);
    expect(roundDiv(65536, 3)).toBe(21845);
  });

  it('תואם את Math.round לכל זוג שלם בטווח נרחב', () => {
    for (let n = -500; n <= 500; n++) {
      for (const d of [1, 2, 3, 4, 5, 7, 10, 127, 1000]) {
        // (+ 0) מנרמל אפס שלילי: Math.round(-0.5)=-0 בעוד המימוש השלם מחזיר +0 — זהים מספרית (ADR-001)
        expect(roundDiv(n, d)).toBe(Math.round(n / d) + 0);
      }
    }
  });

  it('דוחה מכנה לא חיובי או לא שלם', () => {
    expect(() => roundDiv(1, 0)).toThrowError(UnitsError);
    expect(() => roundDiv(1, -2)).toThrowError(UnitsError);
    expect(() => roundDiv(1.5, 2)).toThrowError(UnitsError);
  });
});

describe('mmToLu — רציונל מדויק, קוונטיזציה למיקרומטר (ADR-001 §2–3)', () => {
  const CASES = [0, 0.001, 0.002, 1, 10, 25.4, 29.7, 100, 148.5, 210, 297, 1000, -25.4, -0.001];
  for (const mm of CASES) {
    it(`${mm}mm → אורקל BigInt (${oracleMmToLu(mm)} LU)`, () => {
      expect(mmToLu(mm)).toBe(oracleMmToLu(mm));
    });
  }

  it('A4: 210×297mm — מומר פעם אחת ונעול', () => {
    expect(A4.width).toBe(oracleMmToLu(210));
    expect(A4.height).toBe(oracleMmToLu(297));
    // רוחב A4 בנקודות: 210mm = 595.2755905...pt — סטייה לכל היותר יחידת LU אחת
    expect(luToPt(A4.width)).toBeCloseTo(595.2755905511811, 4);
  });

  it('דוחה קלט לא סופי', () => {
    expect(() => mmToLu(Number.NaN)).toThrowError(UnitsError);
    expect(() => mmToLu(Number.POSITIVE_INFINITY)).toThrowError(UnitsError);
  });
});

describe('ptToLu / luToPt', () => {
  it('גדלי גופן נפוצים', () => {
    expect(ptToLu(12)).toBe(12 * 65536);
    expect(ptToLu(12.5)).toBe(12.5 * 65536);
    expect(ptToLu(0.0625)).toBe(4096); // 1/16pt — רזולוציית הקלט
  });

  it('round-trip היטל', () => {
    for (const pt of [6, 9, 10.5, 11.5, 12, 12.5, 24, 36]) {
      expect(luToPt(ptToLu(pt))).toBe(pt);
    }
  });
});

describe('fontUnitsToLu — חלוקה שלמה אחת לפי unitsPerEm (ADR-001 §4)', () => {
  it('upem=1000 ו-upem=2048', () => {
    expect(fontUnitsToLu(1000, 1000)).toBe(65536);
    expect(fontUnitsToLu(2048, 2048)).toBe(65536);
    expect(fontUnitsToLu(500, 1000)).toBe(32768);
    expect(fontUnitsToLu(1024, 2048)).toBe(32768);
  });

  it('שליליים (שיפועים/מרווחים)', () => {
    expect(fontUnitsToLu(-1000, 1000)).toBe(-65536);
    expect(fontUnitsToLu(-1, 2048)).toBe(-32); // -65536/2048 = -32 מדויק
  });

  it('עיגול מוגדר: 1 יחידת גופן ב־upem=3', () => {
    expect(fontUnitsToLu(1, 3)).toBe(21845); // 65536/3 = 21845.33… → 21845
  });

  it('דוחה upem לא חוקי', () => {
    expect(() => fontUnitsToLu(1, 0)).toThrowError(UnitsError);
    expect(() => fontUnitsToLu(1, -1000)).toThrowError(UnitsError);
    expect(() => fontUnitsToLu(1, 1000.5)).toThrowError(UnitsError);
  });
});

describe('safe integer — גבולות (ADR-001 §6)', () => {
  it('safeAdd זורק על גלישה', () => {
    const max = Number.MAX_SAFE_INTEGER;
    expect(() => safeAdd(max, 1, 'test')).toThrowError(UnitsError);
    expect(safeAdd(max - 1, 1, 'test')).toBe(max);
  });

  it('safeSub זורק על גלישה שלילית', () => {
    expect(() => safeSub(-Number.MAX_SAFE_INTEGER, 1, 'test')).toThrowError(UnitsError);
  });

  it('safeMul זורק על גלישה', () => {
    expect(() => safeMul(2 ** 27, 2 ** 27, 'test')).toThrowError(UnitsError);
    expect(safeMul(2 ** 26, 4, 'test')).toBe(2 ** 28);
  });
});

describe('Cost — סקייל קבוע 1/1024 (ADR-001 §7)', () => {
  it('בנייה וקריאה', () => {
    expect(makeCost(1.5, 't')).toBe(1.5 * COST_SCALE);
    expect(makeCost(-2.25, 't')).toBe(-2.25 * COST_SCALE);
    expect(costToNumber(makeCost(-2.25, 't'))).toBe(-2.25);
  });

  it('השוואות עלויות — שלמות ודטרמיניסטיות', () => {
    const a = makeCost(0.1, 'a');
    const b = makeCost(0.1, 'b');
    expect(a).toBe(b); // ללא epsilon — אותו שלם תמיד
  });
});

describe('Rect — שדות x,y,width,height בלבד (אפיון §6.1)', () => {
  it('עזרי קצוות בחיבור בטוח', () => {
    const r: Rect = { x: asLu(100), y: asLu(200), width: asLu(300), height: asLu(400) };
    expect(rectRight(r)).toBe(400);
    expect(rectBottom(r)).toBe(600);
  });

  it('מיתוג: asLu דוחה לא-שלמים', () => {
    expect(() => asLu(1.5)).toThrowError(UnitsError);
    expect(() => asFontUnit(2 ** 53)).toThrowError(UnitsError);
    expect(asLu(42)).toBe(42);
    expect(asFontUnit(-7)).toBe(-7);
  });
});

describe('דטרמיניזם בסיסי', () => {
  it('אותם קלטים → אותם ערכים תמיד (1,000 חזרות לדוגמה)', () => {
    const first = [mmToLu(29.7), ptToLu(11.5), fontUnitsToLu(777, 2048)];
    for (let i = 0; i < 1000; i++) {
      expect([mmToLu(29.7), ptToLu(11.5), fontUnitsToLu(777, 2048)]).toEqual(first);
    }
  });
});
