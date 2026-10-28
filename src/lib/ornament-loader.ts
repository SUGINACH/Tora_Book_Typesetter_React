/**
 * טעינת עיטורי כותרות (H2/H3) מקובץ JSON חיצוני.
 * מבנה: רשימה של { id, name, svg } — כל אחד הוא SVG.
 */

export interface OrnamentDesign {
  id: string;
  name: string;
  svg: string;
}

let cache: OrnamentDesign[] | null = null;

export async function loadHeaderOrnaments(): Promise<OrnamentDesign[]> {
  if (cache) return cache;
  try {
    const res = await fetch('./header_ornaments.json');
    const data = await res.json();
    cache = data;
    return cache;
  } catch (err) {
    console.warn('Failed to load header ornaments:', err);
    return [];
  }
}

export function getOrnament(
  ornaments: OrnamentDesign[],
  index: number = 0
): OrnamentDesign | null {
  if (!ornaments || ornaments.length === 0) return null;
  return ornaments[Math.min(index, ornaments.length - 1)]!;
}

export function clearOrnamentCache(): void {
  cache = null;
}
