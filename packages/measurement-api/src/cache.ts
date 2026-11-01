/**
 * cache.ts — מטמון shaping (שלב 26; אפיון §6.2, §17.3).
 *
 * עקרון היסוד (§6.4): **המטמון הוא אופטימיזציה בלבד** — ריצה עם מטמון
 * קר וריצה עם מטמון חם מניבות תוצאות זהות ביט-ביט. פינוי (eviction),
 * ניקוי (clear) או ביטול job אינם משנים שום תוצאה — miss מחשב מחדש
 * ומקבל בדיוק את אותו הערך (הספק דטרמיניסטי, שלב 24).
 *
 * מפתח: ‎canonicalShapeCacheKey‎ של שלב 22 — הכיסוי המלא של רכיבי
 * ההשפעה (טקסט+מזהי אטומים, טביעת פנים כולל contentSha256, גודל,
 * features, כיוון, שפה, ריווח, זהות provider מלאה) — אין זמן, אין מונה,
 * אין מיקום ב־batch, אין תלות בסדר קריאות.
 *
 * מדדים (hit/miss/evictions/bytes) — מחוץ לקביעת התוצאה לחלוטין.
 */
import { canonicalShapeCacheKey } from './cache-key.js';
import type { ShapedCacheValue } from './cache-key.js';
import type {
  AnyMeasurementProvider,
  ProviderIdentity,
  ShapeRequest,
  ShapedRun,
} from './provider.js';

/** אומדן זיכרון לרשומה — לתקרת תקציב בלבד; אינו משפיע על התוצאה. */
function estimateRunBytes(run: ShapedRun): number {
  return 256 + run.glyphs.length * 48 + run.missingGlyphAtomIds.length * 64;
}

export interface ShapingCacheOptions {
  /** תקרת רשומות (LRU); ברירת מחדל 4096. */
  readonly maxEntries?: number;
  /** תקרת אומדן בתים; ברירת מחדל 32MiB. */
  readonly byteBudget?: number;
}

/**
 * מטמון shaping — מימוש LRU עם שתי תקרות (רשומות ובתים-מוערכים).
 * ערכים קפואים ומשותפים; המדדים מצטברים ואינם נכנסים לתוצאה.
 */
export class LruShapingCache {
  private readonly map = new Map<string, ShapedCacheValue>();
  private readonly maxEntries: number;
  private readonly byteBudget: number;
  private bytesEstimate = 0;
  private readonly metricsData = { hits: 0, misses: 0, evictions: 0 };

  constructor(options: ShapingCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 4096;
    this.byteBudget = options.byteBudget ?? 32 * 1024 * 1024;
    if (!Number.isSafeInteger(this.maxEntries) || this.maxEntries < 1) {
      throw new RangeError('maxEntries חייב שלם חיובי');
    }
    if (!Number.isSafeInteger(this.byteBudget) || this.byteBudget < 1024) {
      throw new RangeError('byteBudget חייב שלם חיובי (≥1024)');
    }
  }

  /** שליפה — מעדכנת LRU ומדדים; הערך קפוא ומשותף. */
  get(key: string): ShapedCacheValue | null {
    const found = this.map.get(key);
    if (found === undefined) {
      this.metricsData.misses += 1;
      return null;
    }
    // LRU: העברה לסוף (הכי חדש)
    this.map.delete(key);
    this.map.set(key, found);
    this.metricsData.hits += 1;
    return found;
  }

  /** הכנסה עם פינוי LRU עד לעמידה בתקרות; דורסת ערך קיים על אותו מפתח. */
  set(key: string, value: ShapedCacheValue): void {
    const prev = this.map.get(key);
    if (prev !== undefined) {
      this.bytesEstimate -= estimateRunBytes(prev.run);
      this.map.delete(key);
    }
    const size = estimateRunBytes(value.run);
    this.map.set(key, value);
    this.bytesEstimate += size;
    // פינוי: מהכי ישן ועד ששתי התקרות עומדות (או שנשארה הרשומה החדשה בלבד)
    while (this.map.size > 1 && (this.map.size > this.maxEntries || this.bytesEstimate > this.byteBudget)) {
      const oldest = this.map.keys().next().value as string;
      const evicted = this.map.get(oldest)!;
      this.bytesEstimate -= estimateRunBytes(evicted.run);
      this.map.delete(oldest);
      this.metricsData.evictions += 1;
    }
    if (this.map.size === 1 && this.bytesEstimate > this.byteBudget) {
      // רשומה בודדת חורגת — נשמרת (אחרת set לעולם לא יאחסן דבר); מתועד.
    }
  }

