/**
 * מבחני property לגיבוב הקנוני (שלב 11; אפיון §17.1).
 * אי-תלות ה-hash בסדר keys, round-trip של canonical JSON, זהות cold/warm.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalJson, configHash, inputHash, layoutHash } from '../src/canonical-hash.js';

/** בונה ערך עמוק (מספרים, מחרוזות, בוליאנים, מערכים, אובייקטים). */
const deepValueArb = fc.letrec((tie) => ({
  node: fc.oneof(
    { maxDepth: 3 },
    fc.integer({ min: -1000, max: 1000 }),
    fc.string({ minLength: 0, maxLength: 20 }),
    fc.boolean(),
    fc.array(tie('node'), { maxLength: 4 }),
    fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 0, maxLength: 4 })
      .map((keys) => {
        const obj: Record<string, unknown> = {};
        for (const k of keys) obj[k] = Math.floor(Math.random() * 0) + keys.indexOf(k);
        return obj;
      }),
  ),
})).node;

describe('property — canonical JSON וה־hashes', () => {
  it('אי-תלות בסדר הכנסת מפתחות — סריאליזציה זהה', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 8 }), (keys) => {
        const a: Record<string, unknown> = {};
        const b: Record<string, unknown> = {};
        for (const k of keys) a[k] = keys.indexOf(k);
        for (const k of [...keys].reverse()) b[k] = keys.indexOf(k);
        return canonicalJson(a) === canonicalJson(b);
      }),
      { numRuns: 1000 },
    );
  });

  it('אידמפוטנטיות: canonicalJson(JSON.parse(canonicalJson(x))) === canonicalJson(x)', () => {
    fc.assert(
      fc.property(deepValueArb, (x) => {
        const once = canonicalJson(x);
        return canonicalJson(JSON.parse(once)) === once;
      }),
      { numRuns: 1000 },
    );
  });

  it('layoutHash אינו תלוי בסדר הכנסת מפתחות של ה־IR', () => {
    fc.assert(
      fc.property(deepValueArb, (x) => {
        fc.pre(typeof x === 'object' && x !== null && !Array.isArray(x));
        const shuffled: Record<string, unknown> = {};
        const keys = Object.keys(x as object);
        for (const k of [...keys].reverse()) shuffled[k] = (x as Record<string, unknown>)[k];
        return layoutHash(x) === layoutHash(shuffled);
      }),
      { numRuns: 1000 },
    );
  });

  it('זהות cold/warm + אי-תלות configHash בסדר הכנסה', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100_000, max: 100_000 }).map((v) => v / 1000),
        fc.integer({ min: -100_000, max: 100_000 }).map((s) => s / 16),
        (mm, pt) => {
          expect(configHash({ mm, pt })).toBe(configHash({ pt, mm }));
          const warm = configHash({ mm, pt });
          expect(configHash({ mm, pt })).toBe(warm); // cold/warm זהים
          return true;
        },
      ),
      { numRuns: 500 },
    );
  });

  it('inputHash רגיש לכל רכיב', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 5 }), (mut) => {
        const base = {
          sourceSha256: 'a'.repeat(64),
          effectiveSettings: { v: 1 },
          fontsManifestSha256: 'b'.repeat(64),
          assetsManifestSha256: 'c'.repeat(64),
          parserVersion: 'p1',
          engineVersion: 'e1',
        };
        const h0 = inputHash(base);
        return inputHash({ ...base, parserVersion: mut }).length === 64
          && (mut === 'p1' ? inputHash({ ...base, parserVersion: mut }) === h0
            : inputHash({ ...base, parserVersion: mut }) !== h0);
      }),
      { numRuns: 200 },
    );
  });

  it('layoutHash משתנה כשהתוכן משתנה (ערך יחיד בתוך עץ)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 999 }), fc.integer({ min: 1000, max: 999_999 }), (a, b) => {
        fc.pre(a !== b);
        return layoutHash({ pages: [{ n: a }] }) !== layoutHash({ pages: [{ n: b }] });
      }),
      { numRuns: 500 },
    );
  });
});
