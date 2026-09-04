// Generates the arena's ground tileset and its scatter decor via the PixelLab API.
//
//   node scripts/pixellab-map.mjs ground     # 3 generations — two grass tones, Wang-blended
//   node scripts/pixellab-map.mjs decor      # 1 generation per prop
//   node scripts/pixellab-map.mjs border     # 1 generation
//
// Costs real credits, so each group is run explicitly rather than all at once. Results land in
// assets/Map/. Both endpoints can answer synchronously OR hand back a job to poll, so every call
// goes through the same wait-then-fetch path.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const key = readFileSync(resolve(root, '.env'), 'utf8').match(/^PIXELLAB_API_KEY=(.+)$/m)?.[1].trim();
if (!key) throw new Error('PIXELLAB_API_KEY missing from .env');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AUTH = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

async function post(path, body) {
  const res = await fetch(`https://api.pixellab.ai/v2/${path}`, {
    method: 'POST',
    headers: AUTH,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

/** Polls a collection resource until it stops reporting "processing". */
async function waitFor(collection, id, pick) {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`https://api.pixellab.ai/v2/${collection}/${id}`, { headers: AUTH });
    if (res.status === 423) {
      await sleep(4000);
      continue;
    }
    if (!res.ok) throw new Error(`GET ${collection}/${id} -> ${res.status}`);
    const body = await res.json();
    const value = pick(body);
    if (value) return value;
    await sleep(4000);
  }
  throw new Error(`timed out waiting for ${collection}/${id}`);
}

function savePng(dir, name, base64) {
  const outDir = resolve(root, 'assets/Map', dir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, `${name}.png`), Buffer.from(base64.replace(/^data:image\/png;base64,/, ''), 'base64'));
  console.log(`  assets/Map/${dir}/${name}.png`);
}

// ---------------------------------------------------------------------------------------------
// Ground: two tones of the SAME grass rather than grass-vs-dirt. The Wang set then blends them in
// organic patches, which is what stops 6000x6000 units of lawn reading as one flat colour — and it
// avoids the visible brightness step a grass/dirt pair produced.
// ---------------------------------------------------------------------------------------------
async function ground() {
  console.log('Sol — 3 generations…');
  const job = await post('create-tileset', {
    lower_description:
      'lush temperate meadow grass, medium desaturated green, fine short blades, soft late ' +
      'afternoon light, very low contrast, flat even ground, no flowers, no rocks, no dirt',
    upper_description:
      'the same temperate meadow grass very slightly lighter and drier, warm sun-bleached green, ' +
      'fine short blades, very low contrast, flat even ground, no flowers, no rocks, no dirt',
    transition_description: 'one shade of grass easing gently into the other, no hard edge',
    tile_size: { width: 32, height: 32 },
    mode: 'standard',
    shape_style: 'round',
    transition_size: 0,
    view: 'high top-down',
    outline: 'lineless',
    shading: 'basic shading',
    detail: 'low detail',
    seed: 4090,
  });

  const id = job.tileset?.id ?? job.tileset_id ?? job.id;
  const tiles = await waitFor('tilesets', id, (b) => (b.tileset ?? b).tiles);
  for (const tile of tiles) {
    const c = tile.corners ?? {};
    const code = ['NW', 'NE', 'SW', 'SE'].map((k) => (c[k] === 'upper' ? '1' : '0')).join('');
    savePng('ground', `tile-${code}`, tile.image?.base64 ?? tile.base64);
  }
  console.log(`  ${tiles.length} tuiles`);
}

// ---------------------------------------------------------------------------------------------
// Decor: flat, traversable props scattered over the field. Nothing here ever collides — the user's
// rule — so they are chosen to read as ground cover, not as objects you would expect to bump into.
// ---------------------------------------------------------------------------------------------
const DECOR = [
  ['daisies', 'three tiny white daisy flower heads'],
  ['cornflowers', 'three tiny blue cornflower heads'],
  ['buttercups', 'three tiny yellow buttercup flower heads'],
  ['pebbles', 'three small flat pale grey pebbles'],
  ['clover', 'five small green clover leaves'],
  ['tuft', 'a few dark green grass blades'],
];

