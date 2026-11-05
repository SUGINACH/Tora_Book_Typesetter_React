/**
 * PreviewArea.tsx — אזור התצוגה של המעטפת החדשה (שלב 77; אפיון §13.2).
 *
 * התצוגה היא **היטל של ה־IR** בלבד (LayoutPreview, שלב 36): עמודים/
 * אזורים/קווים כרכיבי React עם data-page-id וכו' — אין
 * dangerouslySetInnerHTML ואין מדידת DOM. המצב מגיע מהבוררים של
 * runStore/resultStore/viewStore; zoom הוא transform של המיכל בלבד
 * (§13.2) ואינו משתתף ב־layoutHash.
 *
 * שלב 81 — העורך המקושר מקור ↔ פריסה (§13.2, §13.3, §14.2):
 *   - פריסה ← מקור: קליק על קו/סמן הערה עובר דרך הליבה הטהורה
 *     (linked-navigation — provenance מה־IR) לטווח UTF-16, ונקבע כמוקד
 *     'source' ב־viewStore — העורך בוחר ומדגיש אותו (שלב 80 ביסודו).
 *   - מקור ← פריסה: בחירה/קליק בעורך קובעת מוקד 'layout' עם הטווח;
 *     כאן מחושבים כל הפריטים החופפים (linkedItemsForRange) ומועברים
 *     להדגשה ב־DOM. שני הכיוונים תקפים רק כשהתוצאה טריה — עוגן
 *     הטריות (sourceRevision) שומר שהיסטי ה־IR מתפרשים על המקור שבעורך.
 *   - הניווט אינו עימוד: אין כאן מנוע, מדידה או כתיבה ל־IR — UI בלבד.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  useFindings,
  useLayoutIr,
  useResultIsCurrent,
  useRunErrorCode,
  useRunPhase,
  useRunProgress,
  useViewFocus,
  useZoom,
} from '../../stores/selectors.js';
import { useViewStore } from '../../stores/view-store.js';
import {
  firstAtomIdOfItem,
  itemSourceRange,
  linkedItemsForRange,
} from '../../stores/linked-navigation.js';
import { LayoutPreview, type PreviewError } from '../../renderers/LayoutPreview.js';
import type { ItemActivation } from '../../renderers/PageView.js';
import { ZoomControls } from '../view/ZoomControls';

type RunPhase = ReturnType<typeof useRunPhase>;

/** מיפוי שבעת מצבי runStore לחמשת מצבי התצוגה (§13.2). */
function previewStatusOf(phase: RunPhase): 'idle' | 'running' | 'done' | 'error' | 'cancelled' {
  if (phase === 'preparing' || phase === 'running' || phase === 'auditing') return 'running';
  return phase;
}

const EMPTY_HIGHLIGHTS: ReadonlySet<string> = new Set<string>();

export function PreviewArea() {
  const ir = useLayoutIr();
  const findings = useFindings();
  const phase = useRunPhase();
  const progress = useRunProgress();
  const errorCode = useRunErrorCode();
  const zoom = useZoom();
  const focus = useViewFocus();
  const resultIsCurrent = useResultIsCurrent();
  const setFocus = useViewStore((s) => s.setFocus);
  const setZoom = useViewStore((s) => s.setZoom);
  const scrollRef = useRef<HTMLDivElement>(null);

  const error: PreviewError | undefined =
    phase === 'error' && errorCode !== null ? { errorCode, params: {} } : undefined;

  // ── שלב 81: ההדגשות בפריסה — מהמוקד, רק על תוצאה טריה (הגנה בעומק) ──
  const highlightItemIds = useMemo(() => {
    if (ir === null || !resultIsCurrent || focus === null || focus.sourceSpan === undefined) {
      return EMPTY_HIGHLIGHTS;
    }
    // מקור ← פריסה: בחירה בעורך — כל הפריטים החופפים דרך provenance.
    if (focus.pane === 'layout') {
      return new Set(linkedItemsForRange(ir, focus.sourceSpan).map((r) => r.itemId));
    }
    // פריסה ← מקור: הפריט שהופעל ממשיך להדגיש בפריסה; בלי itemId
    // (למשל בעיה ממפת הקלט, שלב 80) — הפריטים החופפים לטווח הבעיה.
    if (focus.itemId !== undefined) return new Set([focus.itemId]);
    return new Set(linkedItemsForRange(ir, focus.sourceSpan).map((r) => r.itemId));
  }, [ir, focus, resultIsCurrent]);

  // ── שלב 81: קליק על פריט בפריסה ← מוקד מקור (טווח מה־provenance) ──
  const onItemActivate = useCallback(
    (activation: ItemActivation) => {
      if (ir === null) return;
      const range = itemSourceRange(ir, activation.pageId, activation.itemId);
      if (range === null) return; // אין מקור — אין ניווט (לא מנוחש)
      const atomId = firstAtomIdOfItem(ir, activation.itemId);
      setFocus({
        pane: 'source',
        pageId: activation.pageId,
        itemId: activation.itemId,
        ...(atomId !== null ? { atomId } : {}),
        sourceSpan: range,
      });
    },
    [ir, setFocus],
  );

  // ── שלב 81: גלילה לפריט המודגש הראשון (תצוגה בלבד; וירטואליזציה — שלב 83) ──
  useEffect(() => {
    if (focus === null || focus.pane !== 'layout') return;
    const el = scrollRef.current?.querySelector('[data-highlighted="true"]');
    // jsdom אינו מממש scrollIntoView — השמירה כאן היא לבדיקות ולא מדלגת על הדפדפן
    if (el !== null && typeof (el as HTMLElement).scrollIntoView === 'function') {
      (el as HTMLElement).scrollIntoView({ block: 'center' });
    }
  }, [focus]);

  // ── שלב 81: סמן "הפריסה איננה עדכנית" — המקור נערך מאז התוצאה/השליחה ──
  const staleShown = !resultIsCurrent && (ir !== null || phase === 'done');

  return (
    <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between text-sm shrink-0">
        <span className="font-medium">{ir !== null ? `${ir.pages.length} עמודים` : 'אין תוצאה'}</span>
        <div className="flex items-center gap-3">
          {staleShown && (
            <span
              className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs"
              data-testid="preview-stale"
              title="המקור נערך מאז הריצה — הניווט המקושר מושהה עד עדכון"
            >
              ⚠ הפריסה איננה עדכנית
            </span>
          )}
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
      <div className="flex-1 overflow-auto p-4 print:p-0" ref={scrollRef}>
        <LayoutPreview
          layout={ir ?? undefined}
          status={previewStatusOf(phase)}
          error={error}
          progressStage={progress?.stage}
          zoom={zoom}
          onItemActivate={onItemActivate}
          highlightItemIds={highlightItemIds}
        />
      </div>
    </div>
  );
}
