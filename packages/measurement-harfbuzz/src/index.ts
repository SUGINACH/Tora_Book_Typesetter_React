/**
 * @tora/measurement-harfbuzz — ספק המדידה הנעול של הייצור (ADR-003, שלב 24).
 *
 * מודל הזרקה: ה־host מייבא את harfbuzzjs/wawoff2 הנעולות ומזריק אותן
 * ליצירת הספק; החבילה עצמה אינה מייבאת אותן ב-src — אין Node/DOM בליבה.
 */
export * from './lock.js';
export * from './provider.js';
