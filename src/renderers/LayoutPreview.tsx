/**
 * LayoutPreview.tsx — המיכל של התצוגה המקדימה (שלב 36; אפיון §13.2).
 *
 * מצבי loading/error/empty/ready מגיעים מה-props — הקומפוננטה אינה
 * מריצה typeset ואינה מכירה Worker (§13.2: "אין קריאת typesetting מתוך
 * component"); החיבור ל-WorkerClient הוא ה-hook useTypesetWorker בצד
 * ההורה (src/worker-host). שגיאה מוצגת כמפתח i18n + params — לא message
 * גולמי (§12.1). zoom הוא transform של המיכל בלבד — **אינו משתתף
 * ב-layoutHash ואינו מודד מחדש** (§13.2).
 */
import type { ReactNode } from 'react';
import type { LayoutDocument } from '@tora/layout-api';
import { PageView } from './PageView.js';

export type PreviewError = {
  readonly errorCode: string;
  readonly params: Readonly<Record<string, string | number | boolean | null>>;
};

export interface LayoutPreviewProps {
  /** ה-IR להצגה — undefined כל עוד אין תוצאה. */
  readonly layout?: LayoutDocument;
  /** מצב הריצה — מגיע מההורה (runStore לעתיד; §13.1). */
  readonly status: 'idle' | 'running' | 'done' | 'error' | 'cancelled';
  readonly error?: PreviewError;
  /** שלב ההתקדמות האחרון שדווח (התקדמות להצגה בלבד). */
  readonly progressStage?: string;
  /** הגדלה — transform בלבד; ברירת מחדל 1. */
  readonly zoom?: number;
  readonly dir?: 'rtl' | 'ltr';
}

export function LayoutPreview({
  layout,
  status,
  error,
  progressStage,
  zoom = 1,
  dir = 'rtl',
}: LayoutPreviewProps): ReactNode {
  const hasPages = layout !== undefined && layout.pages.length > 0;

  if (status === 'error' && error !== undefined) {
    return (
      <div className="tora-preview-error" role="alert" data-error-code={error.errorCode}>
        {error.errorCode} {JSON.stringify(error.params)}
      </div>
    );
  }
  if (status === 'running' || (status === 'idle' && !hasPages)) {
    return (
      <div className="tora-preview-loading" role="status" data-progress-stage={progressStage ?? ''}>
        {status === 'running' ? `מעמד… ${progressStage ?? ''}` : 'טוען…'}
      </div>
    );
  }
  if (!hasPages) {
    return <div className="tora-preview-empty">אין עמודים להצגה</div>;
  }
  return (
    <div
      className="tora-preview-root"
      dir={dir}
      data-layout-pages={layout?.pages.length ?? 0}
      style={{
        transform: `scale(${zoom})`,
        transformOrigin: 'inline start',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        inlineSize: 'fit-content',
      }}
    >
      {(layout as LayoutDocument).pages.map((p) => (
        <PageView key={p.id} page={p} dir={dir} />
      ))}
    </div>
  );
}
