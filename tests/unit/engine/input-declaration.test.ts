import { describe, it, expect } from 'vitest';
import { declareInputs, diffInputs } from '../../../src/worker/inputs/input-declaration';
import { defaultSettings } from '../../../src/lib/default-settings';
import type { Settings } from '../../../src/types';

const TEXT = 'שם הספר - ספר בדיקה\nכותרת 2 - פרק\nפסקה.';

describe('input-declaration', () => {
  it('מחשב hash לכל רכיב', () => {
    const inputs = declareInputs(TEXT, defaultSettings);
    expect(inputs.textHash).toMatch(/^[0-9a-f]{8}$/);
    expect(inputs.settingsHash).toMatch(/^[0-9a-f]{8}$/);
    expect(inputs.combinedHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('אותו קלט → אותו hash', () => {
    const a = declareInputs(TEXT, defaultSettings);
    const b = declareInputs(TEXT, defaultSettings);
    expect(a.combinedHash).toBe(b.combinedHash);
  });

  it('טקסט שונה → hash שונה', () => {
    const a = declareInputs(TEXT, defaultSettings);
    const b = declareInputs(TEXT + ' שינוי', defaultSettings);
    expect(a.textHash).not.toBe(b.textHash);
  });

  it('הגדרות שונות → hash שונה', () => {
    const modified: Settings = {
      ...defaultSettings,
      typography: { ...defaultSettings.typography, bodyFont: { ...defaultSettings.typography.bodyFont, size: 14 } },
    };
    const a = declareInputs(TEXT, defaultSettings);
    const b = declareInputs(TEXT, modified);
    expect(a.settingsHash).not.toBe(b.settingsHash);
  });

  it('diffInputs — מזהה שינוי טקסט', () => {
    const a = declareInputs(TEXT, defaultSettings);
    const b = declareInputs(TEXT + '!', defaultSettings);
    const diff = diffInputs(a, b);
    expect(diff.textChanged).toBe(true);
    expect(diff.anyChanged).toBe(true);
  });

  it('diffInputs — ללא שינוי', () => {
    const a = declareInputs(TEXT, defaultSettings);
    const b = declareInputs(TEXT, defaultSettings);
    expect(diffInputs(a, b).anyChanged).toBe(false);
  });
});
