/**
 * TextEditor.tsx — עורך המקור של המעטפת החדשה (שלב 77).
 *
 * מקור גולמי בלבד (editorStore — שלב 76; §13.1 "אינו מכיר Layout IR"):
 * הקלדה מעדכנת rawText + revision (עוגן stale-job) ומלכלכת את המסמך.
 * אין עימוד בזמן הקלדה — ההרצה היא פעולה מפורשת של המשתמש דרך ה־Worker
 * (§13.4 — debounce/תור הוא שלב 83).
 */
import { useDocumentName, useIsDirty, useRawText } from '../../stores/selectors.js';
import { useEditorStore } from '../../stores/editor-store.js';

export function TextEditor() {
  const rawText = useRawText();
  const dirty = useIsDirty();
  const documentName = useDocumentName();
  const setText = useEditorStore((s) => s.setText);
  const setDocumentName = useEditorStore((s) => s.setDocumentName);

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
        value={rawText}
        onChange={(e) => {
          setText(e.target.value);
        }}
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
