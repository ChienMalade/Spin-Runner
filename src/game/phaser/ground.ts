import { DECOR_NAMES } from '@/game/phaser/spriteAssets';
import { decorKey, groundKey, STONE_TEXTURE, waterKey } from '@/game/phaser/loadSprites';

/** Source pixels per ground tile — the tileset is generated at this size. */
export const GROUND_TILE_PX = 32;

/** World units one source pixel covers.
 *
 * A player's collision radius at minimum size is 22 and their 64px sprite is drawn at 3.1x that
 * diameter, so one pixel of character art spans 22 * 2 * 3.1 / 64 world units. The ground is built
 * at exactly the same density, which is what makes the field and the characters read as one
 * resolution rather than two pieces of art pasted together. */
export const UNITS_PER_SRC_PX = (22 * 2 * 3.1) / 64;

/** How wide one ground tile is in world units. */
export const GROUND_TILE_WORLD = GROUND_TILE_PX * UNITS_PER_SRC_PX;

/** How far the tile is washed toward its own mean colour, to bury its repeating motif. */
const MOTIF_WASH = 0.78;
/** Grid step, in pixels, for the jittered blade scatter — one blade per cell.
 *
 * Measured on the 2816px field: a step of 4 is 496k strokes and ~920ms of freeze at join, 6 is 221k
 * and ~410ms, 8 is 124k and ~265ms. Six is the compromise — the blades are subtle enough that the
 * extra density of 4 is not worth a second of stall on a phone. */
const BLADE_SPACING = 6;
const BLADE_LIGHT = '150,182,110';
const BLADE_DARK = '54,84,42';

/** Broad tone washes over the finished grass — the meadow's large-scale variation. */
const PATCH_COUNT = 90;
const PATCH_ALPHA = 0.1;

/** Average colour of an image, used to wash a tile toward its own mean. */
function meanColor(img: HTMLImageElement): [number, number, number] {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d');
  if (!ctx) return [63, 107, 52];
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, img.width, img.height).data;
  let r = 0;
  let g = 0;
  let b = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

// --- the arena's layout ------------------------------------------------------------------------
// Fractions of the arena, so the plan holds whatever size the arena is. A uniform field gave players
// nothing to navigate by; a plaza at the centre with four roads out of it and lakes off the axes
// gives every part of the map an address.
const PLAZA_RADIUS = 0.115;
const PLAZA_WOBBLE = 0.1; // how irregular the plaza's rim is, as a fraction of its radius
const ROAD_HALF_WIDTH = 0.026;
/** Sub-divisions per tile used when clipping the paving, so its edge is not a coarse staircase. */
const STONE_EDGE_STEPS = 4;
/** Lakes, as [x, y, radius] in arena fractions. Placed off the roads so they never cut one. */
const LAKES: [number, number, number][] = [
  [0.2, 0.24, 0.1],
  [0.79, 0.2, 0.075],
  [0.24, 0.79, 0.082],
  [0.8, 0.76, 0.11],
];

/** Chance that a given cell is allowed to hold a decor prop. Kept low: the field should feel
 * inhabited, not littered, and every prop is one more thing competing with players for attention. */
const DECOR_CHANCE = 0.055;
/** Props are placed at most one per block of this many cells, so they never clump. */
const DECOR_SPACING_CELLS = 3;

/** Deterministic hash. The ground must be identical for every player and every session — two
 * clients drawing different fields for the same arena would be a very confusing bug.
 *
 * Everything here goes through Math.imul and 32-bit xorshifts on purpose. A previous version
 * multiplied by constants above 2^53; JavaScript silently lost the low bits, the mixing collapsed,
 * and successive seeds returned correlated values — which showed up on screen as scattered blades
 * lining up into long diagonal streaks across the field. */
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

