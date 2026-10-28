import { describe, it, expect } from 'vitest';
import { toGematria } from '../../../src/lib/gematria';

describe('toGematria', () => {
  it('1-9', () => {
    expect(toGematria(1)).toBe('א');
    expect(toGematria(9)).toBe('ט');
  });
  it('10, 15, 16', () => {
    expect(toGematria(10)).toBe('י');
    expect(toGematria(15)).toBe('ט״ו');
    expect(toGematria(16)).toBe('ט״ז');
  });
  it('100, 400', () => {
    expect(toGematria(100)).toBe('ק');
    expect(toGematria(400)).toBe('ת');
  });
  it('multi-digit', () => {
    expect(toGematria(11)).toBe('י״א');
    expect(toGematria(123)).toBe('קכ״ג');
  });
});
