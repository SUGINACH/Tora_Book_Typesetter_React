/**
 * SettingsPanel.tsx — לוח ההגדרות מ־Setting Registry (שלב 78; אפיון §13.3,
 * תכנית שלב 78: "כל ההגדרות נגישות ממקור אחד בלי שדות יתומים").
 *
 * הלוח כולו נגול מהמרשם (settingsRegistry — אותו מופע יחיד של
 * settings-store): הקבוצות לפי ui.section בסדר הופעה ראשון במרשם
 * (דטרמיניסטי), השדות לפי סדר המרשם, התוויות מקטלוג ה־i18n. אין כאן
 * רשימת שדות כתובה־ביד ואין טופס מקביל — שער השלב.
 *
 * מסנן החיפוש הוא מצב חולף של הרכיב (לא נשמר, לא נכנס ל־stores ולא
 * ל־configHash). עם העלייה מחושב effective אחת (ברירות המחדל של המרשם)
 * כדי שהשדות יציגו ערכים עוד לפני העריכה הראשונה; אחר כל שינוי
 * ה־effective/configHash מתעדכנים ב־SettingRow (§13.3: draft ← validation
 * ← effective/hash).
 */
import { useEffect, useMemo, useState } from 'react';
import { settingsRegistry, useSettingsStore, type SettingDefinition } from '../../stores/settings-store.js';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { SECTION_LABELS, SETTINGS_LABELS } from '../../i18n/settings-labels.js';
import { SettingRow } from './SettingRow';

/** קיבוץ לפי מדור בסדר הופעה ראשון במרשם — דטרמיניסטי (מיון המחולל). */
const grouped = (): readonly { readonly section: string; readonly defs: readonly SettingDefinition[] }[] => {
  const map = new Map<string, SettingDefinition[]>();
  for (const def of settingsRegistry.byKey.values()) {
    const list = map.get(def.ui.section);
    if (list === undefined) map.set(def.ui.section, [def]);
    else list.push(def);
  }
  return [...map.entries()].map(([section, defs]) => Object.freeze({ section, defs: Object.freeze(defs) }));
};

const SECTION_GROUPS = grouped();

export function SettingsPanel() {
  const [filter, setFilter] = useState('');
  const effective = useStoreWithEqualityFn(useSettingsStore, (s) => s.effective);

  // ברירות מחדל מוצגות מיד: effective ראשון בעלייה (§13.3 שלב 3).
  useEffect(() => {
    if (useSettingsStore.getState().effective === null) useSettingsStore.getState().applyDraft();
  }, []);

  const q = filter.trim().toLowerCase();
  const groups = useMemo(() => {
    if (q === '') return SECTION_GROUPS;
    return SECTION_GROUPS.map((g) => ({
      section: g.section,
      defs: g.defs.filter(
        (d) =>
          d.key.toLowerCase().includes(q) ||
          (SETTINGS_LABELS[d.ui.labelKey]?.he ?? '').toLowerCase().includes(q),
      ),
    })).filter((g) => g.defs.length > 0);
  }, [q]);

  const total = settingsRegistry.byKey.size;
  const shown = groups.reduce((n, g) => n + g.defs.length, 0);

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col shrink-0 text-sm" dir="rtl" data-testid="settings-panel">
      <div className="p-3 border-b border-gray-200 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">הגדרות הספר</h2>
          <span className="text-[10px] text-gray-400">מרשם {total} מפתחות</span>
        </div>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="סינון לפי מפתח או תווית…"
          className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
          data-testid="settings-filter"
        />
        {filter.trim() !== '' && (
          <p className="text-[10px] text-gray-400">{shown} מתוך {total}</p>
        )}
      </div>

      <div className="flex-1 overflow-auto px-3 pb-2">
        {groups.map((g) => (
          <section key={g.section} className="mb-4" data-setting-section={g.section}>
            <h3 className="font-bold text-xs text-gray-600 sticky top-0 bg-white py-1 border-b border-gray-200">
              {SECTION_LABELS[g.section] ?? g.section}
              <span className="text-gray-300 font-normal mr-1">({g.defs.length})</span>
            </h3>
            {g.defs.map((def) => (
              <SettingRow key={def.key} def={def} />
            ))}
          </section>
        ))}
        {groups.length === 0 && (
          <p className="text-xs text-gray-400 p-2">אין התאמות לסינון.</p>
        )}
      </div>

      <div className="p-2 border-t border-gray-200 bg-gray-50 text-[10px] text-gray-500 flex items-center justify-between" data-testid="settings-footer">
        <span>configHash: {effective === null ? '—' : effective.configHash.slice(0, 12)}</span>
        <span>עדכון הפריסה דרך כפתור ההרצה בלבד</span>
      </div>
    </div>
  );
}