/** True where the plaza or one of its four roads covers this point, in arena fractions. */
function isStone(fx: number, fy: number): boolean {
  const dx = fx - 0.5;
  const dy = fy - 0.5;
  const dist = Math.hypot(dx, dy);
  const rim = PLAZA_RADIUS * (1 + PLAZA_WOBBLE * rimWobble(Math.atan2(dy, dx), 1.7));
  if (dist < rim) return true;
  // Roads run from the plaza out to the middle of each wall. They narrow slightly as they go, which
  // reads as perspective-free but still deliberate.
  const taper = (t: number) => ROAD_HALF_WIDTH * (1.35 - 0.5 * t);
  const along = Math.max(Math.abs(dx), Math.abs(dy));
  const t = Math.min(1, Math.max(0, (along - PLAZA_RADIUS) / (0.5 - PLAZA_RADIUS)));
  if (Math.abs(dx) > Math.abs(dy)) return Math.abs(dy) < taper(t);
  return Math.abs(dx) < taper(t);
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

/**
 * Paints the entire arena floor — grass, its lighter patches, the scattered ground cover and the
 * edge wall — into ONE canvas, which the scene then draws as a single image.
 *
 * The alternative, a sprite per tile, would mean ~7700 objects for a 6000x6000 arena. Baking is one
 * draw call at any zoom, costs nothing per frame, and lets the patches and scatter run across the
 * whole field rather than repeating every few hundred units. The trade is memory: the canvas is
 * (arena / UNITS_PER_SRC_PX) pixels square — 2816x2816 for the current arena, about 32 MB, which
 * stays inside the 4096 texture limit that even mobile GPUs guarantee.
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

  // --- grass -----------------------------------------------------------------------------------
  // Only the all-one-tone tile is used. The Wang set's mixed tiles were tried and dropped: they draw
  // a *boundary* between the two tones, and a boundary is exactly what a meadow does not have — the
  // patches came out looking like ponds with a dark rim. The tone variation is painted afterwards as
  // soft gradients instead, which cannot produce an edge.
  //
  // Repetition of a single 32px tile is broken by flipping it per cell. Four orientations from one
  // tile, no seams: a tile that tiles with itself also tiles with its mirror, because the mirrored
  // edge is the same pixels in the other order.
  const tile = images.get(groundKey('0000'));
  if (tile) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const flipX = hash2(x, y, 3) < 0.5 ? -1 : 1;
        const flipY = hash2(x, y, 5) < 0.5 ? -1 : 1;
        ctx.save();
        ctx.translate((x + 0.5) * GROUND_TILE_PX, (y + 0.5) * GROUND_TILE_PX);
        ctx.scale(flipX, flipY);
        ctx.drawImage(tile, -GROUND_TILE_PX / 2, -GROUND_TILE_PX / 2, GROUND_TILE_PX, GROUND_TILE_PX);
        ctx.restore();
      }
    }
  }

  // The tile carries a small motif that reads as a grid once repeated across the field — flipping
  // it four ways is not enough to hide a shape the eye recognises. So the tile is kept for its
  // colour and washed toward its own average, which flattens the motif, and the detail is put back
  // as blades scattered over the WHOLE field. Field-wide scatter has no period at all, so there is
  // nothing left to repeat.
  if (tile) {
    const mean = meanColor(tile);
    ctx.save();
    ctx.globalAlpha = MOTIF_WASH;
    ctx.fillStyle = `rgb(${mean[0]},${mean[1]},${mean[2]})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // One blade per cell of a jittered grid rather than fully random placement: an even spread with
    // no clumps and no gaps, and each blade's position comes from its own cell coordinates, so
    // nothing can line up.
    const step = BLADE_SPACING;
    for (let gy = 0; gy * step < canvas.height; gy++) {
      for (let gx = 0; gx * step < canvas.width; gx++) {
        const x = (gx + hash2(gx, gy, 811)) * step;
        const y = (gy + hash2(gx, gy, 812)) * step;
        if (isStone(x / canvas.width, y / canvas.height) || isWater(x / canvas.width, y / canvas.height)) continue;
        const h = 2 + hash2(gx, gy, 813) * 3;
        // Half the blades lighter than the ground, half darker, so the texture reads as depth
        // rather than as speckle laid on top.
        const c = hash2(gx, gy, 814) < 0.5 ? BLADE_LIGHT : BLADE_DARK;
        ctx.strokeStyle = `rgba(${c},${0.25 + hash2(gx, gy, 815) * 0.3})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (hash2(gx, gy, 816) - 0.5) * 1.6, y - h);
        ctx.stroke();
      }
    }
  }

  // --- the plaza and its roads -----------------------------------------------------------------
  // Stone is one seamless texture rather than a Wang set (that pairing failed three times — see
  // scripts/pixellab-map.mjs), so it is clipped to the layout and given its own edge here. A hard
  // edge is right for masonry: paving stops where it stops.
  const slab = images.get(STONE_TEXTURE);
  if (slab) {
    // Clipped on a quarter-tile grid rather than whole tiles: at tile resolution the plaza's rim
    // and the roads' edges came out as a coarse staircase you could count the steps of.
    const step = GROUND_TILE_PX / STONE_EDGE_STEPS;
    const path = new Path2D();
    for (let py = 0; py < canvas.height; py += step) {
      for (let px = 0; px < canvas.width; px += step) {
        if (isStone((px + step / 2) / canvas.width, (py + step / 2) / canvas.height)) {
          path.rect(px, py, step, step);
        }
      }
    }
    ctx.save();
    ctx.clip(path);
    const pattern = ctx.createPattern(slab, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.restore();
    // A darker lip around the paving so the grass reads as sitting slightly higher than the stone.
    ctx.save();
    ctx.strokeStyle = 'rgba(40,52,32,0.55)';
    ctx.lineWidth = 2;
    ctx.stroke(path);
    ctx.restore();
  }

  // --- the lakes ---------------------------------------------------------------------------------
  // Water IS a Wang set, so its shores are drawn art rather than a hard cut. Only cells with at
  // least one water corner are painted; the rest keep the grass already laid down.
  const waterCorner = (cx: number, cy: number) => (isWater(cx / cols, cy / rows) ? 1 : 0);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const code =
        `${waterCorner(x, y)}${waterCorner(x + 1, y)}` +
        `${waterCorner(x, y + 1)}${waterCorner(x + 1, y + 1)}`;
      if (code === '0000') continue;
      const wt = images.get(waterKey(code));
      if (wt) ctx.drawImage(wt, x * GROUND_TILE_PX, y * GROUND_TILE_PX, GROUND_TILE_PX, GROUND_TILE_PX);
    }
  }

  // Broad tone variation: big, very faint radial washes, half lightening and half darkening. These
  // are what stop 6000x6000 units of lawn reading as one flat colour, and being gradients they have
  // no edge to give themselves away. Applied over everything, so it reads as light on the whole
  // arena rather than a property of the grass.
  ctx.save();
  for (let i = 0; i < PATCH_COUNT; i++) {
    const px = hash2(i, 71, 1) * canvas.width;
    const py = hash2(i, 72, 2) * canvas.height;
    const r = canvas.width * (0.04 + hash2(i, 73, 3) * 0.07);
    const lighten = hash2(i, 74, 4) < 0.5;
    ctx.globalCompositeOperation = lighten ? 'lighten' : 'multiply';
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    const tone = lighten ? '255,247,214' : '86,104,68';
    g.addColorStop(0, `rgba(${tone},${PATCH_ALPHA})`);
    g.addColorStop(1, `rgba(${tone},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
  }
  ctx.restore();

  // --- scattered ground cover ------------------------------------------------------------------
  const decorImages = DECOR_NAMES.map((n) => images.get(decorKey(n))).filter(
    (i): i is HTMLImageElement => !!i
  );
  if (decorImages.length > 0) {
    for (let by = 0; by < rows; by += DECOR_SPACING_CELLS) {
      for (let bx = 0; bx < cols; bx += DECOR_SPACING_CELLS) {
        if (hash2(bx, by, 101) > DECOR_SPACING_CELLS * DECOR_SPACING_CELLS * DECOR_CHANCE) continue;
        const fx = (bx + DECOR_SPACING_CELLS / 2) / cols;
        const fy = (by + DECOR_SPACING_CELLS / 2) / rows;
        if (isStone(fx, fy) || isWater(fx, fy)) continue;
        // Jitter inside the block so the scatter doesn't sit on the block grid.
        const jx = hash2(bx, by, 211);
        const jy = hash2(bx, by, 307);
        const pick = decorImages[Math.floor(hash2(bx, by, 401) * decorImages.length)];
        const px = (bx + jx * DECOR_SPACING_CELLS) * GROUND_TILE_PX;
        const py = (by + jy * DECOR_SPACING_CELLS) * GROUND_TILE_PX;
        ctx.drawImage(pick, Math.round(px), Math.round(py), pick.width, pick.height);
      }
    }
  }

  // --- edge wall --------------------------------------------------------------------------------
  // Decorative only: the collision boundary stays the rectangle the server clamps players to.
  const wall = images.get('border-wall');
  if (wall) {
    const w = wall.width;
    const h = wall.height;
    for (let x = 0; x < canvas.width; x += w) {
      ctx.drawImage(wall, x, 0, w, h);
      // Bottom edge is the same strip flipped, so the two sides aren't identical copies.
      ctx.save();
      ctx.translate(x + w / 2, canvas.height - h / 2);
      ctx.scale(1, -1);
      ctx.drawImage(wall, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    for (let y = 0; y < canvas.height; y += w) {
      for (const [tx, flip] of [
        [h / 2, 1],
        [canvas.width - h / 2, -1],
      ] as const) {
        ctx.save();
        ctx.translate(tx, y + w / 2);
        ctx.rotate(Math.PI / 2);
        ctx.scale(1, flip);
        ctx.drawImage(wall, -w / 2, -h / 2, w, h);
        ctx.restore();
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
