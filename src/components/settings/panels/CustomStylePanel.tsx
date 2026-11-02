import { useState } from 'react';
import { useSettings } from '../../../hooks/useTypesetter';
import { useSettingsStore } from '../../../store/settings-store';
import type { CustomTextStyle } from '../../../types';

export function CustomStylePanel() {
  const settings = useSettings();
  const updateNested = useSettingsStore((s) => s.updateNested);
  const [editing, setEditing] = useState<CustomTextStyle | null>(null);
  const [showNew, setShowNew] = useState(false);

  const handleAdd = () => {
    const newStyle: CustomTextStyle = {
      id: `custom-${Date.now()}`,
      name: 'סגנון חדש',
      matcher: { type: 'linePrefix', prefix: '» ' },
      target: { position: 'in-column' },
      style: { family: ['serif'], size: 12 },
      enabled: true,
    };
    updateNested('customStyles', [...settings.customStyles, newStyle]);
    setEditing(newStyle);
    setShowNew(false);
  };

  const handleUpdate = (style: CustomTextStyle) => {
    const updated = settings.customStyles.map(s => s.id === style.id ? style : s);
    updateNested('customStyles', updated);
    setEditing(style);
  };

  const handleDelete = (id: string) => {
    updateNested('customStyles', settings.customStyles.filter(s => s.id !== id));
    setEditing(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">סגנונות מותאמים אישית</h3>
        <button onClick={handleAdd} className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">
          + הוסף
        </button>
      </div>

      {settings.customStyles.length === 0 && (
        <p className="text-xs text-gray-400">אין סגנונות מותאמים. לחץ "הוסף" ליצירת סגנון חדש.</p>
      )}

      <div className="space-y-2">
        {settings.customStyles.map(style => (
          <div
            key={style.id}
            className={`p-2 border rounded cursor-pointer text-xs ${
              editing?.id === style.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
            }`}
            onClick={() => setEditing(style)}
          >
            <div className="flex justify-between items-center">
              <span className="font-medium">{style.name}</span>
              <span className="text-gray-400">
                {style.matcher.type === 'linePrefix' && `קידוממת: "${style.matcher.prefix}"`}
                {style.matcher.type === 'inlineMarker' && `תוחמים: ${style.matcher.open}...${style.matcher.close}`}
              </span>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="border border-gray-300 p-3 rounded space-y-2 bg-gray-50">
          <input
            type="text"
            value={editing.name}
            onChange={(e) => handleUpdate({ ...editing, name: e.target.value })}
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
            placeholder="שם הסגנון"
          />

          <div>
            <label className="block text-xs text-gray-500 mb-1">סוג זיהוי</label>
            <select
              value={editing.matcher.type}
              onChange={(e) => {
                const type = e.target.value as 'linePrefix' | 'inlineMarker';
                const newMatcher = type === 'linePrefix'
                  ? { type: 'linePrefix' as const, prefix: '' }
                  : { type: 'inlineMarker' as const, open: '', close: '' };
                handleUpdate({ ...editing, matcher: newMatcher });
              }}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
            >
              <option value="linePrefix">קידוממת שורה (linePrefix)</option>
              <option value="inlineMarker">תוחמים (inlineMarker)</option>
            </select>
          </div>

          {editing.matcher.type === 'linePrefix' && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">קידוממת</label>
              <input
                type="text"
                value={editing.matcher.prefix}
                onChange={(e) => handleUpdate({
                  ...editing,
                  matcher: { type: 'linePrefix' as const, prefix: e.target.value }
                })}
                className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                placeholder='לדוגמה: » '
              />
            </div>
          )}

          {editing.matcher.type === 'inlineMarker' && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">תו פתיחה</label>
                <input
                  type="text"
                  value={editing.matcher.open}
                  onChange={(e) => handleUpdate({
                    ...editing,
                    matcher: { ...editing.matcher, open: e.target.value } as any
                  })}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                  placeholder='לדוגמה: **'
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">תו סגירה</label>
                <input
                  type="text"
                  value={editing.matcher.close}
                  onChange={(e) => handleUpdate({
                    ...editing,
                    matcher: { ...editing.matcher, close: e.target.value } as any
                  })}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                  placeholder='לדוגמה: **'
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 mb-1">גופן</label>
            <input
              type="text"
              value={editing.style.family.join(', ')}
              onChange={(e) => handleUpdate({
                ...editing,
                style: { ...editing.style, family: e.target.value.split(',').map(f => f.trim()) }
              })}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
              placeholder='Frank Ruhl Libre, serif'
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">גודל (pt)</label>
              <input
                type="number"
                value={editing.style.size as number}
                onChange={(e) => handleUpdate({
                  ...editing,
                  style: { ...editing.style, size: Number(e.target.value) }
                })}
                className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">משקל</label>
              <select
                value={editing.style.weight ?? 400}
                onChange={(e) => handleUpdate({
                  ...editing,
                  style: { ...editing.style, weight: Number(e.target.value) as any }
                })}
                className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
              >
                <option value={400}>רגיל</option>
                <option value={700}>מודגש</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">צבע</label>
            <input
              type="text"
              value={editing.style.color ?? '#000000'}
              onChange={(e) => handleUpdate({
                ...editing,
                style: { ...editing.style, color: e.target.value }
              })}
              className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
              placeholder='#000000'
            />
          </div>

          <div className="flex justify-between items-center pt-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(e) => handleUpdate({ ...editing, enabled: e.target.checked })}
              />
              <span>פעיל</span>
            </label>
            <button
              onClick={() => handleDelete(editing.id)}
              className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded"
            >
              מחק
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
