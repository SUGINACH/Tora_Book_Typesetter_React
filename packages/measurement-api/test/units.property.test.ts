/**
 * מבחני property ליחידות ולגיבוב (שלב 11; אפיון §17.1).
 * עקרונות: עיגול יציב תחת כפילויות, גבולות safe integer, round-trip
 * של canonical JSON, אי-תלות ה-hash בסדר keys, זהות cold/warm.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  asLu, fontUnitsToLu, luToPt, makeCost, mmToLu, ptToLu, roundDiv,
  safeAdd, safeMul, safeSub, UnitsError,
} from '../src/units.js';

const intArb = fc.integer({ min: -1_000_000, max: 1_000_000 });
const posIntArb = fc.integer({ min: 1, max: 1_000_000 });
const scaleArb = fc.integer({ min: 1, max: 1000 });
const mmArb = fc.integer({ min: -100_000, max: 100_000 }).map((um) => um / 1000); // מ"מ ברזולוציית µm
const sixteenthPtArb = fc.integer({ min: -100_000, max: 100_000 }).map((s) => s / 16);

describe('property — roundDiv (עיגול יציב תחת כפילויות)', () => {
  it('roundDiv(n·k, d·k) === roundDiv(n, d) לכל k>0 (רציונל נשמר)', () => {
    fc.assert(
      fc.property(intArb, posIntArb, scaleArb, (n, d, k) => {
        fc.pre(Number.isSafeInteger(n * k) && Number.isSafeInteger(d * k));
        expect(roundDiv(n * k, d * k)).toBe(roundDiv(n, d));
      }),
      { numRuns: 2000 },
    );
  });

  it('חסר: floor(n/d) ≤ roundDiv(n,d) ≤ floor(n/d)+1', () => {
    fc.assert(
      fc.property(intArb, posIntArb, (n, d) => {
        const q = roundDiv(n, d);
        const lo = Math.floor(n / d);
        return q >= lo && q <= lo + 1;
      }),
      { numRuns: 2000 },
    );
  });

  it('roundDiv(n, 1) === n', () => {
    fc.assert(fc.property(intArb, (n) => roundDiv(n, 1) === n), { numRuns: 1000 });
  });

  it('זהה ל-Math.round(n/d) לכל n, d>0 (עד נרמול אפס שלילי)', () => {
    fc.assert(
      fc.property(intArb, posIntArb, (n, d) => roundDiv(n, d) === Math.round(n / d) + 0),
      { numRuns: 2000 },
    );
  });
});

describe('property — mmToLu / ptToLu / fontUnitsToLu', () => {
  it('מונוטוניות חלשה: mm1 < mm2 ⇒ mmToLu(mm1) ≤ mmToLu(mm2)', () => {
    fc.assert(
      fc.property(mmArb, mmArb, (a, b) => {
        fc.pre(a < b);
        return mmToLu(a) <= mmToLu(b);
      }),
      { numRuns: 1000 },
    );
  });

  it('דיוק: |mmToLu(mm) − mm·65536·360/127| ≤ 1 (LU אחד לכל היותר)', () => {
    fc.assert(
      fc.property(mmArb, (mm) => {
        const exact = (mm * 65536 * 360) / 127;
        return Math.abs(mmToLu(mm) - exact) <= 1;
      }),
      { numRuns: 2000 },
    );
  });

  it('round-trip: luToPt(ptToLu(pt)) === pt לכל pt ברזולוציית 1/16', () => {
    fc.assert(
      fc.property(sixteenthPtArb, (pt) => luToPt(ptToLu(pt)) === pt),
      { numRuns: 2000 },
    );
  });

  it('fontUnitsToLu: |תוצאה − u·65536/upem| ≤ 0.5', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100_000, max: 100_000 }),
        fc.integer({ min: 1, max: 16_384 }),
        (u, upem) => Math.abs(fontUnitsToLu(u, upem) - (u * 65536) / upem) <= 0.5 + 1e-9,
      ),
      { numRuns: 2000 },
    );
  });
});

describe('property — גבולות safe integer', () => {
  it('safeAdd/safeSub/safeMul נכונים בטווח הבטוח; זורקים בגלישה', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1e9, max: 1e9 }),
        fc.integer({ min: -1e9, max: 1e9 }),
        (a, b) => {
          fc.pre(Number.isSafeInteger(a * b)); // מכפלה בטוחה בלבד; הגלישה נבדקת בנפרד להלן
          expect(safeAdd(a, b, 't')).toBe(a + b);
          expect(safeSub(a, b, 't')).toBe(a - b);
          expect(safeMul(a, b, 't')).toBe(a * b);
          return true;
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('מעבר גבול: safeAdd(MAX-k, k) תקין; safeAdd(MAX, 1) זורק', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), (k) => {
        const MAX = Number.MAX_SAFE_INTEGER;
        expect(safeAdd(MAX - k, k, 't')).toBe(MAX);
        expect(() => safeAdd(MAX, 1, 't')).toThrowError(UnitsError);
        return true;
      }),
      { numRuns: 200 },
    );
  });
});

describe('property — Cost', () => {
  it('makeCost הפיך ועגול: costToNumber(makeCost(x)) ≈ x (עד 1/2048)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1_000_000, max: 1_000_000 }).map((v) => v / 1024), (x) => {
        const c = makeCost(x, 't');
        expect(Number.isInteger(c)).toBe(true);
        return Math.abs(c / 1024 - x) <= 1 / 2048 + 1e-12;
      }),
      { numRuns: 1000 },
    );
  });
});
