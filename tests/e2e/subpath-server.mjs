/**
 * subpath-server.mjs — שרת סטטי חסר־תלויות שמגיש את הבנייה (dist/) מתחת
 * לקידומת תת־נתיב, בדיוק כמו GitHub Pages בייצור:
 *   ‎http://localhost:4174/Tora_Book_Typesetter_React/…‎ → dist/…
 *
 * למה זה קיים: ‎vite preview מגיש בשורת הדומיין בלבד, ואילו האתר החי
 * מוגש מתת־נתיב — פער שהחביא את תקלת הנתיבים האבסולוטיים (404 לצרור
 * הנכסים ⇒ ההעמדה נחסמה בשקט באתר החי). מפרט 06 מריץ את האפליקציה
 * הבנויה דרך השרת הזה כדי שרגרסיית תת־הנתיב לא תחזור לעולם.
 *
 * כללי ההגשה: קידומת חובה (בלי הקידומת — 404, כמו שרת Pages של פרויקט),
 * סוגי תוכן מלאים (כולל wasm/woff2), מניעת מעבר ספריות (path traversal),
 * ואין ניתוב SPA — כל נתיב הוא קובץ.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 4174;
const PREFIX = '/Tora_Book_Typesetter_React';
const repoRoot = resolve(dirnameOf(import.meta.url), '..', '..');
const distDir = join(repoRoot, 'dist');

function dirnameOf(u) {
  return resolve(fileURLToPath(u), '..');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

if (!existsSync(distDir)) {
  console.error(`חסר dist/ — הרץ קודם npm run build:packages && npm run build`);
  process.exit(1);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end('bad url');
    return;
  }
  if (!pathname.startsWith(PREFIX + '/') && pathname !== PREFIX) {
    res.writeHead(404).end('not under deployment prefix');
    return;
  }
  const rel = pathname.slice(PREFIX.length);
  const candidates = rel === '/' || rel === ''
    ? ['index.html']
    : [rel, join(rel, 'index.html')];

  for (const candidate of candidates) {
    const resolved = resolve(distDir, '.' + sep + candidate);
    if (!resolved.startsWith(distDir + sep)) continue; // path traversal
    if (!existsSync(resolved) || !statSync(resolved).isFile()) continue;
    res.writeHead(200, {
      'content-type': MIME[extname(resolved).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(resolved).pipe(res);
    return;
  }
  res.writeHead(404).end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`subpath-server: dist/ ← http://localhost:${PORT}${PREFIX}/`);
});
