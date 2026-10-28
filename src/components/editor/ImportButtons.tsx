import { useDocumentStore } from '../../store/document-store';

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
  const setText = useDocumentStore((s) => s.setText);

  const handleTextFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,text/plain';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        setText(text);
      } catch (err) {
        console.warn('File not loaded:', err);
      }
    };
    input.click();
  };

  const handleLoadSample = async (path: string) => {
    try {
      const response = await fetch(path);
      const text = await response.text();
      setText(text);
    } catch (err) {
      console.warn('Failed to load sample:', err);
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <button
        onClick={handleTextFile}
        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
      >
        📄 ייבוא קובץ טקסט
      </button>
      <select
        onChange={(e) => {
          if (e.target.value) {
            handleLoadSample(e.target.value);
            e.target.value = '';
          }
        }}
        className="px-2 py-1 text-xs border border-gray-300 rounded bg-white"
        defaultValue=""
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
