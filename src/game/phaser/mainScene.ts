import type Phaser from 'phaser';
import { useGameStore } from '@/store/gameStore';
import {
  CHARACTER_IDS,
  DEFAULT_CHARACTER,
  type BonusState,
  type BonusType,
  type CharacterId,
  type EffectState,
  type EffectType,
  type PlayerState,
  type SwordState,
} from '@/net/protocol';
import { hslToHex, lerpColorHex } from '@/game/color';
import { playSfx, type SfxName } from '@/audio/sounds';
import { CHARACTERS, DIRECTIONS, type Direction8 } from '@/game/phaser/spriteAssets';
import { dashKey, idleKey, runKey, SWORD_TEXTURE } from '@/game/phaser/loadSprites';
import { makeBlobCanvas, makeCloudCanvas, paintGround } from '@/game/phaser/ground';

// Same values as the old GameCanvas.tsx / camera.ts — the visual rules haven't changed, only how
// they're drawn. Kept local to this file rather than imported from those (being phased out) so this
// scene doesn't depend on files that will eventually be deleted.
/** Cloud shadows drifting over the field: one tiling texture, scrolled slowly. */
const CLOUD_TEXTURE_PX = 512;
const CLOUD_WORLD_SIZE = 1400;
const CLOUD_ALPHA = 0.16;
const CLOUD_DRIFT_X = 9; // world units per second
const CLOUD_DRIFT_Y = 4;

/** The blob every character's drop shadow is stamped from. Without a shadow the characters read
 * as floating above the ground rather than standing on it. */
const SHADOW_TEXTURE = 'body-shadow';
const SHADOW_WIDTH = 0.62; // fraction of the sprite box
const SHADOW_HEIGHT = 0.2; // squashed into an ellipse
const SHADOW_ALPHA = 0.34;
/** Mid-dash the character is off the ground, so the shadow shrinks and fades under them. */
const SHADOW_DASH_SCALE = 0.72;

const BASE_ZOOM = 1.2;
// Growing pulls the camera back harder than it used to (was 0.09 falloff / 0.35 floor): a maxed
// player now sees roughly twice the ground they did, which they need once their sword ring is huge.
const ZOOM_FALLOFF = 0.15;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 1.2;
const ZOOM_SMOOTH_TAU = 0.45;
const SIZE_SMOOTH_TAU = 0.35;

const BOT_BODY_COLOR = 0x8a8a8a;
const SWORD_WORN_COLOR = '#e0473b';
const AURA_PULSE_MS = 280;
/** How fast a timed aura flashes during its final second. Fast enough to read as "about to end",
 * slow enough not to strobe. */
const AURA_BLINK_MS = 130;
/** The last stretch of a lasting aura (shield, speed) is spent blinking as a warning. */
const AURA_WARN_MS = 1000;
/** How long the pickup-flash auras stay up. */
const AURA_FLASH_MS = 1000;

/** Auras are drawn as a pixel outline hugging the character's silhouette. Each has a wide faint
 * halo and a tighter bright core — two stamped passes are what sells the "glowing" part without
 * any shader.
 *
 * Thickness is measured in pixels OF THE SOURCE ART, not of the screen: the sprites are drawn
 * several times their native size, so a screen-pixel offset would be thinner than a single source
 * pixel and vanish behind the character. Working in source pixels also keeps the same visual weight
 * for any future character, whatever its art resolution. */
/** Up to three concentric bands, innermost first. Several bonuses at once show as several rings
 * rather than one blended colour: band 0 hugs the silhouette, band 1 sits outside it, band 2 outside
 * that. With a single bonus active every band takes its colour, which reads as one thick glow with
 * a soft falloff — the same look the shield had before. */
const AURA_BANDS = [
  { texels: 1.8, alpha: 1 },
  { texels: 3.9, alpha: 0.62 },
  { texels: 6.0, alpha: 0.4 },
];
const AURA_MAX_BANDS = AURA_BANDS.length;

export type AuraKind = 'shield' | 'speed' | 'heart' | 'upgrade' | 'spin';

/** One flat colour per aura. Deliberately not blended with each other: two bonuses give two rings,
 * not a muddy in-between shade. */
const AURA_COLORS: Record<AuraKind, number> = {
  shield: 0x3ba0ff,
  speed: 0x25d07a,
  heart: 0xf01d3c,
  upgrade: 0xf5b400,
  spin: 0xa53dff,
};

/** Order the rings are assigned in, innermost first, when more than one bonus is active. The three
 * pickup flashes come first so the bonus you just grabbed is the ring closest to your silhouette. */
const AURA_PRIORITY: AuraKind[] = ['heart', 'upgrade', 'spin', 'shield', 'speed'];

/** Bonus types that trigger a one-second aura flash on pickup, and the aura they raise. */
const PICKUP_FLASH_AURA: Partial<Record<BonusType, AuraKind>> = {
  heart: 'heart',
  upgrade: 'upgrade',
  spin: 'spin',
};
/** The eight directions the silhouette is stamped in to build the outline. Nothing here depends on
 * the character's size or art style, so any future character gets a correct outline for free. */
const OUTLINE_OFFSETS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const NAME_COLOR = 0xc7d6e6;

