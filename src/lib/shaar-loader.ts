/**
 * טוען עיצובי שערים מקובצי JSON חיצוניים.
 *
 * מבנה כל קובץ: מערך של עיצובים, כל עיצוב = { id, name, svg }
 * ה-SVG הוא רקע מלא לעמוד A4 (viewBox 2000×2880).
 * הטקסט (שם הספר, מחבר, וכו') מונח מעל ה-SVG.
 */

export interface ShaarDesign {
  id: string;
  name: string;
  svg: string;
}

export interface ShaarDesigns {
  main: ShaarDesign[];
  back: ShaarDesign[];
  sub: ShaarDesign[];
}

let cache: ShaarDesigns | null = null;

/**
 * טעינת כל עיצובי השערים מ-JSON.
 * משתמש ב-cache — טעינה פעם אחת בלבד.
 */
export async function loadShaarDesigns(): Promise<ShaarDesigns> {
  if (cache) return cache;

  const [mainRes, backRes, subRes] = await Promise.all([
    fetch('./shaar_main.json'),
    fetch('./shaar_back.json'),
    fetch('./shaar_sub.json'),
  ]);

  const [main, back, sub] = await Promise.all([
    mainRes.json(),
    backRes.json(),
    subRes.json(),
  ]);

  cache = { main, back, sub };
  return cache;
}

/**
 * בחירת עיצוב שער לפי אינדקס.
 */
export function getShaarDesign(
  designs: ShaarDesign[],
  index: number = 0
): ShaarDesign | null {
  if (!designs || designs.length === 0) return null;
  return designs[Math.min(index, designs.length - 1)]!;
}

/**
 * בחירת עיצוב שער לפי ID.
 */
export function getShaarDesignById(
  designs: ShaarDesign[],
  id: string
): ShaarDesign | null {
  return designs.find((d) => d.id === id) ?? null;
}

/**
 * ניקוי cache (לאחר שינוי ערכת נושא).
 */
export function clearShaarCache(): void {
  cache = null;
}
