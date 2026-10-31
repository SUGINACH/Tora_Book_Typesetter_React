import type { BookMetadata } from '../types';

const METADATA_FIELDS: ReadonlyArray<{ key: keyof BookMetadata; patterns: RegExp[] }> = [
  { key: 'bookName', patterns: [/^שם הספר\s*[-:]\s*(.+)$/i] },
  { key: 'subject', patterns: [/^נושא(?:\/.+)?\s*[-:]\s*(.+)$/i] },
  { key: 'detailedSubject', patterns: [/^נושא מפורט(?:\/.+)?\s*[-:]\s*(.+)$/i] },
  { key: 'editionDetails', patterns: [/^פרטי מהדורא(?:\/.+)?\s*[-:]\s*(.+)$/i] },
  { key: 'authorName', patterns: [/^שם המחבר\s*[-:]\s*(.+)$/i] },
  { key: 'placeAndYear', patterns: [/^מקום ושנת הוצאה\s*[-:]\s*(.+)$/i] },
  { key: 'copyright', patterns: [/^שמירת זכויות\s*[-:]\s*(.+)$/i] },
  { key: 'publisherDetails', patterns: [/^פרטי הוצאה לאור\s*[-:]\s*(.+)$/i] },
  { key: 'contactDetails', patterns: [/^פרטי קשר\s*[-:]\s*(.+)$/i] },
  { key: 'additionalDetails', patterns: [/^פרטים נוספים\s*[-:]\s*(.+)$/i] },
];

/**
 * פירסור metadata מפתיח הספר.
 *
 * מזוהה רק בתחילת המסמך (לפני הכותרת הראשונה).
 * שורה ריקה אחרי הפתיח מסמלת את סיום בלוק ה-metadata.
 */
export function parseMetadata(
  lines: string[]
): { metadata: Partial<BookMetadata>; lines: string[] } {
  const metadata: Partial<BookMetadata> = {};
  let firstHeadingIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed.match(/^כותרת\s+\d+/)) {
      firstHeadingIdx = i;
      break;
    }

    for (const field of METADATA_FIELDS) {
      for (const pattern of field.patterns) {
        const match = trimmed.match(pattern);
        if (match) {
          (metadata as Record<string, unknown>)[field.key] = match[1]!.trim();
          break;
        }
      }
    }
  }

  if (firstHeadingIdx === -1) firstHeadingIdx = lines.length;

  // הסרת שורות metadata והשורה הריקה אחריהן
  let endIdx = firstHeadingIdx;
  while (endIdx > 0 && lines[endIdx - 1]!.trim() === '') {
    endIdx--;
  }

  return {
    metadata,
    lines: lines.slice(endIdx),
  };
}
