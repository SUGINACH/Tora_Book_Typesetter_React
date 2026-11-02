/**
 * הבדיקות השליליות של שלב 25 — איסור fallback שקט, על הספק האמיתי.
 * כל כשל חייב להיות גלוי ומקוטלג עם טביעת גופן/מזהה; אף נתיב לא
 * "ממשיך בכל זאת" — לא גופן מערכת, לא מדידה מדומה, לא Canvas.
 *
 * ארבעת התרחישים המחייבים (תכנית שלב 25): הסרת גופן, שינוי byte,
 * גליף חסר, WASM בלתי-זמין — ועוד: אף תוצאה לא מתקבלת בעקבות כשל.
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
  assertNoMissingGlyphs,
  fontFaceKeyOf,
  loadFontSet,
  missingGlyphFindings,
  shapedRunAccountingIssues,
} from '@tora/measurement-api';
import type { FontManifestRecord, ShapeRequest, ShapingAtom } from '@tora/measurement-api';
import { createHarfbuzzProvider } from '../src/index.js';
import type { HarfbuzzModule } from '../src/index.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(import.meta.url);
const wasmBytes = new Uint8Array(readFileSync(require.resolve('harfbuzzjs/dist/harfbuzz.wasm')));
const woff2DecoderBytes = new Uint8Array(
  readFileSync(require.resolve('wawoff2/build/decompress_binding.js')),
);

const manifest = assertFontManifest(
  JSON.parse(readFileSync(join(repoRoot, 'assets', 'fonts', 'manifest.json'), 'utf8')),
);
const guttman = manifest.find((f) => f.file === 'Guttman-Rashi-Normal.woff2') as FontManifestRecord;
const abir = manifest.find((f) => f.file === 'Abir-Black.woff2') as FontManifestRecord;

let provider: Awaited<ReturnType<typeof createHarfbuzzProvider>>;

beforeAll(async () => {
  const fonts = await loadFontSet(manifest, [guttman.fontId], async (rec) =>
    new Uint8Array(readFileSync(join(repoRoot, 'assets', 'fonts', rec.file))));
  provider = await createHarfbuzzProvider({
    hb: hb as unknown as HarfbuzzModule,
    wasmBytes,
    woff2DecoderBytes,
    decompressWoff2: (b) => wawoff2.decompress(b),
    fonts: [...fonts.values()],
  });
});

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
    font: fontFaceKeyOf(guttman),
    fontSizeLu: 786432,
    direction: 'rtl',
    language: 'he',
    features: {},
    letterSpacingLu: 0,
    ...over,
  };
}

describe('תרחיש 1 — הסרת גופן: הבקשה נכשלת במפורש, לא מוחלפת', () => {
  it('גופן שאינו בסט ← MISSING_FONT עם משפחה ומזהה', () => {
    const stranger = fontFaceKeyOf(abir);
    let err: { message: string; params: Record<string, unknown> } | null = null;
    try {
      provider.shape(request({ font: stranger }));
    } catch (e) {
      err = e as { message: string; params: Record<string, unknown> };
    }
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/errors\.font\.MISSING_FONT/);
    expect(err!.params.family).toBe(abir.family ?? abir.file);
    expect(err!.params.file).toBe(stranger.fontId);
  });
  it('לא הוחזרה שום תוצאה חלופית — החריגה היא התוצאה היחידה', () => {
    let anyResult = false;
    try {
      provider.shape(request({ font: fontFaceKeyOf(abir) }));
      anyResult = true;
    } catch {
      // צפוי
    }
    expect(anyResult).toBe(false);
  });
});

describe('תרחיש 2 — שינוי byte: הטעינה עוצרת לפני המדידה הראשונה', () => {
  it('byte אחד שהשתנה ← FONT_HASH_MISMATCH עם שני הגיבובים בפרמטרים', async () => {
    let err: { message: string; params: Record<string, unknown> } | null = null;
    try {
      await loadFontSet(manifest, [guttman.fontId], async (rec) => {
        const bytes = new Uint8Array(readFileSync(join(repoRoot, 'assets', 'fonts', rec.file)));
        bytes[20] = bytes[20]! ^ 0x01;
        return bytes;
      });
    } catch (e) {
      err = e as { message: string; params: Record<string, unknown> };
    }
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/errors\.font\.FONT_HASH_MISMATCH/);
    expect(err!.params.expectedSha256).toBe(guttman.sha256);
    expect(String(err!.params.actualSha256)).toMatch(/^[0-9a-f]{64}$/);
  });
  it('אין טעינה חלקית: גופן תקין + גופן פגום באותו סט ← הסט כולו נדחה', async () => {
    let threw = false;
    try {
      await loadFontSet(manifest, [guttman.fontId, abir.fontId], async (rec) => {
        const bytes = new Uint8Array(readFileSync(join(repoRoot, 'assets', 'fonts', rec.file)));
        if (rec.file === abir.file) bytes[30] = bytes[30]! ^ 0xff;
        return bytes;
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe('תרחיש 3 — גליף חסר: דיווח מלא או כשל קשיח, לעולם לא tofu שקט', () => {
  it('Ω בגופן עברי: ממצא HIGH לכל אטום עם טביעת גופן ומזהה', () => {
    const req = request({ atoms: [atom(0, 'א'), atom(1, 'Ω'), atom(2, 'ב')] });
    const run = provider.shape(req);
    const findings = missingGlyphFindings(run, req);
    expect(findings.length).toBe(1);
    expect(findings[0]!.key).toBe('errors.font.MISSING_GLYPH');
    expect(findings[0]!.params.fontId).toBe(guttman.fontId);
    expect(findings[0]!.params.atomId).toBe(req.atoms[1]!.id);
    expect(shapedRunAccountingIssues(run)).toEqual([]);
  });
  it('השער הקשיח: assertNoMissingGlyphs נכשל עם מזהה הגופן והמספר', () => {
    const req = request({ atoms: [atom(0, 'x'), atom(1, 'y')] });
    const run = provider.shape(req);
    expect(run.missingGlyphAtomIds.length).toBe(2);
    try {
      assertNoMissingGlyphs(run, req);
      expect.unreachable('היה צריך להיכשל');
    } catch (e) {
      expect((e as Error).message).toMatch(/errors\.font\.MISSING_GLYPH/);
      expect((e as { params: Record<string, unknown> }).params.count).toBe(2);
    }
  });
  it('tofu מתועד: הגליף עצמו הוא ‎.notdef‎ (glyphId 0) — לא גליף של גופן אחר', () => {
    const run = provider.shape(request({ atoms: [atom(0, 'Ω')] }));
    expect(run.glyphs.every((g) => g.glyphId === 0)).toBe(true);
  });
});

describe('תרחיש 4 — WASM בלתי-זמין: אין גרסה חלופית ואין מדידה מדומה', () => {
  it('bytes של WASM שהשתנו ← MEASUREMENT_UNAVAILABLE ביצירה', async () => {
    const tampered = new Uint8Array(wasmBytes);
    tampered[10] = tampered[10]! ^ 0xff;
    const fonts = await loadFontSet(manifest, [guttman.fontId], async (rec) =>
      new Uint8Array(readFileSync(join(repoRoot, 'assets', 'fonts', rec.file))));
    let err: { message: string } | null = null;
    try {
      await createHarfbuzzProvider({
        hb: hb as unknown as HarfbuzzModule,
        wasmBytes: tampered,
        woff2DecoderBytes,
        decompressWoff2: (b) => wawoff2.decompress(b),
        fonts: [...fonts.values()],
      });
    } catch (e) {
      err = e as { message: string };
    }
    expect(err).not.toBeNull();
    expect(err!.message).toMatch(/errors\.measurement\.MEASUREMENT_UNAVAILABLE/);
    expect(err!.message).toMatch(/wasm-sha-mismatch/);
  });
});

describe('אין נסיגה לגופן מערכת / Canvas / רשת — הוכחה מבנית', () => {
  it('כל טקסט שהגופן אינו מכיל ← דיווח, לעולם לא גליף מגופן אחר', () => {
    // גוטמן-רש"י אינו מכיל לטינית (הרווח דווקא כן — גליף לגיטימי בגופן);
    // אם הייתה נסיגה לגופן מערכת היינו מקבלים גליפים לא-אפסיים לאותיות.
    const run = provider.shape(request({ atoms: [...('hello world')].map((ch, i) => atom(i, ch)) }));
    const latinGlyphs = run.glyphs.filter((_, i) => i !== run.glyphs.findIndex((g) => g.clusterAtomIndex === 5));
    expect(run.glyphs.every((g) => g.glyphId === 0 || g.clusterAtomIndex === 5)).toBe(true);
    expect(run.missingGlyphAtomIds.length).toBe(10); // 11 תווים פחות הרווח
  });
  it('אין שום גופן מערכת במסלול: ההצלחה היחידה היא גופן מהמניפסט שעבר אימות', () => {
    // הספק נוצר עם גוטמן בלבד; בקשה תקינה מצליחה, וכל בקשה אחרת נכשלת —
    // אין מצב ביניים של "ניסיתי משהו אחר"
    const ok = provider.shape(request());
    expect(ok.glyphs.length).toBe(4);
    expect(ok.missingGlyphAtomIds).toEqual([]);
  });
});
