/**
 * LayoutPreview.tsx — המיכל של התצוגה המקדימה (שלב 36; אפיון §13.2).
 *
 * מצבי loading/error/empty/ready מגיעים מה-props — הקומפוננטה אינה
 * מריצה typeset ואינה מכירה Worker (§13.2: "אין קריאת typesetting מתוך
 * component"); החיבור ל-WorkerClient הוא ה-hook useTypesetWorker בצד
 * ההורה (src/worker-host). שגיאה מוצגת כמפתח i18n + params — לא message
 * גולמי (§12.1). zoom הוא transform של המיכל בלבד — **אינו משתתף
 * ב-layoutHash ואינו מודד מחדש** (§13.2).
 *
 * שלב 83 — virtualization בטוח, progress וביטול (§13.2, §17.2#5, §17.3):
 *   - הצגה וירטואלית של עמודי ה-preview בלבד: הגאומטריה מגיעה מה־IR
 *     (גבהים מוקרנים) ולא ממדידת DOM; המעטפת מעבירה ‎viewport‏
 *     (scrollTop/clientHeight) כ־prop, וכאן נחשב הטווח הגלוי
 *     (virtualization.ts — טהור). ‎viewport‏ חסר או גהה לא־חיובית ⇐
 *     הצגה מלאה (נפילה לאחור מתועדת — jsdom/הדפסה).
 *   - פסי ריווח (spacers) משלימים את הגלילה לגובה האמת; הפער בין
 *     עמודים הוא marginBlockEnd לוגי — מקור אחד (PAGE_GAP_PX).
 *   - הזום הוא scale מהפינה העליונה־התחלתית (inline-start/block-start):
 *     מיפוי גלילה ⇐ תוכן קבוע וליניארי, ‎(scrollTop − inset)/zoom‎ —
 *     בלי זה הזום מתמרכז ומפר את החלון הגלוי.
 *   - progress דטרמיניסטי לתצוגה בלבד (אחוזים אינם קלט למנוע):
 *     ‎`מעמד… breaking 12/40 — 30%`‎ (progress-display.ts).
 *
 * המבנה: כל ה-hooks בראש הפונקציה — תמיד, בלי תלות במצב (אין
 * early-return לפניהם); המצבים נבחנים אחרי חישוב הטווח.
 */
import { useMemo, type ReactNode } from 'react';
import { luToCssPx, type LayoutDocument, type LayoutPage } from '@tora/layout-api';
import { PageView, type ItemActivation } from './PageView.js';
import {
  DEFAULT_OVERSCAN_PAGES,
  PAGE_GAP_PX,
  spacerHeights,
  visiblePageRange,
  type ViewportInfo,
} from './virtualization.js';
import { formatProgress, progressPercent, type ProgressLike } from './progress-display.js';

export type PreviewError = {
  readonly errorCode: string;
  readonly params: Readonly<Record<string, string | number | boolean | null>>;
};

export interface LayoutPreviewProps {
  /** ה-IR להצגה — undefined כל עוד אין תוצאה. */
  readonly layout?: LayoutDocument;
  /** מצב הריצה — מגיע מההורה (runStore; §13.1). */
  readonly status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  readonly error?: PreviewError;
  /** שלב ההתקדמות האחרון שדווח (התקדמות להצגה בלבד). */
  readonly progressStage?: string;
  /** שלב 83 — יחידות המנוע לתצוגה דטרמיניסטית (אחוזים בתצוגה בלבד). */
  readonly progressInfo?: { readonly completedUnits: number; readonly totalUnits: number | null } | null;
  /** הגדלה — transform בלבד; ברירת מחדל 1. */
  readonly zoom?: number;
  readonly dir?: 'rtl' | 'ltr';
  /**
   * שלב 83 — גהת הגלילה של המעטפת (scrollTop/clientHeight) בלבד.
   * ‎null/undefined/גהה לא־חיובית ⇐ הצגה מלאה (jsdom, הדפסה, SSR).
   * הקריאה ב־DOM היא של ההורה; כאן — חישוב טהור בלבד.
   */
  readonly viewport?: ViewportInfo | null;
  /** שלב 81 — קליק על קו/סמן ← הדגשת ה־SourceSpan בעורך (§13.2). */
  readonly onItemActivate?: (activation: ItemActivation) => void;
  /** שלב 81 — מזהי פריטים להדגשה (בחירה בעורך ⇐ הפריסה, דרך provenance). */
  readonly highlightItemIds?: ReadonlySet<string>;
}

