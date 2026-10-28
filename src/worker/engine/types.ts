/**
 * מסמך ביניים — תוצאה של שלב ה-measurement.
 */
export interface MeasuredBlock {
  type: 'paragraph' | 'heading' | 'footnote' | 'ornament' | 'page-break';
  text: string;
  headingLevel?: number;
  simanNumber?: number;
  lines: string[];      // שורות לאחר שבירה
  height: number;      // גובה בפיקסלים
  width: number;       // רוחב בפיקסלים
  isH2?: boolean;
}

export interface MeasuredDocument {
  blocks: MeasuredBlock[];
  totalHeight: number;
  columnWidth: number;
  pageHeight: number;
}

/**
 * תצורת עמוד אחרי שבירה לטורים.
 */
export interface PagedColumns {
  pages: PagedPage[];
}

export interface PagedPage {
  pageNumber: number;
  pageType: import('../../types').PageType;
  columns: import('../../types').ColumnContent[];
  heading?: { level: number; text: string; simanNumber?: number };
  footnotes?: import('../../types').FootnoteBlock[];
}

/**
 * תצורה סופית אחרי כל התיקונים.
 */
export interface FinalLayout {
  pages: import('../../types').FinalPage[];
  totalBlocks: number;
}
