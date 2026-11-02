#!/usr/bin/env node
/**
 * מחולל חד-פעמי של golden לדוגמה (שלב 13).
 * ריצה ידנית בלבד — עדכון golden אסור אוטומטית ב־CI (אפיון §17.3).
 * כל עדכון חייב diff קריא והסבר ב־WORKLOG.
 */
import { writeFileSync } from 'node:fs';
import { buildGolden } from '@tora/test-fixtures';
import { layoutHash } from '@tora/layout-api';

const demoIr = {
  schemaVersion: 1,
  demo: true,
  note: 'golden הדגמה משלב 13 — מוחלף בפלט מנוע אמיתי בשלבים 33+',
  pages: [
    { id: 'p1', columns: [{ x: 0, width: 1000 }, { x: 1100, width: 1000 }] },
    { id: 'p2', columns: [{ x: 0, width: 1000 }, { x: 1100, width: 1000 }] },
  ],
};
const golden = buildGolden(demoIr, layoutHash);
writeFileSync('tests/golden/demo.golden.json', JSON.stringify(golden, null, 2) + '\n', 'utf8');
console.log('demo golden נכתב:', golden.goldenLayoutSha256.slice(0, 16) + '…');
