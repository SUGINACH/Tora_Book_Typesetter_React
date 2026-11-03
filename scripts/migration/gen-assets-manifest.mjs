#!/usr/bin/env node
/**
 * gen-assets-manifest — מחולל מניפסטי הנכסים החזותיים v2 (שלב 68; אפיון §7, §13).
 *
 * דטרמיניסטי לחלוטין: אין חותמות זמן ואין מצב סמוי — הפלט נגזר מקובצי המקור
 * בפועל ומהמקור הנעול בלבד (source-manifest.json). כל הנוסחאות מיובאות
 * מ-@tora/content-model (מקור אמת אחד — לקח ADR-001: אין כפילות נוסחאות
 * בין מחולל למאמת).
 *
 * פלט:
 *   assets/shaar/manifest.json     — 3 קבצים, 86 עיצובים (82 עם תיבת טקסט + 4 בלי)
 *   assets/ornaments/manifest.json — 5 קבצים, 967 עיצובים + 27 חריצי תפקיד מובנים
 *
 * המחולל מאמת את פלטו: פרסור מבני + בעיות סמנטיות חייבות להיות ריקות.
 * יציאה: 0 = נכתב; 1 = כשל.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASSETS_MANIFEST_SCHEMA_VERSION,
  BUILTIN_ROLE_SLOTS,
  ORNAMENT_FILE_ROLES,
  SHAAR_FILE_KINDS,
  legacyPercentBoxOf,
  ornamentAssetId,
  ornamentsManifestIssues,
  parseOrnamentsManifest,
  parseViewBox,
  parseShaarManifest,
  shaarAssetId,
  shaarManifestIssues,
  textBoxAnchorsOf,
  textBoxToPageFractions,
} from '@tora/content-model';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha256Bytes = (buf) => createHash('sha256').update(buf).digest('hex');
const sha256Text = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

// ── המקור הנעול (מלאי ההעברה; אין המצאה) ──
const sourceManifest = JSON.parse(readFileSync(join(repoRoot, 'docs', 'migration', 'source-manifest.json'), 'utf8'));
const orange = (sourceManifest.sources ?? []).find((s) => s.id === 'Orange');
if (orange === undefined) throw new Error('Orange לא נמצא ב-source-manifest.json');
const source = { repo: 'SUGINACH/Tora_Book_Typesetter_Orange', commit: orange.commit };
const license = { status: 'source-undocumented', inventoryCategory: 'shaar-ornaments' };

// ── מניפסט שערים ──
const shaarFiles = ['shaar_main.json', 'shaar_back.json', 'shaar_sub.json'];
const shaarFilesOut = [];
const shaarDesigns = [];
for (const file of shaarFiles) {
  const buf = readFileSync(join(repoRoot, 'assets', 'shaar', file));
  const fileSha256 = sha256Bytes(buf);
  const arr = JSON.parse(buf.toString('utf8'));
  const kind = SHAAR_FILE_KINDS[file];
  shaarFilesOut.push({ file, sha256: fileSha256, bytes: buf.length, kind, count: arr.length });
  arr.forEach((d, index) => {
    const viewBox = parseViewBox(d.svg);
    if (viewBox === null) throw new Error(`viewBox חסר או שגוי: ${file}#${index}`);
    let textBox = null;
    let anchors = null;
    if ('box' in d) {
      textBox = textBoxToPageFractions(legacyPercentBoxOf(d.box));
      anchors = textBoxAnchorsOf(textBox);
    }
    shaarDesigns.push({
      id: shaarAssetId(kind, fileSha256, index),
      legacyId: d.id,
      file,
      index,
      kind,
      name: d.name,
      svgSha256: sha256Text(d.svg),
      viewBox,
      textBox,
      anchors,
    });
  });
}
const shaarManifest = {
  schemaVersion: ASSETS_MANIFEST_SCHEMA_VERSION,
  kind: 'shaar',
  source,
  license,
  files: shaarFilesOut,
  designs: shaarDesigns,
};

// ── מניפסט עיטורים ──
const ornFilesOut = [];
const ornDesigns = [];
for (const file of Object.keys(ORNAMENT_FILE_ROLES)) {
  const buf = readFileSync(join(repoRoot, 'assets', 'ornaments', file));
  const fileSha256 = sha256Bytes(buf);
  const arr = JSON.parse(buf.toString('utf8'));
  const kind = ORNAMENT_FILE_ROLES[file].kind;
  ornFilesOut.push({ file, sha256: fileSha256, bytes: buf.length, kind, count: arr.length });
  arr.forEach((d, index) => {
    const viewBox = parseViewBox(d.svg);
    if (viewBox === null) throw new Error(`viewBox חסר או שגוי: ${file}#${index}`);
    ornDesigns.push({
      id: ornamentAssetId(file, fileSha256, index),
      legacyId: d.id,
      file,
      index,
      name: d.name,
      svgSha256: sha256Text(d.svg),
      viewBox,
    });
  });
}
const ornamentsManifest = {
  schemaVersion: ASSETS_MANIFEST_SCHEMA_VERSION,
  kind: 'ornaments',
  source,
  license,
  files: ornFilesOut,
  designs: ornDesigns,
  builtinSlots: BUILTIN_ROLE_SLOTS.map((s) => ({ key: s.key, kind: s.kind, defaultValue: s.defaultValue, role: s.role })),
};

// ── אימות עצמי: הפלט חייב לעבור פרסור + אפס בעיות ──
const shaarParsed = parseShaarManifest(JSON.parse(JSON.stringify(shaarManifest)));
const shaarIssues = shaarManifestIssues(shaarParsed);
if (shaarIssues.length > 0) throw new Error(`מניפסט השערים שנוצר בעייתי: ${shaarIssues.join('; ')}`);
const ornParsed = parseOrnamentsManifest(JSON.parse(JSON.stringify(ornamentsManifest)));
const ornIssues = ornamentsManifestIssues(ornParsed);
if (ornIssues.length > 0) throw new Error(`מניפסט העיטורים שנוצר בעייתי: ${ornIssues.join('; ')}`);

// ── כתיבה (ללא חותמת זמן; מיוצג UTF-8, שורה אחרונה newline) ──
const shaarPath = join(repoRoot, 'assets', 'shaar', 'manifest.json');
const ornPath = join(repoRoot, 'assets', 'ornaments', 'manifest.json');
writeFileSync(shaarPath, `${JSON.stringify(shaarManifest, null, 2)}\n`, 'utf8');
writeFileSync(ornPath, `${JSON.stringify(ornamentsManifest, null, 2)}\n`, 'utf8');

const withBox = shaarDesigns.filter((d) => d.textBox !== null).length;
console.log(`shaar:     ${shaarFilesOut.length} קבצים, ${shaarDesigns.length} עיצובים (${withBox} עם תיבה, ${shaarDesigns.length - withBox} בלי)`);
console.log(`ornaments: ${ornFilesOut.length} קבצים, ${ornDesigns.length} עיצובים + ${BUILTIN_ROLE_SLOTS.length} חריצים`);
console.log(`נכתב: ${shaarPath}`);
console.log(`נכתב: ${ornPath}`);
