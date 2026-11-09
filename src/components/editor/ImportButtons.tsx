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
// שלב 95 (§12.3, §16): מקור יחיד לסיווג כישלונות ייבוא — גם בדפדפן וגם
// ב-webview של Tauri (שגיאות fs/dialog ממופות לקטלוג היחיד; ביטול
// דיאלוג הוא פעולת-אין, לא כישלון).
import { classifyHostFileFailure } from '../../worker-host/tauri-errors.js';
import { messagesOf, t as translate } from '../../i18n/index.js';
import { useLocale } from '../../stores/selectors.js';


/** דוגמאות — מפתח קטלוגי לכל אחת (התצוגה מתורגמת; הנתיב קנוני). */
const SAMPLE_FILES = [
  { key: 'import.sample.widow', path: './widow-orphan.txt' },
  { key: 'import.sample.escort', path: './heading-escort.txt' },
  { key: 'import.sample.mid', path: './no_long_test_text.txt' },
  { key: 'import.sample.midlong', path: './mid_long_test_text.txt' },
  { key: 'import.sample.long', path: './long_test_text.txt' },
  { key: 'import.sample.longnoparen', path: './long_test_text_no_parentheses.txt' },
  { key: 'import.sample.verylong', path: './very_long_test_text.txt' },
];

export function ImportButtons() {
  const locale = useLocale();
  /** תרגום common (שלב 96 — אין מחרוזות קשיחות; §16) — סגור על הלוקייל מהרינדור (אין hook בתנאי/במאזין). */
  const tc = (key: string, params?: Readonly<Record<string, string | number>>): string =>
    translate(messagesOf(locale), key, params);
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
      } catch (err) {
        // §16: סיווג לפי תכונות הקובץ/צורת השגיאה — לא לפי message גולם;
        // null ⇐ ביטול (פעולת-אין, אין דיווח שווא במפת הקלט).
        const failure = classifyHostFileFailure(err, { fileName: file.name, mimeType: file.type, kind: 'text' });
        if (failure !== null) reportImportFailure(failure.code, failure.params);
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
      } catch (err) {
        const failure = classifyHostFileFailure(err, { fileName: file.name, kind: 'word' });
        if (failure !== null) reportImportFailure(failure.code, failure.params);
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
    } catch (err) {
      const failure = classifyHostFileFailure(err, { fileName: path, kind: 'sample', path: path.replace(/^\.\//, '') });
      if (failure !== null) reportImportFailure(failure.code, failure.params);
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <button
        onClick={handleTextFile}
        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
        data-testid="import-text"
      >
        {tc('import.text')}
      </button>
      <button
        onClick={handleWordFile}
        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
      >
        {tc('import.word')}
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
          {tc('import.sample.choose')}
        </option>
        {SAMPLE_FILES.map((f) => (
          <option key={f.path} value={f.path}>
            {tc(f.key)}
          </option>
        ))}
      </select>
    </div>
  );
}
