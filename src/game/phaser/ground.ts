import { grassKey, stoneKey, waterKey } from '@/game/phaser/loadSprites';

/** Source pixels per ground tile. 64 to match the character art exactly: one pixel of ground is one
 * pixel of character, which is what makes the scene read as one piece of art. An earlier 32px floor
 * was half the resolution of the people standing on it, and looked it. */
export const GROUND_TILE_PX = 64;

/** World units one source pixel covers.
 *
 * A player's collision radius at minimum size is 22 and their 64px sprite is drawn at 3.1x that
 * diameter, so one pixel of character art spans 22 * 2 * 3.1 / 64 world units. */
export const UNITS_PER_SRC_PX = (22 * 2 * 3.1) / 64;

/** How wide one ground tile is in world units. */
export const GROUND_TILE_WORLD = GROUND_TILE_PX * UNITS_PER_SRC_PX;

// --- the arena's layout --------------------------------------------------------------------------
// Fractions of the arena, so the plan holds whatever size the arena is. A uniform field gave players
// nothing to navigate by; a plaza at the centre with four roads out of it, lakes in the quadrants
// and a paved rim around the edge gives every part of the map an address.
const PLAZA_RADIUS = 0.13;
const PLAZA_WOBBLE = 0.09; // irregularity of the plaza's rim, as a fraction of its radius
const ROAD_HALF_WIDTH = 0.03;
/** Paved border ring, as a fraction of the arena. Marks the edge; it is not an obstacle. */
const RIM_WIDTH = 0.022;
/** Lakes, as [x, y, radius] in arena fractions. Placed off the roads so they never cut one. */
const LAKES: [number, number, number][] = [
  [0.21, 0.25, 0.105],
  [0.78, 0.21, 0.08],
  [0.24, 0.78, 0.088],
  [0.79, 0.755, 0.115],
];

/**
 * Removes a tile's built-in large-scale shading, keeping its fine detail.
 *
 * The generated tiles are lit like little pictures rather than like texture: the all-grass tile
 * measures 167 in luminance along its top edge and 102 along its bottom. Tiled normally that puts a
 * dark edge against a bright one and covers the field in a grid; mirrored, the same gradient turns
 * into a wallpaper of symmetric blobs. Subtracting the blurred version and adding the mean back
 * flattens the lighting so every edge lands near the same value, which is what makes a tile tile.
 *
 * The blur is a wrapping box blur, so the correction itself is seamless.
 */
function flattenTile(img: HTMLImageElement, radius: number): HTMLCanvasElement {
  const w = img.width;
  const h = img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.drawImage(img, 0, 0);
  const image = ctx.getImageData(0, 0, w, h);
  const d = image.data;

  const blur = new Float32Array(w * h * 3);
  const tmp = new Float32Array(w * h * 3);
  const span = radius * 2 + 1;
  // Horizontal pass, wrapping at the edges.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = -radius; k <= radius; k++) {
        const i = (y * w + ((x + k + w) % w)) * 4;
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
      }
      const o = (y * w + x) * 3;
      tmp[o] = r / span;
      tmp[o + 1] = g / span;
      tmp[o + 2] = b / span;
    }
  }
  // Vertical pass.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let k = -radius; k <= radius; k++) {
        const o = (((y + k + h) % h) * w + x) * 3;
        r += tmp[o];
        g += tmp[o + 1];
        b += tmp[o + 2];
      }
      const o = (y * w + x) * 3;
      blur[o] = r / span;
      blur[o + 1] = g / span;
      blur[o + 2] = b / span;
    }
  }

  const mean = meanColor(img, w, h);
  for (let i = 0, o = 0; i < d.length; i += 4, o += 3) {
    d[i] = Math.max(0, Math.min(255, d[i] - blur[o] + mean[0]));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] - blur[o + 1] + mean[1]));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] - blur[o + 2] + mean[2]));
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Mean colour of an image's opaque pixels. */
function meanColor(img: CanvasImageSource, w: number, h: number): [number, number, number] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return [1, 1, 1];
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, w, h).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 16) continue;
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
    count++;
  }
  return count === 0 ? [1, 1, 1] : [r / count, g / count, b / count];
}

/** Re-tints every tile of one terrain set so its grass matches the other set's.
 *
 * The two sets are generated in separate calls and their meadows come out slightly different
 * greens. Laid side by side that difference reads as a chequerboard, and it shows again wherever a
 * lake's shore meets the field. PixelLab refuses style references on connectable sets — they are
 * "connectable features cannot be combined with style tiles" — so the match is made here instead,
 * from the measured mean of each set's all-grass tile. */
