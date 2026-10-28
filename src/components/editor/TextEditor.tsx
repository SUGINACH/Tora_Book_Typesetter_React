import { useDocumentStore } from '../../store/document-store';
import { useSettingsStore } from '../../store/settings-store';
import { useMemo } from 'react';

export function TextEditor() {
  const rawText = useDocumentStore((s) => s.rawText);
  const setText = useDocumentStore((s) => s.setText);
  const pages = useDocumentStore((s) => s.lastRenderedPages);
  const markPending = useSettingsStore((s) => s.markPending);

  // חישוב מיקומי מעברי עמוד בטקסט — על בסיס מספר העמודים
  const pageBreakLines = useMemo(() => {
    if (!pages || pages.length <= 1 || !rawText) return [];
    // הערכה גסה: חלוקת הטקסט למספר חלקים שווה פחות או עוד פחות
    const lines = rawText.split('\n');
    const linesPerPage = Math.ceil(lines.length / pages.length);
    const breaks: number[] = [];
    for (let i = 1; i < pages.length; i++) {
      breaks.push(i * linesPerPage);
    }
    return breaks;
  }, [pages, rawText]);

  // רינדור הטקסט עם חוצצים
  const renderWithBreaks = (text: string) => {
    if (pageBreakLines.length === 0) return text;
    const lines = text.split('\n');
    const result: string[] = [];
    let breakIdx = 0;

    for (let i = 0; i < lines.length; i++) {
      result.push(lines[i]!);
      if (breakIdx < pageBreakLines.length && i === pageBreakLines[breakIdx]) {
        result.push(`\n--- עמוד ${breakIdx + 2} ---\n`);
        breakIdx++;
      }
    }
    return result.join('\n');
  };

  const displayText = pageBreakLines.length > 0 ? renderWithBreaks(rawText) : rawText;

  // טיפול בשינוי — מסיר חוצצים לפני שמירה
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    // הסרת חוצצים (שורות שמתחילות ב- ---)
    const cleaned = value.replace(/\n--- עמוד \d+ ---\n/g, '\n');
    setText(cleaned);
    markPending();
  };

  // גלילה לעמוד ספציפי (כאשר לוחצים על עמוד בתצוגה)
  // TODO: ימומש כאשר נקבל אירוע גלילה מ-PreviewArea

  return (
    <textarea
      value={displayText}
      onChange={handleChange}
      dir="rtl"
      placeholder="הדביקו טקסט כאן..."
      className="w-full h-full p-3 font-mono text-sm resize-none focus:outline-none border-0 bg-white"
      style={{ minHeight: '400px' }}
      spellCheck={false}
    />
  );
}
