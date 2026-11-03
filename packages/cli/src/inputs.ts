/**
 * inputs.ts — טעינה ואימות של כל קלטי הריצה (שלב 34).
 *
 * כל שגיאת קלט ממוקמת: קובץ + סיבה (שער השלב). המסמך נפרס עם documentId
 * קבוע 'cli-reference' — שם/נתיב הקובץ אינו נכנס לפריסה (§17.2#8), כי
 * ה־documentId מופיע בזהויות ה־SourceSpan שב־IR.
 */
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFontManifest,
  type FontManifestRecord,
  loadFontSet,
  type LoadedFont,
  type MeasurementProvider,
  sha256Bytes,
} from '@tora/measurement-api';
import { createHarfbuzzProvider } from '@tora/measurement-harfbuzz';
import {
  assetsIdentity,
  ornamentsManifestIssues,
  parseOrnamentsManifest,
  parseShaarManifest,
  type OrnamentsManifest,
  shaarManifestIssues,
  type ShaarManifest,
} from '@tora/content-model';
import { parseSourceText, type ParseResult } from '@tora/content-model';
import {
  buildEffectiveSettings,
  buildSettingRegistry,
  type EffectiveSettings,
  type SettingRegistry,
} from '@tora/settings-schema';
import { canonicalJson, type ResolvedAssetManifest } from '@tora/layout-api';
import { createRequire } from 'node:module';
import { CliError } from './errors.js';
import { EXIT_FONT, EXIT_INPUT } from './exit-codes.js';

/** documentId קבוע — שם הקובץ אינו משנה פריסה (§17.2#8). */
export const CLI_DOCUMENT_ID = 'cli-reference' as const;

const require = createRequire(import.meta.url);

async function readText(path: string, what: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (e) {
    throw new CliError(EXIT_INPUT, `errors.cli.${what}_UNREADABLE`, { path, reason: errReason(e) }, `קריאה נכשלה: ${path}`);
  }
}

