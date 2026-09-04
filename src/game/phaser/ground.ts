import { DECOR_NAMES } from '@/game/phaser/spriteAssets';
import { decorKey, groundKey } from '@/game/phaser/loadSprites';

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

  // Broad tone variation: big, very faint radial washes, half lightening and half darkening. These
  // are what stop 6000x6000 units of lawn reading as one flat colour, and being gradients they have
  // no edge to give themselves away.
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
