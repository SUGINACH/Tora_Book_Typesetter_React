/**
 * @tora/content-model — AST, SourceSpan, atoms, notes, anchors
 *
 * שלב 7: שלד · שלב 14 (פרק ג): SourceSpan וזרמי תוכן · שלב 15 (פרק ג):
 * TextAtom, AtomId דטרמיניסטי, פיצול/איחוד, ספר טרנספורמציות וכיסוי אטומים.
 * ה־API הציבורי של החבילה נחשף דרך קובץ זה בלבד (אפיון §5).
 * המשך המימוש: blocks/inline (16), פרסר (17+).
 */
export const PACKAGE_NAME = '@tora/content-model' as const;
export const SKELETON_NOTE = 'פרק ג בבנייה — spans (14) ו־atoms (15) הושלמו; blocks/inline/parser בהמשך' as const;

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

// ── קטלוג שגיאות מקומי (אותו דפוס שלב 12; content-model חסר תלויות) ──
export type { ErrorCatalogEntry, ErrorParamValue, ErrorParams } from './errors.js';
export {
  CONTENT_MODEL_ERROR_CATALOG,
  ContentModelError,
  contentModelErrorCatalogSize,
  isRegisteredContentModelErrorKey,
} from './errors.js';
