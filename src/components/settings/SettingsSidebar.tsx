import { useSettingsStore } from '../../store/settings-store';
import { useSettings } from '../../hooks/useTypesetter';
import type { FontConfig } from '../../types';

const HEBREW_FONTS = [
  'Frank Ruhl Libre',
  'FrankRuehl',
  'Guttman Rashi',
  'Noto Serif Hebrew',
  'David Libre',
  'David',
  'FrankReal',
  'Frank Re',
  'Livorna',
  'Hadassah Friedlaender',
  'serif',
];

export function SettingsSidebar() {
  const settings = useSettings();
  const update = useSettingsStore((s) => s.update);
  const updateNested = useSettingsStore((s) => s.updateNested);
  const toggleSettings = () => useSettingsStore.setState({});

  return (
    <div className="w-72 bg-white border-r border-gray-200 overflow-auto p-4 text-sm" dir="rtl">
      <h2 className="font-bold text-lg mb-4">הגדרות</h2>

      {/* גופן גוף הטקסט */}
      <section className="mb-6">
        <h3 className="font-bold mb-2 text-gray-700">גופן גוף הטקסט</h3>
        <label className="block text-xs text-gray-500 mb-1">משפחת גופן</label>
        <select
          value={settings.typography.bodyFont.family[0]}
          onChange={(e) => {
            const newFamily = [e.target.value, ...settings.typography.bodyFont.family.slice(1)];
            updateNested('typography.bodyFont.family', newFamily);
          }}
          className="w-full border border-gray-300 rounded px-2 py-1 mb-2"
        >
          {HEBREW_FONTS.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>

        <label className="block text-xs text-gray-500 mb-1">גודל (pt)</label>
        <input
          type="number"
          value={settings.typography.bodyFont.size as number}
          min={9}
          max={16}
          step={0.5}
          onChange={(e) => updateNested('typography.bodyFont.size', Number(e.target.value))}
          className="w-full border border-gray-300 rounded px-2 py-1 mb-2"
        />

        <label className="block text-xs text-gray-500 mb-1">ריווח שורות</label>
        <input
          type="range"
          value={settings.typography.bodyFont.lineHeight as number}
          min={1.15}
          max={1.75}
          step={0.01}
          onChange={(e) => updateNested('typography.bodyFont.lineHeight', Number(e.target.value))}
          className="w-full mb-2"
        />
        <span className="text-xs text-gray-500">{(settings.typography.bodyFont.lineHeight as number).toFixed(2)}</span>
      </section>

      {/* שוליים */}
      <section className="mb-6">
        <h3 className="font-bold mb-2 text-gray-700">שוליים</h3>
        {(['top', 'bottom', 'inner', 'outer'] as const).map((side) => (
          <div key={side} className="mb-2">
            <label className="block text-xs text-gray-500 mb-1">{side} (mm)</label>
            <input
              type="number"
              value={settings.pageMargins[side]}
              min={5}
              max={50}
              step={1}
              onChange={(e) => updateNested(`pageMargins.${side}`, Number(e.target.value))}
              className="w-full border border-gray-300 rounded px-2 py-1"
            />
          </div>
        ))}
      </section>

      {/* גריד */}
      <section className="mb-6">
        <h3 className="font-bold mb-2 text-gray-700">גריד</h3>
        <label className="block text-xs text-gray-500 mb-1">רוחב טור (%)</label>
        <input
          type="number"
          value={settings.grid.columnWidth}
          min={30}
          max={48}
          step={1}
          onChange={(e) => updateNested('grid.columnWidth', Number(e.target.value))}
          className="w-full border border-gray-300 rounded px-2 py-1 mb-2"
        />
        <label className="block text-xs text-gray-500 mb-1">רווח מרכזי (%)</label>
        <input
          type="number"
          value={settings.grid.gutterWidth}
          min={1}
          max={10}
          step={0.5}
          onChange={(e) => updateNested('grid.gutterWidth', Number(e.target.value))}
          className="w-full border border-gray-300 rounded px-2 py-1 mb-2"
        />
        <label className="block text-xs text-gray-500 mb-1">קו מפריד</label>
        <select
          value={settings.grid.columnDivider}
          onChange={(e) => updateNested('grid.columnDivider', e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1 mb-2"
        >
          <option value="none">ללא</option>
          <option value="line">קו רגיל</option>
          <option value="dashed">מקווקו</option>
          <option value="double">כפול</option>
        </select>
      </section>

      {/* איכות עימוד */}
      <section className="mb-6">
        <h3 className="font-bold mb-2 text-gray-700">איכות עימוד אוטומטי</h3>
        <label className="flex items-center justify-between mb-2">
          <span>מניעת אלמנה</span>
          <input
            type="checkbox"
            checked={settings.quality.preventWidow}
            onChange={(e) => updateNested('quality.preventWidow', e.target.checked)}
          />
        </label>
        <label className="flex items-center justify-between mb-2">
          <span>מניעת יתום</span>
          <input
            type="checkbox"
            checked={settings.quality.preventOrphan}
            onChange={(e) => updateNested('quality.preventOrphan', e.target.checked)}
          />
        </label>
      </section>

      {/* מספר עמוד */}
      <section className="mb-6">
        <h3 className="font-bold mb-2 text-gray-700">מספר עמוד</h3>
        <label className="block text-xs text-gray-500 mb-1">פורמט</label>
        <select
          value={settings.grid.pageNumberFormat}
          onChange={(e) => updateNested('grid.pageNumberFormat', e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1 mb-2"
        >
          <option value="hebrew-letter">אות עברית (א, ב, ג...)</option>
          <option value="hebrew-letter-daf">"דף א"</option>
          <option value="arabic">ספרות (1, 2, 3...)</option>
        </select>
        <label className="block text-xs text-gray-500 mb-1">מסגרת</label>
        <select
          value={settings.grid.pageNumberFrame}
          onChange={(e) => updateNested('grid.pageNumberFrame', e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1"
        >
          <option value="none">ללא</option>
          <option value="circle">עיגול</option>
          <option value="square">ריבוע</option>
          <option value="round-parens">(א)</option>
          <option value="square-brackets">[א]</option>
        </select>
      </section>
    </div>
  );
}
