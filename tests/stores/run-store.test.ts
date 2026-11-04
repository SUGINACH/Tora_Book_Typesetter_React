/**
 * run-store.test.ts — בדיקות מכונת מצבי ה־job (שלב 76; אפיון §13.1, §12.1).
 *
 * מה מוכח כאן: שבעת המצבים; הגנת stale-job דו־שכבתית — (א) הודעה
 * מ־job זר אינה נוגעת במצב; (ב) idle חסין: בלי job פעיל כל הודעת
 * ערוץ היא שארית; ביטול שומר jobId כדי שהודעה מאוחרת של אותו job
 * תזוהה כלא־רלוונטית ולא כטרייה.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { useRunStore, RUN_STATES } from '../../src/stores/run-store.js';

beforeEach(() => {
  useRunStore.getState().reset();
});

describe('run-store — מכונת המצבים', () => {
  test('שבעה מצבים בדיוק; התחלה idle עם מזהים ריקים', () => {
    expect([...RUN_STATES]).toEqual(['idle', 'preparing', 'running', 'auditing', 'done', 'error', 'cancelled']);
    const s = useRunStore.getState();
    expect(s.phase).toBe('idle');
    expect(s.jobId).toBeNull();
    expect(s.inputHash).toBeNull();
    expect(s.progress).toBeNull();
    expect(s.errorCode).toBeNull();
  });

  test('מסלול מלא: begin→preparing→running→auditing→done עם progress בדרך', () => {
    const st = useRunStore.getState();
    st.begin('job-1', 'hash-1');
    expect(useRunStore.getState().phase).toBe('preparing');
    useRunStore.getState().setProgress('job-1', 'parse', 3, 10);
    expect(useRunStore.getState().progress).toEqual({ stage: 'parse', completedUnits: 3, totalUnits: 10 });
    useRunStore.getState().markRunning('job-1');
    expect(useRunStore.getState().phase).toBe('running');
    useRunStore.getState().markAuditing('job-1');
    expect(useRunStore.getState().phase).toBe('auditing');
    useRunStore.getState().complete('job-1');
    const done = useRunStore.getState();
    expect(done.phase).toBe('done');
    expect(done.jobId).toBe('job-1'); // נשמר — ראה בדיקת המאוחרים
    expect(done.progress).toBeNull();
  });

  test('begin נדחה אם job חי — הפתיחה היחידה היא מ־idle', () => {
    useRunStore.getState().begin('job-1', 'h1');
    useRunStore.getState().begin('job-2', 'h2'); // ניסיון דריסה — אסור
    const s = useRunStore.getState();
    expect(s.phase).toBe('preparing');
    expect(s.jobId).toBe('job-1');
  });

  test('מעברים לא עוקבים נדחים (running→done ישירות; running→running)', () => {
    useRunStore.getState().begin('j', 'h');
    useRunStore.getState().markRunning('j');
    useRunStore.getState().complete('j'); // מ-done רק מתוך auditing
    expect(useRunStore.getState().phase).toBe('running');
    useRunStore.getState().markRunning('j'); // כבר running
    expect(useRunStore.getState().phase).toBe('running');
  });
});

describe('run-store — הגנת stale-job דו־שכבתית', () => {
  test('שכבה א: הודעה מ־job זר מתעלמת ממנה בכל מעבר', () => {
    useRunStore.getState().begin('job-1', 'h1');
    useRunStore.getState().markRunning('job-1');
    // progress/done/error/cancel של job-2 — שאריות מהפרוטוקול
    useRunStore.getState().setProgress('job-2', 'parse', 1);
    useRunStore.getState().markAuditing('job-2');
    useRunStore.getState().complete('job-2');
    useRunStore.getState().fail('job-2', 'errors.engine.X');
    const s = useRunStore.getState();
    expect(s.phase).toBe('running');
    expect(s.jobId).toBe('job-1');
    expect(s.progress).toBeNull();
    expect(s.errorCode).toBeNull();
  });

  test('שכבה ב: idle חסין — progress/done/error/cancel בלי job פעיל נזרקים', () => {
    useRunStore.getState().setProgress('ghost', 'parse', 5);
    useRunStore.getState().markRunning('ghost');
    useRunStore.getState().markAuditing('ghost');
    useRunStore.getState().complete('ghost');
    useRunStore.getState().fail('ghost', 'errors.engine.LATE');
    useRunStore.getState().cancel('ghost');
    const s = useRunStore.getState();
    expect(s.phase).toBe('idle');
    expect(s.jobId).toBeNull();
    expect(s.errorCode).toBeNull();
  });

  test('cancel: מצב cancelled עם jobId שמור; done מאוחר של אותו job נדחה', () => {
    useRunStore.getState().begin('job-1', 'h1');
    useRunStore.getState().markRunning('job-1');
    useRunStore.getState().cancel('job-1');
    const cancelled = useRunStore.getState();
    expect(cancelled.phase).toBe('cancelled');
    expect(cancelled.jobId).toBe('job-1'); // נשמר — לא נחשב job חדש
    useRunStore.getState().complete('job-1'); // מאוחר — cancelled אינו auditing
    expect(useRunStore.getState().phase).toBe('cancelled');
    useRunStore.getState().setProgress('job-1', 'parse', 9);
    expect(useRunStore.getState().progress).toBeNull();
  });

  test('אחרי cancelled נפתח job חדש כרגיל (reset מפורש בין מסמכים)', () => {
    useRunStore.getState().begin('job-1', 'h1');
    useRunStore.getState().markRunning('job-1');
    useRunStore.getState().cancel('job-1');
    useRunStore.getState().begin('job-2', 'h2');
    const s = useRunStore.getState();
    expect(s.phase).toBe('preparing');
    expect(s.jobId).toBe('job-2');
    expect(s.inputHash).toBe('h2');
  });
});

describe('run-store — כשל ואיפוס', () => {
  test('fail רושם errorCode ומנקה progress; reset מחזיר idle מלא', () => {
    useRunStore.getState().begin('job-1', 'h1');
    useRunStore.getState().markRunning('job-1');
    useRunStore.getState().setProgress('job-1', 'layout', 2);
    useRunStore.getState().fail('job-1', 'errors.engine.TOC_FIXED_POINT_NOT_REACHED');
    const failed = useRunStore.getState();
    expect(failed.phase).toBe('error');
    expect(failed.errorCode).toBe('errors.engine.TOC_FIXED_POINT_NOT_REACHED');
    expect(failed.progress).toBeNull();
    useRunStore.getState().reset();
    const s = useRunStore.getState();
    expect(s.phase).toBe('idle');
    expect(s.jobId).toBeNull();
    expect(s.errorCode).toBeNull();
  });
});
