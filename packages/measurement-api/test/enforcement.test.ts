/**
 * מבחני איסור fallback שקט — החלק הטהור (שלב 25; אפיון §6.4, §14.3, §20).
 * הבדיקות השליליות על הספק האמיתי — measurement-harfbuzz/test/enforcement.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  MEASUREMENT_ERROR_POLICY,
  missingGlyphFindings,
  shapeStrict,
  assertNoMissingGlyphs,
} from '../src/enforcement.js';
import type { ShapeRequest, ShapedRun, ShapingAtom } from '../src/provider.js';

const atom = (i: number, text: string): ShapingAtom => ({
  id: `atom:v1|doc|body|${i}+${i + text.length}||0` as ShapingAtom['id'],
  text,
  script: 'hebrew',
  bidiLevel: 1,
  breakBefore: i === 0 ? 'forbidden' : 'allowed',
});

const REQUEST: ShapeRequest = Object.freeze({
  atoms: [atom(0, 'א'), atom(1, 'Ω')],
  font: {
    fontId: 'font:v1|' + 'a'.repeat(64),
    contentSha256: 'a'.repeat(64),
    family: 'גוטמן-רש"י',
    weight: 400,
    style: 'normal',
  },
  fontSizeLu: 786432,
  direction: 'rtl',
  language: 'he',
  features: {},
  letterSpacingLu: 0,
});

function runWith(missing: readonly string[]): ShapedRun {
  return {
    requestHash: 'x',
    glyphs: [],
    widthLu: 0,
    ascentLu: 0,
    descentLu: 0,
    lineGapLu: 0,
    missingGlyphAtomIds: missing,
  };
}

describe('MEASUREMENT_ERROR_POLICY — המדיניות נעולה ומתועדת', () => {
  it('שמונה הנעילות קיימות ואינן מכילות היתר נסיגה', () => {
    const keys = Object.keys(MEASUREMENT_ERROR_POLICY);
    expect(keys).toEqual([
      'missingFont', 'unknownFontId', 'fontHashMismatch', 'fontFormatMismatch',
      'fontSfntMismatch', 'measurementUnavailable', 'missingGlyph', 'simulatedMeasurer',
    ]);
    const text = JSON.stringify(MEASUREMENT_ERROR_POLICY);
    expect(text).not.toMatch(/fallback.*מותר|allowed|system font/);
    expect(MEASUREMENT_ERROR_POLICY.missingGlyph).toContain('tofu');
    expect(MEASUREMENT_ERROR_POLICY.simulatedMeasurer).toContain('forbidden-in-production');
  });
});

describe('missingGlyphFindings — ממצא אחיד לכל אטום', () => {
  it('אפס גליפים חסרים ⇐ אפס ממצאים', () => {
    expect(missingGlyphFindings(runWith([]), REQUEST)).toEqual([]);
  });
  it('ממצא לכל אטום: מפתח קטלוגי, path=מזהה האטום, פרמטרים מלאים', () => {
    const findings = missingGlyphFindings(runWith([REQUEST.atoms[1]!.id]), REQUEST);
    expect(findings.length).toBe(1);
    const f = findings[0]!;
    expect(f.key).toBe('errors.font.MISSING_GLYPH');
    expect(f.severity).toBe('error');
    expect(f.path).toBe(REQUEST.atoms[1]!.id);
    expect(f.params.fontId).toBe(REQUEST.font.fontId);
    expect(f.params.atomId).toBe(REQUEST.atoms[1]!.id);
    expect(String(f.params.fontFingerprint)).toMatch(/^[0-9a-f]{16}$/);
    expect(f.params.atomIndex).toBe(1);
    expect(f.devNote).toContain('Ω');
  });
  it('אטום זר (לא מהבקשה) — ממצא עם דגל provider-bug, לא השמטה', () => {
    const findings = missingGlyphFindings(runWith(['atom:v1|stranger']), REQUEST);
    expect(findings.length).toBe(1);
    expect(findings[0]!.params.atomIndex).toBe(-1);
    expect(findings[0]!.devNote).toContain('provider bug');
  });
});

describe('assertNoMissingGlyphs / shapeStrict — השער הקשיח', () => {
  it('ריצה נקייה עוברת ומוחזרת כמות שהיא', () => {
    const clean = runWith([]);
    expect(shapeStrict(() => clean, REQUEST)).toBe(clean);
  });
  it('ריצה עם גליף חסר ← MISSING_GLYPH עם מזהה גופן ומספר', () => {
    const bad = runWith([REQUEST.atoms[1]!.id]);
    expect(() => assertNoMissingGlyphs(bad, REQUEST)).toThrowError(/errors\.font\.MISSING_GLYPH/);
    try {
      assertNoMissingGlyphs(bad, REQUEST);
    } catch (e) {
      expect(e.params.fontId).toBe(REQUEST.font.fontId);
      expect(e.params.count).toBe(1);
    }
    expect(() => shapeStrict(() => bad, REQUEST)).toThrowError(/MISSING_GLYPH/);
  });
  it('חריגה מה־shape עצמו עוברת הלאה — אין catch שקט', () => {
    expect(() => shapeStrict(() => {
      throw new Error('errors.font.MISSING_FONT');
    }, REQUEST)).toThrowError(/MISSING_FONT/);
  });
});
