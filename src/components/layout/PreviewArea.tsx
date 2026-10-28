import { useState } from 'react';
import { useDocumentStore } from '../../store/document-store';

export function PreviewArea() {
  const pages = useDocumentStore((s) => s.lastRenderedPages);
  const findings = useDocumentStore((s) => s.lastFindings);
  const [currentPage, setCurrentPage] = useState(1);

  if (!pages || pages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100">
        <div className="text-center text-gray-500">
          <p className="text-lg mb-2">אין עמודים מעומדים</p>
          <p className="text-sm">הדביקו טקסט בצד ימין ולחצו "עדכן ועמד מחדש"</p>
        </div>
      </div>
    );
  }

  const page = pages[Math.min(currentPage - 1, pages.length - 1)];

  return (
    <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 p-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="px-2 py-1 bg-gray-100 rounded disabled:opacity-50"
          >
            ▶
          </button>
          <span className="text-sm">
            עמוד {currentPage} מתוך {pages.length}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(pages.length, currentPage + 1))}
            disabled={currentPage >= pages.length}
            className="px-2 py-1 bg-gray-100 rounded disabled:opacity-50"
          >
            ◀
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {findings.length > 0 ? (
            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded">
              {findings.length} ממצאים
            </span>
          ) : (
            <span className="px-2 py-1 bg-green-100 text-green-800 rounded">
              ✓ אין ממצאים
            </span>
          )}
        </div>
      </div>

      {/* Page preview */}
      <div className="flex-1 overflow-auto p-4">
        <div
          className="bg-white shadow-lg mx-auto"
          style={{ width: 'fit-content', maxWidth: '100%' }}
          dangerouslySetInnerHTML={{ __html: page.html }}
        />
      </div>

      {/* Findings list */}
      {findings.length > 0 && (
        <div className="bg-white border-t border-gray-200 p-3 max-h-40 overflow-auto">
          <h3 className="text-sm font-bold mb-2">ממצאי בדיקה:</h3>
          <ul className="space-y-1">
            {findings.slice(0, 5).map((f, i) => (
              <li key={i} className="text-xs flex items-start gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-white ${
                    f.severity === 'HIGH'
                      ? 'bg-red-500'
                      : f.severity === 'MEDIUM'
                      ? 'bg-orange-500'
                      : 'bg-gray-400'
                  }`}
                >
                  {f.severity}
                </span>
                <span className="text-gray-700">
                  עמוד {f.page}: {f.description}
                </span>
              </li>
            ))}
            {findings.length > 5 && (
              <li className="text-xs text-gray-500">...ו{findings.length - 5} נוספים</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
