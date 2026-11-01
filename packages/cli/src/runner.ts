/**
 * runner.ts — תזמורת הריצה של ה־reference runner (שלב 34; אפיון §12.2, §17, §20).
 *
 * הזרימה: שומר רשת מרגע ההתחלה (§19) ← קלט (מסמך, הגדרות, גופנים) ← typeset
 * (חוזר repeat פעמים — כולן חייבות אותו layoutHash) ← כתיבת artifacts קנוניים.
 *
 * פלט קנוני: layout.json/manifest.json/ledger.json/request.json/report.json
 * (+ preview.html עם --html) — ללא חותמות זמן בתוכן (§15.1; זמני host ב-stderr
 * בלבד, לא בקובץ). המנוע אינו מכיר את ה־CLI; ה־CLI אינו מכיר React/Tauri.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { typeset, ENGINE_VERSION } from '@tora/layout-engine';
import {
  canonicalJson,
  DEFAULT_SEARCH_BUDGET,
  layoutHash as layoutHashOf,
  serializeLayoutDocument,
  sha256Bytes,
  type LayoutDocument,
  type TypesetRequest,
  type TypesetSuccess,
} from '@tora/layout-api';
import { renderHtml } from '@tora/render-html';
import { type CliArgs } from './args.js';
import { CliError } from './errors.js';
import { EXIT_ENGINE, EXIT_INPUT, EXIT_OUTPUT, EXIT_SUCCESS } from './exit-codes.js';
import { installNetworkDeny } from './offline-guard.js';
import {
  displayFamilyOf,
  loadEffectiveSettings,
  loadRegistry,
  parseDocumentFile,
  setupFonts,
} from './inputs.js';

/** גרסת הפרסר כפי שנרשמת ב-RunManifest — נעולה לגרסת חבילת content-model. */
export const PARSER_VERSION = 'content-model@0.1.0' as const;

export interface RunReport {
  readonly schemaVersion: 1;
  readonly layoutHash: string;
  readonly pages: number;
  readonly notesPages: number;
  readonly engineVersion: string;
  readonly parserVersion: string;
  readonly bodyFontFile: string;
  readonly repeats: number;
  readonly deterministic: boolean;
  readonly trace: string;
}

