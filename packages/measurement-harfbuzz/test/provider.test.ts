/**
 * מבחני ספק HarfBuzz/WASM הנעול (שלב 24; ADR-003).
 *
 * וקטורים אמיתיים: גופנים מהמניפסט (שלב 23) דרך הצינור המלא —
 * loadFontSet (hash + חתימה) → פריקת WOFF2 (אימות sfnt כפול) → shaping.
 * הבדיקות רצות ב־Node; ה־WASM נטען מהאריזה המקומית (node_modules הנעול)
 * ומאומת מול נעילת ADR-003 בזמן יצירת הספק — בדיוק כמו בייצור.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import wawoff2 from 'wawoff2';
import * as hb from 'harfbuzzjs';
import {
  assertFontManifest,
  loadFontSet,
  ptToLu,
  shapedRunAccountingIssues,
} from '@tora/measurement-api';
import type { FontManifestRecord, ShapeRequest, ShapingAtom } from '@tora/measurement-api';
import { createHarfbuzzProvider, HARFBUZZ_LOCK, PROVIDER_VERSION } from '../src/index.js';
import type { HarfbuzzModule, HarfbuzzProviderOptions } from '../src/index.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(import.meta.url);
const wasmBytes = new Uint8Array(readFileSync(require.resolve('harfbuzzjs/dist/harfbuzz.wasm')));
const woff2DecoderBytes = new Uint8Array(
  readFileSync(require.resolve('wawoff2/build/decompress_binding.js')),
);

const manifest = assertFontManifest(
  JSON.parse(readFileSync(join(repoRoot, 'assets', 'fonts', 'manifest.json'), 'utf8')),
);
const recordOf = (file: string): FontManifestRecord =>
  manifest.find((f) => f.file === file)!;

const FONT_FILES = [
  'Guttman-Rashi-Normal.woff2',
  'selfhost/frank-ruhl-libre-hebrew-400.woff2',
  'selfhost/david-libre-hebrew-400.woff2',
  'selfhost/assistant-latin-400.woff2',
];

let provider: Awaited<ReturnType<typeof createHarfbuzzProvider>>;

async function buildProvider(overrides: Partial<HarfbuzzProviderOptions> = {}) {
  const fonts = await loadFontSet(manifest, FONT_FILES.map((f) => recordOf(f).fontId), async (rec) =>
    new Uint8Array(readFileSync(join(repoRoot, 'assets', 'fonts', rec.file))));
  return createHarfbuzzProvider({
    hb: hb as unknown as HarfbuzzModule,
    wasmBytes,
    woff2DecoderBytes,
    decompressWoff2: (bytes) => wawoff2.decompress(bytes),
    fonts: [...fonts.values()],
    ...overrides,
  });
}

beforeAll(async () => {
  provider = await buildProvider();
});

function atom(i: number, text: string, over: Partial<ShapingAtom> = {}): ShapingAtom {
  return Object.freeze({
    id: `atom:v1|doc|body|${i}+${i + text.length}||0` as ShapingAtom['id'],
    text,
    script: /[א-ת]/.test(text) ? 'hebrew' : 'latin',
    bidiLevel: 1,
    breakBefore: i === 0 ? 'forbidden' : 'allowed',
    ...over,
  });
}

function request(over: Partial<ShapeRequest> = {}): ShapeRequest {
  const guttman = recordOf('Guttman-Rashi-Normal.woff2');
  return Object.freeze({
    atoms: [atom(0, 'ש'), atom(1, 'ל'), atom(2, 'ו'), atom(3, 'ם')],
    font: {
      fontId: guttman.fontId,
      contentSha256: guttman.sha256,
      family: guttman.family ?? guttman.file,
      weight: guttman.weight ?? 400,
      style: guttman.style,
    },
    fontSizeLu: ptToLu(12),
    direction: 'rtl',
    language: 'he',
    features: {},
    letterSpacingLu: 0,
    ...over,
  });
}

describe('נעילות ADR-003 — אימות הזרקה בזמן יצירה', () => {
  it('wasmSha256 המדווח תואם לנעילה ואומת מול ה־bytes האמיתיים', () => {
    expect(provider.providerId).toBe('harfbuzz-wasm');
    expect(provider.wasmSha256).toBe(HARFBUZZ_LOCK.wasmSha256);
    expect(provider.providerVersion).toBe(PROVIDER_VERSION);
  });
  it('environmentHash יציב בין יצירות — נגזר מהנעילות בלבד', async () => {
    const p2 = await buildProvider();
    expect(p2.environmentHash).toBe(provider.environmentHash);
    expect(provider.environmentHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('WASM זר נדחה — MEASUREMENT_UNAVAILABLE עם שני הגיבובים', async () => {
    const tampered = new Uint8Array(wasmBytes);
    tampered[100] = tampered[100]! ^ 0xff;
    await expect(buildProvider({ wasmBytes: tampered })).rejects.toThrowError(
      /MEASUREMENT_UNAVAILABLE.*wasm-sha-mismatch/,
    );
  });
  it('פריקת WOFF2 חסרה כשיש גופני WOFF2 — דחייה מפורשת', async () => {
    await expect(
      buildProvider({ decompressWoff2: undefined, woff2DecoderBytes: undefined }),
    ).rejects.toThrowError(/woff2-decoder-missing/);
  });
});

describe('shaping עברית — וקטורים אמיתיים', () => {
  it('שלום: גליפים אמיתיים, סדר חזותי RTL (קלסטרים יורדים), חשבונאות מלאה', () => {
    const run = provider.shape(request());
    expect(run.glyphs.length).toBe(4);
    expect(run.glyphs.every((g) => g.glyphId > 0)).toBe(true);
    // RTL: הפלט בסדר חזותי — הקלסטרים יורדים (ם→ו→ל→ש)
    const clusters = run.glyphs.map((g) => g.clusterAtomIndex);
    expect(clusters).toEqual([3, 2, 1, 0]);
    expect(shapedRunAccountingIssues(run)).toEqual([]);
    expect(run.widthLu).toBe(run.glyphs.reduce((s, g) => s + g.advanceLu, 0));
  });
  it('ניקוד: לגליפי הניקוד advance 0 (בטרם ריווח) והאשכול של הבסיס', () => {
    const run = provider.shape(
      request({ atoms: [atom(0, 'שָׁלוֹם')] }),
    );
    expect(run.glyphs.length).toBeGreaterThan(4); // בסיסים + ניקוד
    const zero = run.glyphs.filter((g) => g.advanceLu === 0);
    expect(zero.length).toBeGreaterThanOrEqual(3); // קמץ, חולם, נקודת שין
    expect(run.glyphs.every((g) => g.clusterAtomIndex === 0)).toBe(true);
    expect(shapedRunAccountingIssues(run)).toEqual([]);
  });
  it('ניקוד חוצה אטומים: בסיס באטום א׳, ניקוד באטום ב׳ — האשכול של הבסיס', () => {
    const run = provider.shape(request({ atoms: [atom(0, 'ב'), atom(1, 'ּ'), atom(2, 'א')] }));
    // הדגש (dagesh) מתלה על הבסיס שלפניו: clusterAtomIndex 0
    const dagesh = run.glyphs.find((g) => g.advanceLu === 0 && g.clusterAtomIndex === 0);
    expect(dagesh).toBeDefined();
    expect(shapedRunAccountingIssues(run)).toEqual([]);
  });
  it('מקף עברי וגרשיים מעוצבים כחלק מהזרימה', () => {
    const run = provider.shape(request({ atoms: [...'אָבוֹת־הָעוֹלָם'].map((ch, i) => atom(i, ch)) }));
    expect(run.glyphs.length).toBeGreaterThan(5);
    expect(shapedRunAccountingIssues(run)).toEqual([]);
  });
});

describe('גליף חסר — דיווח גלוי, לא החלפה', () => {
  it('Ω בגופן עברי: ‎.notdef‎ והאטום מדווח', () => {
    const run = provider.shape(request({ atoms: [atom(0, 'א'), atom(1, 'Ω'), atom(2, 'ב')] }));
    const omegaGlyphs = run.glyphs.filter((g) => g.clusterAtomIndex === 1);
    expect(omegaGlyphs.length).toBeGreaterThanOrEqual(1);
    expect(omegaGlyphs.every((g) => g.glyphId === 0)).toBe(true);
    const req = request({ atoms: [atom(0, 'א'), atom(1, 'Ω'), atom(2, 'ב')] });
    expect(run.missingGlyphAtomIds).toEqual([req.atoms[1]!.id]);
    expect(shapedRunAccountingIssues(run)).toEqual([]);
  });
  it('אותיות לטיניות בגוטמן-רש"י (אין latn) — כולן מדווחות, בייחוד בסדר הופעה', () => {
    const run = provider.shape(request({ atoms: [atom(0, 'a'), atom(1, 'b')] }));
    expect(run.missingGlyphAtomIds.length).toBe(2);
    const req = request({ atoms: [atom(0, 'a'), atom(1, 'b')] });
    expect(run.missingGlyphAtomIds).toEqual([req.atoms[0]!.id, req.atoms[1]!.id]);
  });
});

describe('LTR וגופנים דו־לשוניים', () => {
  it('frank-ruhl-libre (latn+hebr): abc גליפים אמיתיים בסדר עולה', () => {
    const fr = recordOf('selfhost/frank-ruhl-libre-hebrew-400.woff2');
    // frank-ruhl-libre מכיל גם latn (טבלת GSUB שלו: DFLT, hebr, latn)
    const run = provider.shape(request({
      atoms: [atom(0, 'a'), atom(1, 'b'), atom(2, 'c')],
      font: {
        fontId: fr.fontId, contentSha256: fr.sha256, family: fr.family ?? fr.file,
        weight: fr.weight ?? 400, style: fr.style,
      },
      direction: 'ltr',
      language: 'en',
    }));
    // אם אין גליפים לטיניים בקובץ ה-hebrew — בדיקת המפתח: דיווח מפורש,
    // לא כשל שקט (assistant-latin הוא הגופן הלטיני המלא של המלאי)
    if (run.glyphs.every((g) => g.glyphId > 0)) {
      expect(run.glyphs.map((g) => g.clusterAtomIndex)).toEqual([0, 1, 2]);
    } else {
      expect(run.missingGlyphAtomIds.length).toBe(3);
    }
    expect(shapedRunAccountingIssues(run)).toEqual([]);
  });
  it('assistant-latin: גליפים לטיניים אמיתיים בסדר עולה — LTR מלא', () => {
    const al = recordOf('selfhost/assistant-latin-400.woff2');
    const run = provider.shape(request({
      atoms: [atom(0, 'a'), atom(1, 'b'), atom(2, 'c')],
      font: {
        fontId: al.fontId, contentSha256: al.sha256, family: al.family ?? al.file,
        weight: al.weight ?? 400, style: al.style,
      },
      direction: 'ltr',
      language: 'en',
    }));
    expect(run.glyphs.every((g) => g.glyphId > 0)).toBe(true);
    expect(run.glyphs.map((g) => g.clusterAtomIndex)).toEqual([0, 1, 2]);
    expect(run.missingGlyphAtomIds).toEqual([]);
    expect(shapedRunAccountingIssues(run)).toEqual([]);
  });
  it('david-libre upem 2048 — קנה מידה שונה, חשבונאות שלמה', () => {
    const dl = recordOf('selfhost/david-libre-hebrew-400.woff2');
    const run = provider.shape(request({
      font: {
        fontId: dl.fontId, contentSha256: dl.sha256, family: dl.family ?? dl.file,
        weight: dl.weight ?? 400, style: dl.style,
      },
    }));
    expect(shapedRunAccountingIssues(run)).toEqual([]);
  });
});

describe('מטריקות אנכיות מ־hhea', () => {
  it('גוטמן-רש"י: ascender 925/descender ‎-388‎/lineGap 0 ביחידות גופן → LU', () => {
    const run = provider.shape(request());
    const size = ptToLu(12);
    expect(run.ascentLu).toBe(Math.round((925 * size) / 1000));
    expect(run.descentLu).toBe(Math.round((388 * size) / 1000));
    expect(run.lineGapLu).toBe(0);
  });
});

describe('ריווח אותיות ודטרמיניזם', () => {
  it('letterSpacingLu נכנס ל־advance של כל גליף (כולל האחרון) ולרוחב', () => {
    const base = provider.shape(request({ letterSpacingLu: 0 }));
    const spaced = provider.shape(request({ letterSpacingLu: 100 }));
    expect(spaced.glyphs.length).toBe(base.glyphs.length);
    for (let i = 0; i < spaced.glyphs.length; i++) {
      expect(spaced.glyphs[i]!.advanceLu - base.glyphs[i]!.advanceLu).toBe(100);
    }
    expect(spaced.widthLu - base.widthLu).toBe(100 * spaced.glyphs.length);
    expect(shapedRunAccountingIssues(spaced)).toEqual([]);
  });
  it('features מועברות ל־HarfBuzz (kern) — בקשה חוקית וחשבונאות שלמה', () => {
    const withKern = provider.shape(request({ features: { kern: true } }));
    const noKern = provider.shape(request({ features: { kern: false } }));
    expect(shapedRunAccountingIssues(withKern)).toEqual([]);
    expect(shapedRunAccountingIssues(noKern)).toEqual([]);
  });
  it('דטרמיניזן: שני ספקים מייצרים ביט-ביט אותה תוצאה לאותה בקשה', async () => {
    const p2 = await buildProvider();
    const r = request();
    expect(JSON.stringify(p2.shape(r))).toBe(JSON.stringify(provider.shape(r)));
  });
  it('batch שקוף: תוצאה זהה לביצוע הפרטני', () => {
    const reqs = [
      request(),
      request({ fontSizeLu: ptToLu(18) }),
      request({ letterSpacingLu: 7 }),
    ];
    const batch = provider.shapeBatch!(reqs);
    const singles = reqs.map((r) => provider.shape(r));
    expect(JSON.stringify(batch)).toBe(JSON.stringify(singles));
  });
});

describe('כשלים גלויים — אין fallback שקט', () => {
  it('גופן שאינו בסט ← MISSING_FONT עם משפחה ומזהה', () => {
    const stranger = recordOf('Abir-Black.woff2');
    expect(() =>
      provider.shape(request({
        font: {
          fontId: stranger.fontId, contentSha256: stranger.sha256,
          family: stranger.family ?? stranger.file, weight: 400, style: 'normal',
        },
      })),
    ).toThrowError(/errors\.font\.MISSING_FONT/);
  });
  it('sfnt שאינו תואם למניפסט (רשומת שקר) ← FONT_SFNT_MISMATCH לפני כל מדידה', async () => {
    const lying = manifest.map((f) => (f.file === 'Guttman-Rashi-Normal.woff2'
      ? { ...f, sfntSha256: '0'.repeat(64) }
      : f));
    await expect(buildProviderWithManifest(lying)).rejects.toThrowError(
      /errors\.font\.FONT_SFNT_MISMATCH/,
    );
  });
});

describe('עשן על פסוק אמיתי מהקורפוס', () => {
  it('פסוק מנוקד מעוצב במלואו; כל הקלסטרים ממופים לאטומים', () => {
    const verse = 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ';
    const atoms = [...verse].map((ch, i) => atom(i, ch));
    const run = provider.shape(request({ atoms }));
    expect(run.glyphs.length).toBeGreaterThanOrEqual(verse.replace(/ /g, '').length);
    expect(run.missingGlyphAtomIds).toEqual([]);
    expect(shapedRunAccountingIssues(run)).toEqual([]);
    expect(run.widthLu).toBeGreaterThan(0);
  });
});

describe('גהות wasm — השמדת מאגרים (שלב 73)', () => {
  const verseAtoms = [...'וְאֵלֶּה שְׁמוֹת בְּנֵי יִשְׂרָאֵל הַבָּאִים מִצְרַיְמָה']
    .map((ch, i) => atom(i, ch));

  it('יציבות לאורך אלפי קריאות — כל תוצאה זהה לראשונה ביט-ביט', () => {
    const first = provider.shape(request({ atoms: verseAtoms }));
    let identical = 0;
    for (let i = 0; i < 3000; i++) {
      const r = provider.shape(request({ atoms: verseAtoms }));
      if (JSON.stringify(r) === JSON.stringify(first)) identical += 1;
    }
    expect(identical).toBe(3000);
  });

  it('הזיכרון החיצוני אינו תופח עם מספר העיצובים (מאגר מושמד)', () => {
    // חימום: הקצאות wasm הראשוניות (גדילת ערימה בסיסית) מאחורינו
    for (let i = 0; i < 500; i++) provider.shape(request({ atoms: verseAtoms }));
    const before = process.memoryUsage().external;
    for (let i = 0; i < 8000; i++) provider.shape(request({ atoms: verseAtoms }));
    const growth = process.memoryUsage().external - before;
    // לפני התיקון: כל מאגר שאינו מושמד נשאר בערימת ה-wasm — 8000 קריאות
    // הצטברו לעשרות MB. אחרי: צמיחה זניחה בלבד (רעש הקצאות JS רגיל).
    expect(growth).toBeLessThan(8 * 1048576);
  });
});

/** עזר: בניית ספק עם מניפסט מותאם (לבדיקת האימות הכפול). */
async function buildProviderWithManifest(fm: readonly FontManifestRecord[]) {
  const fonts = await loadFontSet(fm, FONT_FILES.map((f) => recordOf(f).fontId), async (rec) =>
    new Uint8Array(readFileSync(join(repoRoot, 'assets', 'fonts', rec.file))));
  return createHarfbuzzProvider({
    hb: hb as unknown as HarfbuzzModule,
    wasmBytes,
    woff2DecoderBytes,
    decompressWoff2: (bytes) => wawoff2.decompress(bytes),
    fonts: [...fonts.values()],
  });
}
