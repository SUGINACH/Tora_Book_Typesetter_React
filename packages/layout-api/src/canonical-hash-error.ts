/** שגיאת גיבוב קנוני — קוד + הקשר (משולבת בקטלוג השגיאות בשלב 12). */
export class CanonicalHashError extends Error {
  constructor(
    readonly code: string,
    readonly details: Record<string, unknown>,
  ) {
    super(`[canonical-hash:${code}] ${JSON.stringify(details)}`);
    this.name = 'CanonicalHashError';
  }
}
