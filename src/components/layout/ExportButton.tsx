/**
 * ExportButton.tsx — פעולת הייצוא של המעטפת (שלב 86–87; אפיון §15.1–15.2).
 *
 * החלף את כפתור ההדפסה (window.print) בהיטל HTML טהור מה־IR הקפוא
 * שב-resultStore — ביט-ביט כמו ה-CLI על אותו קלט. הגופנים מהצרור
 * החי (asset-bundle) מוטמעים כ-data URI — הקובץ עומד לבדו offline.
 *
 * התפר (§5): הקומפוננטה אינה נוגעת בחבילות — כל הלוגיקה ב־worker-host/
 * export-html.ts; כאן רק חיווט ה-UI. אין היטל מה-DOM החי; אין מדידה;
 * אין job חדש (layoutHash ללא שינוי).
 */
import { useCallback } from 'react';
import { useLayoutIr, useResultSourceText, useDocumentName, useRunPhase, useLocale } from '../../stores/selectors.js';
import { messagesOf, t as translate, dirOf } from '../../i18n/index.js';
import { peekUiRuntime } from '../../worker-host/ui-runtime.js';
import { buildExportHtml, browserDownloadTransport, exportFileNameOf } from '../../worker-host/export-html.js';

const ACTIVE_PHASES = new Set(['preparing', 'running', 'auditing']);

export function ExportButton() {
  const phase = useRunPhase();
  const ir = useLayoutIr();
  const sourceAtRun = useResultSourceText();
  const documentName = useDocumentName();
  const locale = useLocale();
  const m = messagesOf(locale);

  const onExport = useCallback(() => {
    if (ir === null || sourceAtRun === null) return;
    const runtime = peekUiRuntime();
    if (runtime === null) return;
    const built = buildExportHtml({ ir, source: sourceAtRun, bundle: { fonts: runtime.bundle.fonts } });
    const blob = new Blob([built.html], { type: 'text/html;charset=utf-8' });
    const base = documentName !== '' ? documentName.replace(/\.[^.]*$/, '') : '';
    browserDownloadTransport(blob, exportFileNameOf(base || 'tora-book'));
  }, [ir, sourceAtRun, documentName]);

  const disabled = ACTIVE_PHASES.has(phase) || ir === null || sourceAtRun === null;
  return (
    <button
      onClick={onExport}
      disabled={disabled}
      className="w-full px-3 py-2 bg-gray-200 rounded text-xs disabled:opacity-50"
      data-testid="export-html"
      title={translate(m, "app.export.title")}
    >
      {translate(m, 'app.export.label')}
    </button>
  );
}
