import { useState, useEffect } from 'react';
import { useSettingsStore } from '../../store/settings-store';
import { useSettings } from '../../hooks/useTypesetter';
import { loadShaarDesigns, type ShaarDesigns } from '../../lib/shaar-loader';
import { exportCustomStyles } from '../../lib/custom-styles-io';
import { CustomStylePanel } from '../panels/CustomStylePanel';

const HEBREW_FONTS = [
  'Frank Ruhl Libre', 'FrankRuehl', 'Guttman Rashi', 'Noto Serif Hebrew',
  'David Libre', 'David', 'FrankReal', 'Frank Re', 'Livorna',
  'Hadassah Friedlaender', 'serif',
];

export function SettingsSidebar() {
  const settings = useSettings();
  const updateNested = useSettingsStore((s) => s.updateNested);
  const replaceAll = useSettingsStore((s) => s.replaceAll);
  const reset = useSettingsStore((s) => s.reset);

  const [shaarDesigns, setShaarDesigns] = useState<ShaarDesigns | null>(null);

  useEffect(() => {
    loadShaarDesigns().then(setShaarDesigns).catch(() => {});
  }, []);

  return (
    <div className="w-72 bg-white border-r border-gray-200 overflow-auto p-4 text-sm" dir="rtl">
      <h2 className="font-bold text-lg mb-4">הגדרות</h2>

      {/* === שמירת/טעימת תבנית === */}
      <section className="mb-6 pb-4 border-b border-gray-200">
        <h3 className="font-bold mb-2 text-gray-700">תבנית</h3>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const json = JSON.stringify(settings, null, 2);
              const blob = new Blob([json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'tora-template.json'; a.click();
              URL.revokeObjectURL(url);
            }}
            className="flex-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
          >💾 שמור</button>
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file'; input.accept = '.json';
              input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const parsed = JSON.parse(text);
                  replaceAll({ ...settings, ...parsed });
                } catch { alert('קובץ שגוי'); }
              };
              input.click();
            }}
            className="flex-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
          >📂 טען</button>
          <button
            onClick={() => { if (confirm('איפוס לברירת מחדל?')) reset(); }}
            className="flex-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
          >↺ אפס</button>
        </div>
      </section>

      {/* === עיצובי שער === */}
      <section className="mb-6 pb-4 border-b border-gray-200">
        <h3 className="font-bold mb-2 text-gray-700">עיצובי שערים</h3>
        {shaarDesigns ? (
          <>
            <label className="block text-xs text-gray-500 mb-1">שער ראשי ({shaarDesigns.main.length})</label>
            <select
              onChange={(e) => updateNested('theme.themeSet', e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1 mb-2 text-xs"
              defaultValue="0"
            >
              {shaarDesigns.main.map((d, i) => (
                <option key={d.id} value={i}>{d.name}</option>
              ))}
            </select>
            <label className="block text-xs text-gray-500 mb-1">שער אחורי ({shaarDesigns.back.length})</label>
            <select className="w-full border border-gray-300 rounded px-2 py-1 mb-2 text-xs" defaultValue="0">
              {shaarDesigns.back.map((d, i) => (
                <option key={d.id} value={i}>{d.name}</option>
              ))}
            </select>
            <label className="block text-xs text-gray-500 mb-1">שער משנה ({shaarDesigns.sub.length})</label>
            <select className="w-full border border-gray-300 rounded px-2 py-1 text-xs" defaultValue="0">
              {shaarDesigns.sub.map((d, i) => (
                <option key={d.id} value={i}>{d.name}</option>
              ))}
            </select>
          </>
        ) : <p className="text-xs text-gray-400">טוען...</p>}
      </section>

      {/* === גופן גוף הטקסט === */}
      <section className="mb-6 pb-4 border-b border-gray-200">
        <h3 className="font-bold mb-2 text-gray-700">גופן גוף הטקסט</h3>
        <label className="block text-xs text-gray-500 mb-1">משפחה</label>
        <select
          value={settings.typography.bodyFont.family[0]}
          onChange={(e) => {
            const newFamily = [e.target.value, ...settings.typography.bodyFont.family.slice(1)];
            updateNested('typography.bodyFont.family', newFamily);
          }}
          className="w-full border border-gray-300 rounded px-2 py-1 mb-2"
        >
          {HEBREW_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <label className="block text-xs text-gray-500 mb-1">גודל (pt)</label>
        <input type="number" value={settings.typography.bodyFont.size as number} min={9} max={16} step={0.5}
          onChange={(e) => updateNested('typography.bodyFont.size', Number(e.target.value))}
          className="w-full border border-gray-300 rounded px-2 py-1 mb-2" />
        <label className="block text-xs text-gray-500 mb-1">ריווח שורות: {(settings.typography.bodyFont.lineHeight as number).toFixed(2)}</label>
        <input type="range" value={settings.typography.bodyFont.lineHeight as number} min={1.15} max={1.75} step={0.01}
          onChange={(e) => updateNested('typography.bodyFont.lineHeight', Number(e.target.value))}
          className="w-full mb-2" />
        <label className="block text-xs text-gray-500 mb-1">מילה ראשונה</label>
        <select
          value={settings.typography.dropWordMode}
          onChange={(e) => updateNested('typography.dropWordMode', e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1 mb-2"
        >
          <option value="sunken">חלון שקוע</option>
          <option value="inline">הגדלה בשורה</option>
          <option value="bold">הדגשה</option>
          <option value="none">ללא</option>
        </select>
        <label className="flex items-center justify-between text-xs">
          <span>דיבור המתחיל (ד"ה)</span>
          <input type="checkbox" checked={settings.typography.dibburHamatchil.enabled}
            onChange={(e) => updateNested('typography.dibburHamatchil.enabled', e.target.checked)} />
        </label>
      </section>

      {/* === כותרות עליונות === */}
      <section className="mb-6 pb-4 border-b border-gray-200">
        <h3 className="font-bold mb-2 text-gray-700">כותרות עליונות</h3>
        <label className="flex items-center justify-between text-xs mb-2">
          <span>מתחלפות (זוגי/אי-זוגי)</span>
          <input type="checkbox" checked={settings.runningHeader.alternating}
            onChange={(e) => updateNested('runningHeader.alternating', e.target.checked)} />
        </label>
        <label className="flex items-center justify-between text-xs mb-2">
          <span>שם ספר חצי-חצי</span>
          <input type="checkbox" checked={settings.runningHeader.halfHalfBookName}
            onChange={(e) => updateNested('runningHeader.halfHalfBookName', e.target.checked)} />
        </label>
        <label className="block text-xs text-gray-500 mb-1">תוכן ימין</label>
        <select value={settings.runningHeader.rightContent}
          onChange={(e) => updateNested('runningHeader.rightContent', e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1 mb-2">
          <option value="book-name">שם הספר</option>
          <option value="chapter-name">שם הפרק</option>
          <option value="page-number">מספר עמוד</option>
        </select>
        <label className="block text-xs text-gray-500 mb-1">תוכן מרכז</label>
        <select value={settings.runningHeader.centerContent}
          onChange={(e) => updateNested('runningHeader.centerContent', e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1 mb-2">
          <option value="book-name">שם הספר</option>
          <option value="chapter-name">שם הפרק</option>
          <option value="page-number">מספר עמוד</option>
        </select>
        <label className="block text-xs text-gray-500 mb-1">תוכן שמאל</label>
        <select value={settings.runningHeader.leftContent}
          onChange={(e) => updateNested('runningHeader.leftContent', e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1">
          <option value="book-name">שם הספר</option>
          <option value="chapter-name">שם הפרק</option>
          <option value="page-number">מספר עמוד</option>
        </select>
      </section>

      {/* === הערות === */}
      <section className="mb-6 pb-4 border-b border-gray-200">
        <h3 className="font-bold mb-2 text-gray-700">הערות</h3>
        <label className="block text-xs text-gray-500 mb-1">קו מפריד</label>
        <select value={settings.notes.dividerStyle}
          onChange={(e) => updateNested('notes.dividerStyle', e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1 mb-2">
          <option value="short-right-30">קו קצר ימני 30% (וילנא)</option>
          <option value="line">קו רגיל</option>
          <option value="double">קו כפול</option>
          <option value="dotted">מנוקד</option>
          <option value="none">ללא</option>
        </select>
        <label className="block text-xs text-gray-500 mb-1">סגנון מספור</label>
        <select value={settings.notes.numberingStyle}
          onChange={(e) => updateNested('notes.numberingStyle', e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1 mb-2">
          <option value="hebrew-letters">אותיות עבריות (א, ב, ג)</option>
          <option value="arabic-numbers">ספרות (1, 2, 3)</option>
          <option value="hebrew-letters-geresh">אותיות עם גרשיים (א', ב')</option>
        </select>
        <label className="block text-xs text-gray-500 mb-1">חלוקת טורים</label>
        <select value={settings.notes.columnCount}
          onChange={(e) => updateNested('notes.columnCount', Number(e.target.value))}
          className="w-full border border-gray-300 rounded px-2 py-1 mb-2">
          <option value={1}>טור 1 רחב</option>
          <option value={2}>2 טורים</option>
        </select>
        <label className="block text-xs text-gray-500 mb-1">איפוס מונה</label>
        <select value={settings.notes.counterReset}
          onChange={(e) => updateNested('notes.counterReset', e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1">
          <option value="page">בכל עמוד</option>
          <option value="siman">בכל סימן (H2)</option>
          <option value="part">בכל חלק (H1)</option>
          <option value="continuous">רציף</option>
        </select>
      </section>

      {/* === שוליים === */}
      <section className="mb-6 pb-4 border-b border-gray-200">
        <h3 className="font-bold mb-2 text-gray-700">שוליים (mm)</h3>
        {(['top', 'bottom', 'inner', 'outer'] as const).map((side) => (
          <div key={side} className="flex items-center gap-2 mb-1">
            <label className="text-xs text-gray-500 w-16">{side}</label>
            <input type="number" value={settings.pageMargins[side]} min={5} max={50} step={1}
              onChange={(e) => updateNested(`pageMargins.${side}`, Number(e.target.value))}
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs" />
          </div>
        ))}
      </section>

      {/* === גריד === */}
      <section className="mb-6 pb-4 border-b border-gray-200">
        <h3 className="font-bold mb-2 text-gray-700">גריד</h3>
        <label className="block text-xs text-gray-500 mb-1">רוחב טור (%): {settings.grid.columnWidth}</label>
        <input type="range" value={settings.grid.columnWidth} min={30} max={48} step={1}
          onChange={(e) => updateNested('grid.columnWidth', Number(e.target.value))}
          className="w-full mb-2" />
        <label className="block text-xs text-gray-500 mb-1">רווח מרכזי (%): {settings.grid.gutterWidth}</label>
        <input type="range" value={settings.grid.gutterWidth} min={1} max={10} step={0.5}
          onChange={(e) => updateNested('grid.gutterWidth', Number(e.target.value))}
          className="w-full mb-2" />
        <label className="block text-xs text-gray-500 mb-1">קו מפריד</label>
        <select value={settings.grid.columnDivider}
          onChange={(e) => updateNested('grid.columnDivider', e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1 mb-2">
          <option value="none">ללא</option>
          <option value="line">קו רגיל</option>
          <option value="dashed">מקווקו</option>
          <option value="double">כפול</option>
        </select>
      </section>

      {/* === איכות === */}
      <section className="mb-6 pb-4 border-b border-gray-200">
        <h3 className="font-bold mb-2 text-gray-700">איכות עימוד</h3>
        <label className="flex items-center justify-between text-xs mb-2">
          <span>מניעת אלמנה</span>
          <input type="checkbox" checked={settings.quality.preventWidow}
            onChange={(e) => updateNested('quality.preventWidow', e.target.checked)} />
        </label>
        <label className="flex items-center justify-between text-xs mb-2">
          <span>מניעת יתום</span>
          <input type="checkbox" checked={settings.quality.preventOrphan}
            onChange={(e) => updateNested('quality.preventOrphan', e.target.checked)} />
        </label>
      </section>

      {/* === מספר עמוד === */}
      <section className="mb-6">
        <h3 className="font-bold mb-2 text-gray-700">מספר עמוד</h3>
        <label className="block text-xs text-gray-500 mb-1">פורמט</label>
        <select value={settings.grid.pageNumberFormat}
          onChange={(e) => updateNested('grid.pageNumberFormat', e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1 mb-2">
          <option value="hebrew-letter">אות עברית (א, ב, ג)</option>
          <option value="hebrew-letter-daf">"דף א"</option>
          <option value="arabic">ספרות (1, 2, 3)</option>
        </select>
        <label className="block text-xs text-gray-500 mb-1">מסגרת</label>
        <select value={settings.grid.pageNumberFrame}
          onChange={(e) => updateNested('grid.pageNumberFrame', e.target.value)}
          className="w-full border border-gray-300 rounded px-2 py-1">
          <option value="none">ללא</option>
          <option value="circle">עיגול</option>
          <option value="square">ריבוע</option>
          <option value="round-parens">(א)</option>
          <option value="square-brackets">[א]</option>
        </select>
      </section>

      {/* === סגנונות מותאמים אישית === */}
      <section className="mb-6">
        <CustomStylePanel />
      </section>
    </div>
  );
}
