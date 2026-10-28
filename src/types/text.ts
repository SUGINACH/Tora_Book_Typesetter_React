/**
 * רמת כותרת בספר התורני.
 * 0 = הקדמה/מבוא; 7 = הערת צד בשוליים.
 */
export type HeadingLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * מצב עימוד של כותרת — קובע איך היא מופיעה בעמוד.
 */
export type LayoutMode =
  | 'new_page_1col'
  | 'new_page_2col'
  | 'span_1col'
  | 'inline_2col'
  | 'run_in'
  | 'side_note'
  | 'sub_shaar';

/**
 * סוג טקסט — מזהה את סוג הרכיב הטקסטואלי.
 */
export type TextType =
  | 'body'
  | 'drop-word'
  | 'dibbur-hamatchil'
  | 'heading'
  | 'footnote'
  | 'footnote-marker'
  | 'endnote'
  | 'endnote-marker'
  | 'side-note'
  | 'editorial-note'
  | 'metadata'
  | 'page-number'
  | 'running-header'
  | 'section-divider'
  | 'paren-text'
  | 'custom';

/**
 * מיקום הטקסט בעמוד.
 */
export type TextPosition =
  | 'in-column'
  | 'span-columns'
  | 'in-margin'
  | 'in-footnote-area'
  | 'in-header'
  | 'in-footer'
  | 'new-page';

/**
 * סוג עמוד.
 */
export type PageType =
  | 'regular'
  | 'chapter-opener'
  | 'main-shaar'
  | 'sub-shaar'
  | 'back-shaar'
  | 'dedication'
  | 'haskamot'
  | 'toc'
  | 'custom';

/**
 * סוג עימוד — כמה טורים.
 */
export type ColumnLayout =
  | 'single-column'
  | 'two-columns'
  | 'talmudic'
  | 'mixed';

/**
 * סוג טקסט
 */
export interface ParsedNode {
  id: string;
  type: TextType;
  text: string;
  sourceLine: number;
  headingLevel?: HeadingLevel;
  simanNumber?: number;
  subNumber?: number;
  children?: ParsedNode[];
  customStyleId?: string;
}

/**
 * רכיב טקסט מזוהה — ה-AST הראשי.
 */
export interface ParsedDocument {
  version: 1;
  metadata: Partial<BookMetadata>;
  root: ParsedNode[];
  footnotes: ParsedFootnote[];
  endnotes: ParsedEndnote[];
  sidenotes: ParsedSidenote[];
  noteRules: import('./settings').NoteRules;
  customStyles: import('./settings').CustomTextStyle[];
  sourceHash: string;
}

/**
 * פתיח הספר — 10 שדות metadata.
 */
export interface BookMetadata {
  bookName: string;
  subject: string;
  detailedSubject: string;
  editionDetails: string;
  authorName: string;
  placeAndYear: string;
  copyright: string;
  publisherDetails: string;
  contactDetails: string;
  additionalDetails: string;
}

export interface ParsedFootnote {
  id: string;
  text: string;
  sourceLine: number;
  sourceColumn: number;
}

export interface ParsedEndnote {
  id: string;
  text: string;
  sourceLine: number;
}

export interface ParsedSidenote {
  id: string;
  text: string;
  sourceLine: number;
  attachToNextParagraph: boolean;
}
