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
import { composeDocumentRelease } from '@tora/layout-engine';
import * as policy from '@tora/policy-torah';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { typeset, ENGINE_VERSION } from '@tora/layout-engine';
import {
  canonicalJson,
  DEFAULT_SEARCH_BUDGET,
  layoutHash as layoutHashOf,
  parseLayoutDocument,
  serializeLayoutDocument,
  sha256Bytes,
  type LayoutDocument,
  type TypesetRequest,
  type TypesetSuccess,
} from '@tora/layout-api';
import { renderHtml } from '@tora/render-html';
import { auditLayout, type LayoutAuditReport } from '@tora/audit-core';
import { type CliArgs } from './args.js';
import { CliError } from './errors.js';
import { EXIT_AUDIT, EXIT_ENGINE, EXIT_INPUT, EXIT_OUTPUT, EXIT_SUCCESS, EXIT_USAGE } from './exit-codes.js';
import { installNetworkDeny } from './offline-guard.js';
import {
  displayFamilyOf,
  loadEffectiveSettings,
  loadRegistry,
  loadVisualAssets,
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
  /** המנוע שהריץ (שלב 40) — תמיד 'next' בריצות אמת; נרשם גם ב-RunManifest. */
  readonly engine: 'legacy' | 'next';
  /** סיכום הביקורת (שלב 38): ok ⟺ אפס HIGH. */
  readonly audit: { readonly ok: boolean; readonly high: number; readonly medium: number; readonly low: number };
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

  // שלב 40 (§18-M4): דגל מנוע מפורש — אין fallback אוטומטי ואין מסלול צד.
  // legacy = הרץ הנעול של הבייסליין (docs/migration/baseline) — ריצות חיות
  // שלו דרך צריך ה-differential (שלב 48+); בקשה כזו נדחית בקול רם ובקטלוג.
  if (args.engine === 'legacy') {
    throw new CliError(EXIT_USAGE, 'errors.cli.ENGINE_LEGACY_LOCKED', {
      baseline: 'docs/migration/baseline',
    }, 'הרץ ה-legacy נעול לבייסליין הקפוא — ריצות differential מגיעות בשלב 48; אין מסלול צד ואין fallback שקט ל-next');
  }

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

  // נכסים חזותיים v2 (שלב 68) — שני המניפסטים מאומתים דרך המודל, והזהות
  // הנעולה נכנסת ל-ResolvedAssetManifest ול-request.json (משפיעה על inputHash
  // בלבד; layoutHash אינו תלוי בה — §6.7).
  const visual = await loadVisualAssets(args.shaarManifest, args.ornamentsManifest);
  progressLine(`visual assets: shaar=${visual.shaarManifest.designs.length}, ornaments=${visual.ornamentsManifest.designs.length}, identity=${visual.assetsManifestSha256.slice(0, 16)}…`);

  const sourceSha256 = sha256OfText(sourceText);

  // ── typeset (repeat ריצות — כולן חייבות אותו hash) ──
  const request: TypesetRequest = {
    document: { ...parsed.doc, transforms: parsed.transforms },
    settings,
    assets: { ...fonts.assets, assetsManifestSha256: visual.assetsManifestSha256 },
    trace: args.trace,
    budget: DEFAULT_SEARCH_BUDGET,
    sourceSha256,
    parserVersion: PARSER_VERSION,
  };
  // הרכבת release (שלב 74; M8): שער ראשי/אחורי + עמודי TOC מיוצבים בנקודת
  // השבת החוץ, מעל אותה בקשת v0. ה-policy מוזרק כפונקציות טהורות (גבולות
  // תלות): הערכים מהעוגנים בפועל — אין pageEstimate בעמודי ה-TOC.
  const composeTocSource = {
    entriesOf: (doc: Parameters<typeof policy.tocEntriesOf>[0], anchors: Parameters<typeof policy.tocEntriesOf>[2]) => policy.tocEntriesOf(doc, policy.tocPolicyOf(settings), anchors, policy.folioPolicyOf(settings)),
    folioLabelOf: (physicalPage: number, pageKind: string) => policy.folioLabelOf(physicalPage, pageKind, policy.folioPolicyOf(settings)),
  };
  let first: TypesetSuccess | undefined;
  let hash: string | undefined;
  for (let run = 1; run <= args.repeat; run += 1) {
    let out: TypesetSuccess;
    try {
      out = args.compose
        ? composeDocumentRelease(request, fonts.provider, { toc: composeTocSource })
        : typeset(request, fonts.provider, { policyId: 'torah-v1' });
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
  // args.ts מאמת repeat ≥ 1 — הלולאה תמיד רצה לפחות פעם אחת (cast הגנתי).
  // סדר הפעולות מכאן הוא מסלול חסכוני-זיכרון (שלב 73): במסמכים בני
  // מאות עמודים החזקת שלושה עותקי IR בו-זמנית (מקור + מחרוזת סריאליזציה
  // + עותק מנותח) ועוד גיבוב קנוני של המחרוזת כולה קרסו ב-OOM. לכן:
  //   1) סריאליזציה (המקור חי) ← 2) שחרור המקור ← 3) כתיבת layout.json
  //   מוקדמת ← 4) פריסה לעותק ← 5) בדיקת §17.2#9 וההמשך (ביקורת/היטל)
  //   על העותק בלבד — שיא הזיכרון של כל שלב בנפרד נמוך משמעותית.
  const manifest = (first as TypesetSuccess).manifest;
  const ledger = (first as TypesetSuccess).ledger;
  let layoutRef: LayoutDocument | null = (first as TypesetSuccess).layout;
  first = undefined; // שחרור ה-TypesetSuccess — ה-IR חי רק דרך layoutRef

  await mkdir(args.out, { recursive: true });
  // כתיבה מוקדמת של layout.json — המחרוזת הגדולה נפטרת לפני הגיבוב.
  // במסלול כשל (חוסר התאמה) יישאר הקובץ; יציאת השגיאה מסמנת שהריצה
  // לא אומתה — artifacts של ריצה כושלת הם אבחוניים בלבד (§17).
  let serialized: string | null = serializeLayoutDocument(layoutRef as LayoutDocument);
  await writeArtifact(join(args.out, 'layout.json'), serialized);
  const serializedForParse: string = serialized;
  serialized = null; // המחרוזת הגדולה משוחררת מיד לאחר הכתיבה

  // אימות עצמאי: ה-IR המסודר משמר את ה-hash (§17.2#9) — על העותק
  // המנותח; לאחר הפריסה משוחררים גם את המקור וגם את המחרוזת
  // (איפוס הפניות — הזכוך התוכניתי היה מחזיק אותן עד סוף הפונקציה).
  const roundTripLayout = JSON.parse(serializedForParse) as unknown as LayoutDocument;
  layoutRef = null; // ה-IR המקורי ניתן לאיסוץ
  const roundTripHash = layoutHashOf(roundTripLayout);
  if (roundTripHash !== hash) {
    throw new CliError(EXIT_ENGINE, 'errors.cli.REPEAT_MISMATCH', {
      run: 'serialize-round-trip', expected: hash as string, actual: roundTripHash,
    }, 'round-trip של הסריאליזציה שינה את ה-hash');
  }

  // ── ביקורת עצמאית (§12: בקריאה נפרשת; §14) — על התוצאה כמות שהיא ──
  const audit = auditLayout({ content: request.document, settings, layout: roundTripLayout });
  progressLine(`audit: ${audit.findingCount} findings (HIGH=${audit.counts.HIGH}, MEDIUM=${audit.counts.MEDIUM}, LOW=${audit.counts.LOW})`);

  const report: RunReport = {
    schemaVersion: 1,
    layoutHash: hash,
    pages: roundTripLayout.pages.length,
    notesPages: roundTripLayout.pages.filter((p) => p.kind === 'notes').length,
    engineVersion: ENGINE_VERSION,
    parserVersion: PARSER_VERSION,
    bodyFontFile: fonts.bodyRecord.file,
    repeats: args.repeat,
    deterministic: true,
    trace: args.trace,
    engine: manifest.engine,
    audit: { ok: audit.ok, high: audit.counts.HIGH, medium: audit.counts.MEDIUM, low: audit.counts.LOW },
  };
  // layout.json נכתב כבר בשלב מוקדם (לפני הגיבוב) — המחרוזת הגדולה
  // אינה נשמרת עד כאן; שאר ה-artifacts קטנים.
  const files: Array<[string, string]> = [
    ['manifest.json', canonicalJson(manifest as unknown as Record<string, unknown>)],
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
        assetsManifestSha256: visual.assetsManifestSha256,
      },
      trace: args.trace,
    })],
    ['report.json', canonicalJson(report as unknown as Record<string, unknown>)],
    ['audit.json', canonicalJson(audit as unknown as Record<string, unknown>)],
  ];
  if (ledger !== undefined) {
    files.push(['ledger.json', canonicalJson(ledger as unknown as Record<string, unknown>)]);
  }
  if (args.html) {
    // המקור נחוץ לשחזור הטקסט הלוגי של הריצות (תיקון שורש 2026-11-09/ב'):
    // מזהי האטומים מקודדים טווחי מקור — בלעדיו כל מילה מוצגת מראה.
    // שלב 87 — פלט self-contained: הגופן נטמע כ-data URI מלא מתוך
    // אותם bytes שאומתו (fonts.loaded — אותם bytes שהוזרקו למדידה);
    // הקובץ עומד לבדו offline בלי ספריית fonts/ לצדו ובלי רשת (§15.2, §21).
    const woff = fonts.loaded.get(fonts.bodyRecord.fontId);
    const dataUri = woff === undefined
      ? undefined
      : `data:font/${fonts.bodyRecord.binaryFormat};base64,${Buffer.from(woff.bytes).toString('base64')}`;
    const html = renderHtml(roundTripLayout, { schemaVersion: 1 }, {
      schemaVersion: 1,
      fonts: [{
        fontId: fonts.bodyRecord.fontId,
        family: displayFamilyOf(fonts.bodyRecord),
        file: fonts.bodyRecord.file,
        format: fonts.bodyRecord.binaryFormat,
        contentSha256: fonts.bodyRecord.sha256,
        dataUri,
      }],
    }, undefined, { source: sourceText });
    files.push(['preview.html', html.html]);
  }
  for (const [name, content] of files) {
    await writeArtifact(join(args.out, name), content);
  }
  // שלב 87: אין עוד העתקת גופן לפלט — הגופן מוטמע בתוך preview.html
  // כ-data URI מאותם bytes שאומתו ב-sha256 (ההעתקה מ-2026-11-09 לצד
  // הקובץ הייתה לפני ההטמעה; הקובץ עומד לבדו offline — §15.2, §21).
  progressLine(`artifacts: ${files.length} files → ${args.out} (network attempts: ${guard.attempts()})`);
  const exitCode = audit.ok ? EXIT_SUCCESS : EXIT_AUDIT;
  return { exitCode, report, artifactsDir: args.out, ...(audit.ok ? {} : { error: { code: 'errors.cli.AUDIT_FINDINGS', params: { high: audit.counts.HIGH } } }) };
}

