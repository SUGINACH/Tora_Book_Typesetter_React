/**
 * use-typeset-worker.ts — חיבור התצוגה ל-WorkerClient (שלב 36; אפיון §13.2).
 *
 * ה-hook בצד המעטפת: מגיש לקומפוננטות מצב ריצה (idle/running/done/error/
 * cancelled — תואם runStore של §13.1) ואת ה-IR שהגיע מהעובד. **הקומפוננטה
 * עצמה אינה מריצה typeset** — היא מקבלת props; כל עימוד עובר בפרוטוקול
 * (§12.1). שגיאות מגיעות כמפתח + params (WorkerTypesetError).
 *
 * הריצה החדשה מבטלת אוטומטית את הקודמת (supersede) — לא מוצג ישן
 * כחדש (§13.3#5). ביטול job אינו משנה את הריצה הבאה (§17.2#10).
 */
import { useCallback, useRef, useState } from 'react';
import type { LayoutDocument } from '@tora/layout-api';
import { isLeanLayout } from './lean-layout.js';
import { WorkerJobCancelled, type JobHandle, type WorkerClient } from './worker-client.js';
import type { PreparePayload } from './protocol.js';

export type TypesetRunStatus = 'idle' | 'running' | 'done' | 'error' | 'cancelled';

export interface TypesetRunState {
  readonly status: TypesetRunStatus;
  readonly layout?: LayoutDocument;
  readonly layoutHash?: string;
  readonly progressStage?: string;
  readonly errorCode?: string;
  readonly errorParams?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface UseTypesetWorker {
  readonly state: TypesetRunState;
  /** מריץ job חדש דרך העובד; מבטל את הקודם אם קיים. */
  readonly run: (payload: PreparePayload) => void;
}

export function useTypesetWorker(client: WorkerClient): UseTypesetWorker {
  const [state, setState] = useState<TypesetRunState>({ status: 'idle' });
  const currentJob = useRef<JobHandle | undefined>(undefined);

  const run = useCallback((payload: PreparePayload) => {
    // ביטול הקודם — supersede; תוצאתו לעולם לא תוצג (WorkerJobCancelled)
    if (currentJob.current !== undefined) {
      currentJob.current.cancel();
      currentJob.current = undefined;
    }
    setState({ status: 'running' });
    const handle = client.submit(payload, {
      onProgress: (stage) => {
        setState((s) => (s.status === 'running' ? { ...s, progressStage: stage } : s));
      },
    });
    currentJob.current = handle;
    void handle.done.then(
      (result) => {
        if (currentJob.current === handle) {
          currentJob.current = undefined;
          if (!isLeanLayout(result.layout)) {
            setState({ status: 'error', errorCode: 'errors.worker.RESULT_INVALID', errorParams: {} });
            return;
          }
          setState({
            status: 'done',
            layout: result.layout,
            layoutHash: result.layoutHash,
          });
        }
      },
      (e: unknown) => {
        if (currentJob.current === handle) currentJob.current = undefined;
        if (e instanceof WorkerJobCancelled) {
          setState({ status: 'cancelled' });
          return;
        }
        if (e instanceof Error && 'errorCode' in e) {
          const we = e as unknown as { errorCode: unknown; params?: unknown };
          setState({
            status: 'error',
            errorCode: String(we.errorCode),
            errorParams: we.params as Readonly<Record<string, string | number | boolean | null>>,
          });
          return;
        }
        setState({ status: 'error', errorCode: 'errors.worker.ENGINE_UNCLASSIFIED', errorParams: {} });
      },
    );
  }, [client]);

  return { state, run };
}
