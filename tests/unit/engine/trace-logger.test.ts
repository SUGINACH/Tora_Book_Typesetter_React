import { describe, it, expect } from 'vitest';
import { TraceLogger } from '../../../src/worker/engine/trace-logger';

describe('TraceLogger', () => {
  it('כבוי — אין events', () => {
    const logger = new TraceLogger(false);
    logger.log('fn', { foo: 'bar' });
    expect(logger.count).toBe(0);
  });

  it('דלוק — רושם events', () => {
    const logger = new TraceLogger(true);
    logger.log('fn1', { x: 1 });
    logger.log('fn2', { y: 2 });
    expect(logger.count).toBe(2);
  });

  it('כל event מכיל t, fn, args', () => {
    const logger = new TraceLogger(true);
    logger.log('myFunc', { x: 1 });
    const ev = logger.events[0]!;
    expect(ev.t).toBeGreaterThan(0);
    expect(ev.fn).toBe('myFunc');
    expect(ev.args).toContain('x');
  });

  it('חותך args ל-200 תווים', () => {
    const logger = new TraceLogger(true);
    logger.log('fn', 'a'.repeat(500));
    expect(logger.events[0]!.args.length).toBeLessThanOrEqual(200);
  });

  it('clear מנקה events', () => {
    const logger = new TraceLogger(true);
    logger.log('a', 1);
    logger.log('b', 2);
    expect(logger.count).toBe(2);
    logger.clear();
    expect(logger.count).toBe(0);
  });

  it('flush מחזיר events ומנקה', () => {
    const logger = new TraceLogger(true);
    logger.log('a', 1);
    logger.log('b', 2);
    const flushed = logger.flush();
    expect(flushed.length).toBe(2);
    expect(logger.count).toBe(0);
  });

  it('דטרמיניסטי', () => {
    const run = () => {
      const logger = new TraceLogger(true);
      logger.log('fn1', { x: 1 });
      logger.log('fn2', { y: 2 });
      return logger.events.map(e => `${e.fn}:${e.args}`).join('|');
    };
    expect(run()).toBe(run());
  });
});
