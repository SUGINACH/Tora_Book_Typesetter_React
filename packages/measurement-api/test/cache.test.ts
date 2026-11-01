/**
 * מבחני מטמון shaping (שלב 26; אפיון §6.2, §17.3).
 * השער: המטמון אופטימיזציה בלבד — קר/חם זהים ביט-ביט; פינוי, ניקוי
 * וביטול job אינם משנים תוצאה; אין תלות בסדר קריאות; המדדים מחוץ
 * לקביעת התוצאה.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { LruShapingCache, withShapingCache } from '../src/cache.js';
import { canonicalShapeCacheKey } from '../src/cache-key.js';
import { createTestMeasurementProvider } from '../src/test-provider.js';
import { TEST_PROVIDER_IDENTITY } from '../src/test-provider.js';
import type { ShapeRequest, ShapingAtom, ShapedRun } from '../src/provider.js';

const provider = createTestMeasurementProvider();

const atom = (i: number, text: string): ShapingAtom => ({
  id: `atom:v1|doc|body|${i}+${i + text.length}||0` as ShapingAtom['id'],
  text,
  script: 'hebrew',
  bidiLevel: 1,
  breakBefore: i === 0 ? 'forbidden' : 'allowed',
});

function request(over: Partial<ShapeRequest> = {}): ShapeRequest {
  return {
    atoms: [atom(0, 'ש'), atom(1, 'ל'), atom(2, 'ו'), atom(3, 'ם')],
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
    ...over,
  };
}

describe('LruShapingCache — יחידת המטמון', () => {
  it('set→get מחזיר את הערך; מפתח שונה ← null', () => {
    const cache = new LruShapingCache();
    const run: ShapedRun = provider.shape(request());
    cache.set('k1', { cacheKey: 'k1', run });
    expect(cache.get('k1')?.run).toBe(run); // אותו ערך משותף, לא עותק
    expect(cache.get('k2')).toBeNull();
  });
  it('פינוי LRU: חריגה מ־maxEntries פונה את הישן; get מרענן', () => {
    const cache = new LruShapingCache({ maxEntries: 2 });
    const r1 = provider.shape(request({ language: 'en' }));
    const r2 = provider.shape(request({ language: 'fr' }));
    const r3 = provider.shape(request({ language: 'de' }));
    cache.set('k1', { cacheKey: 'k1', run: r1 });
    cache.set('k2', { cacheKey: 'k2', run: r2 });
    cache.get('k1'); // רענון — k2 נהיה הישן
    cache.set('k3', { cacheKey: 'k3', run: r3 }); // פונה את k2
    expect(cache.size).toBe(2);
    expect(cache.get('k1')).not.toBeNull();
    expect(cache.get('k2')).toBeNull();
    expect(cache.get('k3')).not.toBeNull();
    expect(cache.metrics.evictions).toBe(1);
  });
  it('תקציב בתים נאכף (בגסות מוערכת) — הכנסה גדולה פונה ישנות', () => {
    const cache = new LruShapingCache({ byteBudget: 2048 });
    for (let i = 0; i < 60; i++) {
      const run = provider.shape(request({ atoms: [...('אאאאאאאאאאאאאאאא')].map((ch, j) => atom(j, ch)) }));
      cache.set(`k${i}`, { cacheKey: `k${i}`, run });
    }
    expect(cache.size).toBeLessThan(60);
    expect(cache.metrics.evictions).toBeGreaterThan(0);
  });
  it('clear — ניקוי מלא; מדדי ה־hit/miss ממשיכים להצטבר', () => {
    const cache = new LruShapingCache();
    cache.set('k', { cacheKey: 'k', run: provider.shape(request()) });
    cache.get('k');
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('k')).toBeNull();
    const m = cache.metrics;
    expect(m.hits).toBe(1);
    expect(m.misses).toBe(1);
  });
  it('ארגומנטים לא חוקיים נדחים', () => {
    expect(() => new LruShapingCache({ maxEntries: 0 })).toThrowError(RangeError);
    expect(() => new LruShapingCache({ byteBudget: 1 })).toThrowError(RangeError);
  });
});

describe('withShapingCache — קר/חם זהים ביט-ביט', () => {
  it('ריצה ראשונה (miss) ושנייה (hit) — אותה תוצאה בדיוק', () => {
    const cached = withShapingCache(provider);
    const r = request();
    const cold = cached.shape(r);
    const warm = cached.shape(r);
    expect(cold).toBe(warm); // אותו עצם — הערך הקפוא משותף
    expect(JSON.stringify(cold)).toBe(JSON.stringify(provider.shape(r)));
    const m = cached.cache.metrics;
    expect(m.hits).toBe(1);
    expect(m.misses).toBe(1);
  });
  it('לאחר ניקוי (ביטול job) — miss מחשב מחדש לאותה תוצאה', () => {
    const cached = withShapingCache(provider);
    const r = request();
    const before = JSON.stringify(cached.shape(r));
    cached.cache.clear();
    const after = JSON.stringify(cached.shape(r));
    expect(after).toBe(before);
  });
  it('פינוי אוטומטי אינו משנה תוצאות — תקרת רשומות 1', () => {
    const cached = withShapingCache(provider, { maxEntries: 1 });
    const r1 = request({ language: 'en' });
    const r2 = request({ language: 'fr' });
    const s1a = JSON.stringify(cached.shape(r1));
    cached.shape(r2); // פונה את r1
    expect(cached.cache.size).toBe(1);
    const s1b = JSON.stringify(cached.shape(r1)); // miss ← חישוב מחדש
    expect(s1b).toBe(s1a);
  });
  it('אין תלות בסדר קריאות — אותן בקשות בכל סדר ⇐ אותן תוצאות', () => {
    const a = withShapingCache(provider);
    const b = withShapingCache(provider);
    const reqs = [
      request({ fontSizeLu: 786432 }),
      request({ fontSizeLu: 851968 }),
      request({ letterSpacingLu: 5 }),
      request({ direction: 'ltr' as const }),
    ];
    const forward = reqs.map((r) => JSON.stringify(a.shape(r)));
    const reversed = [...reqs].reverse().map((r) => JSON.stringify(b.shape(r))).reverse();
    expect(reversed).toEqual(forward);
  });
  it('בקשות שונות אינן חולקות ערך במטמון (אין התנגשות מפתח)', () => {
    const cached = withShapingCache(provider);
    const r1 = request({ language: 'en' });
    const r2 = request({ language: 'fr' });
    const s1 = cached.shape(r1);
    const s2 = cached.shape(r2);
    expect(JSON.stringify(s1)).not.toBe(JSON.stringify(s2));
    // והפוך: כל בקשה מקבלת את שלה בדיוק
    expect(JSON.stringify(cached.shape(r1))).toBe(JSON.stringify(s1));
    expect(JSON.stringify(cached.shape(r2))).toBe(JSON.stringify(s2));
  });
  it('batch עובר דרך המטמון — תוצאה זהה לפרטני ולספק החשוף', () => {
    const cached = withShapingCache(provider);
    const reqs = [request(), request({ fontSizeLu: 851968 })];
    const viaBatch = cached.shapeBatch!(reqs);
    const direct = reqs.map((r) => cached.shape(r));
    expect(viaBatch).toEqual(direct);
    // אגב הפעלה פנימית: ה־batch אכל את המטמון — הקריאות הבאות הן hit
    const m0 = cached.cache.metrics;
    cached.shape(reqs[0]!);
    expect(cached.cache.metrics.hits).toBe(m0.hits + 1);
  });
  it('הזהות נשמרת: providerId/providerVersion/environmentHash עוברים כמות שהם', () => {
    const cached = withShapingCache(provider);
    expect(cached.providerId).toBe(provider.providerId);
    expect(cached.providerVersion).toBe(provider.providerVersion);
    expect(cached.environmentHash).toBe(provider.environmentHash);
  });
  it('lineOpportunities מועבר כמות שהוא (אינו ממוקד)', () => {
    const cached = withShapingCache(provider);
    const atoms = [atom(0, 'א'), atom(1, 'ב', { breakBefore: 'allowed' as const })];
    expect(cached.lineOpportunities(atoms)).toEqual(provider.lineOpportunities(atoms));
  });
  it('property: אותן בקשות דרך שני עטיפות עם אותו מטמון מוזרק — מדדים משותפים', () => {
    const shared = new LruShapingCache();
    const a = withShapingCache(provider, { cache: shared });
    const b = withShapingCache(provider, { cache: shared });
    const r = request();
    a.shape(r);
    const fromB = b.shape(r);
    expect(shared.metrics.hits).toBe(1);
    expect(fromB).toBe(a.shape(r));
  });
});

describe('property — דטרמיניזן מלא תחת מטמון', () => {
  it('אותו מסלול קריאות על שתי עטיפות ⇐ אותן תוצאות ביט-ביט', () => {
    const textArb = fc.stringMatching(/^[א-ת]{1,12}$/);
    fc.assert(
      fc.property(fc.array(textArb, { minLength: 1, maxLength: 6 }), (words) => {
        const a = withShapingCache(provider, { maxEntries: 2 });
        const b = withShapingCache(provider, { maxEntries: 100 });
        const results = words.map((w) =>
          JSON.stringify(a.shape(request({ atoms: [...w].map((ch, i) => atom(i, ch)) }))));
        const expected = words.map((w) =>
          JSON.stringify(b.shape(request({ atoms: [...w].map((ch, i) => atom(i, ch)) }))));
        // פינוי אגרסיבי (maxEntries=2) אינו משנה אף תוצאה
        return JSON.stringify(results) === JSON.stringify(expected);
      }),
      { numRuns: 300 },
    );
  });
  it('מפתח קנוני זהה למפתח שהעטיפה משתמשת בו (עקביות עם שלב 22)', () => {
    const cached = withShapingCache(provider);
    const r = request();
    const key = canonicalShapeCacheKey(TEST_PROVIDER_IDENTITY, r);
    cached.shape(r);
    // המטמון מכיל בדיוק רשומה אחת — עם אותו מפתח קנוני
    expect(cached.cache.size).toBe(1);
    expect(cached.cache.get(key)).not.toBeNull();
  });
});
