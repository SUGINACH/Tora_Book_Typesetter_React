import { useEffect, useRef } from 'react';
import { useDocumentStore } from '../store/document-store';

/**
 * סנכרון דו-כיווני: עורך ↔ תצוגה.
 *
 * 1. קליק על עמוד בתצוגה → גלילת עורך לטקסט המתאים
 * 2. מיקום סמן בעורך → סימון העמוד הנוכחי בתצוגה
 */
export function useEditorPreviewSync(
  textareaRef: React.RefObject<HTMLTextAreaElement>,
  previewRef: React.RefObject<HTMLDivElement>
) {
  const pages = useDocumentStore((s) => s.lastRenderedPages);
  const rawText = useDocumentStore((s) => s.rawText);
  const lastScrollSource = useRef<'editor' | 'preview' | null>(null);

  // 1. קליק על עמוד בתצוגה → גלילת עורך
  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || !pages || pages.length === 0) return;

    const handlePageClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const pageEl = target.closest('.tora-page, [data-page]') as HTMLElement;
      if (!pageEl) return;

      const pageNum = parseInt(pageEl.dataset.page || '1', 10);
      if (isNaN(pageNum)) return;

      // חישוב מיקום משוער בטקסט
      const textarea = textareaRef.current;
      if (!textarea || !rawText) return;

      const lines = rawText.split('\n');
      const linesPerPage = Math.max(1, Math.ceil(lines.length / Math.max(1, pages.length)));
      const targetLine = Math.min((pageNum - 1) * linesPerPage, lines.length - 1);
      const charPos = lines.slice(0, targetLine).join('\n').length;

      lastScrollSource.current = 'preview';
      textarea.focus();
      textarea.setSelectionRange(charPos, charPos);

      // גלילת הtextarea למיקום
      const lineHeight = 20; // גובה שורה משוער
      textarea.scrollTop = targetLine * lineHeight;
    };

    preview.addEventListener('click', handlePageClick);
    return () => preview.removeEventListener('click', handlePageClick);
  }, [pages, rawText, textareaRef, previewRef]);

  // 2. מיקום סמן בעורך → עדכון עמוד נוכחי בתצוגה
  useEffect(() => {
    const textarea = textareaRef.current;
    const preview = previewRef.current;
    if (!textarea || !preview || !pages || pages.length === 0 || !rawText) return;

    let scrollTimer: number | null = null;

    const handleSelect = () => {
      if (lastScrollSource.current === 'preview') {
        lastScrollSource.current = null;
        return;
      }

      const pos = textarea.selectionStart;
      const linesBefore = rawText.substring(0, pos).split('\n').length;
      const totalLines = rawText.split('\n').length;
      const linesPerPage = Math.max(1, Math.ceil(totalLines / Math.max(1, pages.length)));
      const currentPage = Math.min(Math.ceil(linesBefore / linesPerPage), pages.length);

      // גלילת התצוגה לעמוד הנוכחי
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        lastScrollSource.current = 'editor';
        const pageEl = preview.querySelector(`[data-page="${currentPage}"]`) as HTMLElement;
        if (pageEl) {
          pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    };

    textarea.addEventListener('select', handleSelect);
    textarea.addEventListener('click', handleSelect);
    return () => {
      textarea.removeEventListener('select', handleSelect);
      textarea.removeEventListener('click', handleSelect);
    };
  }, [pages, rawText, textareaRef, previewRef]);
}
