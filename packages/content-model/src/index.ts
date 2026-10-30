/**
 * @tora/content-model — AST, SourceSpan, atoms, notes, anchors
 *
 * שלב 7: שלד · שלב 14 (פרק ג): SourceSpan ומזהים ממותגים.
 * ה־API הציבורי של החבילה נחשף דרך קובץ זה בלבד (אפיון §5).
 * המשך המימוש: atoms (15), blocks (16), פרסר (17+).
 */
export const PACKAGE_NAME = '@tora/content-model' as const;
export const SKELETON_NOTE = 'פרק ג בבנייה — spans (שלב 14) הושלם; atoms/blocks/parser בהמשך' as const;

// ── שלב 14: SourceSpan ומזהים ממותגים ──
export type {
  AnchorId,
  AtomId,
  BrandedId,
  ContentStream,
  IdKind,
  NodeId,
  SourceSpan,
} from './spans.js';
export {
  CONTENT_STREAMS,
  compareSpans,
  contentStreamRank,
  isEmptySpan,
  isContentStream,
  isSourceSpan,
  isValidIdValue,
  makeAnchorId,
  makeAtomId,
  makeNodeId,
  makeSourceSpan,
  sameStream,
  sliceSpan,
  spanCovers,
  spanLength,
  spansOverlap,
} from './spans.js';

// ── קטלוג שגיאות מקומי (אותו דפוס שלב 12; content-model חסר תלויות) ──
export type { ErrorCatalogEntry, ErrorParamValue, ErrorParams } from './errors.js';
export {
  CONTENT_MODEL_ERROR_CATALOG,
  ContentModelError,
  contentModelErrorCatalogSize,
  isRegisteredContentModelErrorKey,
} from './errors.js';
