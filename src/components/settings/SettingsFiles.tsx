/**
 * SettingsFiles.tsx — סרגל קבצים ותבניות בלוח ההגדרות (שלב 79; אפיון §6.3,
 * §18-M9, תכנית שלב 79: "טעינת presets שמורים, שמירת presets חדשים,
 * ייבוא/ייצוא קובצי הגדרות").
 *
 * כל הלוגיקה הסמנטית דרך פעולות ה-store בלבד — לרכיב אין מימוש מקביל:
 *  - ייבוא קובץ ⇐ importSettingsFile: פריקת מעטפת ← שרשרת המיגרציות
 *    הנעולה (שלב 30) ← ייבוא פריט־פריט. התוצאה מוצגת במלואה: כמה נטען,
 *    אזהרות המרה מתועדות, דחיות עם קוד+path, ומפתחות שלא מופו (נשמרים
 *    ב־unmappedLegacy — לא נזרקים). כל קובץ ישן נטען או נדחה עם הסבר
 *    מדויק — שער השלב.
 *  - ייצוא ⇐ exportSettingsFile: מעטפת {$format, schemaVersion, values}
 *    מהמצב האפקטיבי; הורדה כקובץ JSON.
 *  - תבניות ⇐ savePreset/loadPreset/deletePreset (שלב 76).
 * אחרי כל ייבוא/טעינה מופעל applyDraft — §13.3: ה־effective/configHash
 * תמיד עדכניים, והרצת העימוד נחסמת מראש אם משהו לא תקין.
 */
import { useRef, useState } from 'react';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { useSettingsStore } from '../../stores/settings-store.js';

/** קוד קטלוגי + פרמטרים — אין הצגת message גולמי (פטרון שלב 12). */
const issueText = (code: string, params: Record<string, unknown>): string => {
  const p = Object.entries(params).map(([k, v]) => `${k}=${String(v)}`).join(' ');
  return p === '' ? code : `${code} (${p})`;
};

interface ImportOutcome {
  readonly loaded: number;
  readonly warnings: number;
  readonly rejections: number;
  readonly rejectedIssues: readonly { readonly code: string; readonly path: string; readonly text: string }[];
}