function toneMatched(
  tiles: (HTMLImageElement | undefined)[],
  from: HTMLImageElement,
  to: HTMLCanvasElement
) {
  const src = meanColor(from, from.width, from.height);
  const dst = meanColor(to, to.width, to.height);
  const gain = [dst[0] / Math.max(1, src[0]), dst[1] / Math.max(1, src[1]), dst[2] / Math.max(1, src[2])];

  return tiles.map((img) => {
    if (!img) return undefined;
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) return img;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, d[i] * gain[0]);
      d[i + 1] = Math.min(255, d[i + 1] * gain[1]);
      d[i + 2] = Math.min(255, d[i + 2] * gain[2]);
    }
    ctx.putImageData(data, 0, 0);
    return c;
  });
}

/** Deterministic hash. The ground must be identical for every player and every session — two
 * clients drawing different fields for the same arena would be a very confusing bug.
 *
 * Math.imul and 32-bit xorshifts on purpose: a previous version multiplied by constants above 2^53,
 * JavaScript silently lost the low bits, the mixing collapsed, and successive seeds came back
 * correlated — which showed on screen as scattered detail lining up into diagonal streaks. */
function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Wobble applied to a region's rim so nothing in the arena is a perfect circle. */
function rimWobble(angle: number, seed: number): number {
  return (
    Math.sin(angle * 3 + seed) * 0.55 + Math.sin(angle * 7 + seed * 2.3) * 0.3 + Math.sin(angle * 13 + seed) * 0.15
  );
}

/** True where paving covers this point: the border rim, the central plaza, or one of its four roads.
 * Coordinates are fractions of the arena. */
function isStone(fx: number, fy: number): boolean {
  if (fx < RIM_WIDTH || fx > 1 - RIM_WIDTH || fy < RIM_WIDTH || fy > 1 - RIM_WIDTH) return true;

  const dx = fx - 0.5;
  const dy = fy - 0.5;
  const rim = PLAZA_RADIUS * (1 + PLAZA_WOBBLE * rimWobble(Math.atan2(dy, dx), 1.7));
  if (Math.hypot(dx, dy) < rim) return true;

  // Roads run from the plaza out to the middle of each wall, narrowing slightly as they go.
  const along = Math.max(Math.abs(dx), Math.abs(dy));
  const t = Math.min(1, Math.max(0, (along - PLAZA_RADIUS) / (0.5 - PLAZA_RADIUS)));
  const halfWidth = ROAD_HALF_WIDTH * (1.3 - 0.45 * t);
  return Math.abs(dx) > Math.abs(dy) ? Math.abs(dy) < halfWidth : Math.abs(dx) < halfWidth;
}

/** True where a lake covers this point. */
function isWater(fx: number, fy: number): boolean {
  for (let i = 0; i < LAKES.length; i++) {
    const [lx, ly, lr] = LAKES[i];
    const dx = fx - lx;
    const dy = fy - ly;
    const rim = lr * (1 + 0.22 * rimWobble(Math.atan2(dy, dx), 3.1 + i * 2.7));
    if (Math.hypot(dx, dy) < rim) return true;
  }
  return false;
}

/** The tiles are NOT seamless with themselves. Measured on the all-grass tile: its top edge averages
 * 167 in luminance and its bottom edge 102, its left 150 and its right 115. Tiled the ordinary way,
 * every dark bottom edge lands against a bright top edge and the field is covered in a grid.
 *
 * Mirroring by parity fixes it exactly rather than approximately: with every odd column and row
 * flipped, each edge only ever meets its own reflection, so the two sides of every join are the same
 * pixels. The cost is a two-by-two symmetry in the pattern, which on grass is invisible next to the
 * grid it removes. */
const mirrorX = () => false;
const mirrorY = () => false;

/** Corner mask in the order the generated tilesets use.
 *
 * Read off the generated art rather than assumed: tile_1 has the second terrain in every corner but
 * the south-east, tile_2 all but the south-west, tile_4 all but the north-east, tile_8 all but the
 * north-west. So a set bit means "grass at this corner", weighted NW 8, NE 4, SW 2, SE 1. Mask 15 is
 * all grass; mask 0 is all of the other terrain.
 *
 * The corners are permuted by the cell's mirroring first, so that the tile picked here shows the
 * corners we actually want once it has been flipped.  */
function cornerMask(inRegion: (cx: number, cy: number) => boolean, x: number, y: number): number {
  const grass = (cx: number, cy: number) => (inRegion(cx, cy) ? 0 : 1);
  let nw = grass(x, y);
  let ne = grass(x + 1, y);
  let sw = grass(x, y + 1);
  let se = grass(x + 1, y + 1);

  return nw * 8 + ne * 4 + sw * 2 + se;
}

