/**
 * typeset-run.ts — מנצח הריצה של ה־UI מעל ה־Worker (שלב 77; אפיון §12–13).
 *
 * המנצח הוא הנקודה היחידה שבה ה־UI נוגע בעימוד — והוא **אינו מעמד**:
 * בניית הבקשה טהורה (ui-request), ההרצה עוברת ב־WorkerClient בלבד,
 * והתוצאות נכנסות ל־stores (§13.1). השלבים: prepare ⇐ preparing;
 * progress ראשון ⇐ running; done ⇐ auditing (פרסור IR + ביקורת
 * עצמאית על ה־IR) ⇐ done + setResult. שגיאה ⇒ מפתח קטלוגי ב־runStore
 * (§12.1 — לא message גולמי).
 *
 * stale-job: שלוש שכבות — (1) supersede ב־WorkerClient (ה־job הקודם
 * מבוטל ותוצאתו נזרקת שם); (2) השוואת jobId/inputHash בכל מעבר של
 * runStore (שכבות א–ב של שלב 76); (3) כאן — מזהה ה־job של הריצה
 * הנוכחית בלבד רשאי לכתוב. תוצאה מאוחרת של job שהוחלף אינה מוצגת
 * לעולם.
 *
 * הביקורת (audit-core) רצה על ה־IR שכבר הופק — טהורה ומהירה; היא אינה
 * עימוד (§14: "בלתי תלוי"). AnchorTable אינה עוברת בפרוטוקול v1 —
 * resultStore.anchors נשאר null עד הרחבת פרוטוקול (מתועד; אין המצאת
 * ערכים).
 */
import { auditLayout } from '@tora/audit-core';
import {
  parseLayoutDocument,
  type EffectiveSettings,
  type ResolvedAssetManifest,
  type RunManifest,
  type TypesetRequest,
} from '@tora/layout-api';
import type { ParseResult } from '@tora/content-model';
import { expectedInputHashOf, WorkerJobCancelled, WorkerTypesetError, type JobHandle, type WorkerClient } from './worker-client.js';
import type { FontBytesEntry } from './protocol.js';
import { buildUiTypesetRequest } from './ui-request.js';
import { useResultStore, type ResultFinding } from '../stores/result-store.js';
import { useRunStore } from '../stores/run-store.js';
import { useEditorStore } from '../stores/editor-store.js';

/** קלט ריצה — כל מה שמניב בקשה זהה ל־CLI (§17.2#2). */
export interface UiTypesetRunInput {
  readonly source: string;
  readonly settings: Readonly<EffectiveSettings>;
  readonly assets: ResolvedAssetManifest;
  readonly fonts: readonly FontBytesEntry[];
  readonly wasmBytes: Uint8Array;
  readonly woff2DecoderBytes: Uint8Array;
  readonly documentId?: string;
  /** תוצאת פרסור קיימת של אותו מקור (שלב 80 — פרסור יחיד); אופציונלי. */
  readonly parsed?: ParseResult;
  /** מהדורת המקור בעת השליחה (editorStore.revision) — עוגן הטריות של התוצאה (שלב 81). */
  readonly sourceRevision: number;
}

/** תלות מוזרקות — ה־client הוא הערוץ; הכול השאר טהור. */
export interface TypesetControllerDeps {
  readonly client: WorkerClient;
}

export class TypesetController {
  private readonly client: WorkerClient;
  private handle: JobHandle | undefined;

  constructor(deps: TypesetControllerDeps) {
    this.client = deps.client;
  }

  /** מזהה ה־job הפעיל — לתצוגה/בדיקות; undefined כשאין ריצה פעילה. */
  get currentJobId(): string | undefined {
    return this.handle?.jobId;
  }

