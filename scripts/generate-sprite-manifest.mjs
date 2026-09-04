// Emits src/game/phaser/spriteAssets.ts — a manifest of require() calls for every character/sword PNG.
//
// Metro has to SEE a literal require() per asset to bundle it and hand back a resolvable URI, so the
// paths can't be built at runtime from the metadata.json. There are hundreds of them (per character:
// 8 directions x ~9 frames x 2 animations, plus idle rotations), hence generating the file instead
// of hand-writing it. Re-run with `npm run generate:sprites` whenever the art in assets/Character
// changes.
//
// Adding a character = adding an entry to CHARACTERS below. Folder layouts differ per character
// (PixelLab names the folders after the prompt used), so each entry spells out its own paths.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src/game/phaser/spriteAssets.ts');

// Each character swings their own thing. The art must point "up" (-Y) in its frame — the renderer
// applies one fixed quarter-turn to line that up with the orbit's outward direction.
const WEAPONS = {
  knight:
    'assets/Character/Chevalier/je_veux_une_epee_qui_colle_ave/je_veux_une_epee_qui_colle_ave/rotations/je_veux_une_epee_qui_colle_ave.png',
  pablo: 'assets/Character/épée pablo/une_epee_en_jouet_verticale/rotations/une_epee_en_jouet_verticale.png',
  sahur:
    'assets/Character/une_batte_de_baseball_vertical/une_batte_de_baseball_vertical/rotations/une_batte_de_baseball_vertical.png',
};

// Arena floor art: two 16-tile Wang sets over the same grass, from scripts/pixellab-map.mjs. Files
// are named tile_<mask>, the mask being which corners are grass (NW 8, NE 4, SW 2, SE 1).
const TERRAIN_DIRS = { stone: 'assets/Map/stone', water: 'assets/Map/water' };

const CHARACTERS = [
  {
    id: 'knight',
    label: 'Edgar',
    idle: 'assets/Character/Chevalier/un_chevalier_de_jeu_video/Idle/rotations',
    run: 'assets/Character/Chevalier/un_chevalier_de_jeu_video/mid_run/animations/The_character_leans_forward_into_a_steady_rhythmic',
    dash: 'assets/Character/Chevalier/un_chevalier_de_jeu_video/mid_very_fast_dash/animations/Le_personnage_se_propulse_violemment_vers_l_avant',
  },
  {
    id: 'pablo',
    label: 'Pablo',
    // No dedicated idle animation — the static rotations of the walk cycle are the idle pose,
    // same arrangement as the knight.
    idle: 'assets/Character/Pablo/Marche/rotations',
    run: 'assets/Character/Pablo/Marche/animations/Marche_8_direction',
    dash: 'assets/Character/Pablo/Dash/animations/Dash_8_direction',
  },
  {
    id: 'sahur',
    label: 'Sahur',
    idle: 'assets/Character/Sahur/Idle/rotations',
    run: 'assets/Character/Sahur/run/animations/running_fast',
    dash: 'assets/Character/Sahur/dash/animations/The_wooden_officer_lunges_forward_his_body_tilting',
  },
];

// Order matters: it's the 8-way lookup used by directionFor() in mainScene.ts, walking angles from
// atan2(dy, dx) in PI/4 steps. Screen y grows downward, so a growing angle goes east -> south-east
// -> south, not east -> north-east.
const DIRECTIONS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

/** Path relative to the generated file, in the forward-slash form require() expects. */
function rel(assetPath) {
  return path.relative(path.dirname(OUT), path.join(ROOT, assetPath)).split(path.sep).join('/');
}

function requireLine(assetPath) {
  const full = path.join(ROOT, assetPath);
  if (!fs.existsSync(full)) throw new Error(`Missing asset: ${assetPath}`);
  return `require('${rel(assetPath)}')`;
}

function rotations(folder) {
  return DIRECTIONS.map((dir) => `    '${dir}': ${requireLine(`${folder}/${dir}.png`)},`).join('\n');
}

/** Emits the frame lists for one animation. Every direction must have art. */
function animation(folder, indent) {
  const pad = ' '.repeat(indent);
  const blocks = [];
  for (const dir of DIRECTIONS) {
    const dirPath = path.join(ROOT, folder, dir);
    if (!fs.existsSync(dirPath)) throw new Error(`Missing animation direction: ${folder}/${dir}`);
    const frames = fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith('.png'))
      .sort();
    const list = frames.map((f) => `${pad}    ${requireLine(`${folder}/${dir}/${f}`)},`).join('\n');
    blocks.push(`${pad}  '${dir}': [\n${list}\n${pad}  ],`);
  }
  return blocks.join('\n');
}

function characterBlock(c) {
  return `  ${c.id}: {
    id: '${c.id}',
    label: '${c.label}',
    idle: {
${rotations(c.idle)}
    },
    run: {
${animation(c.run, 4)}
    },
    dash: {
${animation(c.dash, 4)}
    },
  },`;
}


const terrainEntries = Object.entries(TERRAIN_DIRS)
  .map(([name, dir]) => {
    const rows = [];
    for (let mask = 0; mask < 16; mask++) {
      rows.push(`    ${mask}: ${requireLine(`${dir}/tile_${mask}.png`)},`);
    }
    return `  ${name}: {\n${rows.join('\n')}\n  },`;
  })
  .join('\n');

const weaponEntries = CHARACTERS.map((c) => {
  const file = WEAPONS[c.id];
  if (!file) throw new Error(`No weapon art for character: ${c.id}`);
  return `  ${c.id}: ${requireLine(file)},`;
}).join('\n');

const blocks = CHARACTERS.map(characterBlock).join('\n');

const out = `// AUTO-GENERATED by scripts/generate-sprite-manifest.mjs — do not edit by hand.
/* eslint-disable @typescript-eslint/no-require-imports */

// CharacterId comes from the protocol, not from this file: typing CHARACTERS as a full Record over
// it means a character listed in the protocol without art here fails to compile.
import type { CharacterId } from '@/net/protocol';

export type Direction8 =
  | 'east'
  | 'north-east'
  | 'north'
  | 'north-west'
  | 'west'
  | 'south-west'
  | 'south'
  | 'south-east';

/** Indexed by round(atan2(dy, dx) / (PI/4)) mod 8 — screen y grows downward, so index 1 (PI/4) is
 * south-east, not north-east. */
export const DIRECTIONS: Direction8[] = [
${DIRECTIONS.map((d) => `  '${d}',`).join('\n')}
];

export interface CharacterSprites {
  id: CharacterId;
  label: string;
  idle: Record<Direction8, number>;
  run: Record<Direction8, number[]>;
  dash: Record<Direction8, number[]>;
}

export const CHARACTERS: Record<CharacterId, CharacterSprites> = {
${blocks}
};

/** What each character orbits. Typed as a full Record so a new character cannot ship without one.
 * Edgar's magic-imbued sword variant (l_epee_est_impregner) is deliberately left out for now. */
export const WEAPON_SPRITES: Record<CharacterId, number> = {
${weaponEntries}
};
/** The two terrain sets, indexed by corner mask: which corners are grass, NW 8 / NE 4 / SW 2 / SE 1.
 * Mask 15 is all grass — the renderer takes its base meadow from each set's mask 15 — and mask 0 is
 * all of the other terrain. */
export const TERRAIN_TILES: Record<'stone' | 'water', Record<number, number>> = {
${terrainEntries}
};
`;

fs.writeFileSync(OUT, out);
const count = (out.match(/require\(/g) || []).length;
console.log(`Wrote ${path.relative(ROOT, OUT)} (${count} assets, ${CHARACTERS.length} characters)`);
