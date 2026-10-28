import type { FontConfig, HeadingConfigs, NoteRules, CustomTextStyle } from './settings';
import type { PageType, ColumnLayout, HeadingLevel } from './text';

/**
 * גודל עמוד.
 */
export interface PageSize {
  name: string;
  width: number;
  height: number;
}

export const A4: PageSize = { name: 'A4', width: 210, height: 297 };
export const US_LETTER: PageSize = { name: 'US Letter', width: 216, height: 279 };
export const B5: PageSize = { name: 'B5', width: 176, height: 250 };

/**
 * רקע עמוד.
 */
export interface PageBackground {
  type: 'none' | 'color' | 'texture' | 'image';
  color?: string;
  textureUrl?: string;
  imageUrl?: string;
  opacity?: number;
}

/**
 * פאנל 1: ערכות נושא ושערים.
 */
export interface ThemeConfig {
  themeSet: string;
  showSubShaar: boolean;
  regularPageBackground?: PageBackground;
  h0PageBackground?: PageBackground;
  h2PageBackground?: PageBackground;
}

/**
 * פאנל 2: יצירת ערכת נושא.
 */
export interface CustomThemeConfig {
  name: string;
  mainShaarSvg?: string;
  backShaarSvg?: string;
  subShaarSvg?: string;
  textBoxMargins: { top: number; bottom: number; left: number; right: number };
}

/**
 * פאנל 3: ייבוא תוספים.
 */
export interface ExtensionsConfig {
  importedPages: ImportedPage[];
  importedStyles: CustomTextStyle[];
  importedImages: ImportedImage[];
}

export interface ImportedPage {
  id: string;
  name: string;
  anchor: PageAnchor;
  content: string;
  contentType: 'json' | 'html' | 'image';
}

export type PageAnchor =
  | 'beforeAll'
  | 'afterMainShaar'
  | 'afterGeneralToc'
  | 'beforeEachPart'
  | 'afterEachPart'
  | 'endOfEachPart'
  | 'afterAll';

export interface ImportedImage {
  id: string;
  name: string;
  dataUrl: string;
  anchor: PageAnchor;
}

/**
 * פאנל 4: מאגר עיטורים.
 */
export interface OrnamentsConfig {
  matchH2WidthToText: boolean;
}

/**
 * פאנל 5: גופנים, כותרות וגוף הטקסט.
 */
export interface TypographyConfig {
  bodyFont: FontConfig;
  headings: HeadingConfigs;
  dropWordMode: DropWordMode;
  dropWordCount: 1 | 2;
  dropWordMinLines: 2 | 3;
  dropWordFont: FontConfig;
  dibburHamatchil: DibburHamatchilConfig;
}

export type DropWordMode =
  | 'sunken'
  | 'inline'
  | 'bold'
  | 'none';

export interface DibburHamatchilConfig {
  enabled: boolean;
  terminators: readonly string[];
  font: FontConfig;
}

/**
 * פאנל 7: איכות עימוד אוטומטי.
 */
export interface QualityConfig {
  preventWidow: boolean;
  preventOrphan: boolean;
  strictness: 'normal' | 'strict';
  balanceChapterEnd: boolean;
  preventHangingHeadings: boolean;
  preventOverflow: true;
}

/**
 * פאנל 8: כותרות עליונות.
 */
export interface RunningHeaderConfig {
  rightAlign: 'right' | 'center' | 'left';
  centerAlign: 'right' | 'center' | 'left';
  leftAlign: 'right' | 'center' | 'left';
  widthDistribution: [number, number, number];
  alternating: boolean;
  halfHalfBookName: boolean;
  rightContent: HeaderContentSource;
  centerContent: HeaderContentSource;
  leftContent: HeaderContentSource;
  simanOnly: boolean;
  h2WithNumber: boolean;
  rightOrnament?: string;
  centerOrnament?: string;
  leftOrnament?: string;
}

export type HeaderContentSource =
  | 'book-name'
  | 'chapter-name'
  | 'page-number'
  | 'h4'
  | 'first-word-last-word';

/**
 * פאנל 9: תוכן עניינים.
 */
export interface TocConfig {
  generalLevels: readonly HeadingLevel[];
  detailedLevels: readonly HeadingLevel[];
  inlineGrouping: boolean;
  countNumbering: boolean;
  fontsByLevel: Partial<Record<HeadingLevel, FontConfig>>;
}

/**
 * פאנל 10: גריד ומספור.
 */
export interface GridConfig {
  columnWidth: number;
  marginWidth: number;
  gutterWidth: number;
  interColumnGap: number;
  topMargin: number;
  bottomMargin: number;
  h2TopMargin?: number;
  columnDivider: 'none' | 'line' | 'dashed' | 'double';
  pageNumberPosition: PageNumberPosition;
  pageNumberStart: number;
  pageNumberFormat: PageNumberFormat;
  pageNumberFrame: PageNumberFrame;
}

export type PageNumberPosition =
  | 'bottom-center'
  | 'bottom-outer'
  | 'in-header';

export type PageNumberFormat =
  | 'hebrew-letter'
  | 'hebrew-letter-daf'
  | 'arabic';

export type PageNumberFrame =
  | 'none'
  | 'circle'
  | 'square'
  | 'round-parens'
  | 'square-brackets'
  | 'diamond';

/**
 * עמוד מותאם אישית.
 */
export interface CustomPageDefinition {
  id: string;
  name: string;
  pageType: PageType;
  columnLayout: ColumnLayout;
  htmlTemplate: string;
}

/**
 * הגדרות המערכת — המבנה הראשי.
 */
export interface Settings {
  version: 1;
  theme: ThemeConfig;
  customTheme?: CustomThemeConfig;
  extensions: ExtensionsConfig;
  ornaments: OrnamentsConfig;
  typography: TypographyConfig;
  notes: NoteRules;
  quality: QualityConfig;
  runningHeader: RunningHeaderConfig;
  toc: TocConfig;
  grid: GridConfig;
  customStyles: CustomTextStyle[];
  customPages: CustomPageDefinition[];
  pageSize: PageSize;
  pageOrientation: 'portrait' | 'landscape';
  pageMargins: { top: number; bottom: number; inner: number; outer: number };
  bleed?: number;
  cropMarks?: boolean;
}
