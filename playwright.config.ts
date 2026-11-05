/**
 * playwright.config.ts — תצורת ה־E2E הממוקד של שלב 85 (אפיון §17.1: שכבת
 * E2E — ‎edit→run→audit→export, ביטול, שגיאות מתורגמות; Visual נעול).
 *
 * סביבה נעולה (לשון התכנית: "visual tests רק ל־projection עם browser/font
 * env נעולים; אין קביעת נכונות שבירה לפי screenshot בלבד"): דפדפן chromium
 * בגרסה הנעולה ב־lockfile, ‏DPR=1, ויוטפורט קבוע, ‏locale he-IL, אזור זמן
 * Asia/Jerusalem, סכמת צבע light. אין מקביליות, אין ניסיונות חוזרים ואין
 * דילוגים — שתי ריצות של אותו מצב חייבות לתת אותן תוצאות (כלל ה־CI;
 * אפיון §17.2#1 ברמת התצוגה).
 *
 * השרת: ‏vite preview על ה־build המלא (dist/) ביציאה 4173 — אותו מסלול
 * ייצור כמו ב־Deploy לפייג'ס, לא dev-server עם HMR. מי שמריץ מריץ קודם
 * `npm run build:packages && npm run build` (כמו ב־CI וב־Deploy).
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: [['line']],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    colorScheme: 'light',
  },
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