/**
 * Paints the entire arena floor into ONE canvas, which the scene then draws as a single image.
 *
 * The alternative, a sprite per tile, would mean thousands of objects for a 6000x6000 arena. Baking
 * is one draw call at any zoom and costs nothing per frame. The trade is memory: the canvas is
 * (arena / UNITS_PER_SRC_PX) pixels square — 2816x2816 for the current arena, about 32 MB, which
 * stays inside the 4096 texture limit even mobile GPUs guarantee.
 *
 * Everything here is generated art. There is deliberately no procedural touch-up: an earlier version
 * washed the tile toward its own average and redrew grass blades in code, which is exactly why the
 * field looked like flat green with noise sprinkled over it.
 */
export function paintGround(
  images: Map<string, HTMLImageElement>,
  arenaWidth: number,
  arenaHeight: number
): HTMLCanvasElement {
  const cols = Math.ceil(arenaWidth / GROUND_TILE_WORLD);
  const rows = Math.ceil(arenaHeight / GROUND_TILE_WORLD);

  const canvas = document.createElement('canvas');
  canvas.width = cols * GROUND_TILE_PX;
  canvas.height = rows * GROUND_TILE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;

  const px = GROUND_TILE_PX;
  /** Draws one cell, mirrored according to its position — see mirrorX / mirrorY. */
  const draw = (img: CanvasImageSource | undefined, x: number, y: number) => {
    if (!img) return;
    // Flipping only for variety now that the tiles are flat enough to meet anywhere.
    const fx = hash2(x, y, 21) < 0.5 ? -1 : 1;
    const fy = hash2(x, y, 23) < 0.5 ? -1 : 1;
    if (fx === 1 && fy === 1) {
      ctx.drawImage(img, x * px, y * px, px, px);
      return;
    }
    ctx.save();
    ctx.translate((x + 0.5) * px, (y + 0.5) * px);
    ctx.scale(fx, fy);
    ctx.drawImage(img, -px / 2, -px / 2, px, px);
    ctx.restore();
  };

  // --- the meadow --------------------------------------------------------------------------------
  // ONE grass tile, mirrored per cell. Alternating two tiles was tried and it drew a chequerboard:
  // the field's period is short enough that any tone difference between two tiles reads as a grid.
  const grassSrc = images.get(grassKey(0));
  const grass = grassSrc ? flattenTile(grassSrc, 10) : undefined;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) draw(grass, x, y);
  }

  // --- lakes, then paving ------------------------------------------------------------------------
  // Paving goes on top so a road can run right to the water's edge without the shore cutting it.
  const inWater = (cx: number, cy: number) => isWater(cx / cols, cy / rows);
  const inStone = (cx: number, cy: number) => isStone(cx / cols, cy / rows);

  const stoneTiles: (HTMLImageElement | undefined)[] = [];
  const waterRaw: (HTMLImageElement | undefined)[] = [];
  for (let mask = 0; mask < 16; mask++) {
    stoneTiles.push(images.get(stoneKey(mask)));
    waterRaw.push(images.get(waterKey(mask)));
  }
  const grassWater = images.get(grassKey(1));
  const waterTiles = grass && grassWater ? toneMatched(waterRaw, grassWater, grass) : waterRaw;

  for (const [region, tiles] of [
    [inWater, waterTiles],
    [inStone, stoneTiles],
  ] as const) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const mask = cornerMask(region, x, y);
        // 15 is all grass: none of this terrain here, so leave the meadow showing.
        if (mask === 15) continue;
        draw(tiles[mask], x, y);
      }
    }
  }

  return canvas;
}

/**
 * A soft round blob, used for the drop shadow under every character and for the drifting cloud
 * shadows. Drawn rather than generated as art so it scales to any size without banding.
 */
export function makeBlobCanvas(size: number, hardness: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const r = size / 2;
  const gradient = ctx.createRadialGradient(r, r, r * hardness, r, r, r);
  gradient.addColorStop(0, 'rgba(0,0,0,1)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/**
 * A tileable field of soft dark blobs, scrolled slowly across the arena as cloud shadows. One
 * TileSprite, one draw call, and it does more for the sense of an outdoor space than any amount of
 * extra ground detail.
 */
export function makeCloudCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  for (let i = 0; i < 14; i++) {
    const cx = hash2(i, 1, 55) * size;
    const cy = hash2(i, 2, 55) * size;
    const r = size * (0.09 + hash2(i, 3, 55) * 0.14);
    // Drawn nine times on a wrapping offset grid so the texture tiles without a seam.
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const gradient = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
        gradient.addColorStop(0, 'rgba(0,0,0,0.5)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  return canvas;
}