const BONUS_RADIUS = 22;
const BONUS_COLORS: Record<BonusType, number> = {
  sword: 0xf59e0b,
  spin: 0x06b6d4,
  soul: 0xa78bfa,
  heart: 0xf43f5e,
  shield: 0x3b82f6,
  speed: 0x22c55e,
  upgrade: 0xeab308,
};
const BONUS_ICONS: Record<BonusType, string> = {
  sword: '⚔️',
  spin: '🌀',
  soul: '👻',
  heart: '❤️',
  shield: '🛡️',
  speed: '👟',
  upgrade: '⭐',
};

// 'bonusPickup' and 'kill' don't use this generic fading-dot particle system — they get colorful
// bursts instead (see spawnBurst/addBurst). Only 'swordBreak' actually falls through to it.
const EFFECT_LIFETIME_MS = 260;
const EFFECT_COLORS: Partial<Record<EffectType, number>> = {
  swordClash: 0xfff6c9,
  playerHit: 0xff4d4d,
  swordBreak: 0x8a8a8a,
};
const EFFECT_SFX: Partial<Record<EffectType, SfxName>> = {
  swordClash: 'swordClash',
  playerHit: 'playerHit',
  bonusPickup: 'bonusPickup',
  dash: 'dash',
};

// Rotation "hit stop": a player's sword orbit briefly holds still on impact — purely visual (the
// real simulation never pauses), but visible to every viewer since the sword is a shared world
// object, not something private to whoever landed the hit.
const CLASH_FREEZE_MS = 70;
const HIT_FREEZE_MS = 70;
const KILL_FREEZE_MS = 110;

// Screen shake: a small, decaying random camera offset, personal to whichever screen(s) the event
// actually happened on. Magnitudes are in *screen* pixels (divided by zoom before being applied to
// the world-space camera center) so the shake feels the same size regardless of current zoom.
const CLASH_SHAKE = { mag: 4, durMs: 150 };
const HIT_SHAKE = { mag: 8, durMs: 200 };
const KILL_SHAKE = { mag: 16, durMs: 320 };

function approach(current: number, target: number, dtSec: number, tau: number): number {
  const k = 1 - Math.exp(-dtSec / tau);
  return current + (target - current) * k;
}

function targetZoomFor(growthTier: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, BASE_ZOOM / (1 + growthTier * ZOOM_FALLOFF)));
}

function hexToNum(hex: string): number {
  return parseInt(hex.slice(1), 16);
}

// The character art is 64x64 with the knight filling most of the frame; these multiply the player's
// collision radius to get the on-screen sprite size, tuned so the body reads at about the size the
// plain circle used to.
const BODY_SPRITE_SCALE = 3.1;
/** Lifts the character sprite just enough that its WAIST lands on the collision centre — which is
 * also where the swords orbit. Drawing the ring at the collision centre (rather than offsetting the
 * ring upward) is what keeps the blades where they actually hit; the character is moved to meet
 * them instead of the other way round. */
const BODY_Y_OFFSET = 0.08;
/** The blade fills roughly this much of its square sprite, so a sprite drawn at
 * 2 * swordRadius / SWORD_ART_FILL has a blade about as long as its hit circle is wide. */
const SWORD_ART_FILL = 0.85;
const RUN_FRAME_RATE = 14;
const DASH_FRAME_RATE = 20;
/** Mirrors BASE_MOVE_SPEED in server/src/entities.ts — the run cycle is played at its normal rate
 * when the character moves this fast, and faster/slower as their real speed varies (speed bonus,
 * growth slowdown), so the legs don't skate over the ground. */
const BASE_MOVE_SPEED = 230;
const RUN_TIMESCALE_MIN = 0.6;
const RUN_TIMESCALE_MAX = 2.2;
const SPEED_SMOOTH_TAU = 0.15;

/** 8-way sprite direction for a world angle. Screen y grows downward, so a positive angle rotates
 * east -> south-east -> south (see DIRECTIONS' order in spriteAssets.ts). */
function directionFor(angle: number): Direction8 {
  const step = Math.PI / 4;
  const index = ((Math.round(angle / step) % 8) + 8) % 8;
  return DIRECTIONS[index];
}

/** The server is the source of truth for a player's character; fall back to the default rather
 * than crashing on a value this build doesn't know about (e.g. an older/newer server). */
const characterOf = (p: PlayerState): CharacterId =>
  p.character && p.character in CHARACTERS ? p.character : DEFAULT_CHARACTER;

const runAnim = (char: CharacterId, dir: Direction8) => `${char}-run-${dir}`;
const dashAnim = (char: CharacterId, dir: Direction8) => `${char}-dash-${dir}`;

// Explicit draw order — objects are created at unpredictable times (players join, bonuses spawn),
// so creation order alone would put e.g. a late-spawning bonus on top of a player.
const DEPTH_GROUND = 0;
const DEPTH_CLOUD = 1;
const DEPTH_SHADOW = 2;
const DEPTH_BONUS = 5;
const DEPTH_SWORD_BEHIND = 10;
/** Behind the body so it reads as a halo bleeding out from behind the character. */
const DEPTH_AURA = 11;
const DEPTH_BODY = 12;
const DEPTH_SWORD_FRONT = 13;
const DEPTH_PARTICLE = 16;
const DEPTH_NAME = 20;
/** Above everything: the vignette is a screen effect, not part of the world. */
const DEPTH_VIGNETTE = 30;

