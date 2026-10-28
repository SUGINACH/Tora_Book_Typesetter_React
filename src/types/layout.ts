import type {
  PageType,
  ColumnLayout,
  TextType,
  TextPosition,
  HeadingLevel,
  ParsedNode,
  ParsedFootnote,
  ParsedEndnote,
  ParsedSidenote,
} from './text';
import type { FontConfig, HeadingConfigs, NoteRules, CustomTextStyle } from './settings';

/**
 * רכיב ביניים בעימוד — בלוק של טקסט עם גודל מחושב.
 */
export interface Block {
  type: 'paragraph' | 'heading' | 'footnote' | 'ornament' | 'page-break';
  content: string;
  textType?: TextType;
  headingLevel?: HeadingLevel;
  simanNumber?: number;
  height: number;
  width: number;
  sourceNode?: ParsedNode;
}

/**
 * טור עם בלוקים.
 */
export interface ColumnContent {
  index: 0 | 1;
  blocks: Block[];
  height: number;
  width: number;
}

/**
 * עמוד עם טורים.
 */
export interface FinalPage {
  pageNumber: number;
  pageType: PageType;
  columns: ColumnContent[];
  footnotes?: FootnoteBlock;
  ornaments?: OrnamentPlacement[];
  heading?: {
    level: HeadingLevel;
    text: string;
    simanNumber?: number;
  };
  runningHeader?: string;
  pageNumberDisplay?: string;
}

export interface FootnoteBlock {
  notes: ParsedFootnote[];
  height: number;
  dividerStyle: import('./settings').FootnoteDividerStyle;
}

export interface OrnamentPlacement {
  position: 'h2-top' | 'h2-bottom' | 'h3-right' | 'h3-left' | 'chapter-end' | 'shaar';
  svgPath: string;
  width: string;
  height: string;
}

/**
 * פריסה סופית — רשימת עמודים.
 */
export interface FinalLayout {
  pages: FinalPage[];
  totalBlocks: number;
  totalHeight: number;
}

/**
 * עמוד מרונדר — HTML מוכן.
 */
export interface RenderedPage {
  pageNumber: number;
  pageType: PageType;
  html: string;
  geometry: PageGeometry;
}

export interface PageGeometry {
  width: number;
  height: number;
  columns: ColumnGeometry[];
  footnoteAreaHeight?: number;
  hasShaar: boolean;
}

export interface ColumnGeometry {
  index: 0 | 1;
  width: number;
  height: number;
  blockCount: number;
  lineCount: number;
}

/**
 * ממצא בדיקת גיאומטריה.
 */
export interface AuditFinding {
  page: number;
  kind: AuditFindingKind;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  elementId?: string;
  suggestedFix?: string;
}

export type AuditFindingKind =
  | 'widow'
  | 'orphan'
  | 'sparse-line'
  | 'imbalanced-columns'
  | 'hanging-heading'
  | 'overflow'
  | 'empty-column'
  | 'short-page-before-h3'
  | 'tofu'
  | 'font-fallback-fail'
  | 'note-marker-split'
  | 'paren-broken'
  | 'text-out-of-bounds'
  | 'paren-imbalance'
  | 'false-positive-sparse'
  | 'false-positive-fallback';

/**
 * אירוע Trace — החלטת עימוד מתועדת.
 */
export interface TraceEvent {
  t: number;
  fn: string;
  args: string;
  before?: string;
  after?: string;
  result?: string;
}