function errReason(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** פרסור המקור — שגיאות הפרסר ממוקמות לקובץ הקלט. */
export function parseDocumentFile(source: string, inputPath: string): ParseResult {
  try {
    return parseSourceText(source, { documentId: CLI_DOCUMENT_ID });
  } catch (e) {
    throw new CliError(EXIT_INPUT, 'errors.cli.INPUT_INVALID', { path: inputPath, reason: errReason(e) }, `מסמך שגוי: ${inputPath}`);
  }
}

/** טעינת מרשם ההגדרות — מנתיב ברירת מחדל בתוך החבילה או מנתיב מפורש. */
export async function loadRegistry(explicitPath?: string): Promise<SettingRegistry> {
  const path = explicitPath ?? resolveRegistryPath();
  const text = await readText(path, 'REGISTRY');
  try {
    return buildSettingRegistry(JSON.parse(text));
  } catch (e) {
    throw new CliError(EXIT_INPUT, 'errors.cli.REGISTRY_UNREADABLE', { path, reason: errReason(e) }, `מרשם הגדרות שגוי: ${path}`);
  }
}

function resolveRegistryPath(): string {
  try {
    return require.resolve('@tora/settings-schema/registry.json');
  } catch {
    // נפילה לפריסת המונורפו (החבילות זו לצד זו) — מתועד; הריצה מה־repo root
    return resolve('packages', 'settings-schema', 'registry.json');
  }
}

/** נתיב ברירת מחדל של נכס חזותי — כמו resolveRegistryPath: קודם כמו שהוא
 * (יחסית ל־cwd), ואם אינו קיים — מה-repo root (עמיד להרצה מספריות אחרות). */
function resolveOrDefaultAssetPath(p: string): string {
  if (existsSync(p)) return p;
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', p);
}

/** שכבות הגדרות: [] בסיס ← [פריסט] ← [מסמך] — כל שכבה דרך צינור הייבוא (שלב 30). */
export async function loadEffectiveSettings(
  registry: SettingRegistry,
  presetPath: string | undefined,
  settingsPath: string | undefined,
): Promise<EffectiveSettings> {
  const layers: Readonly<Record<string, unknown>>[] = [];
  for (const [path, what] of [[presetPath, 'SETTINGS'], [settingsPath, 'SETTINGS']] as const) {
    if (path === undefined) continue;
    const text = await readText(path, what);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new CliError(EXIT_INPUT, 'errors.cli.SETTINGS_INVALID', { path, reason: `JSON: ${errReason(e)}` }, `JSON שגוי: ${path}`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new CliError(EXIT_INPUT, 'errors.cli.SETTINGS_INVALID', { path, reason: 'not-an-object' }, `שכבת הגדרות אינה אובייקט: ${path}`);
    }
    layers.push(parsed as Readonly<Record<string, unknown>>);
  }
  try {
    return buildEffectiveSettings(registry, layers);
  } catch (e) {
    const src = settingsPath ?? presetPath ?? '(defaults)';
    throw new CliError(EXIT_INPUT, 'errors.cli.SETTINGS_INVALID', { path: src, reason: errReason(e) }, `הגדרות שגויות: ${src}`);
  }
}

export interface FontsSetup {
  readonly manifest: readonly FontManifestRecord[];
  readonly manifestSha256: string;
  readonly bodyRecord: FontManifestRecord;
  readonly loaded: ReadonlyMap<string, LoadedFont>;
  readonly provider: MeasurementProvider;
  readonly assets: ResolvedAssetManifest;
}

/** טעינת מניפסט הגופנים + פתרון גוף הגוף + בניית הספק האמיתי (offline). */
export async function setupFonts(
  fontsManifestPath: string,
  fontsDir: string,
  bodyFontSpec: string,
): Promise<FontsSetup> {
  let manifestText: string;
  try {
    manifestText = await readFile(fontsManifestPath, 'utf8');
  } catch (e) {
    throw new CliError(EXIT_INPUT, 'errors.cli.FONTS_MANIFEST_UNREADABLE', { path: fontsManifestPath, reason: errReason(e) }, `מניפסט גופנים: ${fontsManifestPath}`);
  }
  const manifestSha256 = sha256HexOf(manifestText);
  let manifest: readonly FontManifestRecord[];
  try {
    manifest = assertFontManifest(JSON.parse(manifestText));
  } catch (e) {
    throw new CliError(EXIT_INPUT, 'errors.cli.FONTS_MANIFEST_INVALID', { path: fontsManifestPath, reason: errReason(e) }, `מניפסט גופנים שגוי: ${fontsManifestPath}`);
  }
  const bodyRecord = resolveBodyFont(manifest, bodyFontSpec);

  let loaded: ReadonlyMap<string, LoadedFont>;
  try {
    loaded = await loadFontSet(manifest, [bodyRecord.fontId], async (rec) => {
      try {
        const { readFile: rf } = await import('node:fs/promises');
        return new Uint8Array(await rf(join(fontsDir, rec.file)));
      } catch (e) {
        throw new CliError(EXIT_FONT, 'errors.cli.FONT_LOAD_FAILED', { file: rec.file, reason: errReason(e) }, `קובץ גופן: ${rec.file}`);
      }
    });
  } catch (e) {
    if (e instanceof CliError) throw e;
    throw new CliError(EXIT_FONT, 'errors.cli.FONT_LOAD_FAILED', { file: bodyRecord.file, reason: errReason(e) }, `טעינת גופן נכשלה: ${bodyRecord.file}`);
  }

  const provider = await buildProvider([...loaded.values()]);
  const rec = loaded.get(bodyRecord.fontId) as LoadedFont;
  const assets: ResolvedAssetManifest = {
    schemaVersion: 1,
    fonts: [
      { usage: 'body', font: rec.key },
      { usage: 'note-body', font: rec.key },
      { usage: 'heading', font: rec.key },
      { usage: 'note-marker', font: rec.key },
    ],
    fontsManifestSha256: manifestSha256,
    assetsManifestSha256: '0'.repeat(64),
  };
  return { manifest, manifestSha256, bodyRecord, loaded, provider, assets };
}

function resolveBodyFont(manifest: readonly FontManifestRecord[], spec: string): FontManifestRecord {
  const byId = manifest.find((r) => r.fontId === spec);
  if (byId !== undefined) return byId;
  const byFile = manifest.find((r) => r.file === spec);
  if (byFile !== undefined) return byFile;
  // חלופה אחרונה: שם משפחה בדיוק — עברית (family) או nameTable.family האנגלי
  // (nameTable קיים במניפסט v2 אך אינו חלק מהטיפוס הציבורי — קריאה מסוגרת)
  const byFamily = manifest.find((r) => r.family === spec
    || ((r as unknown as { nameTable?: { family?: string | null } }).nameTable?.family ?? null) === spec);
  if (byFamily !== undefined) return byFamily;
  throw new CliError(EXIT_FONT, 'errors.cli.FONT_NOT_FOUND', { spec }, `גופן לא נמצא במניפסט: ${spec}`);
}

/** שם משפחה לתצוגה — nameTable האנגלי אם קיים, אחרת העברי/שם הקובץ. */
export function displayFamilyOf(rec: FontManifestRecord): string {
  const nt = (rec as unknown as { nameTable?: { family?: string | null } }).nameTable;
  return nt?.family ?? rec.family ?? rec.file;
}

/** בניית ספק HarfBuzz/WASM האמיתי — אותו נעילות של שלב 24/29 (הזרקה מלאה). */
async function buildProvider(fonts: readonly LoadedFont[]): Promise<MeasurementProvider> {
  try {
    const hbMod = (await import('harfbuzzjs')) as unknown as { default?: unknown };
    const hb = (hbMod.default ?? hbMod) as never;
    const wawoff2Mod = (await import('wawoff2')) as unknown as { default?: unknown; decompress: (b: Uint8Array) => Promise<Uint8Array> };
    const wawoff2 = (wawoff2Mod.default ?? wawoff2Mod) as { decompress: (b: Uint8Array) => Promise<Uint8Array> };
    const wasmBytes = new Uint8Array(await readFile(require.resolve('harfbuzzjs/dist/harfbuzz.wasm')));
    const woff2DecoderBytes = new Uint8Array(await readFile(require.resolve('wawoff2/build/decompress_binding.js')));
    return await createHarfbuzzProvider({
      hb,
      wasmBytes,
      woff2DecoderBytes,
      decompressWoff2: (bytes: Uint8Array) => wawoff2.decompress(bytes),
      fonts,
    });
  } catch (e) {
    if (e instanceof CliError) throw e;
    throw new CliError(EXIT_FONT, 'errors.cli.PROVIDER_FAILED', { reason: errReason(e) }, `בניית ספק המדידה נכשלה: ${errReason(e)}`);
  }
}

function sha256HexOf(text: string): string {
  return sha256Bytes(new TextEncoder().encode(text));
}

/** נכסים חזותיים טעונים ומאומתים (שלב 68) — המניפסטים v2 + זהותם הנעולה. */
export interface VisualAssets {
  readonly shaarManifest: ShaarManifest;
  readonly ornamentsManifest: OrnamentsManifest;
  /** sha256(canonicalJson(assetsIdentity(·))) — נכנס ל-ResolvedAssetManifest ול-request.json. */
  readonly assetsManifestSha256: string;
}

async function readAssetsJson(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (e) {
    throw new CliError(EXIT_INPUT, 'errors.cli.ASSETS_MANIFEST_INVALID', { path, reason: errReason(e) }, `קריאה נכשלה: ${path}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    throw new CliError(EXIT_INPUT, 'errors.cli.ASSETS_MANIFEST_INVALID', { path, reason: `JSON: ${errReason(e)}` }, `JSON שגוי: ${path}`);
  }
}

/**
 * טעינת ואימות מניפסטי הנכסים החזותיים v2 (שלב 68): פרסור מבני + בעיות
 * סמנטיות חייבות להיות ריקות; הזהות נגזרת דרך המודל (מקור אמת אחד).
 * כל כשל ⇒ errors.cli.ASSETS_MANIFEST_INVALID (exit 3) עם נתיב וסיבה.
 */
export async function loadVisualAssets(
  shaarManifestPath: string,
  ornamentsManifestPath: string,
): Promise<VisualAssets> {
  const shaarPath = resolveOrDefaultAssetPath(shaarManifestPath);
  const ornamentsPath = resolveOrDefaultAssetPath(ornamentsManifestPath);
  const shaarRaw = await readAssetsJson(shaarPath);
  const ornamentsRaw = await readAssetsJson(ornamentsPath);
  let shaar: ShaarManifest;
  let ornaments: OrnamentsManifest;
  try {
    shaar = parseShaarManifest(shaarRaw);
    const issues = shaarManifestIssues(shaar);
    if (issues.length > 0) throw new Error(issues.join('; '));
  } catch (e) {
    throw new CliError(EXIT_INPUT, 'errors.cli.ASSETS_MANIFEST_INVALID', {
      path: shaarPath, reason: errReason(e),
    }, `מניפסט שערים שגוי: ${shaarPath}`);
  }
  try {
    ornaments = parseOrnamentsManifest(ornamentsRaw);
    const issues = ornamentsManifestIssues(ornaments);
    if (issues.length > 0) throw new Error(issues.join('; '));
  } catch (e) {
    throw new CliError(EXIT_INPUT, 'errors.cli.ASSETS_MANIFEST_INVALID', {
      path: ornamentsPath, reason: errReason(e),
    }, `מניפסט עיטורים שגוי: ${ornamentsPath}`);
  }
  const assetsManifestSha256 = sha256HexOf(canonicalJson(
    assetsIdentity(shaar, ornaments) as unknown as Record<string, unknown>,
  ));
  return { shaarManifest: shaar, ornamentsManifest: ornaments, assetsManifestSha256 };
}