interface SwordVisual {
  container: Phaser.GameObjects.Container;
  blade: Phaser.GameObjects.Sprite;
}

/** A radiating burst particle (kill sparks, dash streaks, bonus-pickup pops, the heart-pulse ring).
 * `gfx` is redrawn every frame from the other fields rather than being a static sprite, since the
 * shape (dot/ring/streak), size and opacity all animate over the particle's lifetime. */
interface Burst {
  id: number;
  x: number;
  y: number;
  angle: number;
  speed: number; // world units/sec
  color: number;
  size: number; // world units
  bornAt: number;
  lifetimeMs: number;
  stretch?: number;
  ring?: boolean;
  followPlayerId?: string;
  gfx: Phaser.GameObjects.Graphics;
}

/** The plain fading-dot particle (currently just sword-break puffs). */
interface SimpleParticle {
  id: number;
  bornAt: number;
  gfx: Phaser.GameObjects.Arc;
}

interface BonusVisual {
  circle: Phaser.GameObjects.Arc;
  icon: Phaser.GameObjects.Text;
}

interface PlayerVisual {
  /** Which character's art this visual uses — animation and texture keys are namespaced by it. */
  character: CharacterId;
  body: Phaser.GameObjects.Sprite;
  nameText: Phaser.GameObjects.Text;
  /** Soft ellipse on the ground under the character. Purely visual, and the single cheapest thing
   * that stops everyone looking like they are hovering. */
  shadow: Phaser.GameObjects.Image;
  /** The aura is drawn as a pixel outline: the same sprite frame stamped once per direction in
   * OUTLINE_OFFSETS, flat-tinted and sitting behind the character, so only the edges show. One set
   * of stamps is reused by every aura — only the tint changes. */
  auraStamps: Phaser.GameObjects.Sprite[];
  /** When each pickup-flash aura expires. Driven by effects, not by server state, since a pickup is
   * an event rather than a lasting condition. */
  flashUntil: Partial<Record<AuraKind, number>>;
  swords: Map<number, SwordVisual>;
  smoothRadius: number;
  smoothOrbit: number;
  /** Last animation state applied, so the sprite isn't told to restart its animation every frame. */
  animState: string;
  /** Smoothed on-screen speed, used to pace the run cycle. Measured from position deltas rather than
   * taken from the server: state arrives at 30Hz while this renders at 60, so raw per-frame deltas
   * alternate between double speed and zero — the smoothing averages back out to the real value. */
  speed: number;
  lastX: number;
  lastY: number;
}

/** A factory instead of a top-level `class MainScene extends Phaser.Scene` — this file only takes a
 * TYPE-ONLY import of 'phaser' (erased at compile time), so it carries no runtime dependency on the
 * actual package. PhaserCanvas.tsx dynamically imports the real module (web-only) and passes its
 * namespace in here, so nothing about Phaser is ever eagerly bundled into a native build. */
