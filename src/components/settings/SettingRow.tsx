/**
 * SettingRow.tsx — שורת הגדרה אחת בלוח (שלב 78; אפיון §13.3).
 *
 * כל מה שהשורה מציגה מגיע מה־Setting Registry ומקטלוג התוויות — אין בה
 * שום הגדרה מקומית משלה: הפקד לפי ui.control, האפשרויות לפי enumValues,
 * היחידה לפי unit, התלות לפי ui.dependsOn, התג לפי affectsLayout והתווית
 * לפי labelKey דרך הקטלוג. הערך המוצג הוא הערך האפקטיבי (ברירות מחדל ⇐
 * draft), וכל שינוי עובר את מסלול §13.3: עדכון draft ← validation ←
 * חישוב effective/configHash (applyDraft). ערך לא חוקי אינו נכנס ל־draft —
 * הבעיה מוצגת צמוד לשדה ותו־לא.
 */
import { memo } from 'react';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { useSettingsStore, type SettingDefinition } from '../../stores/settings-store.js';
import { SETTINGS_LABELS } from '../../i18n/settings-labels.js';

/** תנאי תלות לא מתקיים? (השוואת מחרוזות קנונית — בוליאן כ-'true'/'false'.) */
const depMet = (dep: { readonly key: string; readonly values: readonly string[] }, current: unknown): boolean =>
  dep.values.includes(String(current));

const issueText = (code: string, params: Record<string, unknown>): string => {
  // אין הצגת message גולמי — מפתח קטלוגי + פרמטרים (פטרון שלב 12).
  const p = Object.entries(params).map(([k, v]) => `${k}=${String(v)}`).join(' ');
  return p === '' ? code : `${code} (${p})`;
};

interface SettingRowProps {
  readonly def: SettingDefinition;
}

export const SettingRow = memo(function SettingRow({ def }: SettingRowProps) {
  const label = SETTINGS_LABELS[def.ui.labelKey];
  const value = useStoreWithEqualityFn(useSettingsStore, (s) => s.effective?.values[def.key]);
  const modified = useStoreWithEqualityFn(useSettingsStore, (s) => def.key in s.draft);
  const rowIssues = useStoreWithEqualityFn(
    useSettingsStore,
    (s) => s.issues.filter((i) => i.params.key === def.key),
    (a, b) => a.length === b.length && a.every((x, i) => x === b[i]),
  );
  const depValue = useStoreWithEqualityFn(useSettingsStore, (s) =>
    def.ui.dependsOn === null ? undefined : s.effective?.values[def.ui.dependsOn.key],
  );

  const disabledByDep = def.ui.dependsOn !== null && !depMet(def.ui.dependsOn, depValue);

  const onChange = (raw: unknown): void => {
    const store = useSettingsStore.getState();
    store.setDraftValue(def.key, raw);
    useSettingsStore.getState().applyDraft(); // §13.3 שלב 3 — effective/configHash תמיד עדכני
  };

  const labelText = label?.he ?? def.ui.labelKey; // קטלוג חסר לא קורה (נאכף) — נפילה בטוחה למפתח
  const descText = label?.description ?? def.key;

  return (
    <div
      className={`py-1.5 border-b border-gray-100 last:border-b-0 ${disabledByDep ? 'opacity-50' : ''}`}
      data-setting-key={def.key}
      data-affects-layout={def.affectsLayout ? 'true' : 'false'}
    >
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={`setting-${def.key}`}
          className="text-xs text-gray-700 flex-1 leading-snug"
          title={`${descText} (${def.key})`}
        >
          {labelText}
          {modified && <span className="text-blue-600 mr-1" title="שונה מברירת המחדל">•</span>}
        </label>
        {def.affectsLayout ? (
          <span className="text-[10px] px-1 py-px bg-indigo-100 text-indigo-700 rounded shrink-0" title="משפיע על הפריסה — נכנס ל-configHash">
            פריסה
          </span>
        ) : (
          <span className="text-[10px] px-1 py-px bg-gray-100 text-gray-500 rounded shrink-0" title="מצב ממשק בלבד — אינו נכנס ל-configHash">
            UI
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        {def.ui.control === 'checkbox' ? (
          <input
            id={`setting-${def.key}`}
            type="checkbox"
            checked={value === true}
            disabled={disabledByDep}
            onChange={(e) => onChange(e.target.checked)}
            data-setting-control="checkbox"
          />
        ) : def.ui.control === 'select' && def.enumValues !== null ? (
          <select
            id={`setting-${def.key}`}
            value={String(value ?? '')}
            disabled={disabledByDep}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-1.5 py-1 text-xs bg-white"
            data-setting-control="select"
          >
            {def.enumValues.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        ) : def.type === 'number' ? (
          <input
            id={`setting-${def.key}`}
            type="number"
            step="any"
            value={value === undefined || value === null ? '' : String(value)}
            disabled={disabledByDep}
            onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
            className="flex-1 border border-gray-300 rounded px-1.5 py-1 text-xs"
            data-setting-control="number"
          />
        ) : (
          <input
            id={`setting-${def.key}`}
            type="text"
            value={value === undefined || value === null ? '' : String(value)}
            disabled={disabledByDep}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-1.5 py-1 text-xs font-mono"
            data-setting-control="text"
            dir="auto"
          />
        )}
        {def.unit !== null && (
          <span className="text-[10px] text-gray-400 shrink-0" title={`יחידות חוקיות: ${def.unit}`}>{def.unit}</span>
        )}
      </div>
      {disabledByDep && def.ui.dependsOn !== null && (
        <p className="text-[10px] text-gray-400 mt-0.5" data-setting-dep-hint={def.ui.dependsOn.key}>
          רלוונטי רק כאשר {def.ui.dependsOn.key} = {def.ui.dependsOn.values.join('|')}
        </p>
      )}
      {rowIssues.length > 0 && (
        <p className="text-[10px] text-red-600 mt-0.5" data-setting-issue={def.key}>
          {rowIssues.map((i) => issueText(i.code, i.params as Record<string, unknown>)).join(' · ')}
        </p>
      )}
    </div>
  );
});
