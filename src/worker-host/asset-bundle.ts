/**
 * asset-bundle.ts — צרור הנכסים שה־UI מעביר ל־Worker (שלב 77; אפיון §12.1, §6.4).
 *
 * הפרוטוקול מעביר הכול מקומית — אין CDN/רשת בתוך ה־Worker (§19): מניפסט
 * הגופנים, הגופן שנצרך (bytes + אימות hash בצד הקורא **ושוב בצד העובד**
 * ב־worker-entry), ה־WASM של HarfBuzz והמפענחן של WOFF2. מקור האמת
 * לזהות הגופן הוא אותו מניפסט של ה־CLI (assets/fonts/manifest.json —
 * מועתק ביט־ביט ל־public/fonts) — כך אותו קלט מניב את אותו layoutHash
 * בשני ה־hosts (§17.2#2).
 *
 * הפונקציה טהורה יחסית לערוץ: ה־fetch מוזרק (בדיקות מזריקות מפה מקומית;
 * הדפדפן — fetch אמיתי). כל שלב נכשל בקול רם עם מפתח קטלוגי — אין
 * המשך שקט עם נכס חסר.
 */
import {
  assertFontManifest,
  sha256Bytes,
  verifyFontBytes,
  type FontFaceKey,
  type FontManifestRecord,
} from '@tora/measurement-api';
import type { ResolvedAssetManifest } from '@tora/layout-api';
import type { FontBytesEntry } from './protocol.js';
// נכסי הבנדל — vite מפיק אותם ל־dist בזמן בנייה (?url); הצהרת הטיפוסים
// ב־assets-vendor.d.ts. בבדיקות מוזרקים כתובות/ממשקי fetch חלופיים.
import harfbuzzWasmUrl from 'harfbuzzjs/dist/harfbuzz.wasm?url';
import woff2DecoderAssetUrl from 'wawoff2/build/decompress_binding.js?url';

export const DEFAULT_BODY_FONT_SPEC = 'Guttman-Rashi-Normal.woff2' as const;

/** מה שנדרש לבניית PreparePayload שלם. */
export interface BrowserAssetBundle {
  readonly assets: ResolvedAssetManifest;
  readonly fonts: readonly FontBytesEntry[];
  readonly wasmBytes: Uint8Array;
  readonly woff2DecoderBytes: Uint8Array;
}

export interface LoadAssetBundleOptions {
  /** ערוץ קריאה — מוזרק בבדיקות; ברירת מחדל fetch הגלובלי. */
  readonly fetchImpl?: (url: string) => Promise<Response>;
  /** בסיס הנכסים — ברירת מחדל '.', יחסי למסמך (שורש האפליקציה; public/).
   *  יחסי ולא מוחלט: הפריסה החיה מוגשת מתת־נתיב (GitHub Pages), ונתיב
   *  שורש מוחלט מפנה לשורש הדומיין ⇒ 404 (כישלון ההעמדה באתר החי). */
  readonly baseUrl?: string;
  /** גופן הגוף — fontId או שם קובץ (ברירת מחדל: כמו ה־CLI). */
  readonly bodyFontSpec?: string;
  /** מיקומי ה־WASM והמפענחן — ברירת מחדל: נכסי vite (?url). */
  readonly wasmUrl?: string;
  readonly woff2DecoderUrl?: string;
}

export class AssetBundleError extends Error {
  constructor(readonly errorCode: string, readonly params: Readonly<Record<string, string>>) {
    super(`${errorCode} ${JSON.stringify(params)}`);
    this.name = 'AssetBundleError';
  }
}

/** פענוח המניפסט + sha256 של הטקסט כמות שהוא (זהות ה־CLI). */
const loadManifest = (text: string): { manifest: readonly FontManifestRecord[]; sha256: string } => {
  let manifest: readonly FontManifestRecord[];
  try {
    manifest = assertFontManifest(JSON.parse(text));
  } catch (e) {
    throw new AssetBundleError('errors.assets.MANIFEST_INVALID', { reason: e instanceof Error ? e.message : String(e) });
  }
  return { manifest, sha256: sha256Bytes(new TextEncoder().encode(text)) };
};

