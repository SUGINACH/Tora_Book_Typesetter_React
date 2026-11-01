/**
 * provider.ts — ספק המדידה HarfBuzz/WASM הנעול (שלב 24; ADR-003; אפיון §6.4).
 *
 * מודל הזרקה מלא — ל־src של החבילה אין ייבוא של harfbuzzjs/wawoff2 ואין
 * ייבוא Node/DOM כלל: ה־host (CLI, Worker, Tauri) מייבא את הספריות
 * הנעולות ומזריק אותן + את bytes ה־WASM לאימות. כך הספק רץ זהה בכל
 * סביבה, וטביעת האצבע (wasmSha256) מאומתת מול ה-bytes האמיתיים —
 * לא מוצהרת סתם.
 *
 * שרשרת: bytes גופן (מהמניפסט, שלב 23) → פריקת WOFF2 (wawoff2, אימות
 * sfntSha256 כפול) → hb.Face + hb.Font בסקייל upem → shaping ביחידות
 * גופן שלמות → המרה ל־LU (roundDiv, ADR-001) + ריווח אותיות בתוך
 * ה־advance של כל גליף (חוזה שלב 22: widthLu === Σ advanceLu).
 */
import { EngineError } from '@tora/measurement-api';
import {
  assertShapeRequest,
  canonicalJson,
  computeBreakOpportunities,
  roundDiv,
  shapeBatchViaSingle,
  shapeRequestHash,
  sha256Bytes,
  sha256Hex,
} from '@tora/measurement-api';
import type {
  FontManifestRecord,
  LayoutUnit,
  LoadedFont,
  MeasurementProvider,
  ShapeRequest,
  ShapedGlyph,
  ShapedRun,
  ShapingAtom,
} from '@tora/measurement-api';
import { HARFBUZZ_LOCK, PROVIDER_VERSION } from './lock.js';

// ─────────────────────────── טיפוסים מבניים של harfbuzzjs ───────────────────────────
// מוגדרים כאן מבנית (ולא בייבוא) — ה־host מזריק את המודול; אין תלות בזמן ריצה.

export interface HbBlob { readonly ptr: number }
export interface HbFace {
  readonly ptr: number;
  readonly upem: number;
  referenceTable(table: string): Uint8Array | undefined;
}
export interface HbFont { readonly ptr: number; scale: number | readonly [number, number] }
export interface HbGlyphInfo { readonly codepoint: number; readonly cluster: number; readonly flags?: number }
export interface HbGlyphPosition {
  readonly xAdvance: number; readonly yAdvance: number;
  readonly xOffset: number; readonly yOffset: number;
}
export interface HbBuffer {
  readonly ptr: number;
  addText(text: string, itemOffset?: number, itemLength?: number): void;
  setDirection(dir: number): void;
  setScript(script: string): void;
  setLanguage(language: string): void;
  guessSegmentProperties(): void;
  getGlyphInfos(): readonly HbGlyphInfo[];
  getGlyphPositions(): readonly HbGlyphPosition[];
}
export interface HbFeature { readonly tag: string; readonly value: number }
export interface HarfbuzzModule {
  Blob: new (data: Uint8Array | ArrayBuffer) => HbBlob;
  Face: new (blob: HbBlob, index?: number) => HbFace;
  Font: new (face: HbFace) => HbFont;
  Buffer: new () => HbBuffer;
  Feature: new (tag: string, value?: number) => HbFeature;
  shape(font: HbFont, buffer: HbBuffer, features?: readonly HbFeature[]): void;
  Direction: { readonly INVALID: 0; readonly LTR: 4; readonly RTL: 5; readonly TTB: 6; readonly BTT: 7 };
  version(): { readonly major: number; readonly minor: number; readonly micro: number };
}

/** פונקציית פריקת WOFF2 מוזרקת (מ־wawoff2 הנעול). */
export type Woff2Decompress = (bytes: Uint8Array) => Promise<Uint8Array>;

// ─────────────────────────── אפשרויות היצירה ───────────────────────────