export interface RunOutcome {
  readonly exitCode: number;
  readonly report?: RunReport;
  readonly error?: { readonly code: string; readonly params: Readonly<Record<string, string | number | boolean | null>> };
  readonly artifactsDir?: string;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function sha256OfText(text: string): string {
  return sha256Bytes(new TextEncoder().encode(text));
}

/**
 * הרצה מלאה. זורק CliError בלבד (נתפס ב-main); מחזיר דוח לבדיקות.
 * progressLine — פלט אנושי ל-stderr (מוזרק לבדיקות; אינו חלק מהפלט הקנוני).
 */
export async function runCli(
  args: CliArgs,
  progressLine: (line: string) => void = () => {},
): Promise<RunOutcome> {
  const guard = installNetworkDeny();
  progressLine('offline guard installed (network denied from start)');

  // ── קלט ──
  const registry = await loadRegistry();
  const [sourceText, settings] = await Promise.all([
    readFile(args.input, 'utf8').catch((e: unknown) => {
      throw new CliError(EXIT_INPUT, 'errors.cli.INPUT_UNREADABLE', {
        path: args.input, reason: errText(e),
      }, `קריאה נכשלה: ${args.input}`);
    }),
    loadEffectiveSettings(registry, args.preset, args.settings),
  ]);
  const parsed = parseDocumentFile(sourceText, args.input);
  progressLine(`parsed: ${parsed.doc.parts.length} parts, ${parsed.transforms.length} transforms`);

  const fonts = await setupFonts(args.fontsManifest, args.fontsDir, args.bodyFont);
  progressLine(`fonts: ${fonts.bodyRecord.file}`);

  const sourceSha256 = sha256OfText(sourceText);

  // ── typeset (repeat ריצות — כולן חייבות אותו hash) ──
  const request: TypesetRequest = {
    document: { ...parsed.doc, transforms: parsed.transforms },
    settings,
    assets: fonts.assets,
    trace: args.trace,
    budget: DEFAULT_SEARCH_BUDGET,
    sourceSha256,
    parserVersion: PARSER_VERSION,
  };
  let first: TypesetSuccess | undefined;
  let hash: string | undefined;
  for (let run = 1; run <= args.repeat; run += 1) {
    let out: TypesetSuccess;
    try {
      out = typeset(request, fonts.provider, { policyId: 'torah-v1' });
    } catch (e) {
      const code = e instanceof Error && 'catalogKey' in e ? String((e as { catalogKey: unknown }).catalogKey) : 'unknown';
      throw new CliError(EXIT_ENGINE, 'errors.cli.ENGINE_FAILED', {
        code, reason: errText(e),
      }, `המנוע נכשל: ${code}`);
    }
    const runHash = out.manifest.layoutHash;
    if (hash !== undefined && runHash !== hash) {
      throw new CliError(EXIT_ENGINE, 'errors.cli.REPEAT_MISMATCH', {
        run, expected: hash, actual: runHash,
      }, `ריצה ${run} נתנה hash שונה`);
    }
    hash = runHash;
    if (first === undefined) first = out;
    progressLine(`typeset run ${run}/${args.repeat}: layoutHash=${runHash.slice(0, 16)}…`);
  }
  const result = first as TypesetSuccess;

  // אימות עצמאי: ה-IR המסודר משמר את ה-hash (§17.2#9)
  const serialized = serializeLayoutDocument(result.layout);
  const roundTripHash = layoutHashOf(JSON.parse(serialized) as unknown as LayoutDocument);
  if (roundTripHash !== hash) {
    throw new CliError(EXIT_ENGINE, 'errors.cli.REPEAT_MISMATCH', {
      run: 'serialize-round-trip', expected: hash as string, actual: roundTripHash,
    }, 'round-trip של הסריאליזציה שינה את ה-hash');
  }

  // ── פלט ──
  await mkdir(args.out, { recursive: true });
  const report: RunReport = {
    schemaVersion: 1,
    layoutHash: hash,
    pages: result.layout.pages.length,
    notesPages: result.layout.pages.filter((p) => p.kind === 'notes').length,
    engineVersion: ENGINE_VERSION,
    parserVersion: PARSER_VERSION,
    bodyFontFile: fonts.bodyRecord.file,
    repeats: args.repeat,
    deterministic: true,
    trace: args.trace,
  };
  const files: Array<[string, string]> = [
    ['layout.json', serialized],
    ['manifest.json', canonicalJson(result.manifest as unknown as Record<string, unknown>)],
    ['request.json', canonicalJson({
      schemaVersion: 1,
      source: sourceText,
      sourceSha256,
      parserVersion: PARSER_VERSION,
      settings: settings.values,
      configHash: settings.configHash,
      assets: {
        bodyFontFile: fonts.bodyRecord.file,
        bodyFontId: fonts.bodyRecord.fontId,
        fontsManifestSha256: fonts.manifestSha256,
        assetsManifestSha256: '0'.repeat(64),
      },
      trace: args.trace,
    })],
    ['report.json', canonicalJson(report as unknown as Record<string, unknown>)],
  ];
  if (result.ledger !== undefined) {
    files.push(['ledger.json', canonicalJson(result.ledger as unknown as Record<string, unknown>)]);
  }
  if (args.html) {
    const html = renderHtml(result.layout, { schemaVersion: 1 }, {
      schemaVersion: 1,
      fonts: [{
        fontId: fonts.bodyRecord.fontId,
        family: displayFamilyOf(fonts.bodyRecord),
        file: `fonts/${fonts.bodyRecord.file}`,
        format: fonts.bodyRecord.binaryFormat,
        contentSha256: fonts.bodyRecord.sha256,
      }],
    });
    files.push(['preview.html', html.html]);
  }
  for (const [name, content] of files) {
    await writeArtifact(join(args.out, name), content);
  }
  progressLine(`artifacts: ${files.length} files → ${args.out} (network attempts: ${guard.attempts()})`);
  return { exitCode: EXIT_SUCCESS, report, artifactsDir: args.out };
}

async function writeArtifact(path: string, content: string): Promise<void> {
  try {
    await writeFile(path, content, 'utf8');
  } catch (e) {
    throw new CliError(EXIT_OUTPUT, 'errors.cli.OUTPUT_WRITE_FAILED', {
      path, reason: errText(e),
    }, `כתיבה נכשלה: ${path}`);
  }
}
