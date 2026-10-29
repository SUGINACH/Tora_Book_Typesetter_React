import { SimulatedMeasurer } from '../src/worker/measurement/text-metrics';
import { breakLines } from '../src/worker/measurement/text-metrics';
import { defaultSettings } from '../src/lib/default-settings';

const measurer = new SimulatedMeasurer();
const font = defaultSettings.typography.bodyFont;

// חישוב columnWidthPx (מהקוד)
const pxPerMm = 3.7795;
const pageWidthPx = 210 * pxPerMm;
const marginPx = 25 * pxPerMm;
const totalPct = 40*2 + 10*2 + 2;
const columnWidthPx = (40/totalPct) * (pageWidthPx - 2*marginPx);

console.log('columnWidthPx:', columnWidthPx.toFixed(1));
console.log('font size:', font.size);
console.log('font family:', font.family[0]);
console.log('');

// טקסט לבדיקה
const text = 'זוהי פסקה ארוכה לבדיקת עימוד עם הרבה מילים וטקסט ארוך יחסית כדי לראות את השורות השבורות והטורים בעמוד המרונדר.';
console.log('text length:', text.length, 'chars');

const lines = breakLines(text, font, columnWidthPx, measurer);
console.log('lines:', lines.length);
for (let i = 0; i < lines.length; i++) {
  const w = measurer.measureText(lines[i]!, font);
  console.log(`  line ${i+1}: ${lines[i]!.slice(0,50)}... (${w.toFixed(1)}px)`);
}

console.log('');
console.log('=== בדיקת CanvasMeasurer ===');
try {
  const { CanvasMeasurer } = await import('../src/worker/measurement/canvas-measurer');
  const cm = new CanvasMeasurer();
  const w = cm.measureText(text, font);
  console.log('CanvasMeasurer text width:', w.toFixed(1), 'px');
  const lw = cm.measureLineHeight(font);
  console.log('CanvasMeasurer line height:', lw.toFixed(1), 'px');
  const lines2 = breakLines(text, font, columnWidthPx, cm);
  console.log('CanvasMeasurer lines:', lines2.length);
} catch (e) {
  console.log('CanvasMeasurer not available:', e instanceof Error ? e.message : String(e));
}
