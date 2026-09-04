// Generates the arena's floor art through PixelLab's Pro tile tools.
//
//   node scripts/pixellab-map.mjs field    # 4 grass variations
//   node scripts/pixellab-map.mjs stone    # grass <-> stone, corner set
//   node scripts/pixellab-map.mjs water    # grass <-> water, corner set
//   node scripts/pixellab-map.mjs all
//
// These are the PRO tools (~40 generations a call at 64px), not the 1-generation ones. The cheap
// endpoints were tried first and the result was the problem: 32px tiles against 64px characters, so
// the ground was half the resolution of the people standing on it, and terrain pairs kept coming
// back as flat colour. Quality here is worth the credits — the floor is most of what you look at.
//
// Tiles are generated at 64px to match the character art exactly: one source pixel of ground is one
// source pixel of character, which is what makes a scene read as one piece of art rather than two.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const key = readFileSync(resolve(root, '.env'), 'utf8').match(/^PIXELLAB_API_KEY=(.+)$/m)?.[1].trim();
if (!key) throw new Error('PIXELLAB_API_KEY missing from .env');

const AUTH = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const TILE_SIZE = 64;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The arena's look, shared by every call so the three sets belong together. */
const STYLE =
  'vibrant anime pixel art, bright saturated colours, clean cel shading, crisp readable shapes, ' +
  'sunny afternoon light, rich detail';

async function post(path, body) {
  const res = await fetch(`https://api.pixellab.ai/v2/${path}`, {
    method: 'POST',
    headers: AUTH,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${(await res.text()).slice(0, 600)}`);
  return res.json();
}

/** Pro generations are async and take minutes; 423 means "still working". */
async function waitForTiles(tileId) {
  for (let i = 0; i < 150; i++) {
    const res = await fetch(`https://api.pixellab.ai/v2/tiles-pro/${tileId}`, { headers: AUTH });
    if (res.status === 423) {
      if (i % 10 === 0) console.log(`  … en cours (${i * 6}s)`);
      await sleep(6000);
      continue;
    }
    if (!res.ok) throw new Error(`GET tiles-pro/${tileId} -> ${res.status}`);
    const body = await res.json();
    if (body.storage_urls && Object.keys(body.storage_urls).length > 0) return body;
    await sleep(6000);
  }
  throw new Error(`timed out waiting for tiles-pro/${tileId}`);
}

async function savePngFromUrl(dir, name, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${name} -> ${res.status}`);
  const outDir = resolve(root, 'assets/Map', dir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, `${name}.png`), Buffer.from(await res.arrayBuffer()));
}

/** The grass from an already-generated set, passed as a style reference so the next set's grass
 * comes out the same green. Without this the two sets' meadows differ enough that alternating them
 * across the field draws a visible chequerboard. */
function styleFromGrass(dir) {
  const file = resolve(root, 'assets/Map', dir, 'tile_15.png');
  return [{ base64: readFileSync(file).toString('base64'), width: TILE_SIZE, height: TILE_SIZE }];
}

/** Common request shape: flat top-down ground, no depth, no outlines. */
function tileRequest(description, feature, styleImages) {
  return {
    ...(styleImages ? { style_images: styleImages } : {}),
    description,
    tile_type: 'square_topdown',
    tile_size: TILE_SIZE,
    // Ground is seen straight down and has no thickness — any depth would make the floor read as a
    // stack of slabs with visible sides.
    tile_view: 'top-down',
    tile_depth_ratio: 0,
    // Colour zones rather than grey outlines: outlines on a floor look like drawn borders.
    outline_mode: 'segmentation',
    ...(feature ? { tile_feature: feature } : {}),
    seed: 20260905,
  };
}

async function generate(dir, description, feature, styleImages) {
  console.log(`${dir} — generation Pro (~40 credits)…`);
  const job = await post('create-tiles-pro', tileRequest(description, feature, styleImages));
  const tileId = job.tile_id;
  console.log(`  tile_id ${tileId}`);
  const body = await waitForTiles(tileId);

  const outDir = resolve(root, 'assets/Map', dir);
  mkdirSync(outDir, { recursive: true });
  // The placement rules say which corners of each tile are the second terrain; the renderer needs
  // them to pick a tile, so they are written out beside the art rather than re-derived.
  writeFileSync(
    resolve(outDir, 'rules.json'),
    JSON.stringify({ kind: body.kind, tile_rules: body.tile_rules ?? null }, null, 2)
  );

  const entries = Object.entries(body.storage_urls);
  for (const [k, url] of entries) await savePngFromUrl(dir, k, url);
  console.log(`  ${entries.length} tuiles -> assets/Map/${dir}`);
  console.log(`  regles: ${JSON.stringify(body.tile_rules).slice(0, 300)}`);
  return body;
}

const GRASS = 'lush bright green meadow grass, fine blades, fresh spring green';

const groups = {
  stone: () =>
    generate(
      'stone',
      `1) ${GRASS} 2) a floor of large pale grey cut stone slabs with darker joints, swept clean, ` +
        `no grass on the stone. ${STYLE}`,
      'tileset'
    ),
  water: () =>
    generate(
      'water',
      `1) ${GRASS} 2) clear shallow turquoise water over a pale sandy bed, gentle ripples. ${STYLE}`,
      'tileset',
      styleFromGrass('stone')
    ),
};

const which = process.argv[2];
if (which === 'all') {
  for (const run of Object.values(groups)) await run();
} else if (groups[which]) {
  await groups[which]();
} else {
  console.error(`usage: node scripts/pixellab-map.mjs <${Object.keys(groups).join('|')}|all>`);
  process.exit(1);
}
console.log('ok');
