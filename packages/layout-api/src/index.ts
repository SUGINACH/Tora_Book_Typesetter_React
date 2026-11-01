/**
 * @tora/layout-api — Layout IR, policy APIs, costs, diagnostics.
 *
 * שלב 31 (פרק ה): ה־Layout IR המלא (§6.5) — סוגים, אימות מבני, סריאליזציה
 * קנונית המשמרת layoutHash, הקפאה עמוקה והיטל LU→CSS px.
 * שלב 32: חוזה typeset(), RunManifest ו־Decision Ledger (§12, §6.7).
 */
export * from './canonical-hash.js';
export * from './canonical-hash-error.js';
export * from './hash.js';
export * from './errors.js';
export * from './ir.js';
export * from './ir-serialize.js';
export * from './typeset.js';
export * from './run-manifest.js';
export * from './decision-ledger.js';
export * from './projection.js';

// ─────────────────────────── מונחי יסוד מומרזים (גרף §5: re-export מהבעלים) ───────────────────────────
// מזהים ופרוסות (content-model) — זהות מבנית; הצרכנים (engine/audit/render)
// מקבלים אותם דרך layout-api כדי שגרף התלות יישאר מדויק.
export type {
  AnchorId,
  AtomId,
  NodeId,
  SourceSpan,
  TorahDocument,
  TransformRecord,
  TextAtom,
  InlineItem,
  ContentBlock,
  NoteEntry,
  NoteStreams,
  Siman,
  Part,
  MetadataEntry,
} from '@tora/content-model';
export { allBlocks } from '@tora/content-model';

// יחידות ומדידה (measurement-api) — יחידות LU (ADR-001), Rect, FontFaceKey
// וספק המדידה (לחתימת auditLayout §12 — הביקורת מקבלת את אותו חוזה).
export type {
  LayoutUnit,
  FontUnit,
  Cost,
  Rect,
  FontFaceKey,
  ShapeRequest,
  ShapedRun,
  ShapedGlyph,
  MeasurementProvider,
  TestMeasurementProvider,
} from '@tora/measurement-api';
export {
  roundDiv,
  mmToLu,
  ptToLu,
  luToPt,
  fontUnitsToLu,
  quantizeSetting,
  safeAdd,
  safeSub,
  safeMul,
  asLu,
  A4,
} from '@tora/measurement-api';

// BiDi (UAX #9, שלב 28) — לשימוש המנוע דרך אותו חוזה (גרף §5).
export { computeBidi } from '@tora/measurement-api';
export type { BidiResult, BidiRun, ComputeBidiOptions } from '@tora/measurement-api';

// מספור הערות טרם העימוד (שלב 20) ו־EffectiveSettings (שלב 30) — המנוע
// (layout-engine) תלוי ב-layout-api בלבד; הכל עובר דרכנו (גרף §5).
export {
  DEFAULT_NOTE_NUMBERING_POLICY,
  collectNoteReferences,
  formatNoteLabel,
  numberNotes,
  toGematriaLabel,
} from '@tora/content-model';
export type {
  NoteKind,
  NoteNumberAssignment,
  NoteNumberingPolicy,
  NoteNumberingResult,
} from '@tora/content-model';
export type { EffectiveSettings, SettingRegistry, SettingDefinition } from '@tora/settings-schema';
export { buildSettingRegistry } from '@tora/settings-schema';
