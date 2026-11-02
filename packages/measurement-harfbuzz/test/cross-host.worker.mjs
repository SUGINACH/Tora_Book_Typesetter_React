/**
 * cross-host.worker.mjs — שלב 29: זהות מדידה בין hosts ואכיפת offline.
 *
 * תפקיד כפול:
 *  (א) ב־worker_threads (parentPort קיים) — host שני עצמאי: טעינה מלאה
 *      (manifest → loadFontSet → פריקת WOFF2 → ספק) + shaping של הקורפוס
 *      הייצגי, עם שומר הרשת (network deny) מותקן מרגע ההתחלה.
 *  (ב) כמודול (import) — הגדרת הקורפוס הייצגי ורץ הקורפוס על ספק נתון;
 *      משותף לבדיקות (cross-host.test.ts) ולמאמת (verify-cross-host.mjs).
 *
 * אסמכתא: אפיון §17.1 (Cross-host: Node + Worker; Offline: network deny),
 * §19 ("cross-host Worker tests + offline tests"; "reference runs חוסמים כל
 * בקשת רשת חיצונית"), §18-M3 · תכנית שלב 29.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { isMainThread, parentPort, workerData } from 'node:worker_threads';

const require = createRequire(import.meta.url);

// ─────────────────────────── שומר הרשת (network deny) ───────────────────────────
// מותקן בשני ה-hosts מרגע ההתחלה. ספירת ניסיונות גישה; כל ניסיון זורק.
// הרצה ירוקה של טעינה+מדידה עם השומר = הוכחה שאין אף גישת רשת במסלול.
export function installNetworkDeny() {
  const stats = { attempts: 0 };
  const deny = (label) => {
    stats.attempts += 1;
    throw new Error(`network-denied-by-guard: ${label}`);
  };
  globalThis.fetch = function networkDeniedFetch() { deny('fetch'); };
  try {
    const http = require('node:http');
    const https = require('node:https');
    for (const mod of [http, https]) {
      const origRequest = mod.request;
      const origGet = mod.get;
      mod.request = function networkDeniedRequest(...a) { deny(`${mod === http ? 'http' : 'https'}.request`); return origRequest.apply(this, a); };
      mod.get = function networkDeniedGet(...a) { deny(`${mod === http ? 'http' : 'https'}.get`); return origGet.apply(this, a); };
    }
  } catch { /* node built-ins תמיד קיימים */ }
  return stats;
}

// ─────────────────────────── הקורפוס הייצגי ───────────────────────────
// כיסוי ממדי השפעה (§6.4): גופן (4 משפחות), גודל (8/10/12/18/24pt),
// כיוון (rtl/ltr — גם הפוך מהתוכן), שפה (he/en), features (kern/liga),
// ריווח אותיות (0/420), ניקוד וטעמים, מספרים, סוגריים, מעורב, טקסט ארוך.
const F = (tags) => Object.fromEntries(tags.map((t) => [t, true]));

