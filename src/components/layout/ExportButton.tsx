/**
 * ExportButton.tsx — פעולת הייצוא של המעטפת (שלב 86; אפיון §15.1).
 *
 * מחליף את כפתור ההדפסה: אין עוד window.print ואין עוד היטל מה-DOM החי.
 * הייצוא נבנה כולו מה־IR הקפוא ב-resultStore דרך הרנדרר הטהור
 * (buildExportHtml ← @tora/render-html) עם הגופנים מהצרור החי —
 * ביט-ביט אותן תוצאות כמו ה-CLI על אותו קלט (§15.1).
 *
 * הפעלה חוזרת של הייצוא לא מזיזה אף אות בספר ואינה מריצה עימוד:
 * היטל בלבד (אין job, אין שינוי layoutHash) — נעול בבדיקות השלב.
 */
import { useCallback } from 'react';
import { useLayoutIr, useResultSourceText, useDocumentName, useRunPhase } from '../../stores/selectors.js';
import { peekUiRuntime } from '../../worker-host/ui-runtime.js';
import { buildExportHtml, browserDownloadTransport, exportFileNameOf } from '../../worker-host/export-html.js';

const ACTIVE_PHASES = new Set(['preparing', 'running', 'auditing']);

export function ExportButton() {
  const phase = useRunPhase();
  const ir = useLayoutIr();
  const sourceAtRun = useResultSourceText();
  const documentName = useDocumentName();

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
      title="ייצוא HTML עצמאי מה-IR — מסלול הייצוא הסמכותי (§15.1; אין window.print)"
    >
      📄 ייצוא HTML
    </button>
  );
}
