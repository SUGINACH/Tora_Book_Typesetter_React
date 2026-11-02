/**
 * atoms.property.test.ts — מבחני property לאטומים ולגזירת המזהים (שלב 15).
 *
 * אסמכתא: אפיון §6.2 ("IDs דטרמיניסטיים ויציבים לאותו מבנה") · תכנית
 * שלב 15: "אותו קלט נותן אותם ids" · שלב 11 (מבחני property).
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  computeAtomCoverage,
  deriveAtomId,
  makeTextAtom,
  mergeAtoms,
  splitAtom,
} from '../src/atoms.js';
import { makeSourceSpan } from '../src/spans.js';
import type { TextAtom } from '../src/atoms.js';

const DOCS = ['tora-canonical', 'd1', 'd|2', 'd%3'] as const;
const STREAMS = ['body', 'footnote', 'endnote', 'sidenote', 'metadata'] as const;
const ORIGINS = [undefined, 'insertion:demo', 'insertion:page'] as const;
const SAFE_CHARS = 'אבגדהוזחטיכלמנסעפצקרשתabcXYZ019 ,.-״־';

/** פרוסה תקינה שרירותית עם גבולות קטנים ולא־שליליים. */
const arbSpan = fc.record({
  documentId: fc.constantFrom(...DOCS),
  stream: fc.constantFrom(...STREAMS),
  start: fc.integer({ min: 0, max: 60 }),
  length: fc.integer({ min: 0, max: 8 }),
});

/** טקסט מתווים בטוחים (בלי ניקוד, בלי surrogates, בלי בקרות). */
const arbSafeText = fc.string({
  unit: 'grapheme',
  minLength: 0,
  maxLength: 12,
}).map((s) => {
  let out = '';
  for (const ch of s) {
    if (SAFE_CHARS.includes(ch)) out += ch;
    else out += 'א';
  }
  return out;
});

