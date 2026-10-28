import type { HeadingLevel, LayoutMode, ColumnLayout, PageType, TextPosition } from './text';

/**
 * רשימת גופנים חלופיים (fallback chain).
 */
export type FontFallback = readonly string[];

/**
 * הגדרת גופן לרכיב טקסט.
 */
export interface FontConfig {
  family: FontFallback;
  size: string | number;
  weight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  italic?: boolean;
  color?: string;
  letterSpacing?: string;
  wordSpacing?: string;
  lineHeight?: number | string;
}

export const DEFAULT_BODY_FONT: FontConfig = {
  family: ['Guttman Rashi', 'Frank Ruhl Libre', 'serif'],
  size: 12,
  weight: 400,
  color: '#000000',
  lineHeight: 1.34,
};

/**
 * הגדרת כותרת ברמה מסוימת.
 */
export interface HeadingConfig {
  level: HeadingLevel;
  defaultLayoutMode: LayoutMode;
  allowedLayoutModes: readonly LayoutMode[];
  font: FontConfig;
  alwaysNewPage: boolean;
  marginTop: number;
  marginBottom: number;
  autoSimanBadge?: boolean;
  topOrnament?: string;
  bottomOrnament?: string;
  sideOrnaments?: { right?: string; left?: string };
}

export type HeadingConfigs = Record<HeadingLevel, HeadingConfig>;

/**
 * סגנון מספור הערות.
 */
export type FootnoteNumberingStyle =
  | 'hebrew-letters'
  | 'arabic-numbers'
  | 'hebrew-letters-geresh'
  | 'asterisks'
  | 'parentheses';

export type BodyMarkerStyle =
  | 'superscript'
  | 'normal'
  | 'subscript'
  | 'brackets';

export type FootnoteDividerStyle =
  | 'none'
  | 'line'
  | 'dotted'
  | 'sparkle'
  | 'asterisk'
  | 'diamond'
  | 'short-right-30'
  | 'half-line'
  | 'double-line';

/**
 * הגדרת כללי הערות.
 */
export interface NoteRules {
  footnoteDelimiters: [string, string];
  endnotePrefix: string;
  numberingStyle: FootnoteNumberingStyle;
  bodyMarkerStyle: BodyMarkerStyle;
  bodyMarkerSize: number;
  noteMarkerSize: number;
  dividerStyle: FootnoteDividerStyle;
  columnCount: 1 | 2;
  counterReset: 'page' | 'siman' | 'part' | 'continuous';
  header?: { text: string; font: FontConfig };
  headerSideOrnament?: string;
}

/**
 * סגנון טקסט מותאם אישית.
 */
export interface CustomTextStyle {
  id: string;
  name: string;
  matcher: StyleMatcher;
  target: StyleTarget;
  style: FontConfig;
  enabled: boolean;
}

export type StyleMatcher =
  | { type: 'linePrefix'; prefix: string }
  | { type: 'inlineMarker'; open: string; close: string }
  | { type: 'regex'; pattern: string; flags: string };

export interface StyleTarget {
  pageType?: PageType;
  columnLayout?: ColumnLayout;
  position: TextPosition;
  newPage?: boolean;
}
