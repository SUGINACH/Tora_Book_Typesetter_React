/**
 * formatters.ts — מפרמטים (שלב 93; אפיון §16).
 *
 * מספרים ותאריכים ב-UI — דרך Intl בלבד; גימטריה של עמודי הספר היא
 * domain formatter נפרד (policy-torah/folio.ts) — לא Intl.NumberFormat
 * (אפיון §16; נעול משלב 67).
 */
const cache = new Map<string, Intl.NumberFormat>();
export function formatNumber(v: number, locale: string): string {
  const key = `${locale}:${v}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit.format(v);
  const nf = new Intl.NumberFormat(locale);
  cache.set(key, nf);
  return nf.format(v);
}

const dateCache = new Map<string, Intl.DateTimeFormat>();
export function formatDate(d: Date, locale: string): string {
  const hit = dateCache.get(locale);
  if (hit !== undefined) return hit.format(d);
  const df = new Intl.DateTimeFormat(locale);
  dateCache.set(locale, df);
  return df.format(d);
}