  /** מספר הרשומות כרגע. */
  get size(): number {
    return this.map.size;
  }

  /** אומדן הבתים הנוכחי — למדדים בלבד. */
  get bytes(): number {
    return this.bytesEstimate;
  }

  /** מדדים מצטברים — עותק קפוא; מחוץ לקביעת התוצאה. */
  get metrics(): { readonly hits: number; readonly misses: number; readonly evictions: number } {
    return Object.freeze({ ...this.metricsData });
  }

  /**
   * ניקוי מלא — מדמה ביטול job/סגירה: המטמון מתרוקן; הריצות הבאות
   * יהיו miss ויחשבו מחדש לאותן תוצאות בדיוק (הספק דטרמיניסטי).
   */
  clear(): void {
    this.map.clear();
    this.bytesEstimate = 0;
  }
}

export interface CachedProviderOptions extends ShapingCacheOptions {
  /** להזריק מטמון קיים (למשל משותף בין ריצות של אותו job). */
  readonly cache?: LruShapingCache;
}

/**
 * עוטף ספק במטמון — החוזה: אותן בקשות ⇐ אותן תוצאות, ביט-ביט,
 * בכל תרחיש (קר/חם/לאחר פינוי/לאחר ניקוי). הזהות וה־lineOpportunities
 * עוברים כמות שהם; ה־batch ממומש דרך ה־shape הממוקד לבקשה — שקיפות
 * מלאה לפי חוזה שלב 22. ה־cache חשוף למדדים ולבדיקות בלבד.
 */
export function withShapingCache(
  provider: AnyMeasurementProvider,
  options: CachedProviderOptions = {},
): AnyMeasurementProvider & { readonly cache: LruShapingCache } {
  const cache = options.cache ?? new LruShapingCache(options);
  const fallbackSha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'; // SHA-256("")
  const identity: ProviderIdentity = Object.freeze({
    providerId: provider.providerId,
    providerVersion: provider.providerVersion,
    wasmSha256: 'wasmSha256' in provider && typeof (provider as MeasurementProviderLike).wasmSha256 === 'string'
      ? (provider as MeasurementProviderLike).wasmSha256!
      : fallbackSha,
    environmentHash: provider.environmentHash,
  });

  const shape = (request: ShapeRequest): ShapedRun => {
    const key = canonicalShapeCacheKey(identity, request);
    const cached = cache.get(key);
    if (cached !== null) {
      return cached.run;
    }
    const run = provider.shape(request);
    cache.set(key, { cacheKey: key, run });
    return run;
  };

  const lineOpportunities = (atoms: readonly import('./provider.js').ShapingAtom[]): readonly number[] =>
    provider.lineOpportunities(atoms);
  const shapeBatch = (requests: readonly ShapeRequest[]): readonly ShapedRun[] =>
    requests.map((r) => shape(r));

  if (provider.providerId === 'harfbuzz-wasm') {
    return Object.freeze({
      providerId: 'harfbuzz-wasm' as const,
      wasmSha256: provider.wasmSha256,
      providerVersion: provider.providerVersion,
      environmentHash: provider.environmentHash,
      shape,
      lineOpportunities,
      shapeBatch,
      cache,
    });
  }
  return Object.freeze({
    providerId: 'test-simulated' as const,
    providerVersion: provider.providerVersion,
    environmentHash: provider.environmentHash,
    vectorsVersion: provider.vectorsVersion,
    shape,
    lineOpportunities,
    shapeBatch,
    cache,
  });
}

/** טיפוס עזר לגישה ל־wasmSha256 האופציונלי. */
interface MeasurementProviderLike {
  readonly wasmSha256?: string;
}
