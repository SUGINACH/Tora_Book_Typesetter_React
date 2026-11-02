import { describe, it, expect, beforeEach } from 'vitest';
import { useTraceStore } from '../../../src/store/trace-store';
import type { TraceEvent } from '../../../src/types';

const sample: TraceEvent = { t: 1, fn: 'breakPages', args: '{}' };

describe('trace-store', () => {
  beforeEach(() => {
    useTraceStore.getState().clear();
    useTraceStore.getState().disable();
  });

  it('initial state — empty, disabled', () => {
    const s = useTraceStore.getState();
    expect(s.events).toEqual([]);
    expect(s.isEnabled).toBe(false);
  });

  it('setEvents', () => {
    useTraceStore.getState().setEvents([sample]);
    expect(useTraceStore.getState().events).toEqual([sample]);
  });

  it('toggle', () => {
    expect(useTraceStore.getState().isEnabled).toBe(false);
    useTraceStore.getState().toggle();
    expect(useTraceStore.getState().isEnabled).toBe(true);
    useTraceStore.getState().toggle();
    expect(useTraceStore.getState().isEnabled).toBe(false);
  });

  it('enable/disable', () => {
    useTraceStore.getState().enable();
    expect(useTraceStore.getState().isEnabled).toBe(true);
    useTraceStore.getState().disable();
    expect(useTraceStore.getState().isEnabled).toBe(false);
  });

  it('clear', () => {
    useTraceStore.getState().setEvents([sample, sample]);
    useTraceStore.getState().clear();
    expect(useTraceStore.getState().events).toEqual([]);
  });

  it('add', () => {
    useTraceStore.getState().add(sample);
    useTraceStore.getState().add({ t: 2, fn: 'balance', args: '{}' });
    expect(useTraceStore.getState().events.length).toBe(2);
  });
});