/** פתרון גוף הגוף — אותו סדר עדיפויות כמו ה־CLI (fontId → קובץ → משפחה). */
export function resolveBodyFontRecord(
  manifest: readonly FontManifestRecord[],
  spec: string,
): FontManifestRecord {
  const byId = manifest.find((r) => r.fontId === spec);
  if (byId !== undefined) return byId;
  const byFile = manifest.find((r) => r.file === spec);
  if (byFile !== undefined) return byFile;
  const byFamily = manifest.find((r) => r.family === spec
    || ((r as unknown as { nameTable?: { family?: string | null } }).nameTable?.family ?? null) === spec);
  if (byFamily !== undefined) return byFamily;
  throw new AssetBundleError('errors.assets.FONT_NOT_FOUND', { spec });
}

async function fetchBytes(
  fetchImpl: NonNullable<LoadAssetBundleOptions['fetchImpl']>,
  url: string,
  errorCode: string,
): Promise<Uint8Array> {
  let res: Response;
  try {
    res = await fetchImpl(url);
  } catch (e) {
    throw new AssetBundleError(errorCode, { url, reason: e instanceof Error ? e.name : 'network' });
  }
  if (!res.ok) {
    throw new AssetBundleError(errorCode, { url, status: String(res.status) });
  }
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * טעינת צרור הנכסים המלא למטען prepare: מניפסט (וזהותו), גופן הגוף
 * (bytes שאומתו מול הרשומה), WASM ומפענחן. offline — הכול מהמקור של האפליקציה.
 */
export async function loadBrowserAssetBundle(options: LoadAssetBundleOptions = {}): Promise<BrowserAssetBundle> {
  const fetchImpl = options.fetchImpl ?? ((url: string) => fetch(url));
  const base = options.baseUrl ?? '.';
  const spec = options.bodyFontSpec ?? DEFAULT_BODY_FONT_SPEC;

  // 1) מניפסט הגופנים — טקסט כמות שהוא (ה־sha נכנס ל־ResolvedAssetManifest
  //    ול־inputHash; חייב להיות זהה ל־CLI ביט־ביט).
  let manifestText: string;
  try {
    const res = await fetchImpl(`${base}/fonts/manifest.json`);
    if (!res.ok) throw new AssetBundleError('errors.assets.MANIFEST_UNREADABLE', { status: String(res.status) });
    manifestText = await res.text();
  } catch (e) {
    if (e instanceof AssetBundleError) throw e;
    throw new AssetBundleError('errors.assets.MANIFEST_UNREADABLE', { reason: e instanceof Error ? e.name : 'network' });
  }
  const { manifest, sha256: fontsManifestSha256 } = loadManifest(manifestText);

  // 2) גוף הגוף + אימות hash — אותם bytes או כלום (שיעור שלב 25).
  const record = resolveBodyFontRecord(manifest, spec);
  const fontBytes = await fetchBytes(fetchImpl, `${base}/fonts/${record.file}`, 'errors.assets.FONT_LOAD_FAILED');
  let key: FontFaceKey;
  try {
    key = verifyFontBytes(record, fontBytes);
  } catch (e) {
    throw new AssetBundleError('errors.assets.FONT_HASH_MISMATCH', { file: record.file, reason: e instanceof Error ? e.message : 'hash' });
  }

  // 3) WASM + מפענחן WOFF2 — מוזרקים לספק בתוך העובד (ADR-003).
  const wasmUrl = options.wasmUrl ?? defaultWasmUrl();
  const woff2DecoderUrl = options.woff2DecoderUrl ?? defaultWoff2DecoderUrl();
  const [wasmBytes, woff2DecoderBytes] = await Promise.all([
    fetchBytes(fetchImpl, wasmUrl, 'errors.assets.WASM_LOAD_FAILED'),
    fetchBytes(fetchImpl, woff2DecoderUrl, 'errors.assets.WASM_LOAD_FAILED'),
  ]);

  // 4) מפת השימושים — כמו ה־CLI: אותו גופן לארבעת השימושים (v0).
  const assets: ResolvedAssetManifest = {
    schemaVersion: 1,
    fonts: [
      { usage: 'body', font: key },
      { usage: 'note-body', font: key },
      { usage: 'heading', font: key },
      { usage: 'note-marker', font: key },
    ],
    fontsManifestSha256,
    assetsManifestSha256: '0'.repeat(64),
  };
  return {
    assets,
    fonts: [{ record, bytes: fontBytes }],
    wasmBytes,
    woff2DecoderBytes,
  };
}

function defaultWasmUrl(): string { return harfbuzzWasmUrl; }
function defaultWoff2DecoderUrl(): string { return woff2DecoderAssetUrl; }
