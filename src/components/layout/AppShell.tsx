/**
 * AppShell.tsx — המעטפת הראשית של ה־UI החדש (שלב 77; אפיון §12–13).
 *
 * כל העימוד עובר ב־Worker (useTypesetRun → TypesetController →
 * WorkerClient) — **אין מסלול typeset סינכרוני בחוט הראשי** (§12.1).
 * המצב מגיע מחמשת ה־stores (שלב 76) דרך הבוררים הצרים בלבד; התצוגה
 * היא היטל של ה־IR (LayoutPreview, שלב 36) — לא HTML מוזרק.
 *
 * לוח ההגדרות (שלב 78; §13.3): SettingsPanel הנגול כולו מה־Setting
 * Registry — מוצג כסרגל צד מתקפל; מצב פתיחה/סגירה הוא מצב חולף של
 * הרכיב (אינו נשמר ואינו נכנס ל־stores/configHash).
 */
import { useState } from 'react';
import { useDocumentName, useFindings, useIsDirty, useLayoutHash, useLayoutIr, useRawText, useRunPhase, useRunProgress } from '../../stores/selectors.js';
import { useTypesetRun } from '../../worker-host/use-typeset-run.js';
import { ImportButtons } from '../editor/ImportButtons';
import { ImportInsights } from '../editor/ImportInsights';
import { AuditFindings } from '../audit/AuditFindings';
import { TextEditor } from '../editor/TextEditor';
import { SettingsPanel } from '../settings/SettingsPanel';
import { PreviewArea } from './PreviewArea';

const ACTIVE_PHASES = new Set(['preparing', 'running', 'auditing']);

export function AppShell() {
  const { run, cancel } = useTypesetRun();
  const phase = useRunPhase();
  const progress = useRunProgress();
  const rawText = useRawText();
  const dirty = useIsDirty();
  const documentName = useDocumentName();
  const layoutHash = useLayoutHash();
  const findings = useFindings();
  const ir = useLayoutIr();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isRunning = ACTIVE_PHASES.has(phase);
  const hasSource = rawText !== '';

  return (
    <div className="h-screen flex flex-col bg-gray-100" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between shrink-0">
        <h1 className="text-xl font-bold">📖 מערכת עימוד ספרים תורניים</h1>
        <div className="flex items-center gap-3 text-sm">
          {documentName !== '' && <span className="text-gray-500 text-xs">{documentName}</span>}
          {layoutHash !== null && <span className="text-gray-500 text-xs">hash: {layoutHash.slice(0, 8)}</span>}
          {findings.length > 0 && (
            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">
              {findings.length} ממצאים
            </span>
          )}
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className={`px-2 py-1 rounded text-xs border ${settingsOpen ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            data-testid="toggle-settings"
            aria-pressed={settingsOpen}
          >
            ⚙ הגדרות
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Panel */}
        <div className="w-64 bg-white border-l border-gray-200 flex flex-col shrink-0">
          <div className="p-2 border-b border-gray-200">
            <ImportButtons />
          </div>
          {/* מפת שגיאות הקלט וסקירת המסמך — שלב 80 (§3.3, §13–14) */}
          <ImportInsights />
          {/* ממצאי ה-Audit והניווט אליהם — שלב 82 (§13–14) */}
          <AuditFindings />
          <div className="flex-1 overflow-auto">
            <TextEditor />
          </div>
          <div className="p-2 border-t border-gray-200 space-y-2">
            <button
              onClick={() => {
                void run();
              }}
              disabled={isRunning || !hasSource}
              className={`w-full px-4 py-2 rounded text-sm font-medium ${
                dirty ? 'bg-orange-500 text-white' : 'bg-blue-500 text-white'
              } ${isRunning || !hasSource ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'}`}
              data-testid="run-typeset"
            >
              {isRunning
                ? `⚡ ${phase}${progress !== null ? ` — ${progress.stage} ${progress.completedUnits}` : ''}`
                : '⚡ עדכן ועמד מחדש'}
            </button>
            {isRunning && (
              <button
                onClick={cancel}
                className="w-full px-4 py-2 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                data-testid="cancel-typeset"
              >
                ✕ בטל ריצה
              </button>
            )}
            <button
              onClick={() => window.print()}
              disabled={isRunning || ir === null}
              className="w-full px-3 py-2 bg-gray-200 rounded text-xs disabled:opacity-50"
            >
              📄 הדפסה / PDF
            </button>
          </div>
        </div>

        {/* Preview Area — היטל של ה־IR מ־resultStore */}
        <PreviewArea />

        {/* לוח ההגדרות — נגול מהמרשם (שלב 78) */}
        {settingsOpen && <SettingsPanel />}
      </div>
    </div>
  );
}
