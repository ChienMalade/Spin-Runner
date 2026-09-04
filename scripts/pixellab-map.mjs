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

/** The arena's art direction, shared by every prompt below: bright anime/manga colour, clean cel
 * shading, saturated but not neon. Changed from the first pass, which asked for muted low-contrast
 * ground and came out drab. */
const STYLE =
  'vibrant anime style pixel art, bright saturated colours, clean cel shading, crisp readable ' +
  'shapes, cheerful sunny lighting, high colour contrast, Studio Ghibli meadow palette';
const ANTI = 'drab, washed out, desaturated, muddy, grey, gloomy, realistic, photo, noisy dithering';

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
      'lush bright green anime meadow grass, vivid fresh spring green, fine short blades, sunny, ' +
      `flat even ground, no flowers, no rocks, no dirt, ${STYLE}`,
    upper_description:
      'the same meadow grass one shade lighter and warmer, sunlit yellow-green, fine short blades, ' +
      `flat even ground, no flowers, no rocks, no dirt, ${STYLE}`,
    transition_description: 'one shade of grass easing gently into the other, no hard edge',
    tile_size: { width: 32, height: 32 },
    mode: 'standard',
    shape_style: 'round',
    transition_size: 0,
    view: 'high top-down',
    outline: 'lineless',
    shading: 'basic shading',
    detail: 'medium detail',
    seed: 7311,
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
        `completely flat, no height, no volume, no shadow, small, ${STYLE}`,
      negative_description:
        `grass background, ground, soil, filled background, scene, bush, shrub, clump, tree, brown, ` +
        `dead leaves, side view, perspective, drop shadow, dark blob, thick outline, ${ANTI}`,
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
      'a horizontal strip of bright stone blocks forming the low edge wall of a field, seen from a ' +
      `high top-down angle, vivid green moss between the stones, tileable left to right, ${STYLE}`,
    negative_description: `grass field, sky, gate, tower, perspective, vanishing point, ${ANTI}`,
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


// ---------------------------------------------------------------------------------------------
// Region materials and landmarks, generated with the knight as a STYLE REFERENCE so the arena and
// the characters come out of the same hand. create-image-bitforge is the endpoint that takes one:
// style_image plus style_strength, 1 generation, max 200x200.
//
// Everything here is flat and traversable. The user's rule stands: no obstacles anywhere.
// ---------------------------------------------------------------------------------------------
const KNIGHT_REF = 'assets/Character/Chevalier/un_chevalier_de_jeu_video/Idle/rotations/south.png';

function knightStyle() {
  return {
    type: 'base64',
    base64: readFileSync(resolve(root, KNIGHT_REF)).toString('base64'),
    format: 'png',
  };
}

const MATERIALS = [
  ['stone', 'a floor of large flat pale flagstones with bright turquoise moss in the joints'],
  ['moss', 'thick vivid emerald moss carpet, lush and springy'],
  ['sand', 'warm golden sand, clean and bright'],
  ['water', 'clear shallow turquoise water, bright and sparkling, gentle ripples'],
  ['path', 'a sunlit track of warm sandy earth with pale pebbles'],
];

async function materials() {
  console.log(`Materiaux — ${MATERIALS.length} generations…`);
  const style = knightStyle();
  for (const [name, description] of MATERIALS) {
    const job = await post('create-image-bitforge', {
      description: `${description}, seen from directly overhead, flat ground texture filling the whole image, ${STYLE}`,
      negative_description: `character, object, plant, wall, edge, border, frame, vignette, perspective, horizon, ${ANTI}`,
      image_size: { width: 64, height: 64 },
      // The knight is dark and desaturated; leaning on it as a style reference is what dragged the
      // first pass drab. Keep a light touch so the palette can be bright.
      style_image: style,
      style_strength: 15,
      view: 'high top-down',
      outline: 'lineless',
      shading: 'basic shading',
      detail: 'medium detail',
      text_guidance_scale: 9,
      seed: 7311,
    });
    const b64 =
      job.image?.base64 ??
      (job.image_id || job.id
        ? await waitFor('images', job.image_id ?? job.id, (b) => (b.image ?? b).base64)
        : null);
    if (!b64) throw new Error(`no image for ${name}: ${Object.keys(job)}`);
    savePng('material', name, b64);
  }
}

const LANDMARKS = [
  ['column', 'a broken stone column lying on its side, cracked, mossy'],
  ['bones', 'a scattered pile of old bleached bones and a cracked skull'],
  ['banner', 'a tattered dark cloth banner lying flat on the ground'],
  ['runes', 'a ring of carved stone runes set flush into the ground, faintly glowing'],
];

