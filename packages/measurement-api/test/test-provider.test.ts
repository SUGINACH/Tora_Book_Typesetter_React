/**
 * מבחני TestMeasurementProvider — וקטורים קבועים (שלב 22).
 * הספק מיובא מה-subpath './test' בלבד — בדיוק כמו שבדיקות העתיד
 * (שלבים 25/26/29/33) יזריקו אותו למנוע; כאן נבדק שהוא עצמו
 * דטרמיניסטי לחלוטין ומקיים את חוזה החשבונאות.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createTestMeasurementProvider,
  TEST_PROVIDER_IDENTITY,
  TEST_VECTORS_VERSION,
  isTestMeasurementProvider,
} from '../src/test-provider.js';
import { canonicalShapeCacheKey } from '../src/cache-key.js';
import { shapedRunAccountingIssues } from '../src/provider.js';
import type { FontFaceKey, ShapeRequest, ShapingAtom } from '../src/provider.js';
import { ptToLu } from '../src/units.js';

const FONT: FontFaceKey = Object.freeze({
  fontId: 'font:v1|a69f977d752d11eddb1453e50e7932f0619485cfcd3ca40e92a84558038c1010',
  contentSha256: 'a69f977d752d11eddb1453e50e7932f0619485cfcd3ca40e92a84558038c1010',
  family: 'גוטמן-רש"י',
  weight: 400,
  style: 'normal',
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
    fontSizeLu: ptToLu(12),
    direction: 'rtl',
    language: 'he',
    features: {},
    letterSpacingLu: 0,
    ...over,
  });
}

const provider = createTestMeasurementProvider();

describe('TestMeasurementProvider — זהות וטיפוס', () => {
  it('providerId מילולי test-simulated; אינו MeasurementProvider ייצור', () => {
    expect(provider.providerId).toBe('test-simulated');
    expect(isTestMeasurementProvider(provider)).toBe(true);
    // הטיפוס המילולי של ייצור הוא 'harfbuzz-wasm' — הספק המדומה אינו יכול
    // להיכנס שם בטיפוס (בדיקת השוואת מחרוזות משקפת את ההפרדה)
    expect(provider.providerId === ('harfbuzz-wasm' as const)).toBe(false);
  });
  it('זהות קבועה — גרסת וקטורים וסביבה יציבים', () => {
    expect(provider.providerVersion).toBe(TEST_VECTORS_VERSION);
    expect(provider.environmentHash).toBe(TEST_PROVIDER_IDENTITY.environmentHash);
    expect(provider.environmentHash).toBe('test-simulated-env-v1');
  });
});

describe('TestMeasurementProvider — דטרמיניזם וחשבונאות', () => {
  it('אותה בקשה ⇐ אותה תוצאה ביט-ביט (שתי עצמים provider שונים)', () => {
    const p2 = createTestMeasurementProvider();
    expect(JSON.stringify(provider.shape(request()))).toBe(JSON.stringify(p2.shape(request())));
  });
  it('property: דטרמיניזם תחת בקשות אקראיות', () => {
    const textArb = fc.stringMatching(/^[א-תa-zA-Z0-9 .,]{1,20}$/);
    const reqArb = fc.record({
      text: textArb,
      size: fc.integer({ min: 6, max: 40 }),
      spacing: fc.integer({ min: -50, max: 50 }),
    });
    fc.assert(
      fc.property(reqArb, ({ text, size, spacing }) => {
        const atoms = [...text].map((ch, i) => atom(i, ch));
        const r = request({
          atoms,
          fontSizeLu: ptToLu(size),
          letterSpacingLu: spacing,
        });
        const a = provider.shape(r);
        const b = provider.shape(r);
        return JSON.stringify(a) === JSON.stringify(b);
      }),
      { numRuns: 500 },
    );
  });
  it('חשבונאות: widthLu === Σ advances לכל ריצה (חוזה §6.4/§6.5)', () => {
    const run = provider.shape(request({ letterSpacingLu: 7 }));
    expect(shapedRunAccountingIssues(run)).toEqual([]);
  });
  it('ריווח אותיות נכנס ל-advance של כל גליף (כולל האחרון)', () => {
    const noSpacing = provider.shape(request({ letterSpacingLu: 0 }));
    const withSpacing = provider.shape(request({ letterSpacingLu: 100 }));
    expect(withSpacing.glyphs.length).toBe(noSpacing.glyphs.length);
    for (let i = 0; i < withSpacing.glyphs.length; i++) {
      expect(withSpacing.glyphs[i]!.advanceLu - noSpacing.glyphs[i]!.advanceLu).toBe(100);
    }
    expect(withSpacing.widthLu - noSpacing.widthLu).toBe(100 * withSpacing.glyphs.length);
  });
  it('וקטורים קבועים: אות א׳ = 556 אלפיות em; רווח = 250; ספרה = 500', () => {
    const run = provider.shape(request({ atoms: [atom(0, 'א')] }));
    expect(run.glyphs[0]!.advanceLu).toBe(Math.round((556 * ptToLu(12)) / 1000));
    expect(run.glyphs[0]!.glyphId).toBe(0x0100); // 0x05D0 → 0x0100
    const space = provider.shape(request({ atoms: [atom(0, ' ')] }));
    expect(space.glyphs[0]!.advanceLu).toBe(Math.round((250 * ptToLu(12)) / 1000));
    const digit = provider.shape(request({ atoms: [atom(0, '5')] }));
    expect(digit.glyphs[0]!.advanceLu).toBe(Math.round((500 * ptToLu(12)) / 1000));
  });
  it('מטריקות אנכיות קבועות: ascent 800/descent 200/lineGap 0 אלפיות em', () => {
    const run = provider.shape(request());
    expect(run.ascentLu).toBe(Math.round((800 * ptToLu(12)) / 1000));
    expect(run.descentLu).toBe(Math.round((200 * ptToLu(12)) / 1000));
    expect(run.lineGapLu).toBe(0);
  });
  it('ניקוד: advance 0 והאשכול של הבסיס הקודם', () => {
    const run = provider.shape(
      request({ atoms: [atom(0, 'ב'), atom(1, 'ּ'), atom(2, 'א')] }),
    );
    expect(run.glyphs.length).toBe(3);
    // הנקודה הדגושה — גליף מתלה: advance 0, אשכול = 0 (הבסיס שלפניה)
    const dagesh = run.glyphs[1]!;
    expect(dagesh.advanceLu).toBe(0);
    expect(dagesh.clusterAtomIndex).toBe(0);
    // אות ממשיכה — אשכול משלה
    expect(run.glyphs[2]!.clusterAtomIndex).toBe(2);
  });
  it('בקרות פורמט (RLM) — גליף 2 עם advance 0', () => {
    const run = provider.shape(request({ atoms: [atom(0, '\u200f')] }));
    expect(run.glyphs[0]!.glyphId).toBe(2);
    expect(run.glyphs[0]!.advanceLu).toBe(0);
  });
  it('Private Use U+E000–U+E0FF — הדמיית גליף חסר: .notdef + דיווח האטום', () => {
    const run = provider.shape(
      request({ atoms: [atom(0, 'א'), atom(1, '\uE001'), atom(2, 'ב')] }),
    );
    expect(run.glyphs[1]!.glyphId).toBe(0);
    expect(run.missingGlyphAtomIds).toEqual([
      (request({ atoms: [atom(0, 'א'), atom(1, '\uE001'), atom(2, 'ב')] }).atoms[1]!.id),
    ]);
  });
  it('requestHash של הספק תואם לחוזה shapeRequestHash', async () => {
    const { shapeRequestHash } = await import('../src/provider.js');
    const r = request();
    expect(provider.shape(r).requestHash).toBe(shapeRequestHash(TEST_PROVIDER_IDENTITY, r));
  });
});

describe('TestMeasurementProvider — batching ושבירות', () => {
  it('shapeBatch זהה ביט-ביט לביצוע פרטני, בכל חלוקה', () => {
    const reqs = [
      request({ atoms: [atom(0, 'א')] }),
      request({ atoms: [atom(0, 'ב'), atom(1, 'ג')], fontSizeLu: ptToLu(18) }),
      request({ language: 'en', atoms: [atom(0, 'a'), atom(1, 'b')] }),
    ];
    const batch = provider.shapeBatch!(reqs);
    const singles = reqs.map((r) => provider.shape(r));
    expect(JSON.stringify(batch)).toBe(JSON.stringify(singles));
    const split = [
      ...provider.shapeBatch!(reqs.slice(0, 2)),
      ...provider.shapeBatch!(reqs.slice(2)),
    ];
    expect(JSON.stringify(split)).toBe(JSON.stringify(batch));
  });
  it('lineOpportunities — מועמדים לפי שדה האטום; אין בחירת שורה', () => {
    const atoms = [
      atom(0, 'א'),
      atom(1, 'ב', { breakBefore: 'forbidden' }),
      atom(2, 'ג', { breakBefore: 'allowed' }),
      atom(3, 'ד', { breakBefore: 'required' }),
    ];
    expect(provider.lineOpportunities(atoms)).toEqual([2, 3]);
    expect(provider.lineOpportunities([atom(0, 'א')])).toEqual([]);
  });
  it('מפתח מטמון קנוני עובד עם זהות הספק המדומה', () => {
    const key = canonicalShapeCacheKey(TEST_PROVIDER_IDENTITY, request());
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalShapeCacheKey(TEST_PROVIDER_IDENTITY, request())).toBe(key);
  });
  it('בקשה לא חוקית נדחית עם קוד מקוטלג — לא תוצאה שקטה אחרת', () => {
    const bad = request({ atoms: [{ ...atom(0, 'א'), text: '' }] });
    expect(() => provider.shape(bad)).toThrowError(/errors\.shape\.INVALID_REQUEST/);
  });
});
