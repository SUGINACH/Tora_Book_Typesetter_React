/**
 * טעינת מפרידי סעיפים (section dividers) מ-JSON.
 * 323 עיצובים, כל אחד: { id, name, svg }
 */

export interface DividerDesign {
  id: string;
  name: string;
  svg: string;
}

let cache: DividerDesign[] | null = null;

export async function loadSectionDividers(): Promise<DividerDesign[]> {
  if (cache) return cache;
  try {
    const res = await fetch('./section_dividers.json');
    const data: DividerDesign[] = await res.json();
    cache = data;
    return cache;
  } catch (err) {
    console.warn('Failed to load section dividers:', err);
    return [];
  }
}

export function getDivider(
  dividers: DividerDesign[],
  index: number = 0
): DividerDesign | null {
  if (!dividers || dividers.length === 0) return null;
  return dividers[Math.min(index, dividers.length - 1)]!;
}

export function clearDividerCache(): void {
  cache = null;
}
