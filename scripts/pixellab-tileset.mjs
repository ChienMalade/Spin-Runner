// Generates a top-down Wang tileset via the PixelLab API and writes the 16 tiles to disk.
// Costs 3 generations per run — don't run it casually. Key comes from .env (git-ignored).
//
//   node scripts/pixellab-tileset.mjs
//
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const env = readFileSync(resolve(root, '.env'), 'utf8');
const key = env.match(/^PIXELLAB_API_KEY=(.+)$/m)?.[1].trim();
if (!key) throw new Error('PIXELLAB_API_KEY missing from .env');

// Late-afternoon temperate meadow: mid-tone, slightly desaturated greens. Deliberately low
// contrast — the floor must never compete with players and bonuses for attention.
const body = {
  lower_description:
    'lush temperate meadow grass, medium desaturated green with subtle warm golden highlights, ' +
    'fine short grass blades, soft late afternoon light, low contrast, no flowers',
  upper_description:
    'bare packed dirt ground, warm muted earth brown, a few small pebbles and hairline cracks, ' +
    'low contrast, worn and trodden',
  transition_description: 'grass thinning out into bare dirt, a few scattered blades at the edge',
  tile_size: { width: 32, height: 32 },
  mode: 'standard',
  shape_style: 'round',
  transition_size: 0, // flat ground — this is a field, not a cliff
  view: 'high top-down',
  outline: 'selective outline',
  shading: 'basic shading',
  detail: 'medium detail',
  seed: 20260903,
};

const res = await fetch('https://api.pixellab.ai/v2/create-tileset', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

if (!res.ok) {
  console.error('HTTP', res.status, (await res.text()).slice(0, 1500));
  process.exit(1);
}

const data = await res.json();
const tileset = data.tileset ?? data;
const outDir = resolve(root, 'assets/Map/grass-dirt');
mkdirSync(outDir, { recursive: true });

const index = [];
for (const tile of tileset.tiles) {
  // Corner keys (NW/NE/SW/SE = lower|upper) are what the renderer needs to pick a tile, so the
  // filename encodes them rather than relying on the API's display name.
  const c = tile.corners ?? {};
  const code = ['NW', 'NE', 'SW', 'SE'].map((k) => (c[k] === 'upper' ? '1' : '0')).join('');
  const file = `tile-${code}.png`;
  writeFileSync(resolve(outDir, file), Buffer.from(tile.image.base64, 'base64'));
  index.push({ file, code, corners: c, name: tile.name });
}

writeFileSync(
  resolve(outDir, 'tileset.json'),
  JSON.stringify({ tileSize: tileset.tile_size, tiles: index }, null, 2)
);

console.log(`${index.length} tuiles ecrites dans assets/Map/grass-dirt`);
console.log(index.map((t) => `${t.code}  ${t.name}`).join('\n'));
