/**
 * ImportInsights.tsx — מפת שגיאות הקלט וסקירת המסמך (שלב 80; אפיון §3.3, §13–14).
 *
 * מה מוצג כאן — כל מה שהפרסר הנעול ראה במקור, במיקום הנכון:
 *   1. כישלון מתאם חולף (פורמט/קריאה) — המסמך לא הוחלף.
 *   2. שגיאת פרסור חוסמת — קוד קטלוגי מתורגם + שורה:עמודה + שורת
 *      המקור; הריצה נחסמה לפני שליחת job (שלב 80 ב-use-typeset-run).
 *   3. סקירת מסמך — metadata, ארבעת זרמי ההערות, סימנים וחלקים.
 *   4. מפת שגיאות — כל דיאגנוסטיקה ואזהרת ייבוא עם מיקום; לחיצה בוחרת
 *      את הטווח בעורך (viewStore.focus.sourceSpan → TextEditor) — זו
 *      "ההדגשה במקור": הטקסט המקורי נבחר ונגלל אליו.
 *
 * טריות: המפה נחתמת למהדורה שנותחה (analyzedRevision); עריכה מאוחרת
 * מציגה "איננה עדכנית" עד הריצה הבאה — עוגן stale ללא שעון (שלב 76).
 *
 * התפר המוסכם (שלב 78): הרכיב אינו מייבא חבילות @tora — הכול דרך
 * ה-stores וקטלוג ה-i18n; אין message גולם (§16).
 */
import { useAnalysisIsStale, useImportAnalysis, useImportIssue } from '../../stores/selectors.js';
import { useViewStore, type ViewFocus } from '../../stores/view-store.js';
import { formatIssueLabel, OVERVIEW_LABELS as L } from '../../i18n/import-labels.js';
import type { LocatedIssue } from '../../stores/source-analysis.js';

/** מיקום לתצוגה — "שורה X, עמודה Y"; בלי מיקום ⇐ "ללא מיקום". */
function locationText(issue: LocatedIssue): string {
  if (issue.start === null) return L.noLocation;
  return L.lineColumn.replace('{line}', String(issue.start.line)).replace('{column}', String(issue.start.column));
}

/** שורת המקור עם הטווח החשוד מסומן (עמודות UTF-16 — כמו המיקום). */
function LineExcerpt({ issue }: { readonly issue: LocatedIssue }): JSX.Element | null {
  if (issue.lineText === null || issue.startUtf16 === null) return null;
  // עמודת הפתיחה בתוך השורה (0-based, UTF-16)
  const lineStartOffset = issue.startUtf16 - ((issue.start?.column ?? 1) - 1);
  const from = Math.max(0, issue.startUtf16 - lineStartOffset);
  const to = issue.endUtf16 !== null ? Math.max(from, Math.min(issue.lineText.length, issue.endUtf16 - lineStartOffset)) : from + 1;
  if (from >= issue.lineText.length) return null;
  return (
    <code className="block text-[11px] leading-4 bg-gray-50 border border-gray-100 rounded px-1 py-0.5 font-mono break-all" dir="rtl">
      {issue.lineText.slice(0, from)}
      <mark className="bg-yellow-200 rounded-sm px-0.5">{issue.lineText.slice(from, to) || ' '}</mark>
      {issue.lineText.slice(to)}
    </code>
  );
}

