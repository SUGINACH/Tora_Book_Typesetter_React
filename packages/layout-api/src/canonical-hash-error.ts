/** שגיאת גיבוב קנוני — עוברת דרך הקטלוג: המפתח הקטלוגי הוא errors.hash.<code> (שלב 12). */
import { EngineError, type ErrorParams } from '@tora/measurement-api';

export class CanonicalHashError extends EngineError {
  constructor(
    readonly code: string,
    readonly details: ErrorParams,
  ) {
    super(`errors.hash.${code}`, details);
    this.name = 'CanonicalHashError';
  }
}
