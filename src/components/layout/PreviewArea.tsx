/**
 * PreviewArea.tsx — אזור התצוגה של המעטפת החדשה (שלב 77; אפיון §13.2).
 *
 * התצוגה היא **היטל של ה־IR** בלבד (LayoutPreview, שלב 36): עמודים/
 * אזורים/קווים כרכיבי React עם data-page-id וכו' — אין
 * dangerouslySetInnerHTML ואין מדידת DOM. המצב מגיע מהבוררים של
 * runStore/resultStore/viewStore; zoom הוא transform של המיכל בלבד
 * (§13.2) ואינו משתתף ב־layoutHash.
 */
import {
  useFindings,
  useLayoutIr,
  useRunErrorCode,
  useRunPhase,
  useRunProgress,
  useZoom,
} from '../../stores/selectors.js';
import { useViewStore } from '../../stores/view-store.js';
import { LayoutPreview, type PreviewError } from '../../renderers/LayoutPreview.js';
import { ZoomControls } from '../view/ZoomControls';

type RunPhase = ReturnType<typeof useRunPhase>;

/** מיפוי שבעת מצבי runStore לחמשת מצבי התצוגה (§13.2). */
function previewStatusOf(phase: RunPhase): 'idle' | 'running' | 'done' | 'error' | 'cancelled' {
  if (phase === 'preparing' || phase === 'running' || phase === 'auditing') return 'running';
  return phase;
}

export function PreviewArea() {
  const ir = useLayoutIr();
  const findings = useFindings();
  const phase = useRunPhase();
  const progress = useRunProgress();
  const errorCode = useRunErrorCode();
  const zoom = useZoom();
  const setZoom = useViewStore((s) => s.setZoom);

  const error: PreviewError | undefined =
    phase === 'error' && errorCode !== null ? { errorCode, params: {} } : undefined;

  return (
    <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between text-sm shrink-0">
        <span className="font-medium">{ir !== null ? `${ir.pages.length} עמודים` : 'אין תוצאה'}</span>
        <div className="flex items-center gap-3">
          {ir !== null && findings.length > 0 && (
            <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs">
              {findings.length} ממצאים
            </span>
          )}
          {ir !== null && findings.length === 0 && phase === 'done' && (
            <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">✓ אין ממצאים</span>
          )}
          <ZoomControls zoom={zoom} onChange={setZoom} />
        </div>
      </div>

      {/* Pages — היטל בלבד */}
      <div className="flex-1 overflow-auto p-4 print:p-0">
        <LayoutPreview
          layout={ir ?? undefined}
          status={previewStatusOf(phase)}
          error={error}
          progressStage={progress?.stage}
          zoom={zoom}
        />
      </div>
    </div>
  );
}
