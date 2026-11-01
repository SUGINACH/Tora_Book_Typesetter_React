// תצורת vitest לבדיקות החבילות וקוד המעטפת החדש של התכנית (שלב 9+).
// הבדיקות הישנות של האפליקציה רצות עם --dir tests/unit הייעודי שלהן
// ואינן מושפעות.
// הרחבה (שלב 35): tests/worker-host — בדיקות פרוטוקול ה-Worker וה-WorkerClient
// (קוד מעטפת ב-src/worker-host; אפיון §12.1) — סביבת node, כמו החבילות.
// הרחבה (שלב 36): tests/component — תצוגה מקדימה צורכת IR (jsdom בתוך
// הקובץ עצמו דרך docblock).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'tests/worker-host/**/*.test.ts', 'tests/component/**/*.test.tsx', 'tests/e2e-skeleton/**/*.test.ts'],
    environment: 'node',
  },
});
