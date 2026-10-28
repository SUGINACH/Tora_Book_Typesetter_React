import { useDocumentStore } from '../../store/document-store';

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
        // קובץ לא נתמך → לא נטען (בשקט)
        console.warn('File not loaded:', err);
      }
    };
    input.click();
  };

  const handleLoadSample = async () => {
    try {
      const response = await fetch('./widow-orphan.txt');
      const text = await response.text();
      setText(text);
    } catch (err) {
      console.warn('Failed to load sample:', err);
    }
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={handleTextFile}
        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
      >
        📄 ייבוא טקסט
      </button>
      <button
        onClick={handleLoadSample}
        className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
      >
        📝 טען דוגמה
      </button>
    </div>
  );
}
