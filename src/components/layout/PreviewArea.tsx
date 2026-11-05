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
 *
 * שלב 83 — virtualization בטוח, progress וביטול (§13.2, §17.2#5, §17.3):
 *   - המעטפת היא היחידה שקוראת את גהת הגלילה (scrollTop/clientHeight —
 *     תצוגה בלבד) ומעבירה אותה ל־LayoutPreview כ־prop; החישוב עצמו טהור
 *     (virtualization.ts). zoom/DPR אינם משנים את התוצאה — הם משנים רק
 *     *כמה* עמודים מוצגים.
 *   - ניווט שלב 81 על מסמך ארוך: הגלילה אל עמוד המוקד מחושבת מהגאומטריה
 *     של ה־IR (לא מדידת DOM), ורק אז מחפשים את האלמנט המודגש.
 *   - כל המאזינים (גלילה/גודל/הדפסה) נרשמים ב־effect אחד עם ניקוי
 *     מלא בהסרה — אין זליגת מאזינים; לפני הדפסה — הצגה מלאה.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { projectLayout } from '../../renderers/preview-model.js';
import { CONTENT_INSET_PX, pageOffsets } from '../../renderers/virtualization.js';
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

  // ── שלב 83: גהת הגלילה כמצב תצוגה בלבד (לא נכנס ל־hash/למנוע) ──
  const [viewport, setViewport] = useState<{ scrollTopPx: number; viewportHeightPx: number } | null>(null);

  /** קריאה ב־DOM של תיבת הגלילה — תצוגה בלבד; עדכון רק כששווי השתנה. */
  const readViewport = useCallback((): void => {
    const el = scrollRef.current;
    if (el === null) return;
    const scrollTopPx = el.scrollTop;
    const viewportHeightPx = el.clientHeight;
    setViewport((prev) =>
      prev !== null && prev.scrollTopPx === scrollTopPx && prev.viewportHeightPx === viewportHeightPx
        ? prev
        : { scrollTopPx, viewportHeightPx },
    );
  }, []);

  // רישום המאזינים — גלילה, שינוי גודל (ResizeObserver כשקיים; jsdom —
  // אין), לפני/אחרי הדפסה (הצגה מלאה להדפסה) — עם ניקוי מלא בהסרה.
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null) return;
    readViewport();
    el.addEventListener('scroll', readViewport, { passive: true });
    const onBeforePrint = (): void => setViewport(null); // הדפסה ⇐ הצגה מלאה
    const onAfterPrint = (): void => readViewport();
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('afterprint', onAfterPrint);
    let resizeObserver: { disconnect(): void } | null = null;
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(() => readViewport());
      ro.observe(el);
      resizeObserver = ro;
    }
    return () => {
      el.removeEventListener('scroll', readViewport);
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('afterprint', onAfterPrint);
      resizeObserver?.disconnect(); // אין זליגת מאזינים (§17.3#10 ברוח זו)
    };
  }, [readViewport]);

  // זום משנה את מרחב הגלילה (scale) בלי אירוע גלילה — קריאה חוזרת מפורשת.
  useEffect(() => {
    readViewport();
  }, [zoom, readViewport]);

  // גאומטריית העמודים מה־IR (היטל טהור; לא מדידה) — לניווט הגלילה שלהלן.
  const pageHeights = useMemo(
    () => (ir === null ? [] : projectLayout(ir).map((p) => p.blockSizePx)),
    [ir],
  );

  // ── שלב 81 + 83: ניווט למוקד — קודם מביאים את העמוד לטווח הגלוי ──
  // הגלילה מחושבת מהגאומטריה (offsets מה־IR × זום + ריפוד), לא מדידת DOM.
  useEffect(() => {
    if (focus === null || focus.pane !== 'layout') return;
    const el = scrollRef.current;
    if (el === null) return;
    if (ir !== null && focus.pageId !== undefined) {
      const idx = ir.pages.findIndex((p) => p.id === focus.pageId);
      if (idx >= 0) {
        const offsets = pageOffsets(pageHeights);
        const targetPx = (offsets[idx] ?? 0) + (pageHeights[idx] ?? 0) / 2;
        // מרחב הגלילה: תוכן x נראה ב־scroll = inset + zoom·x (פינה עליונה).
        const desired = targetPx * zoom + CONTENT_INSET_PX - el.clientHeight / 2;
        if (el.clientHeight > 0 && Number.isFinite(desired)) {
          el.scrollTop = Math.max(0, desired);
        }
      }
    }
    // עדכון סינכרוני של הטווח לפני חיפוש האלמנט המודגש (האפקט הבא).
    readViewport();
  }, [focus, ir, pageHeights, zoom, readViewport]);

  // ── שלב 81: גלילה לפריט המודגש הראשון (רק אחרי שהטווח התעדכן) ──
  useEffect(() => {
    if (focus === null || focus.pane !== 'layout') return;
    const el = scrollRef.current;
    if (el === null) return;
    const hl = el.querySelector('[data-highlighted="true"]');
    // jsdom אינו מממש scrollIntoView — השמירה כאן היא לבדיקות ולא מדלגת על הדפדפן
    if (hl !== null && typeof (hl as HTMLElement).scrollIntoView === 'function') {
      (hl as HTMLElement).scrollIntoView({ block: 'center' });
    }
  }, [focus, viewport]);

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

      {/* Pages — היטל בלבד; הגהה נקראת כאן (תצוגה בלבד, שלב 83) */}
      <div className="flex-1 overflow-auto p-4 print:p-0" ref={scrollRef} data-testid="preview-scroll">
        <LayoutPreview
          layout={ir ?? undefined}
          status={previewStatusOf(phase)}
          error={
            phase === 'error' && errorCode !== null
              ? { errorCode, params: {} }
              : undefined
          }
          progressStage={progress?.stage}
          progressInfo={
            progress !== null
              ? { completedUnits: progress.completedUnits, totalUnits: progress.totalUnits }
              : null
          }
          viewport={viewport}
          zoom={zoom}
          onItemActivate={onItemActivate}
          highlightItemIds={highlightItemIds}
        />
      </div>
    </div>
  );
}