async function decor() {
  console.log(`Decor — ${DECOR.length} generations…`);
  for (const [name, description] of DECOR) {
    const job = await post('create-image-pixflux', {
      description:
        `${description}, isolated on an empty transparent background, seen from directly overhead, ` +
        'completely flat, no height, no volume, no shadow, small, pixel art, muted natural colours',
      negative_description:
        'grass background, ground, soil, filled background, scene, bush, shrub, clump, tree, brown, ' +
        'dead leaves, side view, perspective, drop shadow, dark blob, thick outline',
      image_size: { width: 32, height: 32 },
      view: 'high top-down',
      outline: 'lineless',
      shading: 'flat shading',
      detail: 'low detail',
      no_background: true,
      text_guidance_scale: 11,
      seed: 4090,
    });
    const b64 =
      job.image?.base64 ??
      (job.image_id || job.id
        ? await waitFor('images', job.image_id ?? job.id, (b) => (b.image ?? b).base64)
        : null);
    if (!b64) throw new Error(`no image for ${name}: ${Object.keys(job)}`);
    savePng('decor', name, b64);
  }
}

// ---------------------------------------------------------------------------------------------
// Border: the arena edge. Decorative only — the collision stays the server's rectangle.
// ---------------------------------------------------------------------------------------------
async function border() {
  console.log('Bordure — 1 generation…');
  const job = await post('create-image-pixflux', {
    description:
      'a horizontal strip of weathered grey stone blocks forming the low edge wall of a field, ' +
      'seen from a high top-down angle, mossy, pixel art, muted colours, tileable left to right',
    negative_description: 'grass, sky, gate, tower, perspective, vanishing point',
    image_size: { width: 64, height: 32 },
    view: 'high top-down',
    outline: 'selective outline',
    shading: 'basic shading',
    detail: 'medium detail',
    no_background: true,
    text_guidance_scale: 9,
    seed: 4090,
  });
  const b64 =
    job.image?.base64 ??
    (job.image_id || job.id
      ? await waitFor('images', job.image_id ?? job.id, (b) => (b.image ?? b).base64)
      : null);
  if (!b64) throw new Error(`no image: ${Object.keys(job)}`);
  savePng('border', 'wall', b64);
}


// ---------------------------------------------------------------------------------------------
// A single large grass texture. The 32px tileset repeated a small motif in a grid you could read
// across the whole field; at 400px the same motif is 12x rarer, and the renderer mirror-tiles it,
// which doubles the period again without a seam.
// ---------------------------------------------------------------------------------------------
async function field() {
  console.log('Herbe — 1 generation…');
  const job = await post('create-image-pixflux', {
    description:
      'a large flat expanse of lush temperate meadow grass seen from directly overhead, ' +
      'medium desaturated green, fine short even blades, soft late afternoon light, ' +
      'uniform texture with no landmarks, very low contrast, pixel art',
    negative_description:
      'flowers, rocks, path, dirt, water, tree, shadow, object, pattern, repeating motif, ' +
      'stripes, tiles, grid, border, vignette',
    image_size: { width: 400, height: 400 },
    view: 'high top-down',
    outline: 'lineless',
    shading: 'flat shading',
    detail: 'low detail',
    text_guidance_scale: 8,
    seed: 4090,
  });
  const b64 =
    job.image?.base64 ??
    (job.image_id || job.id
      ? await waitFor('images', job.image_id ?? job.id, (b) => (b.image ?? b).base64)
      : null);
  if (!b64) throw new Error(`no image: ${Object.keys(job)}`);
  savePng('ground', 'field', b64);
}

const which = process.argv[2];
const groups = { ground, decor, border, field };
if (!groups[which]) {
  console.error('usage: node scripts/pixellab-map.mjs <ground|decor|border>');
  process.exit(1);
}
await groups[which]();
console.log('ok');
