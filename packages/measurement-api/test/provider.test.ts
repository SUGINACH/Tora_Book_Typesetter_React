/**
 * מבחני חוזי provider (שלב 22; אפיון §6.4).
 * עוסקים בחוזה בלבד — המימוש האמיתי בשלב 24; כאן נבדקים הטיפוסים,
 * הוולידציה, requestHash הקנוני, חשבונאות הריצה וזהות ה־provider.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  fontFaceKeyIssues,
  fontFingerprint,
  isFontFaceKey,
  isShapeRequest,
  providerIdentityIssues,
  shapeBatchViaSingle,
  shapedRunAccountingIssues,
  shapeRequestHash,
  shapeRequestIssues,
  type FontFaceKey,
  type ProviderIdentity,
  type ShapeRequest,
  type ShapingAtom,
} from '../src/provider.js';

const FONT: FontFaceKey = Object.freeze({
  fontId: 'font:v1|a69f977d752d11eddb1453e50e7932f0619485cfcd3ca40e92a84558038c1010',
  contentSha256: 'a69f977d752d11eddb1453e50e7932f0619485cfcd3ca40e92a84558038c1010',
  family: 'גוטמן-רש"י',
  weight: 400,
  style: 'normal',
});

const IDENTITY: ProviderIdentity = Object.freeze({
  providerId: 'harfbuzz-wasm',
  providerVersion: '8.x.y-test',
  wasmSha256: 'a69f977d752d11eddb1453e50e7932f0619485cfcd3ca40e92a84558038c1010',
  environmentHash: 'env-test-v1',
});

function atom(i: number, text: string, over: Partial<ShapingAtom> = {}): ShapingAtom {
  return Object.freeze({
    id: `atom:v1|doc|body|${i}+${i + text.length}||0` as ShapingAtom['id'],
    text,
    script: 'hebrew',
    bidiLevel: 1,
    breakBefore: i === 0 ? 'forbidden' : 'allowed',
    ...over,
  });
}

function request(over: Partial<ShapeRequest> = {}): ShapeRequest {
  return Object.freeze({
    atoms: [atom(0, 'ש'), atom(1, 'ל'), atom(2, 'ו'), atom(3, 'ם')],
    font: FONT,
    fontSizeLu: 12 * 65536,
    direction: 'rtl',
    language: 'he',
    features: { liga: true, kern: true },
    letterSpacingLu: 0,
    ...over,
  });
}

describe('FontFaceKey — ולידציה וטביעת אצבע', () => {
  it('מפתח תקין עובר; כל שדה פגום נתפס', () => {
    expect(isFontFaceKey(FONT)).toBe(true);
    expect(fontFaceKeyIssues({ ...FONT, fontId: '' })).toContain('fontId');
    expect(fontFaceKeyIssues({ ...FONT, contentSha256: 'XYZ' })).toContain('contentSha256');
    expect(fontFaceKeyIssues({ ...FONT, weight: 0 })).toContain('weight');
    expect(fontFaceKeyIssues({ ...FONT, weight: 100.5 })).toContain('weight');
    expect(fontFaceKeyIssues({ ...FONT, weight: 1001 })).toContain('weight');
    expect(fontFaceKeyIssues({ ...FONT, style: 'oblique' })).toContain('style');
    expect(fontFaceKeyIssues(null)).toContain('not-an-object');
  });
  it('טביעת אצבע דטרמיניסטית ורגישה לכל שדה — כולל החלפת bytes', () => {
    const fp = fontFingerprint(FONT);
    expect(fp).toBe(fontFingerprint(FONT));
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fontFingerprint({ ...FONT, contentSha256: '0'.repeat(64) })).not.toBe(fp);
    expect(fontFingerprint({ ...FONT, weight: 700 })).not.toBe(fp);
    expect(fontFingerprint({ ...FONT, family: 'אחר' })).not.toBe(fp);
  });
});

describe('ShapeRequest — ולידציה', () => {
  it('בקשה תקינה עוברת', () => {
    expect(isShapeRequest(request())).toBe(true);
  });
  it('אטומים ריקים נדחים', () => {
    expect(shapeRequestIssues(request({ atoms: [] }))).toContain('atoms:empty');
  });
  it('lone surrogate בטקסט אטום נדחה', () => {
    const bad = atom(0, 'ש'); // תקין
    const lone = { ...bad, text: '\uD800' }; // high ללא low
    expect(shapeRequestIssues(request({ atoms: [lone] }))).toContain('atoms[0]:lone-surrogate');
    const loneLow = { ...bad, text: 'א\uDC00' };
    expect(shapeRequestIssues(request({ atoms: [loneLow] }))).toContain('atoms[0]:lone-surrogate');
  });
  it('תו בקרה (למעט tab) בטקסט אטום נדחה', () => {
    const bad = { ...atom(0, 'א'), text: 'א\u0007' };
    expect(shapeRequestIssues(request({ atoms: [bad] }))).toContain('atoms[0]:control-char');
    const tab = { ...atom(0, '\t') };
    expect(shapeRequestIssues(request({ atoms: [tab] }))).not.toContain('atoms[0]:control-char');
  });
  it('כיוון/שפה/גודל/ריווח/features — כל הכשלים המקוטלגים', () => {
    expect(shapeRequestIssues(request({ direction: 'auto' as never }))).toContain('direction');
    expect(shapeRequestIssues(request({ language: '' }))).toContain('language');
    expect(shapeRequestIssues(request({ language: 'he brew!' }))).toContain('language:format');
    expect(shapeRequestIssues(request({ fontSizeLu: 0 }))).toContain('fontSizeLu');
    expect(shapeRequestIssues(request({ fontSizeLu: 1.5 }))).toContain('fontSizeLu');
    expect(shapeRequestIssues(request({ letterSpacingLu: 0.5 }))).toContain('letterSpacingLu');
    expect(shapeRequestIssues(request({ features: { lig: true } as never })))
      .toContain('features:tag:lig');
    expect(shapeRequestIssues(request({ features: { liga: 1 } as never })))
      .toContain('features:value:liga');
  });
  it('property: בקשות אקראיות תקינות עוברות ולידציה', () => {
    const textArb = fc.stringMatching(/^[א-תa-zA-Z0-9 ]{1,10}$/);
    const atomArb = fc.record({
      id: fc.stringMatching(/^atom-[0-9]+$/),
      text: textArb,
      script: fc.constantFrom('hebrew', 'latin', 'number', 'punctuation', 'other'),
      bidiLevel: fc.integer({ min: 0, max: 125 }),
      breakBefore: fc.constantFrom('forbidden', 'allowed', 'required'),
    });
    const reqArb = fc.record({
      atoms: fc.array(atomArb, { minLength: 1, maxLength: 8 }),
      fontSizeLu: fc.integer({ min: 1, max: 100 * 65536 }),
      direction: fc.constantFrom('rtl' as const, 'ltr' as const),
      language: fc.constantFrom('he', 'en-US', 'he-IL-u-ca-hebrew'),
      features: fc.constant({ liga: true }),
      letterSpacingLu: fc.integer({ min: -1000, max: 1000 }),
    });
    fc.assert(
      fc.property(reqArb, (r) => {
        const full = { ...r, font: FONT };
        return isShapeRequest(full);
      }),
      { numRuns: 500 },
    );
  });
});

describe('shapeRequestHash — קנוניות ודטרמיניזם', () => {
  it('אותה בקשה ⇐ אותו hash, תמיד', () => {
    expect(shapeRequestHash(IDENTITY, request())).toBe(shapeRequestHash(IDENTITY, request()));
  });
  it('סדר מפתחות ב-features אינו משנה (קנוניות)', () => {
    const a = request({ features: { liga: true, kern: false, mark: true } });
    const b = request({ features: { mark: true, liga: true, kern: false } });
    expect(shapeRequestHash(IDENTITY, a)).toBe(shapeRequestHash(IDENTITY, b));
  });
  it('שינוי כל רכיב משנה את ה-hash', () => {
    const base = shapeRequestHash(IDENTITY, request());
    expect(shapeRequestHash(IDENTITY, request({ direction: 'ltr' }))).not.toBe(base);
    expect(shapeRequestHash(IDENTITY, request({ language: 'en' }))).not.toBe(base);
    expect(shapeRequestHash(IDENTITY, request({ fontSizeLu: 13 * 65536 }))).not.toBe(base);
    expect(shapeRequestHash(IDENTITY, request({ letterSpacingLu: 5 }))).not.toBe(base);
    expect(
      shapeRequestHash(IDENTITY, request({ font: { ...FONT, contentSha256: '1'.repeat(64) } })),
    ).not.toBe(base);
    expect(shapeRequestHash(IDENTITY, request({ atoms: [atom(0, 'א')] }))).not.toBe(base);
  });
  it('זהות provider שונה ⇐ hash שונה (כולל environmentHash)', () => {
    const base = shapeRequestHash(IDENTITY, request());
    expect(
      shapeRequestHash({ ...IDENTITY, providerVersion: '8.x.z-other' }, request()),
    ).not.toBe(base);
    expect(
      shapeRequestHash({ ...IDENTITY, environmentHash: 'env-test-v2' }, request()),
    ).not.toBe(base);
  });
  it('זהות provider פגומה נדחית עם קוד מקוטלג', () => {
    expect(() =>
      shapeRequestHash({ ...IDENTITY, wasmSha256: 'zz' } as ProviderIdentity, request()),
    ).toThrowError(/errors\.shape\.INVALID_PROVIDER/);
  });
  it('בקשה לא חוקית נדחית לפני הגיבוב', () => {
    expect(() => shapeRequestHash(IDENTITY, request({ atoms: [] }))).toThrowError(
      /errors\.shape\.INVALID_REQUEST/,
    );
  });
});

describe('providerIdentityIssues — ולידציה', () => {
  it('זהות תקינה עוברת; שדות פגומים נתפסים', () => {
    expect(providerIdentityIssues(IDENTITY)).toEqual([]);
    expect(providerIdentityIssues({ ...IDENTITY, providerId: '' })).toContain('providerId');
    expect(providerIdentityIssues({ ...IDENTITY, wasmSha256: 'nothex' })).toContain('wasmSha256');
    expect(providerIdentityIssues(null)).toContain('not-an-object');
  });
});

describe('shapedRunAccountingIssues — חשבונאות ריצה', () => {
  const goodRun = {
    requestHash: 'r1',
    glyphs: [
      { glyphId: 256, clusterAtomIndex: 0, advanceLu: 100, xOffsetLu: 0, yOffsetLu: 0 },
      { glyphId: 257, clusterAtomIndex: 1, advanceLu: 120, xOffsetLu: 0, yOffsetLu: 0 },
    ],
    widthLu: 220,
    ascentLu: 629,
    descentLu: 157,
    lineGapLu: 0,
    missingGlyphAtomIds: [],
  };
  it('ריצה מאוזנת עוברת', () => {
    expect(shapedRunAccountingIssues(goodRun)).toEqual([]);
  });
  it('widthLu שאינו Σ advances נתפס', () => {
    expect(
      shapedRunAccountingIssues({ ...goodRun, widthLu: 221 }),
    ).toContain('widthLu:mismatch');
  });
  it('clusterAtomIndex שלילי / glyphId שלילי נתפסים', () => {
    const bad = {
      ...goodRun,
      glyphs: [
        { glyphId: -1, clusterAtomIndex: 0, advanceLu: 100, xOffsetLu: 0, yOffsetLu: 0 },
      ],
      widthLu: 100,
    };
    const issues = shapedRunAccountingIssues(bad);
    expect(issues).toContain('glyphs[0]:glyphId');
  });
});

describe('shapeBatchViaSingle — חוזה batching', () => {
  it('תוצאה זהה לביצוע הפרטני, בכל סדר ובכל חלוקה', () => {
    const calls: string[] = [];
    const provider = {
      providerVersion: 'x',
      environmentHash: 'e',
      shape: (r: ShapeRequest) => {
        calls.push(r.language);
        return { requestHash: 'k:' + r.language, glyphs: [], widthLu: 0, ascentLu: 0, descentLu: 0, lineGapLu: 0, missingGlyphAtomIds: [] };
      },
      lineOpportunities: () => [],
    };
    const reqs = [request({ language: 'he' }), request({ language: 'en' }), request({ language: 'fr' })];
    const batchAll = shapeBatchViaSingle(provider, reqs);
    const singles = reqs.map((r) => provider.shape(r));
    expect(batchAll).toEqual(singles);
    // חלוקה לשני batches — אותן תוצאות ביט-ביט
    const split = [
      ...shapeBatchViaSingle(provider, reqs.slice(0, 1)),
      ...shapeBatchViaSingle(provider, reqs.slice(1)),
    ];
    expect(split).toEqual(batchAll);
    // הסדר בתוך ה-batch נשמר (תוצאה[i] תואמת requests[i])
    expect(batchAll.map((r) => r.requestHash)).toEqual(['k:he', 'k:en', 'k:fr']);
    expect(calls.length).toBe(9); // 3 (batchAll) + 3 (בודדות) + 3 (חלוקה לשניים)
  });
});
