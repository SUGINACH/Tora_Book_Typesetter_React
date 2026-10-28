import type { ParsedDocument, ParsedNode, BookMetadata, HeadingLevel } from '../types';
import { parseHeading } from './header-parser';
import type { ParsedFootnote, ParsedEndnote, ParsedSidenote } from '../types';

/**
 * בניית AST מתוך רשימת שורות מעובדות.
 * מאחד שורות רצופות לפסקאות, ומזהה כותרות.
 *
 * שורה ריקה מפרידה בין פסקאות.
 * כותרת (H0-H6) פותחת בלוק חדש עם children.
 */
export function buildAst(
  lines: string[],
  metadata: Partial<BookMetadata>,
  footnotes: ParsedFootnote[] = [],
  endnotes: ParsedEndnote[] = [],
  sidenotes: ParsedSidenote[] = [],
  sourceHash: string = ''
): ParsedDocument {
  const root: ParsedNode[] = [];
  let currentParagraph: string[] = [];
  let currentHeading: ParsedNode | null = null;
  let sidenoteIdx = 0;

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      const text = currentParagraph.join(' ').trim();
      if (text) {
        const node: ParsedNode = {
          id: `p-${root.length}-${currentParagraph[0]?.slice(0, 10) ?? ''}`,
          type: 'body',
          text,
          sourceLine: 0, // יתעדכן מאוחר יותר
        };
        if (currentHeading?.children) {
          currentHeading.children.push(node);
        } else {
          root.push(node);
        }
      }
      currentParagraph = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) {
      // שורה ריקה — סיום פסקה
      flushParagraph();
      continue;
    }

    const heading = parseHeading(line);
    if (heading) {
      flushParagraph();

      // הצמדת sidenote לכותרת הבאה
      const attachedSidenotes: ParsedSidenote[] = [];
      while (sidenoteIdx < sidenotes.length && sidenotes[sidenoteIdx]!.sourceLine <= i) {
        attachedSidenotes.push(sidenotes[sidenoteIdx]!);
        sidenoteIdx++;
      }

      currentHeading = {
        id: `h-${root.length}-${i}`,
        type: 'heading',
        text: heading.text,
        sourceLine: i,
        headingLevel: heading.level,
        simanNumber: heading.simanNumber,
        subNumber: heading.subNumber,
        children: [],
      };
      root.push(currentHeading);
    } else {
      // בדיקת סימון מיוחד (footnote/endnote placeholder)
      if (line.startsWith('\u0001CUSTOM:')) {
        // סגנון מותאם אישית — נשמור כבלוק עם marker
        const match = line.match(/\u0001CUSTOM:([^\u0002]+)\u0002(.+)/);
        if (match) {
          const [, styleId, content] = match;
          const node: ParsedNode = {
            id: `c-${root.length}-${i}`,
            type: 'custom',
            text: content!.trim(),
            sourceLine: i,
            customStyleId: styleId,
          };
          if (currentHeading?.children) {
            currentHeading.children.push(node);
          } else {
            root.push(node);
          }
          continue;
        }
      }

      // פסקה רגילה
      currentParagraph.push(line);
    }
  }
  flushParagraph();

  return {
    version: 1,
    metadata,
    root,
    footnotes,
    endnotes,
    sidenotes,
    noteRules: {
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
    customStyles: [],
    sourceHash,
  };
}
