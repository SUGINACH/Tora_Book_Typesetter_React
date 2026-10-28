import type { Settings } from '../types';
import { A4 } from '../types';

/**
 * ברירות מחדל — מבוסס על ההגדרות מ-Gold repo.
 */
export const defaultSettings: Settings = {
  version: 1,

  theme: {
    themeSet: 'heichal-romi',
    showSubShaar: true,
  },

  customTheme: undefined,

  extensions: {
    importedPages: [],
    importedStyles: [],
    importedImages: [],
  },

  ornaments: {
    matchH2WidthToText: false,
  },

  typography: {
    bodyFont: {
      family: ['Guttman Rashi', 'Frank Ruhl Libre', 'serif'],
      size: 12,
      weight: 400,
      color: '#000000',
      lineHeight: 1.34,
    },
    headings: {
      0: {
        level: 0,
        defaultLayoutMode: 'new_page_1col',
        allowedLayoutModes: ['new_page_1col', 'span_1col', 'new_page_2col'],
        font: { family: ['Frank Ruhl Libre', 'serif'], size: 17, weight: 700 },
        alwaysNewPage: true,
        marginTop: 0,
        marginBottom: 200,
      },
      1: {
        level: 1,
        defaultLayoutMode: 'sub_shaar',
        allowedLayoutModes: ['sub_shaar', 'new_page_1col'],
        font: { family: ['Lia Sgula', 'Bellefair', 'serif'], size: 50, weight: 700 },
        alwaysNewPage: true,
        marginTop: 0,
        marginBottom: 0,
      },
      2: {
        level: 2,
        defaultLayoutMode: 'new_page_1col',
        allowedLayoutModes: ['new_page_1col'],
        font: { family: ['AAd_AlphaBlack', 'serif'], size: 17, weight: 700 },
        alwaysNewPage: true,
        marginTop: 130,
        marginBottom: 50,
        autoSimanBadge: true,
      },
      3: {
        level: 3,
        defaultLayoutMode: 'span_1col',
        allowedLayoutModes: ['span_1col', 'inline_2col'],
        font: { family: ['AAd_AlphaLight', 'serif'], size: 13.5, weight: 400 },
        alwaysNewPage: false,
        marginTop: 100,
        marginBottom: 60,
      },
      4: {
        level: 4,
        defaultLayoutMode: 'inline_2col',
        allowedLayoutModes: ['inline_2col', 'span_1col', 'run_in'],
        font: { family: ['FrankRuehl', 'serif'], size: 12.5, weight: 400 },
        alwaysNewPage: false,
        marginTop: 60,
        marginBottom: 40,
      },
      5: {
        level: 5,
        defaultLayoutMode: 'inline_2col',
        allowedLayoutModes: ['inline_2col', 'side_note'],
        font: { family: ['David', 'serif'], size: 11.5, weight: 400 },
        alwaysNewPage: false,
        marginTop: 40,
        marginBottom: 25,
      },
      6: {
        level: 6,
        defaultLayoutMode: 'inline_2col',
        allowedLayoutModes: ['inline_2col', 'side_note'],
        font: { family: ['Noto Serif Hebrew', 'serif'], size: 10.5, weight: 400 },
        alwaysNewPage: false,
        marginTop: 30,
        marginBottom: 20,
      },
      7: {
        level: 7,
        defaultLayoutMode: 'side_note',
        allowedLayoutModes: ['side_note'],
        font: { family: ['Hadassah Friedlaender', 'serif'], size: 6, weight: 400, color: '#404040' },
        alwaysNewPage: false,
        marginTop: 0,
        marginBottom: 0,
      },
    },
    dropWordMode: 'sunken',
    dropWordCount: 1,
    dropWordMinLines: 3,
    dropWordFont: { family: ['FrankReal', 'David Libre', 'serif'], size: '1.5em', weight: 900, lineHeight: 0.85 },
    dibburHamatchil: {
      enabled: true,
      terminators: ['.', '-', '–', '—'],
      font: { family: ['Frank Ruhl Libre', 'serif'], size: 12, weight: 700 },
    },
  },

  notes: {
    footnoteDelimiters: ['[', ']'],
    endnotePrefix: 'הערת סיום -',
    numberingStyle: 'hebrew-letters',
    bodyMarkerStyle: 'superscript',
    bodyMarkerSize: 12,
    noteMarkerSize: 8,
    dividerStyle: 'short-right-30',
    columnCount: 1,
    counterReset: 'siman',
  },

  quality: {
    preventWidow: true,
    preventOrphan: true,
    strictness: 'normal',
    balanceChapterEnd: true,
    preventHangingHeadings: true,
    preventOverflow: true,
  },

  runningHeader: {
    rightAlign: 'right',
    centerAlign: 'center',
    leftAlign: 'left',
    widthDistribution: [40, 20, 40],
    alternating: true,
    halfHalfBookName: false,
    rightContent: 'book-name',
    centerContent: 'chapter-name',
    leftContent: 'page-number',
    simanOnly: false,
    h2WithNumber: true,
  },

  toc: {
    generalLevels: [1, 2, 3, 4, 5, 6],
    detailedLevels: [2, 3, 4, 5, 6],
    inlineGrouping: true,
    countNumbering: true,
    fontsByLevel: {},
  },

  grid: {
    columnWidth: 40,
    marginWidth: 10,
    gutterWidth: 2,
    interColumnGap: 0,
    topMargin: 10,
    bottomMargin: 10,
    h2TopMargin: 30,
    columnDivider: 'none',
    pageNumberPosition: 'bottom-center',
    pageNumberStart: 1,
    pageNumberFormat: 'hebrew-letter',
    pageNumberFrame: 'none',
  },

  customStyles: [],
  customPages: [],

  pageSize: A4,
  pageOrientation: 'portrait',
  pageMargins: { top: 25, bottom: 25, inner: 25, outer: 25 },
  bleed: 0,
  cropMarks: false,
};
