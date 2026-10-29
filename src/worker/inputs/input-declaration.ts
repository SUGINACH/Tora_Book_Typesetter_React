import { fnv1a32 } from './fnv-hash';
import type { Settings } from '../../types';

/**
 * הצהרת קלטים ו-hash משולב.
 *
 * סעיף 4.5 באפיון הטכני — מנגנון ההגנה המרכזי נגד אי-דטרמיניזם.
 */
export interface DeclaredInputs {
  text: string;
  textHash: string;
  settings: Settings;
  settingsHash: string;
  loadedFonts: readonly string[];
  fontsHash: string;
  cssVars: Record<string, string>;
  cssVarsHash: string;
  combinedHash: string;
}

export function declareInputs(
  text: string,
  settings: Settings,
  loadedFonts: readonly string[] = [],
  cssVars: Record<string, string> = {}
): DeclaredInputs {
  const textHash = fnv1a32(text);
  const settingsHash = fnv1a32(JSON.stringify(settings));
  const fontsHash = fnv1a32(loadedFonts.join('|'));
  const cssVarsHash = fnv1a32(JSON.stringify(cssVars));
  const combinedHash = fnv1a32(textHash + settingsHash + fontsHash + cssVarsHash);
  return {
    text, textHash, settings, settingsHash,
    loadedFonts, fontsHash, cssVars, cssVarsHash, combinedHash,
  };
}

export interface InputsDiff {
  textChanged: boolean;
  settingsChanged: boolean;
  fontsChanged: boolean;
  cssVarsChanged: boolean;
  anyChanged: boolean;
}

export function diffInputs(a: DeclaredInputs, b: DeclaredInputs): InputsDiff {
  const textChanged = a.textHash !== b.textHash;
  const settingsChanged = a.settingsHash !== b.settingsHash;
  const fontsChanged = a.fontsHash !== b.fontsHash;
  const cssVarsChanged = a.cssVarsHash !== b.cssVarsHash;
  return {
    textChanged, settingsChanged, fontsChanged, cssVarsChanged,
    anyChanged: textChanged || settingsChanged || fontsChanged || cssVarsChanged,
  };
}
