/**
 * result-store.test.ts — בדיקות store התוצאות (שלב 76; אפיון §13.1).
 *
 * מה מוכח כאן: ה־IR/manifest/findings/anchors נכנסים וקפואים **עמוק** —
 * ניסיון שינוי זורק; deepFreeze איטרטיבי (מחסנית, לא רקורסיה — לא
 * RangeError על מסמך עמוק), בטוח למחזורים (WeakSet) ולא נוגע בטיפוסים
 * אטומים (TypedArray); הכנסה שנייה מחליפה בשלמותה; reset מנקה.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import type { LayoutDocument, RunManifest } from '@tora/layout-api';
import { deepFreeze, useResultStore } from '../../src/stores/result-store.js';

const makeIr = (): LayoutDocument =>
  ({
    schemaVersion: 1,
    policyId: 'torah-v1',
    pages: [{ id: 'p-1', physicalIndex: 1, parity: 'recto', kind: 'body', size: { width: 1 as never, height: 1 as never }, regions: [], items: [{ itemId: 'i-1' }] as never[] }],
    anchors: [],
    transformations: [],
  }) as unknown as LayoutDocument;

const makeManifest = (): RunManifest =>
  ({
    schemaVersion: 1,
    engineVersion: 'test',
    codeSha: 'dev',
    engine: 'next',
    inputHash: 'a'.repeat(64),
    configHash: 'b'.repeat(64),
    fontsManifestSha256: 'c'.repeat(64),
    assetsManifestSha256: 'd'.repeat(64),
    environmentHash: 'test-env',
    layoutHash: 'e'.repeat(64),
  }) as unknown as RunManifest;

beforeEach(() => {
  useResultStore.getState().reset();
});

describe('result-store — הכנסה והחלפה', () => {
  test('מצב התחלתי ריק; setResult מאחסן הכל כולל layoutHash', () => {
    const s0 = useResultStore.getState();
    expect(s0.ir).toBeNull();
    expect(s0.manifest).toBeNull();
    expect(s0.findings).toEqual([]);
    expect(s0.anchors).toBeNull();
    expect(s0.layoutHash).toBeNull();
    useResultStore.getState().setResult(
      { ir: makeIr(), manifest: makeManifest(), findings: [{ code: 'audit.text.MISSING_ATOM', severity: 'HIGH', messageKey: 'x', params: {}, sourceSpans: [] }] },
      'e'.repeat(64),
    );
    const s1 = useResultStore.getState();
    expect(s1.ir?.pages[0]?.id).toBe('p-1');
    expect(s1.manifest?.engine).toBe('next');
    expect(s1.findings).toHaveLength(1);
    expect(s1.layoutHash).toBe('e'.repeat(64));
  });

  test('הכנסה שנייה מחליפה את הקודמת בשלמותה — אין מיזוג', () => {
    useResultStore.getState().setResult({ ir: makeIr(), manifest: makeManifest(), findings: [{ code: 'a', severity: 'LOW', messageKey: 'm', params: {}, sourceSpans: [] }] }, 'h1');
    const ir2 = makeIr();
    useResultStore.getState().setResult({ ir: ir2, manifest: makeManifest() }, 'h2');
    const s = useResultStore.getState();
    expect(s.findings).toEqual([]); // בלי findings ⇐ ריק, לא שארית
    expect(s.layoutHash).toBe('h2');
    expect(s.ir).toBe(ir2 as never);
  });

  test('reset מנקה הכל', () => {
    useResultStore.getState().setResult({ ir: makeIr(), manifest: makeManifest() }, 'h');
    useResultStore.getState().reset();
    const s = useResultStore.getState();
    expect(s.ir).toBeNull();
    expect(s.manifest).toBeNull();
    expect(s.findings).toEqual([]);
    expect(s.anchors).toBeNull();
    expect(s.layoutHash).toBeNull();
  });
});

describe('result-store — הקפאה עמוקה של מה שנכנס', () => {
  test('ה־IR קפוא עמוק: שינוי מקונן זורק במצב strict', () => {
    useResultStore.getState().setResult({ ir: makeIr(), manifest: makeManifest() }, 'h');
    const ir = useResultStore.getState().ir!;
    expect(Object.isFrozen(ir)).toBe(true);
    expect(Object.isFrozen(ir.pages)).toBe(true);
    expect(Object.isFrozen(ir.pages[0])).toBe(true);
    expect(Object.isFrozen(ir.pages[0].items)).toBe(true);
    expect(() => {
      'use strict';
      (ir.pages[0] as unknown as { id: string }).id = 'p-hacked';
    }).toThrow();
  });

  test('הממצאים והמניפסט קפואים גם הם; anchors=null כשלא סופק', () => {
    const finding = { code: 'x', severity: 'HIGH' as const, messageKey: 'm', params: { k: 1 }, sourceSpans: [] };
    useResultStore.getState().setResult({ ir: makeIr(), manifest: makeManifest(), findings: [finding] }, 'h');
    const s = useResultStore.getState();
    expect(Object.isFrozen(s.findings)).toBe(true);
    expect(Object.isFrozen(s.findings[0])).toBe(true);
    expect(Object.isFrozen(s.manifest)).toBe(true);
    expect(s.anchors).toBeNull();
  });
});

describe('deepFreeze — איטרטיבי, בטוח למחזורים', () => {
  test('אובייקט מעגלי אינו תלוי ואינו זורק (WeakSet)', () => {
    const a: Record<string, unknown> = { name: 'a' };
    const b: Record<string, unknown> = { name: 'b', back: a };
    a.self = a;
    a.b = b;
    expect(() => deepFreeze(a)).not.toThrow();
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(b)).toBe(true);
  });

  test('מחסנית ולא רקורסיה: שרשרת של 50,000 עומק — בלי RangeError', () => {
    let node: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 50_000; i += 1) node = { next: node };
    expect(() => deepFreeze(node)).not.toThrow();
    expect(Object.isFrozen(node)).toBe(true);
  });

  test('פרימיטיבים עוברים חלק; TypedArray אינו נאטם (freeze עליו זורק)', () => {
    expect(deepFreeze(5)).toBe(5);
    expect(deepFreeze('x')).toBe('x');
    expect(deepFreeze(null)).toBeNull();
    const bytes = new Uint8Array([1, 2, 3]);
    const holder = { bytes };
    expect(() => deepFreeze(holder)).not.toThrow();
    expect(Object.isFrozen(holder)).toBe(true);
    expect(Object.isFrozen(bytes)).toBe(false);
  });
});
