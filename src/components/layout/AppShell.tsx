import { useDocumentStore } from '../../store/document-store';
import { useTypesetter, useHasPendingChanges } from '../../hooks/useTypesetter';
import { useWorkerStore } from '../../store/worker-store';
import { useSettings } from '../../hooks/useTypesetter';
import { ImportButtons } from '../editor/ImportButtons';
import { TextEditor } from '../editor/TextEditor';
import { PreviewArea } from './PreviewArea';
import { SettingsSidebar } from '../settings/SettingsSidebar';
import { downloadHtml } from '../../lib/html-exporter';

export function AppShell() {
  const typeset = useTypesetter();
  const settings = useSettings();
  const workerStatus = useWorkerStore((s) => s.status);
  const percent = useWorkerStore((s) => s.percent);
  const message = useWorkerStore((s) => s.message);
  const hasPending = useHasPendingChanges();
  const findings = useDocumentStore((s) => s.lastFindings);
  const outputHash = useDocumentStore((s) => s.lastOutputHash);
  const pages = useDocumentStore((s) => s.lastRenderedPages);
  const rawText = useDocumentStore((s) => s.rawText);

  const isRunning = workerStatus === 'running';

  const handleExportHtml = () => {
    if (!pages || pages.length === 0) {
      alert('אין עמודים לייצוא. הדביקו טקסט ולחצו "עדכן ועמד מחדש" תחילה.');
      return;
    }
    // יצירת doc פשוט לייצוא (ה-parseDocument כבר רץ ב-typeset, אבל אין לנו את ה-doc כאן)
    // לכן ניצור doc פשוט מה-parsed document
    const doc = {
      version: 1 as const,
      metadata: {},
      root: [],
      footnotes: [],
      endnotes: [],
      sidenotes: [],
      noteRules: settings.notes,
      customStyles: settings.customStyles,
      sourceHash: outputHash ?? '',
    };
    downloadHtml(pages, settings, doc);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shrink-0">
        <h1 className="text-xl font-bold">📖 מערכת עימוד ספרים תורניים</h1>
        <div className="flex items-center gap-3 text-sm">
          {outputHash && (
            <span className="text-gray-500 text-xs">hash: {outputHash.slice(0, 8)}</span>
          )}
          {findings.length > 0 && (
            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">
              {findings.length} ממצאים
            </span>
          )}
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Panel */}
        <div className="w-64 bg-white border-l border-gray-200 flex flex-col shrink-0">
          <div className="p-2 border-b border-gray-200">
            <ImportButtons />
          </div>
          <div className="flex-1 overflow-auto">
            <TextEditor />
          </div>
          <div className="p-2 border-t border-gray-200 space-y-2">
            <button
              onClick={typeset}
              disabled={isRunning}
              className={`w-full px-4 py-2 rounded text-sm font-medium ${
                hasPending
                  ? 'bg-orange-500 text-white animate-pulse'
                  : 'bg-blue-500 text-white'
              } ${isRunning ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'}`}
            >
              {isRunning ? `⚡ ${percent}% — ${message ?? ''}` : '⚡ עדכן ועמד מחדש'}
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                disabled={isRunning}
                className="flex-1 px-3 py-2 bg-gray-200 rounded text-xs"
              >
                📄 PDF
              </button>
              <button
                onClick={handleExportHtml}
                disabled={isRunning || !pages}
                className="flex-1 px-3 py-2 bg-gray-200 rounded text-xs disabled:opacity-50"
              >
                💾 HTML
              </button>
            </div>
          </div>
        </div>

        {/* Settings Sidebar */}
        <SettingsSidebar />

        {/* Preview Area */}
        <PreviewArea />
      </div>
    </div>
  );
}