export const CORPUS = Object.freeze([
  { key: 'he-simple', text: 'שלום', fontFile: 'Guttman-Rashi-Normal.woff2', fontSizePt: 12, direction: 'rtl', language: 'he', features: {}, letterSpacingLu: 0 },
  { key: 'he-nikkud-taam', text: 'וַיְדַבֵּר יְהוָה אֶל מֹשֶׁה לֵּאמֹר', fontFile: 'selfhost/frank-ruhl-libre-hebrew-400.woff2', fontSizePt: 10, direction: 'rtl', language: 'he', features: F(['kern']), letterSpacingLu: 0 },
  { key: 'latin-simple', text: 'Hello world 123', fontFile: 'selfhost/assistant-latin-400.woff2', fontSizePt: 12, direction: 'ltr', language: 'en', features: {}, letterSpacingLu: 0 },
  { key: 'he-refs-numbers', text: 'בְּרֵאשִׁית (פרק א) 1:1 — וַיְהִי כֵן', fontFile: 'Guttman-Rashi-Normal.woff2', fontSizePt: 10, direction: 'rtl', language: 'he', features: {}, letterSpacingLu: 0 },
  { key: 'mixed-he-num', text: 'שלום עולם 123 תורה 456', fontFile: 'Guttman-Rashi-Normal.woff2', fontSizePt: 12, direction: 'rtl', language: 'he', features: {}, letterSpacingLu: 0 },
  { key: 'he-david-upem2048', text: 'אבגדהוזחטיכלמנסעפצקרשת', fontFile: 'selfhost/david-libre-hebrew-400.woff2', fontSizePt: 24, direction: 'rtl', language: 'he', features: {}, letterSpacingLu: 0 },
  { key: 'he-letterspacing', text: 'אַלְמָן וְיִשָּׁשְׂכֵם', fontFile: 'Guttman-Rashi-Normal.woff2', fontSizePt: 18, direction: 'rtl', language: 'he', features: {}, letterSpacingLu: 420 },
  { key: 'latin-features', text: 'fi ff ffl office', fontFile: 'selfhost/assistant-latin-400.woff2', fontSizePt: 12, direction: 'ltr', language: 'en', features: F(['kern', 'liga']), letterSpacingLu: 0 },
  { key: 'he-ltr-direction', text: 'אבגד', fontFile: 'selfhost/frank-ruhl-libre-hebrew-400.woff2', fontSizePt: 12, direction: 'ltr', language: 'he', features: {}, letterSpacingLu: 0 },
  { key: 'latin-rtl-direction', text: 'abcd', fontFile: 'selfhost/assistant-latin-400.woff2', fontSizePt: 12, direction: 'rtl', language: 'en', features: {}, letterSpacingLu: 0 },
  { key: 'he-large-24pt', text: 'תורה תורים ותרין', fontFile: 'selfhost/david-libre-hebrew-400.woff2', fontSizePt: 24, direction: 'rtl', language: 'he', features: F(['kern']), letterSpacingLu: 0 },
  { key: 'he-8pt-small', text: 'קטן מאוד', fontFile: 'Guttman-Rashi-Normal.woff2', fontSizePt: 8, direction: 'rtl', language: 'he', features: {}, letterSpacingLu: 0 },
  { key: 'long-paragraph', text: 'וַיְדַבֵּר יְהוָה אֶל מֹשֶׁה לֵּאמֹר דַּבֵּר אֶל בְּנֵי יִשְׂרָאֵל וְאָמַרְתָּ אֲלֵהֶם וְעָשׂוּ לָהֶם צִיצִית עַל כַּנְפֵי בִגְדֵיהֶם לְדֹרֹתָם וְנָתְנוּ עַל צִיצִית הַכָּנָף פְּתִיל תְּכֵלֶת', fontFile: 'selfhost/frank-ruhl-libre-hebrew-400.woff2', fontSizePt: 10, direction: 'rtl', language: 'he', features: F(['kern']), letterSpacingLu: 0 },
  { key: 'latin-mixed-brackets', text: 'value (45) [12] {7} end', fontFile: 'selfhost/assistant-latin-400.woff2', fontSizePt: 12, direction: 'ltr', language: 'en', features: F(['kern']), letterSpacingLu: 0 },
]);

export const CORPUS_FONT_FILES = Object.freeze([...new Set(CORPUS.map((c) => c.fontFile))]);

