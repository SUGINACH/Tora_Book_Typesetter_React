// תצורת vitest לבדיקות החבילות בלבד (שלב 9+). הבדיקות הישנות של האפליקציה
// רצות עם --dir tests/unit הייעודי שלהן ואינן מושפעות.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
  },
});