export function createMainScene(PhaserNS: typeof Phaser, spriteImages: Map<string, HTMLImageElement>) {
  return class MainScene extends PhaserNS.Scene {
    private smoothZoom: number | null = null;
    private playerVisuals = new Map<string, PlayerVisual>();
    private bonusVisuals = new Map<string, BonusVisual>();

    private lastEffects: EffectState[] | null = null;
    private nextParticleId = Date.now();
    private particles: SimpleParticle[] = [];
    private bursts: Burst[] = [];
    private rotationFreeze = new Map<string, { angle: number; until: number }>();
    private shake = { mag: 0, until: 0, durMs: 1 };

    constructor() {
      super('main');
    }

    private clouds: Phaser.GameObjects.TileSprite | null = null;
    private vignette: Phaser.GameObjects.Image | null = null;

    create() {
      // Textures come in already loaded (see loadSprites.ts for why Phaser's own loader isn't used).
      // Each is forced to nearest-neighbour sampling: these are 64x64 pixel-art frames drawn at
      // several times their native size, and the default smooth (bilinear) upscale blurs them.
      for (const [key, image] of spriteImages) {
        if (this.textures.exists(key)) continue;
        this.textures.addImage(key, image)?.setFilter(PhaserNS.Textures.FilterMode.NEAREST);
      }

      // Every character's animations are registered up front. There are only a couple of them and
      // the frames are already in memory, so this is cheaper than creating them lazily per player.
      for (const char of CHARACTER_IDS) {
        const sprites = CHARACTERS[char];
        for (const dir of DIRECTIONS) {
          this.anims.create({
            key: runAnim(char, dir),
            frames: sprites.run[dir].map((_, i) => ({ key: runKey(char, dir, i) })),
            frameRate: RUN_FRAME_RATE,
            repeat: -1,
          });
          this.anims.create({
            key: dashAnim(char, dir),
            frames: sprites.dash[dir].map((_, i) => ({ key: dashKey(char, dir, i) })),
            frameRate: DASH_FRAME_RATE,
            repeat: -1,
          });
        }
      }
      this.drawWorldBackground();
      this.drawVignette();
    }

    /** Paints the whole floor into one texture and drops it in as a single image.
     *
     * The floor used to be a procedural tile repeated over the arena; it is now real art — a Wang
     * set over two tones of grass, with the ground cover and the edge wall baked in. See ground.ts
     * for why it is one baked texture rather than thousands of tile sprites. */
    private drawWorldBackground() {
      const arena = useGameStore.getState().arena;
      if (!arena) return;

      const key = 'arena-ground';
      if (!this.textures.exists(key)) {
        const painted = paintGround(spriteImages, arena.width, arena.height);
        this.textures.addCanvas(key, painted)?.setFilter(PhaserNS.Textures.FilterMode.NEAREST);
      }
      this.add
        .image(0, 0, key)
        .setOrigin(0, 0)
        .setDisplaySize(arena.width, arena.height)
        .setDepth(DEPTH_GROUND);

      // Cloud shadows: one scrolling tile sprite over the whole field. Cheap, and it does more for
      // the feeling of an outdoor space than any amount of extra ground detail.
      const cloudKey = 'cloud-shadows';
      if (!this.textures.exists(cloudKey)) {
        this.textures.addCanvas(cloudKey, makeCloudCanvas(CLOUD_TEXTURE_PX));
      }
      this.clouds = this.add
        .tileSprite(0, 0, arena.width, arena.height, cloudKey)
        .setOrigin(0, 0)
        .setAlpha(CLOUD_ALPHA)
        .setDepth(DEPTH_CLOUD);
      this.clouds.setTileScale(CLOUD_WORLD_SIZE / CLOUD_TEXTURE_PX);

      // The soft blob every character's drop shadow is drawn from.
      if (!this.textures.exists(SHADOW_TEXTURE)) {
        this.textures.addCanvas(SHADOW_TEXTURE, makeBlobCanvas(64, 0.25));
      }
    }

    /** A dark rim that fades in at the screen edges. Pinned to the camera rather than the world, so
     * it stays put while everything else scrolls underneath. */
    private drawVignette() {
      const key = 'vignette';
      if (!this.textures.exists(key)) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.32, size / 2, size / 2, size * 0.72);
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(1, 'rgba(0,0,0,0.55)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, size, size);
        }
        this.textures.addCanvas(key, canvas);
      }
      const cam = this.cameras.main;
      this.vignette = this.add
        .image(0, 0, key)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(DEPTH_VIGNETTE)
        .setDisplaySize(cam.width, cam.height);
    }

    update(_time: number, deltaMs: number) {
      const state = useGameStore.getState();
      const dtSec = Math.min(0.1, deltaMs / 1000);

      if (this.clouds) {
        // Divided by the tile scale because the offset is in texture pixels, not world units.
        const perUnit = CLOUD_TEXTURE_PX / CLOUD_WORLD_SIZE;
        this.clouds.tilePositionX += CLOUD_DRIFT_X * dtSec * perUnit;
        this.clouds.tilePositionY += CLOUD_DRIFT_Y * dtSec * perUnit;
      }
      if (this.vignette) {
        const cam = this.cameras.main;
        // The canvas can be resized under us (window resize, phone rotation).
        if (this.vignette.displayWidth !== cam.width || this.vignette.displayHeight !== cam.height) {
          this.vignette.setDisplaySize(cam.width, cam.height);
        }
      }
      const now = Date.now();
      const localPlayer = state.players.find((p) => p.id === state.playerId) ?? null;

      if (state.effects !== this.lastEffects) {
        this.lastEffects = state.effects;
        this.processEffects(state.effects, state.playerId, state.players);
      }

      if (localPlayer) {
        const targetZoom = targetZoomFor(localPlayer.growthTier);
        this.smoothZoom = approach(this.smoothZoom ?? targetZoom, targetZoom, dtSec, ZOOM_SMOOTH_TAU);
        this.cameras.main.setZoom(this.smoothZoom);

        let shakeX = 0;
        let shakeY = 0;
        if (now < this.shake.until) {
          const remainingFrac = (this.shake.until - now) / this.shake.durMs;
          const magPx = this.shake.mag * remainingFrac;
          const a = Math.random() * Math.PI * 2;
          shakeX = (Math.cos(a) * magPx) / this.smoothZoom;
          shakeY = (Math.sin(a) * magPx) / this.smoothZoom;
        }
        this.cameras.main.centerOn(localPlayer.x + shakeX, localPlayer.y + shakeY);
      }

      this.updatePlayers(state.players, dtSec, now);
      this.updateBonuses(state.bonuses);
      this.updateParticles(now);
      this.updateBursts(now, state.players);
    }

    private triggerShake(mag: number, durMs: number) {
      // Take the stronger of the two if a shake is already in progress, don't just reset it.
      if (mag < this.shake.mag) return;
      this.shake = { mag, until: Date.now() + durMs, durMs };
    }

    /** Mirrors the old GameCanvas.tsx's effects useEffect: sound triggers, hit-stop freezes, screen
     * shake, and spawning particles/bursts — run once per NEW effects batch from the server (the
     * store replaces the whole array each tick, so a reference check is enough to detect "new"). */
    private processEffects(effects: EffectState[], localPlayerId: string | null, players: PlayerState[]) {
      const now = Date.now();

      const freezeRotation = (id: string | undefined, durationMs: number) => {
        if (!id) return;
        const p = players.find((pl) => pl.id === id);
        if (!p) return;
        this.rotationFreeze.set(id, { angle: p.swordOrbitAngle, until: now + durationMs });
      };

      for (const e of effects) {
        if (e.type === 'kill') {
          freezeRotation(e.actorId, KILL_FREEZE_MS);
          // The finishing-blow burst, shake and sound are exclusive to the killer's own client.
          if (e.actorId !== localPlayerId) continue;
          this.triggerShake(KILL_SHAKE.mag, KILL_SHAKE.durMs);
          this.spawnBurst(e.x, e.y, 16, 0xffcf4d, { speed: 140, spread: 90, size: 9, lifetimeMs: 650 });
          this.spawnBurst(e.x, e.y, 10, 0xff5d3d, { speed: 110, spread: 60, size: 7, lifetimeMs: 600 });
          playSfx('kill');
          continue;
        }

        if (e.type === 'swordClash') {
          freezeRotation(e.actorId, CLASH_FREEZE_MS);
          freezeRotation(e.otherId, CLASH_FREEZE_MS);
          if (localPlayerId === e.actorId || localPlayerId === e.otherId) {
            this.triggerShake(CLASH_SHAKE.mag, CLASH_SHAKE.durMs);
          }
        } else if (e.type === 'playerHit') {
          freezeRotation(e.actorId, HIT_FREEZE_MS);
          if (localPlayerId === e.targetId) this.triggerShake(HIT_SHAKE.mag, HIT_SHAKE.durMs);
        }

        if (e.type === 'bonusPickup' && e.bonusType) {
          const flash = PICKUP_FLASH_AURA[e.bonusType];
          const vis = e.actorId ? this.playerVisuals.get(e.actorId) : undefined;
          if (flash && vis) vis.flashUntil[flash] = now + AURA_FLASH_MS;
        }

        if (e.type === 'bonusPickup' && e.bonusType === 'heart') {
          // A warmer, more distinct "healing pulse": an expanding ring plus sparkles drifting mostly
          // upward, both riding along with whoever grabbed it instead of staying pinned in place.
          this.addBurst({
            x: e.x,
            y: e.y,
            angle: 0,
            speed: 0,
            color: 0xff6b81,
            size: 22,
            lifetimeMs: 480,
            ring: true,
            followPlayerId: e.actorId,
          });
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.7;
            this.addBurst({
              x: e.x,
              y: e.y,
              angle: a,
              speed: 40 + Math.random() * 55,
              color: Math.random() < 0.5 ? 0xff9bab : 0xffe3e7,
              size: 4 + Math.random() * 4,
              lifetimeMs: 550 + Math.random() * 260,
            });
          }
        } else if (e.type === 'bonusPickup') {
          this.spawnBurst(e.x, e.y, 8, e.bonusType ? BONUS_COLORS[e.bonusType] : 0xffffff);
        } else if (e.type === 'dash') {
          // A shockwave ring at the launch point, a few fading afterimages of the dasher's own body
          // tracing back along the burst, and a wide fan of elongated speed-line streaks flaring
          // opposite the dash direction.
          const forward = e.angle ?? 0;
          const back = forward + Math.PI;
          const actor = players.find((pl) => pl.id === e.actorId);
          const bodyColor = actor ? (actor.isBot ? BOT_BODY_COLOR : hexToNum(hslToHex(actor.hue, 0.65, 0.55))) : 0x7dd3fc;
          const bodyRadius = actor?.radius ?? 22;

          this.addBurst({ x: e.x, y: e.y, angle: 0, speed: 0, color: 0xbfe9ff, size: bodyRadius * 0.9, lifetimeMs: 260, ring: true });

          for (let i = 1; i <= 3; i++) {
            this.addBurst({
              x: e.x - Math.cos(forward) * bodyRadius * 0.9 * i,
              y: e.y - Math.sin(forward) * bodyRadius * 0.9 * i,
              angle: 0,
              speed: 0,
              color: bodyColor,
              size: bodyRadius * (1 - i * 0.12),
              lifetimeMs: 220 - i * 30,
            });
          }

          for (let i = 0; i < 18; i++) {
            const a = back + (Math.random() - 0.5) * 1.1;
            this.addBurst({
              x: e.x,
              y: e.y,
              angle: a,
              speed: 130 + Math.random() * 160,
              color: Math.random() < 0.5 ? 0xe0f6ff : 0x7dd3fc,
              size: 6 + Math.random() * 5,
              lifetimeMs: 260 + Math.random() * 220,
              stretch: 3 + Math.random() * 3,
            });
          }
        } else {
          this.addParticle(e.type, e.x, e.y);
        }

        const sfx = EFFECT_SFX[e.type];
        if (!sfx) continue;
        // Only what's on screen is heard: the local player has no line of sight past the camera.
        if (this.cameras.main.worldView.contains(e.x, e.y)) playSfx(sfx);
      }
    }

    private spawnBurst(
      x: number,
      y: number,
      count: number,
      color: number,
      opts: { speed?: number; spread?: number; size?: number; lifetimeMs?: number } = {}
    ) {
      const { speed = 90, spread = 40, size = 6, lifetimeMs = 420 } = opts;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        this.addBurst({ x, y, angle, speed: speed + Math.random() * spread, color, size, lifetimeMs });
      }
    }

    private addBurst(partial: Omit<Burst, 'id' | 'bornAt' | 'gfx'>) {
      const gfx = this.add.graphics().setDepth(DEPTH_PARTICLE);
      this.bursts.push({ ...partial, id: this.nextParticleId++, bornAt: Date.now(), gfx });
    }

    private updateBursts(now: number, players: PlayerState[]) {
      this.bursts = this.bursts.filter((b) => {
        const age = now - b.bornAt;
        const frac = age / b.lifetimeMs;
        if (frac >= 1) {
          b.gfx.destroy();
          return false;
        }

        const followed = b.followPlayerId ? players.find((pl) => pl.id === b.followPlayerId) : null;
        let wx: number;
        let wy: number;
        if (followed) {
          wx = followed.x;
          wy = followed.y;
        } else {
          const dist = b.speed * (age / 1000);
          wx = b.x + Math.cos(b.angle) * dist;
          wy = b.y + Math.sin(b.angle) * dist;
        }

        const alpha = Math.max(0, 1 - frac);
        b.gfx.clear();
        b.gfx.setPosition(wx, wy);

        if (b.ring) {
          const ringR = Math.max(1, b.size * (1 + frac * 2.2));
          const strokeW = Math.max(1, 3 * (1 - frac));
          b.gfx.lineStyle(strokeW, b.color, alpha);
          b.gfx.strokeCircle(0, 0, ringR);
        } else if (b.stretch) {
          const len = Math.max(2, b.size * b.stretch * (1 - frac * 0.3));
          const w = Math.max(1, b.size * 0.5);
          b.gfx.fillStyle(b.color, alpha);
          b.gfx.fillRoundedRect(-len / 2, -w / 2, len, w, w / 2);
          b.gfx.setRotation(b.angle);
        } else {
          const r = Math.max(1, b.size * (1 - frac * 0.4));
          b.gfx.fillStyle(b.color, alpha);
          b.gfx.fillCircle(0, 0, r);
        }
        return true;
      });
    }

    /** Only 'swordBreak' currently reaches here — kill/bonusPickup/dash all get their own burst
     * treatment above, and swordClash/playerHit are freeze+shake+sound only, no particle. A single
     * fading dot at the break point. */
    private addParticle(type: EffectType, x: number, y: number) {
      const color = EFFECT_COLORS[type] ?? 0xffffff;
      const gfx = this.add.circle(x, y, 6, color).setDepth(DEPTH_PARTICLE);
      this.particles.push({ id: this.nextParticleId++, bornAt: Date.now(), gfx });
    }

    private updateParticles(_now: number) {
      this.particles = this.particles.filter((p) => {
        const age = (Date.now() - p.bornAt) / EFFECT_LIFETIME_MS;
        if (age >= 1) {
          p.gfx.destroy();
          return false;
        }
        p.gfx.setRadius(Math.max(1, 6 + age * 16));
        p.gfx.setAlpha(Math.max(0, 1 - age));
        return true;
      });
    }

    private updateBonuses(bonuses: BonusState[]) {
      const liveIds = new Set<string>();
      for (const b of bonuses) {
        liveIds.add(b.id);
        let vis = this.bonusVisuals.get(b.id);
        if (!vis) {
          const circle = this.add.circle(b.x, b.y, BONUS_RADIUS, BONUS_COLORS[b.type]).setDepth(DEPTH_BONUS);
          const icon = this.add
            .text(b.x, b.y, BONUS_ICONS[b.type], { fontSize: `${BONUS_RADIUS * 1.1}px` })
            .setOrigin(0.5, 0.5)
            .setDepth(DEPTH_BONUS);
          vis = { circle, icon };
          this.bonusVisuals.set(b.id, vis);
        }
      }
      for (const [id, vis] of this.bonusVisuals) {
        if (!liveIds.has(id)) {
          vis.circle.destroy();
          vis.icon.destroy();
          this.bonusVisuals.delete(id);
        }
      }
    }

    private updatePlayers(players: PlayerState[], dtSec: number, now: number) {
      const liveIds = new Set<string>();

      for (const p of players) {
        liveIds.add(p.id);
        let vis = this.playerVisuals.get(p.id);
        if (!vis) {
          vis = this.createPlayerVisual(p);
          this.playerVisuals.set(p.id, vis);
        }
        this.syncPlayerVisual(vis, p, dtSec, now);
      }

      for (const [id, vis] of this.playerVisuals) {
        if (!liveIds.has(id)) {
          this.destroyPlayerVisual(vis);
          this.playerVisuals.delete(id);
        }
      }
    }

    private createPlayerVisual(p: PlayerState): PlayerVisual {
      const character = characterOf(p);
      const shadow = this.add
        .image(p.x, p.y, SHADOW_TEXTURE)
        .setAlpha(SHADOW_ALPHA)
        .setDepth(DEPTH_SHADOW);
      const body = this.add.sprite(p.x, p.y, idleKey(character, 'south'));
      body.setDepth(DEPTH_BODY);
      const nameText = this.add
        .text(p.x, p.y - p.radius - 6, p.name, {
          fontSize: '14px',
          color: `#${NAME_COLOR.toString(16)}`,
          fontFamily: 'Trebuchet MS, Segoe UI, Verdana, sans-serif',
          fontStyle: 'bold',
        })
        .setOrigin(0.5, 1)
        .setShadow(0, 1, 'rgba(0,0,0,0.85)', 3);
      // One stamp per direction per layer: the wide faint pass first, the tight bright one on top.
      const auraStamps = AURA_BANDS.flatMap((_, layerIndex) =>
        OUTLINE_OFFSETS.map(() => {
          const stamp = this.add.sprite(p.x, p.y, idleKey(character, 'south'));
          // FILL mode paints the silhouette a flat colour instead of multiplying with the art —
          // without it, tinting this near-black armour blue just yields dark navy, not a glow.
          stamp.setTintMode(PhaserNS.TintModes.FILL);
          stamp.setVisible(false);
          stamp.setDepth(DEPTH_AURA + (AURA_MAX_BANDS - 1 - layerIndex) * 0.1);
          return stamp;
        })
      );

      nameText.setDepth(DEPTH_NAME);

      return {
        character,
        shadow,
        body,
        nameText,
        auraStamps,
        flashUntil: {},
        swords: new Map(),
        smoothRadius: p.radius,
        smoothOrbit: p.swordOrbitRadius,
        animState: '',
        speed: 0,
        lastX: p.x,
        lastY: p.y,
      };
    }

    private syncPlayerVisual(vis: PlayerVisual, p: PlayerState, dtSec: number, now: number) {
      const alive = p.alive;
      vis.body.setVisible(alive);
      vis.nameText.setVisible(alive);
      vis.shadow.setVisible(alive);
      if (!alive) {
        // Swords/aura were only ever hidden as a side effect of syncSwords running, which never
        // ran once dead — so they'd stay on screen, frozen, until the next respawn recreated them.
        // Hide everything explicitly instead of relying on that.
        for (const stamp of vis.auraStamps) stamp.setVisible(false);
        for (const sv of vis.swords.values()) sv.container.setVisible(false);
        return;
      }

      const instantSpeed = Math.hypot(p.x - vis.lastX, p.y - vis.lastY) / Math.max(dtSec, 1 / 240);
      vis.speed = approach(vis.speed, instantSpeed, dtSec, SPEED_SMOOTH_TAU);
      vis.lastX = p.x;
      vis.lastY = p.y;

      vis.smoothRadius = approach(vis.smoothRadius, p.radius, dtSec, SIZE_SMOOTH_TAU);
      vis.smoothOrbit = approach(vis.smoothOrbit, p.swordOrbitRadius, dtSec, SIZE_SMOOTH_TAU);
      const displayRadius = vis.smoothRadius;
      const displayOrbit = vis.smoothOrbit;

      // The character art stands on the ground, so its feet sit at the bottom of the frame — nudge
      // the sprite up so the character stands ON its collision circle instead of being centred
      // through the middle of it. One constant covers every character so far: the knight's and
      // Pablo's opaque bounding boxes match to within a pixel (both 64x64, art spanning y 2..60).
      const spriteSize = displayRadius * 2 * BODY_SPRITE_SCALE;
      vis.body.setPosition(p.x, p.y - spriteSize * BODY_Y_OFFSET);
      vis.body.setDisplaySize(spriteSize, spriteSize);
      this.syncBodyAnimation(vis, p);

      // The shadow sits at the collision centre — where the feet actually are — not under the
      // sprite's middle. Mid-dash it tightens up, which reads as the character leaving the ground.
      const airborne = p.dashing ? SHADOW_DASH_SCALE : 1;
      vis.shadow.setPosition(p.x, p.y + displayRadius * 0.18);
      vis.shadow.setDisplaySize(spriteSize * SHADOW_WIDTH * airborne, spriteSize * SHADOW_HEIGHT * airborne);
      vis.shadow.setAlpha(SHADOW_ALPHA * (p.dashing ? 0.65 : 1));

      vis.nameText.setPosition(p.x, p.y - spriteSize * 0.62);
      vis.nameText.setFontSize(Math.max(9, Math.min(22, displayRadius * 0.5)));

      this.syncAura(vis, p, now, spriteSize);

      const frozen = this.rotationFreeze.get(p.id);
      const orbitAngle = frozen && now < frozen.until ? frozen.angle : p.swordOrbitAngle;

      this.syncSwords(vis, p, displayOrbit, orbitAngle);
    }

    /** Every aura currently up, innermost ring first, capped at AURA_MAX_BANDS.
     *
     * Lasting auras (shield, speed) end at a time the server tells us, so their last second is spent
     * blinking as a warning — each ring blinks on its own clock, so a green ring can be flashing out
     * while the blue one beside it holds steady. Pickup flashes are raised by an effect and simply
     * run out; a one-second flash IS its own warning, so it never blinks. */
    private activeAuras(
      vis: PlayerVisual,
      p: PlayerState,
      now: number
    ): { kind: AuraKind; intensity: number }[] {
      const endsAt: Partial<Record<AuraKind, number>> = {
        shield: p.shieldUntil,
        speed: p.speedBuffUntil,
        heart: vis.flashUntil.heart,
        upgrade: vis.flashUntil.upgrade,
        spin: vis.flashUntil.spin,
      };

      const out: { kind: AuraKind; intensity: number }[] = [];
      for (const kind of AURA_PRIORITY) {
        if (out.length >= AURA_MAX_BANDS) break;
        const until = endsAt[kind];
        if (until == null || until <= now) continue;

        const remaining = until - now;
        const warns = kind === 'shield' || kind === 'speed';
        const blinking = warns && remaining < AURA_WARN_MS;
        const intensity = blinking
          ? Math.floor(remaining / AURA_BLINK_MS) % 2 === 0
            ? 1
            : 0
          : 0.8 + 0.2 * (0.5 + 0.5 * Math.sin(now / AURA_PULSE_MS));
        out.push({ kind, intensity });
      }
      return out;
    }

    /** Stamps the character's own silhouette behind them in the aura's colour. Nothing here reads
     * the art itself, so any character — and any future one — gets a correct outline for free. */
    private syncAura(vis: PlayerVisual, p: PlayerState, now: number, spriteSize: number) {
      const auras = this.activeAuras(vis, p, now);
      if (auras.length === 0) {
        for (const stamp of vis.auraStamps) stamp.setVisible(false);
        return;
      }

      // One source pixel is (spriteSize / frame width) world units once the art is scaled up.
      const texel = spriteSize / Math.max(1, vis.body.frame.width);
      vis.auraStamps.forEach((stamp, i) => {
        const bandIndex = Math.floor(i / OUTLINE_OFFSETS.length);
        const band = AURA_BANDS[bandIndex];
        // Fewer bonuses than bands: the outer bands repeat the last aura's colour, so a lone bonus
        // reads as one thick glow instead of a thin line.
        const aura = auras[Math.min(bandIndex, auras.length - 1)];
        const [ox, oy] = OUTLINE_OFFSETS[i % OUTLINE_OFFSETS.length];
        const step = texel * band.texels;
        // Same frame as the body, so the outline tracks the animation exactly.
        stamp.setTexture(vis.body.texture.key, vis.body.frame.name);
        stamp.setTint(AURA_COLORS[aura.kind]);
        stamp.setDisplaySize(spriteSize, spriteSize);
        stamp.setPosition(vis.body.x + ox * step, vis.body.y + oy * step);
        stamp.setAlpha(band.alpha * aura.intensity);
        stamp.setVisible(aura.intensity > 0);
      });
    }

    /** Picks the right 8-way idle/run/dash animation and only restarts it when the state actually
     * changes — otherwise the sprite would be reset to frame 0 sixty times a second and never
     * visibly animate. */
    private syncBodyAnimation(vis: PlayerVisual, p: PlayerState) {
      const dir = directionFor(p.facing);
      const state = p.dashing ? `dash-${dir}` : p.moving ? `run-${dir}` : `idle-${dir}`;

      // The dash keeps its own fixed, punchy cadence; only the run cycle is paced to how fast the
      // character is actually covering ground.
      vis.body.anims.timeScale = p.dashing
        ? 1
        : Math.max(RUN_TIMESCALE_MIN, Math.min(RUN_TIMESCALE_MAX, vis.speed / BASE_MOVE_SPEED));

      if (state === vis.animState) return;
      vis.animState = state;

      if (p.dashing) vis.body.play(dashAnim(vis.character, dir), true);
      else if (p.moving) vis.body.play(runAnim(vis.character, dir), true);
      else {
        vis.body.stop();
        vis.body.setTexture(idleKey(vis.character, dir));
      }
    }

    private syncSwords(vis: PlayerVisual, p: PlayerState, displayOrbit: number, orbitAngle: number) {
      const liveSwordIds = new Set<number>();

      for (const sword of p.swords) {
        liveSwordIds.add(sword.id);
        let sv = vis.swords.get(sword.id);
        if (!sv) {
          // The art points the blade "up" (-Y); the container is rotated so its local +X faces
          // outward along the orbit, so the sprite gets a fixed quarter-turn to line the two up.
          const blade = this.add.sprite(0, 0, SWORD_TEXTURE).setRotation(Math.PI / 2);
          const container = this.add.container(0, 0, [blade]);
          sv = { container, blade };
          vis.swords.set(sword.id, sv);
        }
        this.syncOneSword(sv, sword, p, displayOrbit, orbitAngle);
      }

      for (const [id, sv] of vis.swords) {
        if (!liveSwordIds.has(id)) {
          sv.container.destroy();
          vis.swords.delete(id);
        }
      }
    }

    private syncOneSword(sv: SwordVisual, sword: SwordState, p: PlayerState, displayOrbit: number, orbitAngle: number) {
      const angle = orbitAngle + sword.angleOffset;
      const sin = Math.sin(angle);
      const wx = p.x + Math.cos(angle) * displayOrbit;
      const wy = p.y + sin * displayOrbit;
      sv.container.setPosition(wx, wy);
      sv.container.setRotation(angle);
      // Swinging through the bottom of its arc, the blade is in front of the character and should
      // cover them; through the top it passes behind.
      sv.container.setDepth(sin >= 0 ? DEPTH_SWORD_FRONT : DEPTH_SWORD_BEHIND);

      const wear = 1 - sword.hp / sword.maxHp;
      // Sized from the server's own hit radius so the blade you see is the blade that connects.
      const spriteSize = Math.max(6, (p.swordRadius * 2) / SWORD_ART_FILL);
      sv.blade.setDisplaySize(spriteSize, spriteSize);
      // Tinting toward red still shows a blade taking damage, now on the sprite instead of a
      // recolored rectangle.
      sv.blade.setTint(hexToNum(lerpColorHex('#ffffff', SWORD_WORN_COLOR, wear)));
    }

    private destroyPlayerVisual(vis: PlayerVisual) {
      vis.shadow.destroy();
      vis.body.destroy();
      vis.nameText.destroy();
      for (const stamp of vis.auraStamps) stamp.destroy();
      for (const sv of vis.swords.values()) sv.container.destroy();
    }
  };
}
