/**
 * schema.ts — סכמת fixture ואימותה (שלב 13; אפיון §17.3).
 * הרישום (registry.json) הוא המקור היחיד לאמת; הסכמה מאומתת תוך כדי.
 * החבילה נקייה מתלויות — פונקציית הגיבוב מוזרקת (כדי לא לשבור את גרף התלות).
 */

/** ערך סדיר לפרמטרים. */
export type FixtureParamValue = string | number | boolean | null;

/** ממצא אימות של fixture — מבנה מקביל ל־ValidationIssue (ללא תלות בין חבילות). */
export interface FixtureValidationIssue {
  readonly fixtureId: string;
  readonly field: string;
  readonly problem: string;
}

/** רשומת fixture — סכמה מלאה (§17.3). */
export interface FixtureEntry {
  readonly id: string;
  readonly schemaVersion: number;
  readonly kind: string;
  readonly corpusFile: { readonly path: string; readonly sha256: string; readonly bytes: number };
  readonly settings: { readonly source: string; readonly sha256: string };
  readonly settingsSha256: string;
  readonly fontManifestSha256: string;
  readonly enginePolicy: string;
  readonly expected: {
    readonly invariants: readonly string[];
    readonly baselineArtifact: string | null;
    readonly goldenLayoutSha256: string | null;
  };
  readonly provenance: {
    readonly sourceRepo: string;
    readonly sourceSha: string;
    readonly sourcePath: string;
    readonly reason: string;
  };
  readonly settingsVariant?: { readonly path: string; readonly sha256: string; readonly bytes: number };
}

const HEX64 = /^[0-9a-f]{64}$/;

/** אימות רשומת fixture בודדת לפי הסכמה — מחזיר את כל הבעיות (לא עוצר בראשונה). */
export function validateFixture(f: unknown): FixtureValidationIssue[] {
  const issues: FixtureValidationIssue[] = [];
  const id = (typeof (f as FixtureEntry)?.id === 'string') ? (f as FixtureEntry).id : '(חסר id)';
  const add = (field: string, problem: string) => issues.push({ fixtureId: id, field, problem });
  const e = f as Partial<FixtureEntry> | null;
  if (!e || typeof e !== 'object') return [{ fixtureId: id, field: '$', problem: 'אינו אובייקט' }];
  if (typeof e.id !== 'string' || e.id.length === 0) add('id', 'חסר או ריק');
  if (e.schemaVersion !== 2) add('schemaVersion', `צפוי 2, התקבל ${String(e.schemaVersion)}`);
  if (typeof e.kind !== 'string') add('kind', 'חסר');
  if (!e.corpusFile || typeof e.corpusFile.path !== 'string' || !HEX64.test(e.corpusFile.sha256 ?? '')) {
    add('corpusFile', 'חסר נתיב או sha256 בן 64 hex');
  }
  if (!e.settings || !HEX64.test(e.settings.sha256 ?? '')) add('settings.sha256', 'חסר או שגוי');
  if (!HEX64.test(e.settingsSha256 ?? '')) add('settingsSha256', 'חסר או שגוי');
  if (!HEX64.test(e.fontManifestSha256 ?? '')) add('fontManifestSha256', 'חסר או שגוי');
  if (typeof e.enginePolicy !== 'string' || e.enginePolicy.length === 0) add('enginePolicy', 'חסר');
  if (!Array.isArray(e.expected?.invariants) || e.expected.invariants.length === 0) {
    add('expected.invariants', 'רשימה ריקה או חסרה');
  }
  if (e.expected && e.expected.goldenLayoutSha256 !== null && !HEX64.test(e.expected.goldenLayoutSha256 ?? '')) {
    add('expected.goldenLayoutSha256', 'null (עדיין) או hex תקין בלבד');
  }
  const p = e.provenance;
  if (!p || typeof p.sourceRepo !== 'string' || !HEX64_OR_40.test(p.sourceSha ?? '')
    || typeof p.sourcePath !== 'string' || typeof p.reason !== 'string' || p.reason.length === 0) {
    add('provenance', 'חסר מקור/SHA/נתיב/סיבה');
  }
  return issues;
}

const HEX64_OR_40 = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/** אימות רישום מלא — מחזיר את כל הבעיות מכל הפריטים. */
export function validateRegistry(registry: { fixtures?: unknown[] }): FixtureValidationIssue[] {
  const issues: FixtureValidationIssue[] = [];
  const seen = new Set<string>();
  for (const f of registry.fixtures ?? []) {
    const e = f as FixtureEntry;
    if (seen.has(e?.id)) issues.push({ fixtureId: e.id, field: 'id', problem: 'מזהה כפול' });
    seen.add(e?.id);
    issues.push(...validateFixture(f));
  }
  return issues;
}
