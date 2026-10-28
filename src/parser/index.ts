import { parseMetadata } from './metadata-parser';
import { parseFootnotes } from './footnote-parser';
import { parseEndnotes } from './endnote-parser';
import { parseSidenotes } from './sidenote-parser';
import { parseEditorialNotes } from './editorial-note-parser';
import { applyCustomStyles } from './custom-style-parser';
import { buildAst } from './ast-builder';
import { fnv1a32 } from '../worker/inputs/fnv-hash';
import type { ParsedDocument, Settings, NoteRules } from '../types';

/**
 * פונקציה ראשית של ה-parser — טהורה.
 * מקבלת טקסט והגדרות, מחזירה ParsedDocument.
 */
export function parseDocument(text: string, settings: Settings): ParsedDocument {
  const sourceHash = fnv1a32(text);
  let lines = text.split('\n');

  // 1. פירסור metadata
  const { metadata, lines: linesAfterMeta } = parseMetadata(lines);
  lines = linesAfterMeta;

  // 2. הסרת הערות עריכה (##...##)
  lines = parseEditorialNotes(lines);

  // 3. פירסור הערות צד (H7) — מזהה ומסיר
  const { lines: linesAfterSide, sidenotes } = parseSidenotes(lines);
  lines = linesAfterSide;

  // 4. פירסור הערות סיום — מזהה ומחליף ב-placeholder
  const noteRules: NoteRules = settings?.notes ?? {
    footnoteDelimiters: ['[', ']'],
    endnotePrefix: 'הערת סיום -',
    numberingStyle: 'hebrew-letters',
    bodyMarkerStyle: 'superscript',
    bodyMarkerSize: 12,
    noteMarkerSize: 8,
    dividerStyle: 'short-right-30',
    columnCount: 1,
    counterReset: 'siman',
  };
  const { lines: linesAfterEnd, endnotes } = parseEndnotes(lines, noteRules.endnotePrefix);
  lines = linesAfterEnd;

  // 5. פירסור הערות שוליים [ ... ] — מזהה ומחליף ב-placeholder
  const joined = lines.join('\n');
  const { text: textWithoutFootnotes, footnotes } = parseFootnotes(
    joined,
    noteRules.footnoteDelimiters
  );
  lines = textWithoutFootnotes.split('\n');

  // 6. החלת סגנונות מותאמים אישית
  const customStyles = settings?.customStyles ?? [];
  const { lines: linesAfterCustom, matches: customMatches } = applyCustomStyles(
    lines,
    customStyles
  );
  lines = linesAfterCustom;

  // 7. בניית AST
  const doc = buildAst(lines, metadata, footnotes, endnotes, sidenotes, sourceHash);
  doc.noteRules = noteRules;
  doc.customStyles = customStyles;

  return doc;
}

// Re-exports של פונקציות פנימיות לבדיקות
export { parseHeading } from './header-parser';
export { parseFootnotes } from './footnote-parser';
export { parseEndnotes } from './endnote-parser';
export { parseSidenotes } from './sidenote-parser';
export { parseEditorialNotes } from './editorial-note-parser';
export { parseMetadata } from './metadata-parser';
export { applyCustomStyles, findInlineMarkers } from './custom-style-parser';
export { findMatchingCloseBracket } from './nested-bracket-matcher';
export { buildAst } from './ast-builder';
export { fnv1a32 } from '../worker/inputs/fnv-hash';
