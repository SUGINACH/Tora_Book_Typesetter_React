/**
 * AuditFindings.tsx — פאנל ממצאי ה-Audit והניווט אליהם (שלב 82; אפיון §13–14).
 *
 * "כל בעיה סמנטית/גאומטרית גלויה וניתנת לאיתור" — הפאנל מציג את
 * resultStore.findings (חוזה אחיד §14.1: code/severity/messageKey/params/
 * sourceSpans/pageId/actual/expected) עם תווית מתורגמת מקטלוג סגור
 * (audit-labels; §16 — אין message גולם), ומנווט אל הממצא:
 *   • עם sourceSpans ⇐ מוקד מקור — העורך בוחר את הטווח (תשתית שלב 80);
 *     עם pageId נוסף — העמוד נבחר גם הוא (הקשר בפריסה).
 *   • בלי spans עם pageId ⇐ מוקד פריסה + בחירת העמוד.
 *
 * טריות (דוקטרינת שלב 81): ההיסטים בממצאים מתפרשים על המקור שממנו
 * הופקו; אחרי עריכה הם זרים — הניווט מושהה ומוצג סמן "אינם עדכניים"
 * (אין הצגת ישן כחדש; אין מיפוי מטעה על טקסט אחר).
 *
 * שעת השלב — "אין אפשרות למחוק ממצא כדי לעבור שער": ל-store אין כל
 * פעולת הסרה/השתקה של ממצא (רשימה לקריאה בלבד), ולפאנל אין פקד
 * "הסר/התעלם" — רק סינון תצוגתי (הסינון אינו משנה את הממצאים עצמם).
 *
 * התפר נשמר (שלב 78): הקומפוננטה אינה מייבאת @tora — הכול דרך
 * ה-stores וה-i18n המקומי.
 */
import { useMemo, useState } from 'react';
import { useFindings, useRawText, useResultIsCurrent } from '../../stores/selectors.js';
import { useViewStore } from '../../stores/view-store.js';
import type { ViewFocus } from '../../stores/view-store.js';
import type { ResultFinding } from '../../stores/result-store.js';
import { AUDIT_PANEL_LABELS as L, AUDIT_SEVERITY_LABELS, formatAuditLabel } from '../../i18n/audit-labels.js';

type SeverityFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';

const SEVERITY_RANK: Readonly<Record<ResultFinding['severity'], number>> = Object.freeze({ HIGH: 0, MEDIUM: 1, LOW: 2 });
const SEVERITY_BADGE_CLASS: Readonly<Record<ResultFinding['severity'], string>> = Object.freeze({
  HIGH: 'bg-red-100 text-red-800 border-red-300',
  MEDIUM: 'bg-orange-100 text-orange-800 border-orange-300',
  LOW: 'bg-yellow-100 text-yellow-800 border-yellow-300',
});

/** מספר שורה (1-based) במקור הגולמי לפי היסף UTF-16 — כל הזרמים במרחב אחד (שלב 81).
 *  הטיפוס מצומצם מבנית כמו ViewFocus.sourceSpan — הקומפוננטה אינה מייבאת @tora. */
function lineOfSpan(rawText: string, span: { readonly startUtf16: number }): number {
  const clamped = Math.min(span.startUtf16, rawText.length);
  let line = 1;
  for (let i = 0; i < clamped; i += 1) {
    if (rawText.charCodeAt(i) === 10 /* \n */) line += 1;
  }
  return line;
}

/** תווית מיקום — מקור (שורה) ו/או עמוד; ממצא בלי שניהם עדיין ניתן למעקב דרך הקוד. */
function locationText(finding: ResultFinding, rawText: string): string {
  const parts: string[] = [];
  const span = finding.sourceSpans[0];
  if (span !== undefined) parts.push(L.sourceLocation.replace('{line}', String(lineOfSpan(rawText, span))));
  if (finding.pageId !== undefined) parts.push(L.pageLocation.replace('{pageId}', finding.pageId));
  return parts.join(' · ');
}