async function landmarks() {
  console.log(`Reperes — ${LANDMARKS.length} generations…`);
  const style = knightStyle();
  for (const [name, description] of LANDMARKS) {
    const job = await post('create-image-bitforge', {
      description: `${description}, isolated on an empty transparent background, seen from directly overhead, lying flat on the ground, pixel art`,
      negative_description: 'grass background, ground, filled background, scene, standing upright, side view, perspective, tall, casting shadow',
      image_size: { width: 64, height: 64 },
      style_image: style,
      style_strength: 55,
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
    if (!b64) throw new Error(`no image for ${name}: ${Object.keys(job)}`);
    savePng('landmark', name, b64);
  }
}


// ---------------------------------------------------------------------------------------------
// Terrain sets for the composed arena: grass->stone for the plaza and its paths, grass->water for
// the ponds. A Wang set draws a BOUNDARY between its two terrains, which was wrong when both were
// grass (see ground.ts) but is exactly right here — a paved plaza should have an edge.
//
// The water set is chained to the stone set's grass tile so the grass is literally the same art in
// both, instead of two near-misses that would show as patches wherever they met.
// ---------------------------------------------------------------------------------------------
const GRASS_DESC =
  'lush bright green anime meadow grass, vivid fresh spring green, fine short blades, sunny, ' +
  'flat even ground, no flowers, no rocks';

async function stoneSet() {
  console.log('Pierre — 3 generations…');

  const stoneJob = await post('create-tileset', {
    lower_description: `${GRASS_DESC}, ${STYLE}`,
    upper_description:
      'a paved floor of large cut grey stone slabs, light warm grey masonry with darker joints ' +
      'between the blocks, absolutely no grass and no green, dry and swept clean, flat and ' +
      'walkable, vibrant anime style pixel art, clean cel shading, crisp readable shapes',
    transition_description: 'the last blades of grass meeting the cut edge of the grey paving',
    tile_size: { width: 32, height: 32 },
    mode: 'standard',
    shape_style: 'round',
    // The first two attempts came back with grass for BOTH terrains. enhance lets the model rewrite
    // the descriptions and pick base colours to match, which is the documented cure for exactly this.
    enhance: true,
    transition_size: 0.25,
    view: 'high top-down',
    outline: 'lineless',
    shading: 'basic shading',
    detail: 'medium detail',
    seed: 991,
  });
  const stoneId = stoneJob.tileset?.id ?? stoneJob.tileset_id ?? stoneJob.id;
  const stoneTiles = await waitFor('tilesets', stoneId, (b) => (b.tileset ?? b).tiles);
  let grassBaseId = null;
  for (const tile of stoneTiles) {
    const c = tile.corners ?? {};
    const code = ['NW', 'NE', 'SW', 'SE'].map((k) => (c[k] === 'upper' ? '1' : '0')).join('');
    if (code === '0000') grassBaseId = tile.id ?? null;
    savePng('stone', `tile-${code}`, tile.image?.base64 ?? tile.base64);
  }
  console.log(`  pierre: ${stoneTiles.length} tuiles`);
  return grassBaseId;
}

async function waterSet(grassBaseId) {
  console.log('Eau — 3 generations…');
  const waterJob = await post('create-tileset', {
    lower_description: `${GRASS_DESC}, ${STYLE}`,
    upper_description:
      'clear shallow turquoise water over a pale sandy bed, bright and sparkling, gentle ripples, ' +
      `${STYLE}`,
    transition_description: 'grass giving way to a wet sandy shore at the water line',
    lower_base_tile_id: grassBaseId ?? undefined,
    tile_size: { width: 32, height: 32 },
    mode: 'standard',
    shape_style: 'round',
    transition_size: 0.25,
    view: 'high top-down',
    outline: 'lineless',
    shading: 'basic shading',
    detail: 'medium detail',
    seed: 7311,
  });
  const waterId = waterJob.tileset?.id ?? waterJob.tileset_id ?? waterJob.id;
  const waterTiles = await waitFor('tilesets', waterId, (b) => (b.tileset ?? b).tiles);
  for (const tile of waterTiles) {
    const c = tile.corners ?? {};
    const code = ['NW', 'NE', 'SW', 'SE'].map((k) => (c[k] === 'upper' ? '1' : '0')).join('');
    savePng('water', `tile-${code}`, tile.image?.base64 ?? tile.base64);
  }
  console.log(`  eau: ${waterTiles.length} tuiles`);
}


// ---------------------------------------------------------------------------------------------
// A plain stone texture, tiled by the renderer which draws the plaza's edge itself.
//
// This replaces a grass->stone Wang set that was attempted three times (9 generations) and failed
// the same way every time: the "upper" terrain came back as a flat green fill with no masonry at
// all, whatever the description said. The water set generated from the same call shape worked
// first time, so the fault is specific to that pairing — don't retry it.
// ---------------------------------------------------------------------------------------------
async function stone() {
  console.log('Pierre — 1 generation…');
  const job = await post('create-image-pixflux', {
    description:
      'a seamless paved floor of large cut grey stone slabs, light warm grey masonry with darker ' +
      'joints between the blocks, dry and swept, seen from directly overhead, filling the entire ' +
      'image edge to edge, vibrant anime style pixel art, clean cel shading',
    negative_description:
      'grass, green, moss, plant, dirt, water, border, frame, edge of the paving, vignette, object, character',
    image_size: { width: 64, height: 64 },
    view: 'high top-down',
    outline: 'lineless',
    shading: 'basic shading',
    detail: 'medium detail',
    text_guidance_scale: 10,
    seed: 991,
  });
  const b64 =
    job.image?.base64 ??
    (job.image_id || job.id
      ? await waitFor('images', job.image_id ?? job.id, (b) => (b.image ?? b).base64)
      : null);
  if (!b64) throw new Error('no image');
  savePng('stone', 'slab', b64);
}

const which = process.argv[2];
async function terrain() {
  const grassBaseId = await stoneSet();
  await waterSet(grassBaseId);
}

const groups = { ground, decor, border, field, materials, landmarks, terrain, stoneSet, stone };
if (!groups[which]) {
  console.error('usage: node scripts/pixellab-map.mjs <ground|decor|border>');
  process.exit(1);
}
await groups[which]();
console.log('ok');