export interface HarfbuzzProviderOptions {
  /** מודול harfbuzzjs מאותחל (מיובא ומוזרק על ידי ה־host). */
  readonly hb: HarfbuzzModule;
  /** bytes של harfbuzz.wasm — מאומתים מול נעילת ADR-003. */
  readonly wasmBytes: Uint8Array;
  /** bytes של wawoff2 decompress_binding.js — מאומתים מול הנעילה (חובה אם decompressWoff2 ניתן). */
  readonly woff2DecoderBytes?: Uint8Array;
  /** פריקת WOFF2 (מוזרקת) — חובה אם בסט יש גופני WOFF2. */
  readonly decompressWoff2?: Woff2Decompress;
  /** סט הגופנים הטעון והמאומת (loadFontSet של שלב 23). */
  readonly fonts: readonly LoadedFont[];
}

// ─────────────────────────── פנים הספק ───────────────────────────

interface FontEntry {
  readonly record: FontManifestRecord;
  readonly font: HbFont;
  readonly upem: number;
  readonly ascentFu: number;
  readonly descentFu: number;
  readonly lineGapFu: number;
}

/** מטריקות hhea ביחידות גופן (ascender חיובי, descender שלילי כמקובל). */
function readHhea(hb: HarfbuzzModule, face: HbFace): { ascentFu: number; descentFu: number; lineGapFu: number } {
  const hhea = face.referenceTable('hhea');
  if (!hhea || hhea.byteLength < 10) {
    // טבלת hhea הכרחית ב־OpenType; היעדרה בגופן אמיתי הוא ממצא — אפסים
    // דטרמיניסטיים עם תיעוד, ה־shaping עצמו אינו נפגע (לא ממציאים מטריקות).
    return { ascentFu: 0, descentFu: 0, lineGapFu: 0 };
  }
  const dv = new DataView(hhea.buffer as ArrayBuffer, hhea.byteOffset, hhea.byteLength);
  return {
    ascentFu: dv.getInt16(4),
    descentFu: dv.getInt16(6),
    lineGapFu: dv.getInt16(8),
  };
}

/**
 * סקריפט דטרמיניסטי לבקשה מתוך האטומים: הכתב הראשון שאינו פיסוק/אחר;
 * ברירת מחדל לפי הכיוון. (הסקריפט משפיע על בחירת טבלאות GSUB/GPOS.)
 */
function scriptOfRequest(atoms: readonly ShapingAtom[], direction: 'rtl' | 'ltr'): string {
  for (const a of atoms) {
    if (a.script === 'hebrew') return 'Hebr';
    if (a.script === 'latin' || a.script === 'number') return 'Latn';
  }
  return direction === 'rtl' ? 'Hebr' : 'Latn';
}

/** מיפוי cluster (אינדקס UTF-16 בטקסט המאוחד) → אינדקס אטום (חיפוש בינארי). */
function atomIndexAt(atomStarts: readonly number[], atomEnds: readonly number[], cluster: number): number {
  let lo = 0;
  let hi = atomStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = atomStarts[mid]!;
    const e = atomEnds[mid]!;
    if (cluster < s) hi = mid - 1;
    else if (cluster >= e) lo = mid + 1;
    else return mid;
  }
  // cluster מחוץ לטווח — באג במיפוי (הוולידציה מנעה את הקלט); נכשל בקול רם
  throw new EngineError('errors.shape.INVALID_REQUEST', {
    reason: `cluster-out-of-range:${cluster}`,
  });
}

// ─────────────────────────── יצירת הספק ───────────────────────────

