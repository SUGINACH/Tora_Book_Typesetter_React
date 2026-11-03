/**
 * @tora/content-model — AST, SourceSpan, atoms, notes, anchors
 *
 * שלב 7: שלד · שלב 14 (פרק ג): SourceSpan וזרמי תוכן · שלב 15 (פרק ג):
 * TextAtom, AtomId דטרמיניסטי, פיצול/איחוד, ספר טרנספורמציות וכיסוי אטומים.
 * ה־API הציבורי של החבילה נחשף דרך קובץ זה בלבד (אפיון §5).
 * המשך המימוש: blocks/inline (16), פרסר (17), נאמנות Unicode (18).
 */
export const PACKAGE_NAME = '@tora/content-model' as const;
export const SKELETON_NOTE = 'פרק ג בבנייה — spans (14), atoms (15), inline/blocks/document (16), הפרסר (17), נאמנות Unicode (18), עץ סוגריים (19) ומספור הערות (20) הושלמו; המשך הפרק: Text Audit v1 (21)' as const;

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

// ── שלב 19: עץ סוגריים מבני (§10.4) ──
export type {
  BracketBlockState,
  BracketIssue,
  BracketKind,
  BracketPairDef,
  BracketPairNode,
  BracketScan,
  BracketScanResult,
} from './brackets.js';
export {
  BRACKET_PAIRS,
  MAX_BRACKET_DEPTH,
  blockExitState,
  crossingPairs,
  endsInsideBracket,
  isBracketScanResult,
  scanBrackets,
} from './brackets.js';

// ── שלב 20: זרמי הערות ומספורן טרם העימוד (§10.3) ──
export type {
  NoteLabelFormat,
  NoteNumberAssignment,
  NoteNumberingPolicy,
  NoteNumberingResult,
  NoteNumberingScope,
  NumberingPageContext,
} from './notes.js';
export {
  DEFAULT_NOTE_NUMBERING_POLICY,
  NOTE_LABEL_FORMATS,
  NOTE_NUMBERING_SCOPES,
  collectNoteReferences,
  formatNoteLabel,
  numberNotes,
  toGematriaLabel,
} from './notes.js';

// ── שלב 68: מניפסטי נכסים חזותיים v2 — שערים ועיטורים (M8; §7, §13) ──
export type {
  AssetViewBox,
  AssetsFileEntry,
  AssetsIdentity,
  AssetsLicenseRef,
  AssetsSourceRef,
  BoxAnchor,
  BoxAnchors,
  BuiltinRoleSlot,
  OrnamentDesignRecord,
  OrnamentsManifest,
  PageFractions,
  ShaarDesignRecord,
  ShaarManifest,
  ShaarPercentBox,
  TextBoxMm,
} from './assets.js';
export {
  ASSETS_MANIFEST_SCHEMA_VERSION,
  BUILTIN_DRAWINGS,
  BUILTIN_ROLE_SLOTS,
  ORNAMENT_FILE_ROLES,
  SHAAR_FILE_KINDS,
  SHAAR_KINDS,
  SHAAR_PHYSICAL_PAGE_MM,
  assetsIdentity,
  legacyPercentBoxOf,
  ornamentAssetId,
  ornamentsManifestIssues,
  pageFractionsToMm,
  parseOrnamentsManifest,
  parseShaarManifest,
  parseViewBox,
  shaarAssetId,
  shaarManifestIssues,
  textBoxAnchorsOf,
  textBoxToPageFractions,
} from './assets.js';

// ── קטלוג שגיאות מקומי (אותו דפוס שלב 12; content-model חסר תלויות) ──
export type { ErrorCatalogEntry, ErrorParamValue, ErrorParams } from './errors.js';
export {
  CONTENT_MODEL_ERROR_CATALOG,
  ContentModelError,
  contentModelErrorCatalogSize,
  isRegisteredContentModelErrorKey,
} from './errors.js';