// ─────────────────────────── טעינת ספק מלאה (משותף לשני ה-hosts) ───────────────────────────
/** manifest → loadFontSet (hash+חתימה) → פריקת WOFF2 → createHarfbuzzProvider. */
export async function buildProviderFromPaths(repoRoot) {
  const api = await import('@tora/measurement-api');
  const hbMod = await import('harfbuzzjs');
  const wawoff2Mod = await import('wawoff2');
  const wawoff2 = wawoff2Mod.default ?? wawoff2Mod;
  const { createHarfbuzzProvider } = await import('@tora/measurement-harfbuzz');
  const manifest = api.assertFontManifest(
    JSON.parse(readFileSync(join(repoRoot, 'assets', 'fonts', 'manifest.json'), 'utf8')));
  const fonts = await api.loadFontSet(manifest, CORPUS_FONT_FILES.map((f) => manifest.find((r) => r.file === f).fontId), async (rec) =>
    new Uint8Array(readFileSync(join(repoRoot, 'assets', 'fonts', rec.file))));
  const wasmBytes = new Uint8Array(readFileSync(require.resolve('harfbuzzjs/dist/harfbuzz.wasm')));
  const woff2DecoderBytes = new Uint8Array(readFileSync(require.resolve('wawoff2/build/decompress_binding.js')));
  const provider = await createHarfbuzzProvider({
    hb: hbMod.default ?? hbMod,
    wasmBytes,
    woff2DecoderBytes,
    decompressWoff2: (bytes) => wawoff2.decompress(bytes),
    fonts: [...fonts.values()],
  });
  return { provider, manifest };
}

// ─────────────────────────── רץ הקורפוס על ספק ───────────────────────────
/** וקטור מלא לכל כניסה: requestHash + גליפים (מזהה/קלסטר/קידום/היסטים) + חסרים. */
export async function runCorpusOnProvider(provider, manifest) {
  const api = await import('@tora/measurement-api');
  const out = [];
  for (const entry of CORPUS) {
    const rec = manifest.find((r) => r.file === entry.fontFile);
    const atoms = [...entry.text].map((ch, i) => ({
      id: `atom:v1|doc|body|${i}+${i + ch.length}||0`,
      text: ch,
      script: /[א-ת]/.test(ch) ? 'hebrew' : /[0-9]/.test(ch) ? 'number' : 'latin',
      bidiLevel: entry.direction === 'rtl' ? 1 : 0,
      breakBefore: i === 0 ? 'forbidden' : 'allowed',
    }));
    const shaped = provider.shape({
      atoms,
      font: {
        fontId: rec.fontId,
        contentSha256: rec.sha256,
        family: rec.family ?? rec.file,
        weight: rec.weight ?? 400,
        style: rec.style,
      },
      fontSizeLu: api.ptToLu(entry.fontSizePt),
      direction: entry.direction,
      language: entry.language,
      features: entry.features,
      letterSpacingLu: entry.letterSpacingLu,
    });
    out.push({
      key: entry.key,
      requestHash: shaped.requestHash,
      widthLu: shaped.widthLu,
      glyphs: shaped.glyphs.map((g) => ({
        glyphId: g.glyphId, clusterAtomIndex: g.clusterAtomIndex,
        advanceLu: g.advanceLu, xOffsetLu: g.xOffsetLu, yOffsetLu: g.yOffsetLu,
      })),
      missingGlyphAtomIds: shaped.missingGlyphAtomIds,
    });
  }
  return out;
}

export const summaryOf = (results) => ({
  entries: results.length,
  totalGlyphs: results.reduce((n, r) => n + r.glyphs.length, 0),
  sha: results.map((r) => `${r.key}:${r.requestHash.slice(0, 16)}`).join('|'),
});

// ─────────────────────────── מצב worker ───────────────────────────
if (!isMainThread && parentPort !== null) {
  const { repoRoot } = workerData;
  const denyStats = installNetworkDeny();
  try {
    const { provider, manifest } = await buildProviderFromPaths(repoRoot);
    const results = await runCorpusOnProvider(provider, manifest);
    parentPort.postMessage({
      ok: true,
      environmentHash: provider.environmentHash,
      providerVersion: provider.providerVersion,
      results,
      denyAttempts: denyStats.attempts,
    });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: String(err?.stack ?? err), denyAttempts: denyStats.attempts });
  }
}
