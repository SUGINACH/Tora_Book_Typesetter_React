/**
 * @tora/content-model — AST, SourceSpan, atoms, notes, anchors
 *
 * שלב 7: שלד · שלב 14 (פרק ג): SourceSpan וזרמי תוכן · שלב 15 (פרק ג):
 * TextAtom, AtomId דטרמיניסטי, פיצול/איחוד, ספר טרנספורמציות וכיסוי אטומים.
 * ה־API הציבורי של החבילה נחשף דרך קובץ זה בלבד (אפיון §5).
 * המשך המימוש: blocks/inline (16), פרסר (17), נאמנות Unicode (18).
 */
export const PACKAGE_NAME = '@tora/content-model' as const;
export const SKELETON_NOTE = 'פרק ג בבנייה — spans (14), atoms (15), inline/blocks/document (16), הפרסר (17) ונאמנות Unicode (18) הושלמו; המשך הפרק: עץ סוגריים (19)' as const;

// ── שלב 14: SourceSpan וזרמי תוכן ──
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

// ── שלב 15: TextAtom, מזהים דטרמיניסטיים, טרנספורמציות וכיסוי ──
export type {
  AtomLedger,
  AtomScript,
  BreakBefore,
  CoverageReport,
  LedgerDetailValue,
  LedgerIssue,
  MakeTextAtomOptions,
  MergeResult,
  SplitResult,
  TextAtom,
  TransformKind,
  TransformRecord,
} from './atoms.js';
export {
  ATOM_SCRIPTS,
  BREAK_BEFORE_KINDS,
  MAX_BIDI_LEVEL,
  TRANSFORM_KINDS,
  appendTransform,
  classifyScript,
  computeAtomCoverage,
  deriveAtomId,
  isCombiningMark,
  isTextAtom,
  isTransformRecord,
  ledgerIntegrityIssues,
  makeTextAtom,
  makeTransformRecord,
  mergeAtoms,
  splitAtom,
  transformsTouching,
} from './atoms.js';

// ── שלב 16: InlineItem, ContentBlock ומסגרת המסמך ──
export type { InlineItem, InlineItemKind } from './inline.js';
export {
  INLINE_ITEM_KINDS,
  isInlineItem,
  makeAnchorItem,
  makeExplicitBreak,
  makeInlineBox,
  makeMarker,
  makeNoteReference,
  makeTextItem,
} from './inline.js';
export type {
  BlockRole,
  ContentBlock,
  HeadingLevel,
  MakeContentBlockInput,
} from './blocks.js';
export {
  BLOCK_ROLES,
  HEADING_LEVELS,
  MAX_BLOCK_DEPTH,
  blockDepth,
  blockSpanLength,
  deriveAnchorId,
  deriveNodeId,
  isContentBlock,
  makeContentBlock,
} from './blocks.js';
export type {
  MetadataEntry,
  NoteEntry,
  NoteKind,
  NoteStreams,
  Part,
  ShaarDesign,
  Siman,
  TorahDocument,
} from './document.js';
export {
  LEGACY_METADATA_KEYS,
  NOTE_KINDS,
  SHAAR_DESIGNS,
  allBlocks,
  findOrphanNotes,
  isTorahDocument,
  makeTorahDocument,
  parseDocument,
  serializeDocument,
} from './document.js';

// ── שלב 17: פורט הפרסר הישן — מרשם המזהים והתוחמים ──
export type {
  CoverageProof,
  CustomStyleGrammar,
  CustomStyleMatcher,
  DiagnosticSeverity,
  ParseResult,
  ParserDiagnostic,
  ParserOptions,
  SyntaxSpan,
} from './parser/parse.js';
export { parseSourceText } from './parser/parse.js';
export type { IdentifierRecord } from './parser/registry-data.js';
export {
  IDENTIFIER_RECORDS,
  PIPELINE_STAGES,
  REGISTRY_FROZEN_AT,
  REGISTRY_SCHEMA_VERSION,
} from './parser/registry-data.js';

// ── שלב 18: נאמנות נוסח ו־Unicode (ADR-007) ──
export type {
  AtomFidelityIssue,
  NormalizationSpan,
  NormalizationView,
  UnicodeFidelityPolicyKind,
  UnicodeFidelityRule,
  UnicodeInventory,
  UnicodeNormalizationForm,
} from './unicode.js';
export {
  UNICODE_FIDELITY_RULES,
  UNICODE_NORMALIZATION_FORMS,
  UNICODE_POLICY_VERSION,
  atomFidelityIssues,
  findNormalizationSpans,
  inspectUnicode,
  normalizeView,
  normalizationDetectionInvariantHolds,
} from './unicode.js';

// ── קטלוג שגיאות מקומי (אותו דפוס שלב 12; content-model חסר תלויות) ──
export type { ErrorCatalogEntry, ErrorParamValue, ErrorParams } from './errors.js';
export {
  CONTENT_MODEL_ERROR_CATALOG,
  ContentModelError,
  contentModelErrorCatalogSize,
  isRegisteredContentModelErrorKey,
} from './errors.js';