export interface AuditOutcome {
  readonly exitCode: number;
  readonly audit?: LayoutAuditReport;
  readonly error?: { readonly code: string; readonly params: Readonly<Record<string, string | number | boolean | null>> };
}

/**
 * מצב ביקורת עצמאי (engine:audit --layout layout.json; §12) — ביקורת בקריאה
 * נפרשת על artifacts קיימים: ה-layout מנותח מהסריאליזציה הקנונית, המקור
 * מנותח מחדש מ-request.json שנכתב בריצת ה-layout. יציאה 7 כשיש HIGH.
 */
export async function runAuditCli(
  layoutPath: string,
  requestPath: string | undefined,
  progressLine: (line: string) => void = () => {},
): Promise<AuditOutcome> {
  const guard = installNetworkDeny();
  progressLine('offline guard installed (network denied from start)');
  const reqPath = requestPath ?? join(dirname(layoutPath), 'request.json');
  let layoutText: string;
  let reqText: string;
  try {
    layoutText = await readFile(layoutPath, 'utf8');
  } catch (e) {
    throw new CliError(EXIT_INPUT, 'errors.cli.INPUT_UNREADABLE', { path: layoutPath, reason: errText(e) }, `קריאה נכשלה: ${layoutPath}`);
  }
  try {
    reqText = await readFile(reqPath, 'utf8');
  } catch (e) {
    throw new CliError(EXIT_INPUT, 'errors.cli.INPUT_UNREADABLE', { path: reqPath, reason: errText(e) }, `חסר request.json לצד ה-layout (צפה: ${reqPath})`);
  }
  let layout: ReturnType<typeof parseLayoutDocument>;
  let req: { source?: string };
  try {
    layout = parseLayoutDocument(layoutText);
  } catch (e) {
    throw new CliError(EXIT_INPUT, 'errors.cli.INPUT_INVALID', { path: layoutPath, reason: errText(e) }, `layout.json שגוי: ${layoutPath}`);
  }
  try {
    req = JSON.parse(reqText) as { source?: string };
  } catch (e) {
    throw new CliError(EXIT_INPUT, 'errors.cli.SETTINGS_INVALID', { path: reqPath, reason: errText(e) }, `request.json שגוי: ${reqPath}`);
  }
  if (typeof req.source !== 'string') {
    throw new CliError(EXIT_INPUT, 'errors.cli.INPUT_INVALID', { path: reqPath, reason: 'source-missing' }, 'request.json חסר source');
  }
  const parsed = parseDocumentFile(req.source, reqPath);
  const content = { ...parsed.doc, transforms: parsed.transforms };
  const audit = auditLayout({ content, settings: {}, layout });
  progressLine(`audit: ${audit.findingCount} findings (HIGH=${audit.counts.HIGH}, MEDIUM=${audit.counts.MEDIUM}, LOW=${audit.counts.LOW})`);
  const outPath = join(dirname(layoutPath), 'audit.json');
  await writeArtifact(outPath, canonicalJson(audit as unknown as Record<string, unknown>));
  progressLine(`audit written: ${outPath} (network attempts: ${guard.attempts()})`);
  return { exitCode: audit.ok ? EXIT_SUCCESS : EXIT_AUDIT, audit };
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
