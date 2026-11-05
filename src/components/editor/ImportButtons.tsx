/**
 * ImportButtons.tsx — ייבוא מסמכים למעטפת החדשה (שלב 77; שלב 80 — מסלול ייבוא).
 *
 * קבצי טקסט/Word/דוגמאות נכנסים דרך פעולת הייבוא היחידה (import-document,
 * שלב 80): ביטול ריצה פעילה ← ניקוי בין מסמכים ← כתיבה ← ניתוח הקלט ←
 * מפת שגיאות וסקירה ב־editorStore. כישלון מתאם (פורמט/קריאה/המרה/דוגמה)
 * אינו מחליף מסמך ואינו נבלע ב־console — הוא מדווח בקוד קטלוגי ומוצג
 * במפת הקלט (reportImportFailure; אין תיקון שקט — אפיון §3.3, §16).
 */
import { importTextFile, importWordFile } from '../../lib/text-importers';
import { importDocumentText, reportImportFailure } from '../../stores/import-document.js';

const SAMPLE_FILES = [
  { name: 'טקסט קצר — אלמנה/יתום', path: './widow-orphan.txt' },
  { name: 'טקסט קצר — ליווי כותרות', path: './heading-escort.txt' },
  { name: 'טקסט בינוני', path: './no_long_test_text.txt' },
  { name: 'טקסט בינוני-ארוך', path: './mid_long_test_text.txt' },
  { name: 'טקסט ארוך', path: './long_test_text.txt' },
  { name: 'טקסט ארוך (ללא סוגריים)', path: './long_test_text_no_parentheses.txt' },
  { name: 'טקסט ארוך מאוד', path: './very_long_test_text.txt' },
];

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
        importDocumentText(text, file.name, 'text-file');
      } catch {
        // סיווג לפי תכונות הקובץ עצמו — לא לפי message גולם (§16):
        // סיומת/סוג שאינם טקסט ⇐ פורמט; אחרת ⇐ כשל קריאה.
        const isFormatIssue = !file.name.toLowerCase().endsWith('.txt') && file.type !== 'text/plain';
        if (isFormatIssue) {
          reportImportFailure('errors.import.UNSUPPORTED_FORMAT', { extension: file.name.split('.').pop() ?? '' });
        } else {
          reportImportFailure('errors.import.FILE_UNREADABLE', { reason: 'read-failed' });
        }
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
        importDocumentText(text, file.name, 'word-file');
      } catch {
        const isFormatIssue = !file.name.toLowerCase().endsWith('.docx');
        if (isFormatIssue) {
          reportImportFailure('errors.import.UNSUPPORTED_FORMAT', { extension: file.name.split('.').pop() ?? '' });
        } else {
          reportImportFailure('errors.import.WORD_CONVERT_FAILED', {});
        }
      }
    };
    input.click();
  };

  const handleLoadSample = async (path: string) => {
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(String(response.status));
      const text = await response.text();
      importDocumentText(text, path.replace(/^\.\//, ''), 'sample');
    } catch {
      reportImportFailure('errors.import.SAMPLE_UNAVAILABLE', { path: path.replace(/^\.\//, '') });
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
        <option value="" disabled>
          טעינת דוגמה…
        </option>
        {SAMPLE_FILES.map((f) => (
          <option key={f.path} value={f.path}>
            {f.name}
          </option>
        ))}
      </select>
    </div>
  );
}