describe('property — גזירת מזהים (בפועל)', () => {
  it('אי־תלות בסדר ריצה: גזירה בסדר הפוך נותנת את אותם מזהים לאותם גורמים', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ span: arbSpan, ordinal: fc.nat(20), origin: fc.constantFrom(...ORIGINS) }).filter(
            (r) => !(r.origin === undefined && r.span.length === 0),
          ),
          { minLength: 1, maxLength: 25 },
        ),
        (specs) => {
          const mk = (r: { span: { documentId: string; stream: string; start: number; length: number }; ordinal: number; origin: string | undefined }) =>
            deriveAtomId(
              makeSourceSpan(r.span.documentId, r.span.stream as never, r.span.start, r.span.start + r.span.length),
              r.ordinal,
              r.origin,
            );
          const forward = specs.map(mk);
          const backward = [...specs].reverse().map(mk);
          const byKey = new Map<string, string>();
          specs.forEach((s, i) => byKey.set(JSON.stringify([s.span, s.ordinal, s.origin]), forward[i] as string));
          for (let i = 0; i < specs.length; i++) {
            // backward[i] נגזר מהאיבר שהיה במקום length−1−i בסדר המקורי
            const srcIdx = specs.length - 1 - i;
            const key = JSON.stringify([specs[srcIdx]?.span, specs[srcIdx]?.ordinal, specs[srcIdx]?.origin]);
            expect(backward[i]).toBe(byKey.get(key)); // אותו גורם ← אותו מזהה, בכל סדר
          }
        },
      ),
      { numRuns: 120 },
    );
  });

  it('אותם גורמים ← אותו מזהה; גורמים שונים ← מזהים שונים (חד־חד־ערכיות)', () => {
    fc.assert(
      fc.property(
        fc
          .record({ span: arbSpan, ordinal: fc.nat(50), origin: fc.constantFrom(...ORIGINS) })
          .filter((r) => !(r.origin === undefined && r.span.length === 0)),
        fc
          .record({ span: arbSpan, ordinal: fc.nat(50), origin: fc.constantFrom(...ORIGINS) })
          .filter((r) => !(r.origin === undefined && r.span.length === 0)),
        (a, b) => {
          const mk = (r: { span: { documentId: string; stream: string; start: number; length: number }; ordinal: number; origin: string | undefined }) =>
            deriveAtomId(
              makeSourceSpan(r.span.documentId, r.span.stream as never, r.span.start, r.span.start + r.span.length),
              r.ordinal,
              r.origin,
            );
          const idA1 = mk(a);
          const idA2 = mk(a); // גזירה כפולה — זהה
          expect(idA1).toBe(idA2);
          const sameFactors =
            JSON.stringify(a.span) === JSON.stringify(b.span) && a.ordinal === b.ordinal && a.origin === b.origin;
          const idB = mk(b);
          if (sameFactors) expect(idA1).toBe(idB);
          else expect(idA1).not.toBe(idB);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('אוסף גורמים ייחודיים ← אוסף מזהים ייחודי (אין התנגשויות גזירה)', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(
          fc.record({ span: arbSpan, ordinal: fc.nat(12), origin: fc.constantFrom(...ORIGINS) }).filter(
            (r) => !(r.origin === undefined && r.span.length === 0),
          ),
          { selector: (r) => JSON.stringify([r.span, r.ordinal, r.origin]), minLength: 1, maxLength: 40 },
        ),
        (specs) => {
          const ids = specs.map((r) =>
            deriveAtomId(
              makeSourceSpan(r.span.documentId, r.span.stream as never, r.span.start, r.span.start + r.span.length),
              r.ordinal,
              r.origin,
            ),
          );
          expect(new Set(ids).size).toBe(ids.length);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('property — פיצול ואיחוד', () => {
  it('merge(split(x)) משחזר את x במדויק לכל נקודת פיצול חוקית', () => {
    fc.assert(
      fc.property(
        arbSafeText.filter((t) => t.length >= 2),
        fc.nat(60),
        fc.integer({ min: 0, max: 4 }),
        fc.constantFrom(...(['allowed', 'forbidden', 'required'] as const)),
        fc.constantFrom(...ORIGINS.filter((o) => o !== undefined)),
        (text, startOffset, bidiLevel, breakBefore, origin) => {
          const span = makeSourceSpan('tora-canonical', 'body', startOffset, startOffset + text.length);
          const x = makeTextAtom(text, span, {
            bidiLevel,
            breakBefore,
            origin,
            ordinal: 1,
          });
          for (let at = 1; at < text.length; at++) {
            const { left, right } = splitAtom(x, at);
            const { merged } = mergeAtoms(left, right);
            expect(merged.id).toBe(x.id);
            expect(merged.text).toBe(x.text);
            expect(merged.source).toEqual(x.source);
            expect(merged.script).toBe(x.script);
            expect(merged.bidiLevel).toBe(x.bidiLevel);
            expect(merged.breakBefore).toBe(x.breakBefore);
            expect(merged.ordinal).toBe(x.ordinal);
            expect(merged.origin).toBe(x.origin);
          }
        },
      ),
      { numRuns: 120 },
    );
  });
});

describe('property — כיסוי אטומים', () => {
  it('חלוקה שרירותית של [0, N) ← כיסוי תקין; השמטת אטום ← רווח', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 40 }),
        fc.uniqueArray(fc.integer({ min: 1, max: 39 }), { minLength: 0, maxLength: 8 }),
        arbSafeText,
        (n, cutsRaw, textPool) => {
          const cuts = [...new Set(cutsRaw.filter((c) => c < n))].sort((x, y) => x - y);
          const bounds = [0, ...cuts, n];
          const atoms: TextAtom[] = [];
          let poolIdx = 0;
          for (let i = 0; i + 1 < bounds.length; i++) {
            const s = bounds[i] as number;
            const e = bounds[i + 1] as number;
            if (e <= s) continue;
            const ch = textPool.length > 0 ? (textPool[poolIdx++ % textPool.length] ?? 'א') : 'א';
            const piece = ch.repeat(e - s).slice(0, e - s);
            atoms.push(makeTextAtom(piece, makeSourceSpan('tora-canonical', 'body', s, e)));
          }
          const full = computeAtomCoverage(atoms, n, 'tora-canonical', 'body');
          expect(full.ok).toBe(true);
          expect(full.coveredLength).toBe(n);
          if (atoms.length > 0) {
            const dropped = atoms.slice(0, -1);
            const holed = computeAtomCoverage(dropped, n, 'tora-canonical', 'body');
            expect(holed.ok).toBe(false);
            expect(holed.gaps.length).toBeGreaterThan(0);
          }
        },
      ),
      { numRuns: 150 },
    );
  });
});
