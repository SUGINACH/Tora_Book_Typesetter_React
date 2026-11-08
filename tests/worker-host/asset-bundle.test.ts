/**
 * asset-bundle.test.ts — בדיקות צרור הנכסים ל־Worker (שלב 77).
 *
 * מה מוכח כאן: המניפסט נטען וזהותו (sha256 של הטקסט) נשמרת ל־inputHash;
 * גוף הגוף נפתר באותו סדר עדיפויות כמו ה־CLI (fontId → קובץ → משפחה);
 * bytes שאומתו מול הרשומה — חילול ⇐ כשל מפורש; כשלי רשת/מניפסט
 * פגום ⇐ מפתח קטלוגי, לא זריקה גולמית. ריצה מול המניפסט והגופן האמיתיים
 * של המאגר (public/fonts — אותם bytes כמו assets/fonts).
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AssetBundleError,
  DEFAULT_BODY_FONT_SPEC,
  loadBrowserAssetBundle,
  resolveBodyFontRecord,
} from '../../src/worker-host/asset-bundle.js';
import { assertFontManifest, sha256Bytes } from '@tora/measurement-api';

const repoRoot = join(import.meta.dirname, '..', '..');
const manifestText = readFileSync(join(repoRoot, 'public', 'fonts', 'manifest.json'), 'utf8');
const manifest = assertFontManifest(JSON.parse(manifestText));
const guttmanBytes = new Uint8Array(readFileSync(join(repoRoot, 'public', 'fonts', 'Guttman-Rashi-Normal.woff2')));

type FetchMap = Record<string, () => Response | Promise<Response>>;

const makeFetch = (map: FetchMap) => async (url: string): Promise<Response> => {
  const maker = map[url];
  if (maker === undefined) {
    return new Response('not found', { status: 404 });
  }
  return maker();
};

const jsonResponse = (text: string): Response => new Response(text, { status: 200 });
const bytesResponse = (bytes: Uint8Array): Response => new Response(bytes.slice().buffer as ArrayBuffer, { status: 200 });

const happyMap: FetchMap = {
  './fonts/manifest.json': () => jsonResponse(manifestText),
  [`./fonts/${DEFAULT_BODY_FONT_SPEC}`]: () => bytesResponse(guttmanBytes),
  '/wasm': () => bytesResponse(new Uint8Array([1, 2, 3])),
  '/decoder': () => bytesResponse(new Uint8Array([9])),
};

describe('asset-bundle — טעינה מלאה מול הנכסים האמיתיים', () => {
  test('צרור תקין: רשומת הגופן, ארבעת השימושים באותו מפתח, זהות המניפסט, הנכסים המוזרקים', async () => {
    const bundle = await loadBrowserAssetBundle({
      fetchImpl: makeFetch(happyMap),
      wasmUrl: '/wasm',
      woff2DecoderUrl: '/decoder',
    });
    expect(bundle.fonts).toHaveLength(1);
    expect(bundle.fonts[0]?.record.file).toBe(DEFAULT_BODY_FONT_SPEC);
    expect(bundle.assets.schemaVersion).toBe(1);
    const usages = bundle.assets.fonts.map((f) => f.usage).sort();
    expect(usages).toEqual(['body', 'heading', 'note-body', 'note-marker']);
    const keys = new Set(bundle.assets.fonts.map((f) => f.font));
    expect(keys.size).toBe(1); // אותו גופן לכל השימושים — כמו ה־CLI
    // זהות המניפסט — sha256 של הטקסט כמות שהוא (זהה ל־CLI ביט־ביט)
    expect(bundle.assets.fontsManifestSha256).toBe(sha256Bytes(new TextEncoder().encode(manifestText)));
    expect(Array.from(bundle.wasmBytes)).toEqual([1, 2, 3]);
    expect(Array.from(bundle.woff2DecoderBytes)).toEqual([9]);
  });

  test('resolveBodyFontRecord — אותו סדר עדיפויות כמו ה־CLI (fontId → קובץ → משפחה)', () => {
    const byFile = resolveBodyFontRecord(manifest, DEFAULT_BODY_FONT_SPEC);
    expect(byFile.file).toBe(DEFAULT_BODY_FONT_SPEC);
    const byId = resolveBodyFontRecord(manifest, byFile.fontId);
    expect(byId.file).toBe(DEFAULT_BODY_FONT_SPEC);
    // משפחה = חיפוש ראשון־מתאים (כמו ה־CLI) — איזה משקל שיהיה, אבל מהמשפחה
    const byFamily = resolveBodyFontRecord(manifest, 'Guttman Rashi');
    expect(byFamily.file).toMatch(/^Guttman-Rashi-/);
    expect(byFamily.family === null || typeof byFamily.family === 'string').toBe(true);
    expect(() => resolveBodyFontRecord(manifest, 'no-such-font')).toThrowError(AssetBundleError);
  });
});

describe('asset-bundle — כשלים מפורשים (אין המשך שקט עם נכס חסר)', () => {
  test('גופן שהוחלף בדרך ⇐ FONT_HASH_MISMATCH — לא ספק עם bytes זרים', async () => {
    const tampered = new Uint8Array(guttmanBytes.length);
    tampered.set(guttmanBytes);
    tampered[0] = (tampered[0]! + 1) % 256;
    await expect(loadBrowserAssetBundle({
      fetchImpl: makeFetch({ ...happyMap, [`./fonts/${DEFAULT_BODY_FONT_SPEC}`]: () => bytesResponse(tampered) }),
      wasmUrl: '/wasm',
      woff2DecoderUrl: '/decoder',
    })).rejects.toMatchObject({ errorCode: 'errors.assets.FONT_HASH_MISMATCH' });
  });

  test('מניפסט חסר/פגום ⇐ MANIFEST_UNREADABLE / MANIFEST_INVALID', async () => {
    await expect(loadBrowserAssetBundle({
      fetchImpl: makeFetch({}),
      wasmUrl: '/wasm',
      woff2DecoderUrl: '/decoder',
    })).rejects.toMatchObject({ errorCode: 'errors.assets.MANIFEST_UNREADABLE' });
    await expect(loadBrowserAssetBundle({
      fetchImpl: makeFetch({ './fonts/manifest.json': () => jsonResponse('{broken') }),
      wasmUrl: '/wasm',
      woff2DecoderUrl: '/decoder',
    })).rejects.toMatchObject({ errorCode: 'errors.assets.MANIFEST_INVALID' });
  });

  test('WASM/מפענחן חסרים ⇐ WASM_LOAD_FAILED', async () => {
    await expect(loadBrowserAssetBundle({
      fetchImpl: makeFetch(happyMap),
      wasmUrl: '/missing-wasm',
      woff2DecoderUrl: '/decoder',
    })).rejects.toMatchObject({ errorCode: 'errors.assets.WASM_LOAD_FAILED' });
  });

  test('גופן לא קיים במניפסט ⇐ FONT_NOT_FOUND עם ה־spec', async () => {
    await expect(loadBrowserAssetBundle({
      fetchImpl: makeFetch(happyMap),
      bodyFontSpec: 'Not-A-Font.woff2',
      wasmUrl: '/wasm',
      woff2DecoderUrl: '/decoder',
    })).rejects.toMatchObject({ errorCode: 'errors.assets.FONT_NOT_FOUND', params: { spec: 'Not-A-Font.woff2' } });
  });
});