export async function createHarfbuzzProvider(
  options: HarfbuzzProviderOptions,
): Promise<MeasurementProvider> {
  const { hb, wasmBytes, fonts } = options;

  // 1) אימות הנעילות — ה־bytes האמיתיים מול ADR-003
  const actualWasmSha = sha256Bytes(wasmBytes);
  if (actualWasmSha !== HARFBUZZ_LOCK.wasmSha256) {
    throw new EngineError('errors.measurement.MEASUREMENT_UNAVAILABLE', {
      provider: 'harfbuzz-wasm',
      reason: `wasm-sha-mismatch: expected ${HARFBUZZ_LOCK.wasmSha256.slice(0, 12)}…, got ${actualWasmSha.slice(0, 12)}…`,
    });
  }
  const v = hb.version();
  const actualHbVersion = `${v.major}.${v.minor}.${v.micro}`;
  if (actualHbVersion !== HARFBUZZ_LOCK.harfbuzzVersion) {
    throw new EngineError('errors.measurement.MEASUREMENT_UNAVAILABLE', {
      provider: 'harfbuzz-wasm',
      reason: `harfbuzz-version-mismatch: locked ${HARFBUZZ_LOCK.harfbuzzVersion}, got ${actualHbVersion}`,
    });
  }
  const hasWoff2Fonts = fonts.some((f) => f.record.binaryFormat === 'woff2');
  if (hasWoff2Fonts) {
    if (typeof options.decompressWoff2 !== 'function') {
      throw new EngineError('errors.measurement.MEASUREMENT_UNAVAILABLE', {
        provider: 'harfbuzz-wasm',
        reason: 'woff2-decoder-missing (wawoff2 must be injected for WOFF2 fonts)',
      });
    }
    if (!options.woff2DecoderBytes) {
      throw new EngineError('errors.measurement.MEASUREMENT_UNAVAILABLE', {
        provider: 'harfbuzz-wasm',
        reason: 'woff2-decoder-bytes-missing (needed for fingerprint verification)',
      });
    }
    const decoderSha = sha256Bytes(options.woff2DecoderBytes);
    if (decoderSha !== HARFBUZZ_LOCK.woff2DecoderSha256) {
      throw new EngineError('errors.measurement.MEASUREMENT_UNAVAILABLE', {
        provider: 'harfbuzz-wasm',
        reason: `woff2-decoder-sha-mismatch: expected ${HARFBUZZ_LOCK.woff2DecoderSha256.slice(0, 12)}…, got ${decoderSha.slice(0, 12)}…`,
      });
    }
  }

  // 2) environmentHash — נגזר מהנעילות בלבד ⇒ זהה בכל host לאותה בנייה
  const environmentHash = sha256Hex(canonicalJson({
    providerId: HARFBUZZ_LOCK.providerId,
    harfbuzzjs: HARFBUZZ_LOCK.harfbuzzjsVersion,
    harfbuzz: HARFBUZZ_LOCK.harfbuzzVersion,
    wasmSha256: HARFBUZZ_LOCK.wasmSha256,
    woff2Decoder: hasWoff2Fonts ? HARFBUZZ_LOCK.woff2DecoderSha256 : null,
    unicodeConfig: HARFBUZZ_LOCK.unicodeConfig,
  }));
  const identity = Object.freeze({
    providerId: 'harfbuzz-wasm' as const,
    providerVersion: PROVIDER_VERSION,
    wasmSha256: HARFBUZZ_LOCK.wasmSha256,
    environmentHash,
  });

  // 3) טעינת הפנים: פריקת WOFF2 + אימות sfnt כפול + hb.Font בסקייל upem
  const entries = new Map<string, FontEntry>();
  for (const loaded of fonts) {
    const { record, bytes, key } = loaded;
    let sfnt: Uint8Array;
    if (record.binaryFormat === 'woff2') {
      sfnt = await options.decompressWoff2!(bytes);
      if (record.sfntSha256 !== undefined) {
        const actualSfnt = sha256Bytes(sfnt);
        if (actualSfnt !== record.sfntSha256) {
          throw new EngineError('errors.font.FONT_SFNT_MISMATCH', {
            file: record.file,
            expectedSha256: record.sfntSha256,
            actualSha256: actualSfnt,
          });
        }
      }
    } else {
      sfnt = bytes; // sfnt ישיר (woff ישן/sfnt — אין כאלה במלאי, אך החוזה תומך)
    }
    const blob = new hb.Blob(sfnt);
    const face = new hb.Face(blob);
    const font = new hb.Font(face);
    font.scale = face.upem; // shaping ביחידות גופן שלמות — ללא איבוד דיוק
    const hhea = readHhea(hb, face);
    entries.set(key.fontId, Object.freeze({
      record,
      font,
      upem: face.upem,
      ascentFu: hhea.ascentFu,
      descentFu: hhea.descentFu,
      lineGapFu: hhea.lineGapFu,
    }));
  }

  // 4) shape — סינכרוני ודטרמיניסטי (אחרי היצירה; אפיון §6.4)
  const shape = (request: ShapeRequest): ShapedRun => {
    assertShapeRequest(request);
    const entry = entries.get(request.font.fontId);
    if (entry === undefined) {
      throw new EngineError('errors.font.MISSING_FONT', {
        family: request.font.family,
        file: request.font.fontId,
      });
    }
    const { font, upem } = entry;
    const { atoms, fontSizeLu, letterSpacingLu } = request;

    // הטקסט המאוחד + טווחי האטומים (UTF-16)
    let combined = '';
    const atomStarts: number[] = [];
    const atomEnds: number[] = [];
    for (const a of atoms) {
      atomStarts.push(combined.length);
      combined += a.text;
      atomEnds.push(combined.length);
    }

    const buffer = new hb.Buffer();
    buffer.addText(combined);
    buffer.setDirection(request.direction === 'rtl' ? hb.Direction.RTL : hb.Direction.LTR);
    buffer.setScript(scriptOfRequest(atoms, request.direction));
    buffer.setLanguage(request.language);

    const featureTags = Object.keys(request.features);
    const hbFeatures = featureTags.length > 0
      ? featureTags.map((tag) => new hb.Feature(tag, request.features[tag] === true ? 1 : 0))
      : undefined;
    hb.shape(font, buffer, hbFeatures);

    const infos = buffer.getGlyphInfos();
    const positions = buffer.getGlyphPositions();
    const glyphs: ShapedGlyph[] = [];
    const missingByIndex = new Map<number, ShapedRun['missingGlyphAtomIds'][number]>();
    let width = 0;
    for (let i = 0; i < infos.length; i++) {
      const info = infos[i]!;
      const pos = positions[i]!;
      const atomIndex = atomIndexAt(atomStarts, atomEnds, info.cluster);
      // advance ומיקומים: יחידות גופן → LU (roundDiv של ADR-001); y הופכי
      // (HarfBuzz חיובי מעלה; החוזה חיובי מטה — ADR-003 §8)
      const advanceLu = (roundDiv(pos.xAdvance * fontSizeLu, upem) + letterSpacingLu) as LayoutUnit;
      glyphs.push(Object.freeze({
        glyphId: info.codepoint,
        clusterAtomIndex: atomIndex,
        advanceLu,
        xOffsetLu: roundDiv(pos.xOffset * fontSizeLu, upem) as LayoutUnit,
        yOffsetLu: roundDiv(-pos.yOffset * fontSizeLu, upem) as LayoutUnit,
      }));
      width += advanceLu;
      if (info.codepoint === 0) {
        // ‎.notdef‎ — דיווח גלוי, לא החלפה שקטה (מדיניות העלייה בשגיאה — שלב 25);
        // הדיווח בסדר המקור (לוגי) — לא בסדר החזותי של הפלט
        missingByIndex.set(atomIndex, atoms[atomIndex]!.id);
      }
    }
    const missingIds = [...missingByIndex.keys()].sort((a, b) => a - b)
      .map((i) => missingByIndex.get(i)!);

    return Object.freeze({
      requestHash: shapeRequestHash(identity, request),
      glyphs: Object.freeze(glyphs),
      widthLu: width as LayoutUnit,
      ascentLu: roundDiv(entry.ascentFu * fontSizeLu, upem) as LayoutUnit,
      descentLu: roundDiv(-entry.descentFu * fontSizeLu, upem) as LayoutUnit,
      lineGapLu: roundDiv(entry.lineGapFu * fontSizeLu, upem) as LayoutUnit,
      missingGlyphAtomIds: Object.freeze(missingIds),
    });
  };

  /**
   * הזדמנויות שבירה — UAX #14 נעול (rev 53, Unicode 16.0.0; שלב 27) על
   * טקסט האטומים המאוחד, ממופה לגבולות אטומים. שער השלב: כל נקודה
   * מקושרת למזהה אטום. ה־hooks של המדיניות (איסור/התרה מקומיים) נצרכים
   * על ידי המנוע דרך computeBreakOpportunities — כאן ה־UAX הגולמי.
   */
  const lineOpportunities = (atoms: readonly ShapingAtom[]): readonly number[] => {
    const out: number[] = [];
    for (const o of computeBreakOpportunities(atoms)) {
      if (o.kind === 'opportunity' || o.kind === 'mandatory') out.push(o.atomIndex);
    }
    return Object.freeze(out);
  };

  return Object.freeze({
    providerId: 'harfbuzz-wasm' as const,
    providerVersion: PROVIDER_VERSION,
    wasmSha256: HARFBUZZ_LOCK.wasmSha256,
    environmentHash,
    shape,
    lineOpportunities,
    shapeBatch: (requests: readonly ShapeRequest[]): readonly ShapedRun[] =>
      shapeBatchViaSingle(
        { providerVersion: PROVIDER_VERSION, environmentHash, shape, lineOpportunities },
        requests,
      ),
  });
}
