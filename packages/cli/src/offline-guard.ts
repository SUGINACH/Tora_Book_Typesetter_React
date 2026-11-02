/**
 * offline-guard.ts — שומר רשת ל־reference runner (שלב 34; אפיון §19:
 * "reference runs חוסמים כל בקשת רשת חיצונית", §17.1 Offline).
 *
 * אותו דפוס של שלב 29 (cross-host): fetch/http/https נעטפים בספירה+זריקה
 * סינכרונית. מותקן ב־CLI מרגע ההתחלה, לפני כל טעינה — אין דגל היתר.
 */
import { createRequire } from 'node:module';

export interface NetworkGuard {
  /** מספר ניסיונות הגישה שנתפסו עד כה. */
  readonly attempts: () => number;
}

export function installNetworkDeny(): NetworkGuard {
  let attempts = 0;
  const deny = (label: string): never => {
    attempts += 1;
    throw new Error(`network-denied-by-guard: ${label}`);
  };
  (globalThis as { fetch?: unknown }).fetch = function networkDeniedFetch(): never {
    return deny('fetch');
  };
  try {
    const require = createRequire(import.meta.url);
    for (const modName of ['node:http', 'node:https'] as const) {
      const mod = require(modName) as { request: unknown; get: unknown };
      const label = modName.endsWith('https') ? 'https' : 'http';
      mod.request = function networkDeniedRequest(): never {
        return deny(`${label}.request`);
      };
      mod.get = function networkDeniedGet(): never {
        return deny(`${label}.get`);
      };
    }
  } catch {
    // מודולי ליבה של Node תמיד קיימים — אין תרחיש שבו זה נכשל
  }
  return Object.freeze({ attempts: () => attempts });
}
