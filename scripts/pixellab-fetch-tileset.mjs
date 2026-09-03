// Downloads an already-generated tileset and writes its tiles to assets/Map/<name>/.
// Free — costs no generations. Generation itself is async, so this polls until ready.
//
//   node scripts/pixellab-fetch-tileset.mjs <tileset_id> <output-folder-name>
//
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [id, outName = 'tileset'] = process.argv.slice(2);
if (!id) throw new Error('usage: node scripts/pixellab-fetch-tileset.mjs <tileset_id> <folder>');

const key = readFileSync(resolve(root, '.env'), 'utf8').match(/^PIXELLAB_API_KEY=(.+)$/m)?.[1].trim();
if (!key) throw new Error('PIXELLAB_API_KEY missing from .env');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let data;
for (let attempt = 1; attempt <= 60; attempt++) {
  const res = await fetch(`https://api.pixellab.ai/v2/tilesets/${id}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  // 423 is the documented "still generating" response.
  if (res.status === 423) {
    console.log(`en cours... (${attempt})`);
    await sleep(5000);
    continue;
  }
  if (!res.ok) {
    console.error('HTTP', res.status, (await res.text()).slice(0, 800));
    process.exit(1);
  }
  data = await res.json();
  const tileset = data.tileset ?? data;
  if (tileset.status && tileset.status !== 'completed' && !tileset.tiles) {
    console.log(`statut: ${tileset.status} (${attempt})`);
    await sleep(5000);
    continue;
  }
  break;
}

const tileset = data.tileset ?? data;
if (!Array.isArray(tileset.tiles)) {
  console.error('Pas de tuiles dans la reponse. Cles:', Object.keys(tileset));
  console.error(JSON.stringify(tileset).slice(0, 1000).replace(/[A-Za-z0-9+/]{80,}/g, '<BASE64>'));
  process.exit(1);
}

const outDir = resolve(root, 'assets/Map', outName);
mkdirSync(outDir, { recursive: true });

const index = [];
for (const tile of tileset.tiles) {
  // The corner keys (NW/NE/SW/SE = lower|upper) are what a renderer needs to pick the right tile,
  // so encode them into the filename rather than relying on the API's display name.
  const c = tile.corners ?? {};
  const code = ['NW', 'NE', 'SW', 'SE'].map((k) => (c[k] === 'upper' ? '1' : '0')).join('');
  const base64 = tile.image?.base64 ?? tile.base64;
  const file = `tile-${code}.png`;
  writeFileSync(resolve(outDir, file), Buffer.from(base64, 'base64'));
  index.push({ file, code, corners: c, name: tile.name });
}

writeFileSync(
  resolve(outDir, 'tileset.json'),
  JSON.stringify({ id, tileSize: tileset.tile_size, tiles: index }, null, 2)
);

console.log(`${index.length} tuiles ecrites dans assets/Map/${outName}`);
