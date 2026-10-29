import { useDocumentStore } from '../../store/document-store';
import { useSettingsStore } from '../../store/settings-store';
import { useMemo, useRef } from 'react';
import { useEditorPreviewSync } from '../../hooks/useEditorPreviewSync';

export function TextEditor() {
  const rawText = useDocumentStore((s) => s.rawText);
  const setText = useDocumentStore((s) => s.setText);
  const pages = useDocumentStore((s) => s.lastRenderedPages);
  const markPending = useSettingsStore((s) => s.markPending);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // סנכרון עורך↔תצוגה
  useEditorPreviewSync(textareaRef, previewRef);

  const pageBreakLines = useMemo(() => {
    if (!pages || pages.length <= 1 || !rawText) return [];
    const lines = rawText.split('\n');
    const linesPerPage = Math.ceil(lines.length / pages.length);
    const breaks: number[] = [];
    for (let i = 1; i < pages.length; i++) {
      breaks.push(i * linesPerPage);
    }
    return breaks;
  }, [pages, rawText]);

  const displayText = useMemo(() => {
    if (pageBreakLines.length === 0) return rawText;
    const lines = rawText.split('\n');
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
  }, [rawText, pageBreakLines]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cleaned = value.replace(/\n--- עמוד \d+ ---\n/g, '\n');
    setText(cleaned);
    markPending();
  };

  return (
    <textarea
      ref={textareaRef}
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