export function AuditFindings(): JSX.Element | null {
  const findings = useFindings();
  const current = useResultIsCurrent();
  const rawText = useRawText();
  const setFocus = useViewStore((s) => s.setFocus);
  const selectPage = useViewStore((s) => s.selectPage);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');
  const [codeFilter, setCodeFilter] = useState('');

  const counts = useMemo(() => {
    let high = 0;
    let medium = 0;
    let low = 0;
    for (const f of findings) {
      if (f.severity === 'HIGH') high += 1;
      else if (f.severity === 'MEDIUM') medium += 1;
      else low += 1;
    }
    return { high, medium, low };
  }, [findings]);

  // סדר תצוגה: HIGH ← MEDIUM ← LOW; יציב בתוך חומרה (סדר ה־IR נשמר).
  // הסינון תצוגתי בלבד — אינו משנה את רשימת הממצאים ב-store.
  const visible = useMemo(() => {
    const needle = codeFilter.trim().toLowerCase();
    const filtered = findings.filter((f) => {
      if (severityFilter !== 'ALL' && f.severity !== severityFilter) return false;
      if (needle !== '' && !f.code.toLowerCase().includes(needle)) return false;
      return true;
    });
    return [...filtered].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  }, [findings, severityFilter, codeFilter]);

  if (findings.length === 0) return null; // אין ממצאים ⇐ אין פאנל; אין תוכן סמוי

  /** ניווט אל ממצא — מושהה על תוצאה לא-טריה (היסטים זרים; שלב 81). */
  const locate = (finding: ResultFinding): void => {
    if (!current) return;
    const span = finding.sourceSpans[0];
    if (span !== undefined) {
      const focus: ViewFocus = {
        pane: 'source',
        sourceSpan: { startUtf16: span.startUtf16, endUtf16: span.endUtf16 },
      };
      setFocus(focus);
      if (finding.pageId !== undefined) selectPage(finding.pageId);
      return;
    }
    if (finding.pageId !== undefined) {
      setFocus({ pane: 'layout', pageId: finding.pageId });
      selectPage(finding.pageId);
    }
  };

  return (
    <div className="border-b border-gray-200 bg-white shrink-0" data-testid="audit-findings">
      <div className="px-2 py-1.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-gray-700">{L.title}</span>
          <span className="text-[11px] text-gray-500" data-testid="audit-counts">
            {L.countsTotal.replace('{n}', String(findings.length))}
          </span>
        </div>
        <div className="text-[11px] text-gray-600" data-testid="audit-counts-severity">
          {L.countsBySeverity
            .replace('{high}', String(counts.high))
            .replace('{medium}', String(counts.medium))
            .replace('{low}', String(counts.low))}
        </div>
        {!current && (
          <div className="px-2 py-1 bg-orange-50 border border-orange-200 rounded text-[11px] text-orange-800" data-testid="audit-stale">
            {L.stale}
          </div>
        )}
        <div className="flex items-center gap-1 flex-wrap">
          {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={`px-1.5 py-0.5 rounded text-[11px] border ${
                severityFilter === sev ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
              data-testid={`audit-filter-${sev.toLowerCase()}`}
              aria-pressed={severityFilter === sev}
            >
              {sev === 'ALL' ? L.severityFilterAll : AUDIT_SEVERITY_LABELS[sev]}
            </button>
          ))}
          <input
            type="text"
            value={codeFilter}
            onChange={(e) => setCodeFilter(e.target.value)}
            placeholder={L.codeFilterPlaceholder}
            className="flex-1 min-w-0 px-1.5 py-0.5 border border-gray-300 rounded text-[11px]"
            data-testid="audit-filter-code"
          />
        </div>
        <ul className="max-h-40 overflow-auto space-y-1">
          {visible.map((f, i) => {
            const location = locationText(f, rawText);
            const navigable = current && (f.sourceSpans.length > 0 || f.pageId !== undefined);
            return (
              <li key={`${f.code}-${i}`}>
                <button
                  type="button"
                  onClick={() => locate(f)}
                  disabled={!navigable}
                  className={`w-full text-start px-1.5 py-1 rounded border text-[11px] leading-snug space-y-0.5 ${
                    navigable ? 'bg-white border-gray-200 hover:bg-blue-50 cursor-pointer' : 'bg-gray-50 border-gray-200 cursor-default'
                  }`}
                  data-testid={`audit-row-${i}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className={`px-1 py-px rounded border shrink-0 ${SEVERITY_BADGE_CLASS[f.severity]}`}>
                      {AUDIT_SEVERITY_LABELS[f.severity]}
                    </span>
                    <span className="flex-1 break-words text-gray-800">{formatAuditLabel(f.code, f.params)}</span>
                  </span>
                  <span className="flex items-center gap-2 text-gray-500">
                    <span className="font-mono truncate" dir="ltr">{f.code}</span>
                    {location !== '' && <span className="truncate">{location}</span>}
                  </span>
                  {(f.actual !== undefined || f.expected !== undefined) && (
                    <span className="block text-gray-600" data-testid={`audit-values-${i}`}>
                      {f.actual !== undefined ? L.actual.replace('{actual}', String(f.actual)) : ''}
                      {f.actual !== undefined && f.expected !== undefined ? ' · ' : ''}
                      {f.expected !== undefined ? L.expected.replace('{expected}', String(f.expected)) : ''}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {visible.length === 0 && (
            <li className="px-1.5 py-2 text-[11px] text-gray-500" data-testid="audit-empty-filtered">
              {L.emptyFiltered}
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
