import { useDocumentStore } from '../../store/document-store';

export function TextEditor() {
  const rawText = useDocumentStore((s) => s.rawText);
  const setText = useDocumentStore((s) => s.setText);

  return (
    <textarea
      value={rawText}
      onChange={(e) => setText(e.target.value)}
      dir="rtl"
      placeholder="הדביקו טקסט כאן..."
      className="w-full h-full p-3 font-mono text-sm resize-none focus:outline-none border-0"
      style={{ minHeight: '400px' }}
    />
  );
}