export function SettingsFiles() {
  const presets = useStoreWithEqualityFn(useSettingsStore, (s) => s.presets);
  const unmappedLegacy = useStoreWithEqualityFn(useSettingsStore, (s) => s.unmappedLegacy);
  const hasEffective = useStoreWithEqualityFn(useSettingsStore, (s) => s.effective !== null);
  const [presetName, setPresetName] = useState('');
  const [presetHint, setPresetHint] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [fileError, setFileError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const presetNames = Object.keys(presets);
  const unmappedKeys = Object.keys(unmappedLegacy);

  const onFilePicked = (file: File): void => {
    const reader = new FileReader();
    reader.onerror = () => setFileError('הקריאה נכשלה — הקובץ אינו קריא');
    reader.onload = () => {
      setFileError('');
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (error) {
        // שגיאת קריאה ברמת הקובץ (לא שגיאת הגדרות) — הודעה מפורשת, שום
        // דבר לא נטען בשקט.
        setOutcome(null);
        setFileError(`קובץ אינו JSON תקין: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      const summary = useSettingsStore.getState().importSettingsFile(parsed);
      useSettingsStore.getState().applyDraft(); // §13.3 — effective/hash עדכניים מיד
      setOutcome({
        loaded: summary.loaded,
        warnings: summary.issues.filter((i) => i.code === 'errors.settings.COERCED_LEGACY_STRING').length,
        rejections: summary.issues.filter((i) => i.code !== 'errors.settings.COERCED_LEGACY_STRING').length,
        rejectedIssues: summary.issues
          .filter((i) => i.code !== 'errors.settings.COERCED_LEGACY_STRING')
          .map((i) => ({ code: i.code, path: i.path, text: issueText(i.code, i.params) })),
      });
    };
    reader.readAsText(file);
  };

  const onExport = (): void => {
    const store = useSettingsStore.getState();
    store.applyDraft(); // הייצוא הוא מהמצב האפקטיבי — מרוענן קודם
    const data = useSettingsStore.getState().exportSettingsFile();
    if (data === null) return; // אין effective תקין — לא מייצאים מצב חלקי
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tora-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const onSavePreset = (): void => {
    const store = useSettingsStore.getState();
    const before = store.presets;
    store.savePreset(presetName);
    // הצלחה ⇐ הרשימה הוחלפה (ייחוס חדש); דחייה (ריק/קיים) ⇐ אותו ייחוס
    if (useSettingsStore.getState().presets !== before) {
      setPresetName('');
      setPresetHint('');
    } else {
      setPresetHint('שם ריק או קיים — השמירה נדחתה');
    }
  };

  const onLoadPreset = (): void => {
    if (selectedPreset === '') return;
    useSettingsStore.getState().loadPreset(selectedPreset);
    useSettingsStore.getState().applyDraft();
    setOutcome(null);
    setFileError('');
  };

  const onDeletePreset = (): void => {
    if (selectedPreset === '') return;
    useSettingsStore.getState().deletePreset(selectedPreset);
    setSelectedPreset('');
  };

  return (
    <div className="border-b border-gray-200 pb-2 mb-2 space-y-1.5" data-testid="settings-files">
      <div className="flex items-center gap-1.5">
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="import-settings-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file !== undefined) onFilePicked(file);
            e.target.value = ''; // אותו קובץ פעמיים — אירוע שינוי שוב
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex-1 px-2 py-1 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50"
          data-testid="import-settings-button"
        >
          📥 ייבוא קובץ הגדרות
        </button>
        <button
          type="button"
          onClick={onExport}
          disabled={!hasEffective}
          className="px-2 py-1 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50 disabled:opacity-50"
          data-testid="export-settings"
          title="ייצוא המצב האפקטיבי לקובץ JSON (מעטפת tora-settings)"
        >
          📤 ייצוא
        </button>
      </div>

      {fileError !== '' && (
        <p className="text-[10px] text-red-600" data-testid="import-file-error">{fileError}</p>
      )}

      {outcome !== null && (
        <div className="text-[10px] text-gray-600 space-y-0.5" data-testid="import-summary">
          <p>
            נטענו {outcome.loaded} מפתחות · {outcome.warnings} המרות מתועדות · {outcome.rejections} נדחו
          </p>
          {outcome.rejectedIssues.map((i, idx) => (
            <p key={`${i.code}-${idx}`} className="text-red-600" data-issue-code={i.code} data-issue-path={i.path}>
              {i.text} @ {i.path}
            </p>
          ))}
        </div>
      )}

      {unmappedKeys.length > 0 && (
        <p className="text-[10px] text-orange-700" data-testid="unmapped-legacy" title="מפתחות מהקובץ שאינם במרשם — נשמרו, לא הומלוו ולא נמחקו">
          לא מופו (נשמרו): {unmappedKeys.join(', ')}
        </p>
      )}

      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          placeholder="שם תבנית…"
          className="flex-1 border border-gray-300 rounded px-1.5 py-1 text-xs"
          data-testid="preset-name"
        />
        <button
          type="button"
          onClick={onSavePreset}
          className="px-2 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded text-xs hover:bg-blue-100"
          data-testid="preset-save"
        >
          שמור
        </button>
      </div>
      {presetHint !== '' && (
        <p className="text-[10px] text-red-600" data-testid="preset-hint">{presetHint}</p>
      )}

      {presetNames.length > 0 && (
        <div className="flex items-center gap-1.5">
          <select
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-1.5 py-1 text-xs bg-white"
            data-testid="preset-select"
          >
            <option value="">— בחר תבנית —</option>
            {presetNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={onLoadPreset}
            disabled={selectedPreset === ''}
            className="px-2 py-1 bg-white border border-gray-300 rounded text-xs disabled:opacity-50"
            data-testid="preset-load"
          >
            טען
          </button>
          <button
            type="button"
            onClick={onDeletePreset}
            disabled={selectedPreset === ''}
            className="px-2 py-1 bg-red-50 border border-red-200 text-red-700 rounded text-xs disabled:opacity-50"
            data-testid="preset-delete"
          >
            מחק
          </button>
        </div>
      )}
    </div>
  );
}
