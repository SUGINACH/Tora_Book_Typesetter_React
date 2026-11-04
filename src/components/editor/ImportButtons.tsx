/**
 * ImportButtons.tsx — ייבוא מסמכים למעטפת החדשה (שלב 77).
 *
 * קבצי טקסט/Word/דוגמאות נכנסים ל־editorStore (מקור גולמי; שלב 76).
 * ייבוא מסמך חדש מנקה את התוצאה הקודמת — אין הצגה של תוצאה ישנה כאילו
 * היא של המסמך החדש (resetForNewDocument שומר zoom/locale).
 */
import { importTextFile, importWordFile } from '../../lib/text-importers';
import { useEditorStore } from '../../stores/editor-store.js';
import { resetForNewDocument } from '../../stores/index.js';

const SAMPLE_FILES = [
  { name: 'טקסט קצר — אלמנה/יתום', path: './widow-orphan.txt' },
  { name: 'טקסט קצר — ליווי כותרות', path: './heading-escort.txt' },
  { name: 'טקסט בינוני', path: './no_long_test_text.txt' },
  { name: 'טקסט בינוני-ארוך', path: './mid_long_test_text.txt' },
  { name: 'טקסט ארוך', path: './long_test_text.txt' },
  { name: 'טקסט ארוך (ללא סוגריים)', path: './long_test_text_no_parentheses.txt' },
  { name: 'טקסט ארוך מאוד', path: './very_long_test_text.txt' },
];

/** קליטת תוכן חדש — מסמך חדש: ניקוי בין מסמכים לפני הכתיבה. */
function acceptNewDocument(text: string, name: string): void {
  resetForNewDocument();
  const editor = useEditorStore.getState();
  editor.setDocumentName(name);
  editor.setText(text);
}

export function ImportButtons() {
  const handleTextFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,text/plain';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await importTextFile(file);
        acceptNewDocument(text, file.name);
      } catch (err) {
        console.warn('File not loaded:', err);
      }
    };
    input.click();
  };

  const handleWordFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await importWordFile(file);
        acceptNewDocument(text, file.name);
      } catch (err) {
        console.warn('Word file not loaded:', err);
      }
    };
    input.click();
  };

  const handleLoadSample = async (path: string) => {
    try {
      const response = await fetch(path);
      const text = await response.text();
      acceptNewDocument(text, path.replace(/^\.\//, ''));
    } catch (err) {
      console.warn('Failed to load sample:', err);
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <button
        onClick={handleTextFile}
        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
        data-testid="import-text"
      >
        📄 ייבוא טקסט
      </button>
      <button
        onClick={handleWordFile}
        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
      >
        📝 ייבוא Word
      </button>
      <select
        onChange={(e) => {
          if (e.target.value) {
            void handleLoadSample(e.target.value);
            e.target.value = '';
          }
        }}
        className="px-2 py-1 text-xs border border-gray-300 rounded bg-white"
        defaultValue=""
        data-testid="import-sample"
      >
        <option value="">📝 טען דוגמה...</option>
        {SAMPLE_FILES.map((f) => (
          <option key={f.path} value={f.path}>
            {f.name}
          </option>
        ))}
      </select>
    </div>
  );
}