/** שורת בעיה אחת — לחיצה בוחרת את הטווח בעורך. */
function IssueRow({ issue, index }: { readonly issue: LocatedIssue; readonly index: number }): JSX.Element {
  const setFocus = useViewStore((s) => s.setFocus);
  const hasSpan = issue.startUtf16 !== null;
  const onSelect = (): void => {
    if (!hasSpan) return;
    const focus: ViewFocus = {
      pane: 'source',
      sourceSpan: { startUtf16: issue.startUtf16 as number, endUtf16: issue.endUtf16 ?? (issue.startUtf16 as number) + 1 },
    };
    setFocus(focus);
  };
  const isError = issue.severity === 'error';
  return (
    <li
      className={`rounded border px-2 py-1 text-[11px] space-y-1 ${isError ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'} ${hasSpan ? 'cursor-pointer hover:border-blue-300' : ''}`}
      data-testid={`insight-issue-${index}`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-1">
        <span aria-hidden className={isError ? 'text-red-600' : 'text-amber-600'}>{isError ? '✖' : '⚠'}</span>
        <span className="flex-1 break-words">{formatIssueLabel(issue.code, issue.params)}</span>
        <span className="text-gray-500 shrink-0" title={issue.code}>{locationText(issue)}</span>
      </div>
      <LineExcerpt issue={issue} />
      <div className="text-[9px] text-gray-400 font-mono" dir="ltr">{issue.code}</div>
    </li>
  );
}

export function ImportInsights(): JSX.Element | null {
  const analysis = useImportAnalysis();
  const importIssue = useImportIssue();
  const stale = useAnalysisIsStale();
  const setFocus = useViewStore((s) => s.setFocus);

  const focusIssue = (issue: LocatedIssue): void => {
    if (issue.startUtf16 === null) return;
    setFocus({
      pane: 'source',
      sourceSpan: { startUtf16: issue.startUtf16, endUtf16: issue.endUtf16 ?? issue.startUtf16 + 1 },
    });
  };

  if (analysis === null && importIssue === null) return null;
  const overview = analysis?.overview ?? null;
  const issues = analysis?.issues ?? [];

  return (
    <div className="border-b border-gray-200 bg-gray-50/60" data-testid="import-insights">
      <div className="px-2 py-1 flex items-center justify-between">
        <span className="text-[11px] font-medium text-gray-600">{L.issuesTitle}</span>
        {stale && (
          <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded" data-testid="insights-stale">
            {L.staleNotice}
          </span>
        )}
      </div>

      <div className="px-2 pb-2 space-y-2 max-h-56 overflow-auto">
        {/* כישלון מתאם — המסמך לא הוחלף; שום דבר לא נזרק בשקט */}
        {importIssue !== null && (
          <div className="rounded border border-red-300 bg-red-50 px-2 py-1.5 space-y-1" data-testid="insights-import-failure">
            <div className="flex items-start gap-1 text-[11px] text-red-800">
              <span aria-hidden>✖</span>
              <span className="flex-1 break-words">{formatIssueLabel(importIssue.code, importIssue.params)}</span>
            </div>
            <div className="text-[9px] text-red-400 font-mono" dir="ltr">{importIssue.code}</div>
          </div>
        )}

        {/* שגיאת פרסור חוסמת — הריצה לא נשלחה; לחיצה מדגישה את המקום בעורך */}
        {analysis?.parseError != null && (
          <div
            className="rounded border border-red-300 bg-red-50 px-2 py-1.5 space-y-1 cursor-pointer hover:border-blue-300"
            data-testid="insights-parse-error"
            onClick={() => {
              focusIssue(analysis.parseError as LocatedIssue);
            }}
          >
            <div className="text-[11px] font-medium text-red-800">{L.parseErrorTitle}</div>
            <div className="flex items-start gap-1 text-[11px] text-red-800">
              <span aria-hidden>✖</span>
              <span className="flex-1 break-words">{formatIssueLabel(analysis.parseError.code, analysis.parseError.params)}</span>
              <span className="text-gray-600 shrink-0">{locationText(analysis.parseError)}</span>
            </div>
            <LineExcerpt issue={analysis.parseError} />
            <div className="text-[9px] text-red-400 font-mono" dir="ltr">{analysis.parseError.code}</div>
          </div>
        )}

        {/* סקירת המסמך — metadata, זרמי הערות, מבנה */}
        {overview !== null && (
          <div className="rounded border border-gray-200 bg-white px-2 py-1.5 space-y-1" data-testid="insights-overview">
            <div className="text-[11px] font-medium text-gray-600">{L.overviewTitle}</div>
            {overview.metadata.length > 0 && (
              <dl className="text-[11px] space-y-0.5">
                {overview.metadata.slice(0, 6).map((m, i) => (
                  <div key={m.key} className="flex gap-1" data-testid={`insight-metadata-${i}`}>
                    <dt className="text-gray-500 shrink-0">{m.key}:</dt>
                    <dd className="text-gray-800 break-words">{m.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="text-[10px] text-gray-600 flex flex-wrap gap-x-2 gap-y-0.5" data-testid="insights-notes">
              <span>{L.notesFootnotes} {overview.notes.footnotes}</span>
              <span>{L.notesEndnotes} {overview.notes.endnotes}</span>
              <span>{L.notesSidenotes} {overview.notes.sidenotes}</span>
              <span>{L.notesEditorial} {overview.notes.editorial}</span>
              <span>{L.simanim} {overview.simanim}</span>
              <span>{L.parts} {overview.parts}</span>
            </div>
          </div>
        )}

        {/* מפת השגיאות */}
        {issues.length > 0 && (
          <ul className="space-y-1" data-testid="insights-issues">
            {issues.map((issue, i) => (
              <IssueRow key={`${issue.code}:${issue.startUtf16 ?? 'x'}:${i}`} issue={issue} index={i} />
            ))}
          </ul>
        )}

        {/* מסמך נקי — נטען ונותח בלי בעיות */}
        {analysis !== null && analysis.parseError === null && issues.length === 0 && importIssue === null && (
          <div className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1" data-testid="insights-clean">
            ✓ {L.emptyClean}
          </div>
        )}
      </div>
    </div>
  );
}
