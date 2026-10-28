import { useDocumentStore } from '../../store/document-store';
import { useViewStore } from '../../store/view-store';
import { ZoomControls } from '../view/ZoomControls';
import { useRef } from 'react';

export function PreviewArea() {
  const pages = useDocumentStore((s) => s.lastRenderedPages);
  const findings = useDocumentStore((s) => s.lastFindings);
  const zoom = useViewStore((s) => s.zoom);
  const setZoom = useViewStore((s) => s.setZoom);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between text-sm shrink-0">
        <span className="font-medium">{pages.length} עמודים</span>
        <div className="flex items-center gap-3">
          {findings.length > 0 ? (
            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">
              {findings.length} ממצאים
            </span>
          ) : (
            <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
              ✓ אין ממצאים
            </span>
          )}
          <button
            onClick={() => window.print()}
            className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-xs"
          >
            📄 הדפסה
          </button>
          <ZoomControls zoom={zoom} onChange={setZoom} />
        </div>
      </div>

      {/* Pages */}
      <div ref={containerRef} className="flex-1 overflow-auto p-4 space-y-6 print:p-0 print:space-y-0">
        {pages.map((page) => (
          <div
            key={page.pageNumber}
            className="tora-page-wrapper bg-white shadow-lg mx-auto"
            style={{
              width: 'fit-content',
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
            }}
          >
            <div dangerouslySetInnerHTML={{ __html: page.html }} />
          </div>
        ))}
      </div>

      {/* Findings */}
      {findings.length > 0 && (
        <div className="bg-white border-t border-gray-200 p-3 max-h-40 overflow-auto shrink-0">
          <h3 className="text-sm font-bold mb-2">ממצאי בדיקה:</h3>
          <ul className="space-y-1">
            {findings.map((f, i) => (
              <li key={i} className="text-xs flex items-start gap-2">
                <span className={`px-2 py-0.5 rounded text-white shrink-0 ${
                  f.severity === 'HIGH' ? 'bg-red-500'
                  : f.severity === 'MEDIUM' ? 'bg-orange-500'
                  : 'bg-gray-400'
                }`}>
                  {f.severity}
                </span>
                <span className="text-gray-700">
                  עמוד {f.page}: {f.description}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
