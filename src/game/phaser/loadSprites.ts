import { Asset } from 'expo-asset';
import { CHARACTERS, DIRECTIONS, TERRAIN_TILES, WEAPON_SPRITES, type Direction8 } from '@/game/phaser/spriteAssets';
import { CHARACTER_IDS, type CharacterId } from '@/net/protocol';

export const idleKey = (char: CharacterId, dir: Direction8) => `${char}-idle-${dir}`;
export const runKey = (char: CharacterId, dir: Direction8, frame: number) => `${char}-run-${dir}-${frame}`;
export const dashKey = (char: CharacterId, dir: Direction8, frame: number) => `${char}-dash-${dir}-${frame}`;
export const weaponKey = (char: CharacterId) => `weapon-${char}`;

/** Arena floor art. These never become Phaser textures: the scene paints them once into a single
 * ground image, so they are handed back as raw images rather than registered individually. */
export const stoneKey = (mask: number) => `stone-${mask}`;
export const waterKey = (mask: number) => `water-${mask}`;
/** The two all-grass tiles, one from each terrain set — the meadow's two faces. */
export const grassKey = (variant: number) => `grass-${variant}`;

/** Loads every character/sword PNG into plain HTMLImageElements, keyed by the texture name the
 * scene will register them under.
 *
 * Phaser's own loader is deliberately not used: it caps at 32 parallel downloads and, with these
 * ~280 files, stalls after the first batch — the rest left queued, none in flight, no errors, and
 * the scene never reaches create(). Loading them here and handing the scene ready-made images via
 * `textures.addImage` sidesteps that entirely, and lets the game boot only once the art is ready. */
export async function loadSpriteImages(): Promise<Map<string, HTMLImageElement>> {
  const wanted: [string, number][] = [];
  for (const char of CHARACTER_IDS) wanted.push([weaponKey(char), WEAPON_SPRITES[char]]);
  for (let mask = 0; mask < 16; mask++) {
    wanted.push([stoneKey(mask), TERRAIN_TILES.stone[mask]]);
    wanted.push([waterKey(mask), TERRAIN_TILES.water[mask]]);
  }
  // Mask 15 of each set is that set's all-grass tile; the two differ because they came from
  // separate generations, which is exactly the variety the meadow needs.
  wanted.push([grassKey(0), TERRAIN_TILES.stone[15]]);
  wanted.push([grassKey(1), TERRAIN_TILES.water[15]]);
  for (const char of CHARACTER_IDS) {
    const sprites = CHARACTERS[char];
    for (const dir of DIRECTIONS) {
      wanted.push([idleKey(char, dir), sprites.idle[dir]]);
      sprites.run[dir].forEach((mod, i) => wanted.push([runKey(char, dir, i), mod]));
      sprites.dash[dir].forEach((mod, i) => wanted.push([dashKey(char, dir, i), mod]));
    }
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