const asProgressLike = (
  stage: string | undefined,
  info: { completedUnits: number; totalUnits: number | null } | null | undefined,
): ProgressLike | null =>
  info === null || info === undefined
    ? null
    : { stage: stage ?? '', completedUnits: info.completedUnits, totalUnits: info.totalUnits };

export function LayoutPreview({
  layout,
  status,
  error,
  progressStage,
  progressInfo,
  zoom = 1,
  dir = 'rtl',
  viewport = null,
  onItemActivate,
  highlightItemIds,
}: LayoutPreviewProps): ReactNode {
  const hasPages = layout !== undefined && layout.pages.length > 0;

  // ── שלב 83: הטווח הגלוי — טהור, מה־IR בלבד (אין מדידת DOM כאן).
  // ה-hooks תמיד בראש — גם כשהמצב אינו ready (אין early-return לפניהם).
  const heights = useMemo(
    () => (layout !== undefined ? (layout.pages as readonly LayoutPage[]).map((p) => luToCssPx(p.size.height)) : []),
    [layout],
  );
  const range = useMemo(
    () =>
      viewport === null || viewport === undefined
        ? null
        : visiblePageRange(heights, viewport, { zoom, overscanPages: DEFAULT_OVERSCAN_PAGES }),
    [heights, viewport, zoom],
  );
  const spacers = useMemo(() => (range === null ? null : spacerHeights(range, heights)), [range, heights]);

  if (status === 'error' && error !== undefined) {
    return (
      <div className="tora-preview-error" role="alert" data-error-code={error.errorCode}>
        {error.errorCode} {JSON.stringify(error.params)}
      </div>
    );
  }
  if (status === 'running' || (status === 'idle' && !hasPages)) {
    const progress = asProgressLike(progressStage, progressInfo);
    const line = progress !== null ? formatProgress(progress) : (progressStage ?? '');
    const pct = progress !== null ? progressPercent(progress) : null;
    return (
      <div
        className="tora-preview-loading"
        role="status"
        data-progress-stage={progressStage ?? ''}
        {...(pct !== null ? { 'data-progress-percent': String(pct) } : {})}
        {...(progress !== null && progress.totalUnits !== null && progress.totalUnits > 0
          ? { 'data-progress-units': `${progress.completedUnits}/${progress.totalUnits}` }
          : {})}
      >
        {status === 'running' ? `מעמד… ${line}` : 'טוען…'}
      </div>
    );
  }
  if (!hasPages) {
    return <div className="tora-preview-empty">אין עמודים להצגה</div>;
  }
  const pages = (layout as LayoutDocument).pages as readonly LayoutPage[];

  const shownFrom = range === null ? 0 : range.first;
  const shownCount = range === null ? pages.length : range.last - range.first + 1;
  const shown = pages.slice(shownFrom, shownFrom + shownCount);

  return (
    <div
      className="tora-preview-root"
      dir={dir}
      data-layout-pages={pages.length}
      data-virtual-range={range === null ? 'full' : `${range.first}-${range.last}`}
      style={{
        transform: `scale(${zoom})`,
        // פינה עליונה־התחלתית: מיפוי גלילה⇐תוכן ליניארי וקבוע (שלב 83) —
        // הזום אינו מתמרכז ואינו מזיז את ראש המסמך מתחילת הגלילה.
        transformOrigin: dir === 'rtl' ? 'right top' : 'left top',
        display: 'flex',
        flexDirection: 'column',
        inlineSize: 'fit-content',
      }}
    >
      {spacers !== null && spacers.topPx > 0 && (
        <div
          data-testid="preview-spacer-top"
          aria-hidden="true"
          style={{ blockSize: `${spacers.topPx}px`, inlineSize: '100%' }}
        />
      )}
      {shown.map((p, i) => (
        <div
          key={p.id}
          data-virtual-page-index={shownFrom + i}
          style={{ marginBlockEnd: i < shown.length - 1 ? `${PAGE_GAP_PX}px` : 0 }}
        >
          <PageView page={p} dir={dir} onItemActivate={onItemActivate} highlightItemIds={highlightItemIds} />
        </div>
      ))}
      {spacers !== null && spacers.bottomPx > 0 && (
        <div
          data-testid="preview-spacer-bottom"
          aria-hidden="true"
          style={{ blockSize: `${spacers.bottomPx}px`, inlineSize: '100%' }}
        />
      )}
    </div>
  );
}
