/**
 * TextEditor.tsx — עורך המקור של המעטפת החדשה (שלב 77; שלב 80 — הדגשה; שלב 81 — קישור).
 *
 * מקור גולמי בלבד (editorStore — שלב 76; §13.1 "אינו מכיר Layout IR"):
 * הקלדה מעדכנת rawText + revision (עוגן stale-job) ומלכלכת את המסמך.
 * אין עימוד בזמן הקלדה — ההרצה היא פעולה מפורשת של המשתמש דרך ה־Worker
 * (§13.4 — debounce/תור הוא שלב 83).
 *
 * שלב 80: כשמוקד התצוגה הוא מקור עם טווח (לחיצה על שורה במפת שגיאות
 * הקלט) — הטווח נבחר בעורך (setSelectionRange במרחב UTF-16 של המקור,
 * בדיוק כמו המיקום במפה) והעורך מקבל מיקוד; הדפדפן גולל אל הבחירה.
 * זו ההדגשה הכנה: העורך נשאר textarea טהור — אין שכבת-על ואין DOM
 * מסונכרן ידנית (מקור לבאגים); הטווח החשוד מסומן גם בתוך שורת הבעיה.
 *
 * שלב 81 — הכיוון השני (§13.2 "קליק בעורך מוצא את כל ה־fragments דרך
 * provenance"): בחירה/קליק בעורך קובעת מוקד 'layout' עם הטווח ב־UTF-16;
 * PreviewArea מחשבת את הפריטים החופפים מה־IR ומדגישה אותם. אין כאן
 * חישוב מיפוי — העורך רק מדווח על הבחירה; ההשתקה של כפילויות היא
 * מקומית (האחרון שנשלח), ומיקוד 'source' שנקבע תכנותית אינו מפעיל
 * select מלאכותי (setSelectionRange אינו יורה select) — אין לולאה.
 */
import { useEffect, useRef } from 'react';
import { useDocumentName, useIsDirty, useRawText, useViewFocus } from '../../stores/selectors.js';
import { useEditorStore } from '../../stores/editor-store.js';
import { useViewStore } from '../../stores/view-store.js';

export function TextEditor() {
  const rawText = useRawText();
  const dirty = useIsDirty();
  const documentName = useDocumentName();
  const focus = useViewFocus();
  const setText = useEditorStore((s) => s.setText);
  const setDocumentName = useEditorStore((s) => s.setDocumentName);
  const setFocus = useViewStore((s) => s.setFocus);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const lastReported = useRef<{ start: number; end: number } | null>(null);

  // הדגשה במקור (שלב 80): מוקד עם טווח ⇐ בחירת הטווח בעורך + מיקוד.
  useEffect(() => {
    if (focus === null || focus.pane !== 'source' || focus.sourceSpan === undefined) return;
    const el = areaRef.current;
    if (el === null) return;
    const { startUtf16, endUtf16 } = focus.sourceSpan;
    el.focus();
    el.setSelectionRange(startUtf16, endUtf16);
    // הבחירה התכנותית היא המצב המדווח עכשיו — מונע דיווח כפול בבחירה הבאה
    lastReported.current = { start: startUtf16, end: endUtf16 };
  }, [focus]);

  // שלב 81 — הכיוון מקור ← פריסה: דיווח הבחירה (כולל סמן מרוכז — קליק/חצים)
  // כמוקד 'layout'; ההשתקה מונעת רעש בגרירת בחירה ובניווט מקלדת.
  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>): void => {
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (lastReported.current?.start === start && lastReported.current?.end === end) return;
    lastReported.current = { start, end };
    setFocus({ pane: 'layout', sourceSpan: { startUtf16: start, endUtf16: end } });
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDocumentName(e.target.value);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-1 border-b border-gray-100 flex items-center gap-2 text-xs text-gray-500">
        <input
          value={documentName}
          onChange={handleNameChange}
          placeholder="שם מסמך…"
          dir="rtl"
          className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs focus:outline-none focus:border-blue-300"
          data-testid="document-name"
        />
        {dirty && <span className="text-orange-600 shrink-0" title="שינויים שלא עומדו">●</span>}
      </div>
      <textarea
        ref={areaRef}
        value={rawText}
        onChange={(e) => {
          setText(e.target.value);
        }}
        onSelect={handleSelect}
        dir="rtl"
        placeholder="הדביקו טקסט כאן…"
        data-testid="source-editor"
        className="flex-1 w-full p-3 font-mono text-sm resize-none focus:outline-none border-0 bg-white"
        style={{ minHeight: '400px' }}
        spellCheck={false}
      />
    </div>
  );
}
