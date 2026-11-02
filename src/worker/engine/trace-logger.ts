import type { TraceEvent } from '../../types';

/**
 * יומן החלטות — אופציונלי.
 * כבוי כברירת מחדל (אינו משפיע על הפריסה).
 *
 * סעיף 5.11 באפיון הטכני.
 */
export class TraceLogger {
  private _events: TraceEvent[] = [];

  constructor(private readonly enabled: boolean = false) {}

  log(
    fn: string,
    args: unknown,
    before?: unknown,
    after?: unknown,
    result?: unknown
  ): void {
    if (!this.enabled) return;
    this._events.push({
      t: performance.now(),
      fn,
      args: JSON.stringify(args).slice(0, 200),
      before: before !== undefined ? JSON.stringify(before).slice(0, 200) : undefined,
      after: after !== undefined ? JSON.stringify(after).slice(0, 200) : undefined,
      result: result !== undefined ? JSON.stringify(result).slice(0, 200) : undefined,
    });
  }

  get events(): TraceEvent[] {
    return this._events;
  }

  get count(): number {
    return this._events.length;
  }

  clear(): void {
    this._events = [];
  }

  flush(): TraceEvent[] {
    const out = [...this._events];
    this._events = [];
    return out;
  }
}

export const traceLogger = new TraceLogger(false);
