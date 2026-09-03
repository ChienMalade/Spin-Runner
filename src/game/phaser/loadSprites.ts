import { Asset } from 'expo-asset';
import {
  DIRECTIONS,
  KNIGHT_DASH,
  KNIGHT_IDLE,
  KNIGHT_RUN,
  SWORD_SPRITE,
  type Direction8,
} from '@/game/phaser/spriteAssets';

export const idleKey = (dir: Direction8) => `knight-idle-${dir}`;
export const runKey = (dir: Direction8, frame: number) => `knight-run-${dir}-${frame}`;
export const dashKey = (dir: Direction8, frame: number) => `knight-dash-${dir}-${frame}`;
export const SWORD_TEXTURE = 'sword-base';

/** Loads every character/sword PNG into plain HTMLImageElements, keyed by the texture name the
 * scene will register them under.
 *
 * Phaser's own loader is deliberately not used: it caps at 32 parallel downloads and, with these
 * ~150 files, stalls after the first batch — 121 files left queued, none in flight, no errors, and
 * the scene never reaches create(). Loading them here and handing the scene ready-made images via
 * `textures.addImage` sidesteps that entirely, and lets the game boot only once the art is ready. */
export async function loadSpriteImages(): Promise<Map<string, HTMLImageElement>> {
  const wanted: [string, number][] = [[SWORD_TEXTURE, SWORD_SPRITE]];
  for (const dir of DIRECTIONS) {
    wanted.push([idleKey(dir), KNIGHT_IDLE[dir]]);
    KNIGHT_RUN[dir].forEach((mod, i) => wanted.push([runKey(dir, i), mod]));
    KNIGHT_DASH[dir].forEach((mod, i) => wanted.push([dashKey(dir, i), mod]));
  }

  const entries = await Promise.all(
    wanted.map(async ([key, mod]) => {
      const uri = Asset.fromModule(mod).uri;
      const image = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        // A missing frame shouldn't take the whole game down with it — the scene falls back to
        // whatever textures did load.
        img.onerror = () => {
          console.error('[sprites] failed to load', key, uri);
          resolve(null);
        };
        img.src = uri;
      });
      return [key, image] as const;
    })
  );

  const out = new Map<string, HTMLImageElement>();
  for (const [key, image] of entries) if (image) out.set(key, image);
  return out;
}