  /** הרצה חדשה — מבטלת את הקודמת (supersede) לפני השליחה. */
  run(input: UiTypesetRunInput): void {
    if (this.handle !== undefined) {
      const supersededJobId = this.handle.jobId;
      this.handle.cancel();
      this.handle = undefined;
      // המצב של הישן חייב להגיע למסוף לפני פתיחת החדש — אחרת begin של
      // החדש יידחה (שכבה ב של runStore: אין פתיחה מעל job פעיל).
      useRunStore.getState().cancel(supersededJobId);
    }
    const request = buildUiTypesetRequest({
      source: input.source,
      settings: input.settings,
      assets: input.assets,
      documentId: input.documentId,
      parsed: input.parsed,
    });
    const payload = {
      request,
      fonts: input.fonts,
      wasmBytes: input.wasmBytes,
      woff2DecoderBytes: input.woff2DecoderBytes,
    };
    const handle = this.client.submit(payload);
    this.handle = handle;
    const jobId = handle.jobId;
    // שלב 81: מהדורת המקור בעת השליחה — עוגן הקבלה ב־onDone. עריכה אחרי
    // השליחה הופכת את התוצאה לזרה: ההיסטים שלה מתפרשים על מקור שכבר
    // איננו, והניווט המקושר היה ממפה טווחים שגויים. הריצה הבאה אחרי
    // העריכה היא תמיד job חדש (supersede למעלה) — "עריכה מפעילה job חדש".
    const sourceRevision = input.sourceRevision;
    // הרשמה אחרי submit — בטוח: הודעות העובד אסינכרוניות ואינן מטופלות
    // לפני סוף הבלוק הסינכרוני הזה.
    useRunStore.getState().begin(jobId, expectedInputHashOf(request));
    handle.onProgress((stage, completedUnits) => {
      const run = useRunStore.getState();
      // דיווח ראשון מהמנוע ⇐ הספק נבנה והעימוד רץ (preparing → running).
      if (run.phase === 'preparing') run.markRunning(jobId);
      run.setProgress(jobId, stage, completedUnits);
    });
    void handle.done.then(
      (result) => this.onDone(jobId, request, result.layoutJson, result.layoutHash, result.manifest, sourceRevision),
      (e: unknown) => this.onRejected(jobId, e),
    );
  }

  /** ביטול ידני — המצב עובר ל־cancelled וה־jobId נשמר (שלב 76). */
  cancel(): void {
    if (this.handle === undefined) return;
    const jobId = this.handle.jobId;
    this.handle.cancel(); // דוחה את done כבוטל + מסמן בערוץ
    useRunStore.getState().cancel(jobId);
    this.handle = undefined;
  }

  // ─────────────────────────── מעברי מצב פנימיים ───────────────────────────

  private onDone(
    jobId: string,
    request: TypesetRequest,
    layoutJson: string,
    layoutHash: string,
    manifest: RunManifest,
    sourceRevision: number,
  ): void {
    const run = useRunStore.getState();
    if (run.jobId !== jobId) return; // שכבה נוספת — אין כתיבה מ־job שהוחלף
    run.markAuditing(jobId);
    // שעת השלב (81): המקור נערך מאז השליחה ⇐ התוצאה אינה של המסמך
    // הנוכחי — היא **אינה מתקבלת** (אין הצגת תוצאה ישנה כאילו היא חדשה,
    // §13.3#5). ה־job עצמו הושלם כנדרש; המהדורה שנדחתה מתועדת בעוגן
    // הטריות שלא נכתב. התוצאה המוצגת נשארת האחרונה שהתקבלה + סמן "לא
    // עדכנית" בצד התצוגה.
    if (useEditorStore.getState().revision !== sourceRevision) {
      useRunStore.getState().complete(jobId);
      return;
    }
    try {
      const ir = parseLayoutDocument(layoutJson);
      const report = auditLayout({ content: request.document, settings: request.settings, layout: ir });
      useResultStore.getState().setResult(
        {
          ir,
          manifest,
          findings: report.findings as readonly ResultFinding[],
          // AnchorTable אינה בפרוטוקול v1 — null מתועד, לא המצאה.
          anchors: null,
          sourceRevision,
        },
        layoutHash,
      );
      useRunStore.getState().complete(jobId);
    } catch (e) {
      // כשל פרסור/ביקורת של תוצאה שהגיעה — כשל מפורש, לא תוצאה חלקית.
      const code = e instanceof Error && 'code' in e ? String((e as { code: string }).code) : 'errors.worker.ENGINE_UNCLASSIFIED';
      useRunStore.getState().fail(jobId, code);
    }
  }

  private onRejected(jobId: string, e: unknown): void {
    if (e instanceof WorkerJobCancelled) {
      // בוטל — לא כישלון; runStore כבר ב־cancelled (cancel()) או שזו
      // שארית של job שהוחלף — שניהם אינם משנים מצב.
      return;
    }
    const errorCode = e instanceof WorkerTypesetError
      ? e.errorCode
      : e instanceof Error && 'errorCode' in e
        ? String((e as { errorCode: unknown }).errorCode)
        : 'errors.worker.ENGINE_UNCLASSIFIED';
    useRunStore.getState().fail(jobId, errorCode);
  }
}
