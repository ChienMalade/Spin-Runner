import type { WebSocket } from 'ws';
import {
  GROWTH_LEVEL_MAX,
  LEVEL_MAX,
  MAX_SWORDS,
  SLOW_FACTOR,
  SPIN_LEVEL_MAX,
  type PlayerState,
  type SwordState,
} from './protocol.js';

export const BASE_RADIUS = 22;
// The client sizes the sword sprite from this and places it at this orbit, so what you see is what
// actually collides. Bumped from 8/48 when the flat blade became a proper sword sprite: notably
// bigger and held further out, hit area included — which does lengthen everyone's reach, so this is
// the dial to turn if combat starts feeling too swingy.
export const BASE_SWORD_RADIUS = 23;
export const BASE_SWORD_ORBIT_RADIUS = 52;
export const BASE_SWORD_SPIN = 1.1; // rad/s at level 1 — lower baseline, and levels climb more gently
export const BASE_MOVE_SPEED = 230; // px/s
export const SPEED_BUFF_MULTIPLIER = 2; // flat — the "speed" bonus no longer stacks
export const SPEED_BUFF_DURATION_MS = 3000; // re-picking it up refreshes to this, it doesn't add up
export const BASE_MAX_HP = 100;
export const SWORD_MAX_HP = 45;
export const SWORD_DAMAGE_TO_SWORD = 15;
export const SWORD_DAMAGE_TO_PLAYER = 12;
export const KNOCKBACK_IMPULSE = 260;
export const SHIELD_DURATION_MS = 5000; // flat — the "shield" bonus no longer stacks either
export const SWORD_SIZE_BUFF_MS = 8000;
export const BOT_RESPAWN_MS = 3000;
// Dash charges just fill up on their own, one graduation at a time — no sprint/hold mechanic. A
// graduation takes CHARGE_FILL_SECONDS to fill and becomes a usable charge the instant it's full,
// then there's a brief CHARGE_PAUSE_MS beat before the next graduation starts filling.
export const CHARGE_FILL_SECONDS = 5 / 1.5; // ≈3.33s per graduation
export const CHARGE_PAUSE_MS = 1000;
export const DASH_GRID_SIZE = 180; // matches the client's background grid cell size
export const DASH_DISTANCE = DASH_GRID_SIZE * 2.2; // a charged dash always covers exactly this far
export const DASH_SPEED_MULTIPLIER = 6; // how much faster than base movement the dash travels
export const HP_REGEN_FRACTION_PER_SEC = 0.01; // passive regen: 1% of max HP per second while alive
// Growth only barely slows movement now: a very light x1.04 divisor every 2 growth levels, so level
// 10 (max) is only x1.04^4 ≈ x1.17 slower than level 1 — should never feel frustrating.
export const MOVE_SLOW_STEP_PER_TWO_LEVELS = 1.04;
// Dash charges: everyone always has room for 3 stacked charges — the "speed" bonus doesn't raise
// this cap, it just instantly fills a graduation (on top of its speed boost). Dev mode can still
// push the cap further, up to 10, for testing.
export const BASE_MAX_DASH_CHARGES = 3;
export const DEV_MAX_DASH_CHARGES = 10;
// Dev-mode manual tuning steps.
export const DEV_MOVE_SPEED_STEP = 30;
export const DEV_STAMINA_RECHARGE_STEP = 0.5;

// Levels 1..10 climb at the original, familiar pace; levels 10..maxLevel are a second "prestige"
// stretch that accelerates (quadratically) toward a much stronger payoff at maxLevel, without
// disturbing how the first 10 levels already felt. Parameterized by maxLevel since growth (still
// capped at 20) and sword-tier/spin (now capped at 15) need the ramp to finish at different levels.
function prestigeFactor(level: number, maxLevel: number): number {
  const span = maxLevel - 10;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(1, (level - 10) / span)) ** 2;
}

/** The multiplier sword-tier upgrades grant at a given level: the original 1, 1.5, 2, ..., 5.5 climb
 * through level 10, then keeps accelerating up to roughly 10.45x by level 15 (LEVEL_MAX). */
export function levelMultiplier(level: number): number {
  const base10 = 1 + 0.5 * 9; // = 5.5, value at level 10
  if (level <= 10) return 1 + 0.5 * (level - 1);
  return base10 + base10 * 0.9 * prestigeFactor(level, 15);
}

/** Same shape as levelMultiplier but steeper from the start (spin should feel like it's climbing
 * toward a faster spin sooner, not just eventually) and keeps accelerating hard through level 15
 * (SPIN_LEVEL_MAX), used only for the spin bonus. */
export function spinLevelMultiplier(level: number): number {
  const base10 = 1 + 0.45 * 9; // = 5.05, value at level 10 — noticeably faster than the old max already
  if (level <= 10) return 1 + 0.45 * (level - 1);
  return base10 + base10 * 0.8 * prestigeFactor(level, 15);
}

/** Pickups needed to advance FROM this level to the next one — 1 to go from 1→2, 2 from 2→3, etc.,
 * same as before through level 10. Past that the cost stays flat at the 9→10 cost (9) all the way to
 * level 20, so the grind doesn't keep getting steeper on top of the stats already accelerating. */
export function pickupsToNextLevel(level: number): number {
  return level < 10 ? level : 9;
}

export interface ServerPlayer {
  id: string;
  name: string;
  isBot: boolean;
  ws: WebSocket | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  inputDx: number;
  inputDy: number;
  /** True while the dash button is held — only the rising edge (press) matters, to fire a dash. */
  sprintInput: boolean;
  prevSprintInput: boolean;
  /** Fill (0..1) of the next dash-charge graduation. Becomes a real charge the instant it hits 1. */
  chargeFill: number;
  /** While now < this, the next graduation doesn't start filling yet — the brief pause between charges. */
  nextChargeFillAt: number;
  dashCharges: number;
  maxDashCharges: number;
  dashRemaining: number;
  dashAngle: number;
  hp: number;
  maxHp: number;
  growthTier: number;
  growthProgress: number;
  swords: SwordState[];
  nextSwordId: number;
  swordOrbitAngle: number;
  swordTier: number;
  swordTierProgress: number;
  spinLevel: number;
  spinProgress: number;
  speedBuffUntil: number;
  swordSizeBuffUntil: number;
  alive: boolean;
  shieldUntil: number;
  hue: number;
  deadSince: number;
  /** Id of the sword currently "inside" this player (0 = none) — used to detect when a different
   * sword takes over, which always lands a guaranteed hit regardless of its own cooldown. */
  lastTouchingSwordId: number;
  devMoveSpeedOffset: number;
  devStaminaRechargeOffsetSec: number;
  gold: number;
}

/** Uniform growth multiplier applied to player radius, sword radius, orbit radius and max HP alike.
 * Climbs the original 1..5.5 curve through level 10 (unchanged from before), then accelerates so
 * level 20 lands at exactly 2x the old level-10 cap (11x) — bigger players keep getting noticeably
 * bigger per level all the way to the new max instead of leveling off. */
export function scaleFor(growthTier: number): number {
  const base10 = 1 + 0.5 * 9; // = 5.5, the old level-10 cap
  if (growthTier <= 10) return 1 + 0.5 * (growthTier - 1);
  return base10 + base10 * prestigeFactor(growthTier, 20); // -> exactly 2x base10 at level 20
}

export function radiusFor(p: ServerPlayer): number {
  return BASE_RADIUS * scaleFor(p.growthTier);
}

/** Bigger players carry a bigger health pool, scaling with the same growth curve as their size. */
export function maxHpFor(p: ServerPlayer): number {
  return BASE_MAX_HP * scaleFor(p.growthTier);
}

export function swordMaxHpFor(p: ServerPlayer): number {
  return SWORD_MAX_HP * levelMultiplier(p.swordTier);
}

export function swordDamageToSwordFor(p: ServerPlayer): number {
  return SWORD_DAMAGE_TO_SWORD * levelMultiplier(p.swordTier);
}

export function swordDamageToPlayerFor(p: ServerPlayer): number {
  return SWORD_DAMAGE_TO_PLAYER * levelMultiplier(p.swordTier);
}

export function swordRadiusFor(p: ServerPlayer): number {
  const buffed = p.swordSizeBuffUntil > Date.now() ? 1.25 : 1;
  return BASE_SWORD_RADIUS * scaleFor(p.growthTier) * buffed;
}

export function orbitRadiusFor(p: ServerPlayer): number {
  return BASE_SWORD_ORBIT_RADIUS * scaleFor(p.growthTier);
}

/** Bigger players swing slower (gaps appear in their defense); the spin bonus's level multiplier
 * counteracts this. */
export function spinSpeedFor(p: ServerPlayer): number {
  const base = BASE_SWORD_SPIN * spinLevelMultiplier(p.spinLevel);
  return base / (1 + p.growthTier * SLOW_FACTOR);
}

/** The dash always moves at a fixed multiple of the player's *un-buffed* base speed, regardless of
 * any speed buff/sprint/dev offset in effect — a predictable, fixed-distance burst. */
export function dashSpeedFor(p: ServerPlayer): number {
  const growthSlowdown = Math.pow(MOVE_SLOW_STEP_PER_TWO_LEVELS, Math.floor((p.growthTier - 1) / 2));
  return (BASE_MOVE_SPEED * DASH_SPEED_MULTIPLIER) / growthSlowdown;
}

/** Growth barely slows movement now (an x1.1 step every 2 levels — x1.3 at most, at level 7) — the
 * sword spin carries the real size-vs-speed tradeoff. The "speed" bonus is a flat, non-stacking x2 buff. */
export function moveSpeedFor(p: ServerPlayer): number {
  const speedMult = p.speedBuffUntil > Date.now() ? SPEED_BUFF_MULTIPLIER : 1;
  const growthSlowdown = Math.pow(MOVE_SLOW_STEP_PER_TWO_LEVELS, Math.floor((p.growthTier - 1) / 2));
  const base = Math.max(20, BASE_MOVE_SPEED + p.devMoveSpeedOffset);
  return (base * speedMult) / growthSlowdown;
}

export function chargeFillSecondsFor(p: ServerPlayer): number {
  return Math.max(0.5, CHARGE_FILL_SECONDS + p.devStaminaRechargeOffsetSec);
}

let nextPlayerId = 1;
let nextSwordUid = 1;

export function createPlayer(name: string, isBot: boolean, x: number, y: number): ServerPlayer {
  const p: ServerPlayer = {
    id: `p${nextPlayerId++}`,
    name,
    isBot,
    ws: null,
    x,
    y,
    vx: 0,
    vy: 0,
    facing: 0,
    inputDx: 0,
    inputDy: 0,
    sprintInput: false,
    prevSprintInput: false,
    chargeFill: 1,
    nextChargeFillAt: 0,
    dashCharges: 0,
    maxDashCharges: BASE_MAX_DASH_CHARGES,
    dashRemaining: 0,
    dashAngle: 0,
    hp: BASE_MAX_HP,
    maxHp: BASE_MAX_HP,
    growthTier: 1,
    growthProgress: 0,
    swords: [],
    nextSwordId: 0,
    swordOrbitAngle: 0,
    swordTier: 1,
    swordTierProgress: 0,
    spinLevel: 1,
    spinProgress: 0,
    speedBuffUntil: 0,
    swordSizeBuffUntil: 0,
    alive: true,
    shieldUntil: 0,
    hue: Math.floor(Math.random() * 360),
    deadSince: 0,
    lastTouchingSwordId: 0,
    devMoveSpeedOffset: 0,
    devStaminaRechargeOffsetSec: 0,
    gold: 0,
  };
  addSword(p);
  return p;
}

export function resetForRespawn(p: ServerPlayer, x: number, y: number) {
  p.x = x;
  p.y = y;
  p.vx = 0;
  p.vy = 0;
  p.sprintInput = false;
  p.prevSprintInput = false;
  p.chargeFill = 1;
  p.nextChargeFillAt = 0;
  p.dashCharges = 0;
  p.maxDashCharges = BASE_MAX_DASH_CHARGES;
  p.dashRemaining = 0;
  p.hp = BASE_MAX_HP;
  p.maxHp = BASE_MAX_HP;
  p.growthTier = 1;
  p.growthProgress = 0;
  p.swords = [];
  p.swordOrbitAngle = 0;
  p.swordTier = 1;
  p.swordTierProgress = 0;
  p.spinLevel = 1;
  p.spinProgress = 0;
  p.speedBuffUntil = 0;
  p.swordSizeBuffUntil = 0;
  p.alive = true;
  p.shieldUntil = 0;
  p.deadSince = 0;
  p.lastTouchingSwordId = 0;
  addSword(p);
}

/** Adds a sword (if under the cap) and respreads every remaining sword evenly around the circle. */
export function addSword(p: ServerPlayer): boolean {
  if (p.swords.length >= MAX_SWORDS) return false;
  const maxHp = swordMaxHpFor(p);
  p.swords.push({ id: nextSwordUid++, angleOffset: 0, hp: maxHp, maxHp });
  const n = p.swords.length;
  p.swords.forEach((s, i) => {
    s.angleOffset = (i / n) * Math.PI * 2;
  });
  return true;
}

export function repairSwords(p: ServerPlayer) {
  for (const s of p.swords) s.hp = s.maxHp;
}

/** Dev-mode "reset to defaults": wipes every dev-adjustable and level-based build stat back to a
 * fresh-spawn baseline, without otherwise touching position, HP-vs-max ratio worries, etc. — it's
 * the same shape resetForRespawn already produces, applied on demand instead of on death. */
export function resetBuild(p: ServerPlayer) {
  p.hp = BASE_MAX_HP;
  p.maxHp = BASE_MAX_HP;
  p.growthTier = 1;
  p.growthProgress = 0;
  p.swords = [];
  p.swordTier = 1;
  p.swordTierProgress = 0;
  p.spinLevel = 1;
  p.spinProgress = 0;
  p.dashCharges = 0;
  p.maxDashCharges = BASE_MAX_DASH_CHARGES;
  p.devMoveSpeedOffset = 0;
  p.devStaminaRechargeOffsetSec = 0;
  addSword(p);
}

/** Dev-mode only: removes the last sword and respreads the rest evenly. */
export function removeSword(p: ServerPlayer): boolean {
  if (p.swords.length === 0) return false;
  p.swords.pop();
  const n = p.swords.length;
  if (n > 0) {
    p.swords.forEach((s, i) => {
      s.angleOffset = (i / n) * Math.PI * 2;
    });
  }
  return true;
}

/** A "soul" bonus pickup: same escalating-cost leveling as the others. Growth being a level means
 * the extra max-HP capacity it grants (see maxHpFor) is handed over as current HP too. */
export function gainGrowthLevel(p: ServerPlayer) {
  if (p.growthTier >= GROWTH_LEVEL_MAX) return;
  p.growthProgress++;
  if (p.growthProgress >= pickupsToNextLevel(p.growthTier)) {
    const oldMax = maxHpFor(p);
    p.growthTier++;
    p.growthProgress = 0;
    const newMax = maxHpFor(p);
    p.maxHp = newMax;
    p.hp += newMax - oldMax;
  }
}

// Once a stat is maxed, further pickups of its type are wasted otherwise — convert them to gold.
const GOLD_PER_MAXED_PICKUP = 5;

/** A "spin" bonus pickup: same escalating-cost leveling as sword tier and growth, capped at
 * SPIN_LEVEL_MAX — once maxed, further spin pickups convert to gold instead of doing nothing. */
export function gainSpinLevel(p: ServerPlayer) {
  if (p.spinLevel >= SPIN_LEVEL_MAX) {
    p.gold += GOLD_PER_MAXED_PICKUP;
    return;
  }
  p.spinProgress++;
  if (p.spinProgress >= pickupsToNextLevel(p.spinLevel)) {
    p.spinLevel++;
    p.spinProgress = 0;
  }
}

/** Dev-mode only: jumps straight to a growth level (1..LEVEL_MAX), bypassing the pickup-progress
 * requirement, still granting/removing the matching HP capacity. */
export function setGrowthLevel(p: ServerPlayer, level: number) {
  const clamped = Math.max(1, Math.min(GROWTH_LEVEL_MAX, level));
  if (clamped === p.growthTier) return;
  const oldMax = maxHpFor(p);
  p.growthTier = clamped;
  p.growthProgress = 0;
  const newMax = maxHpFor(p);
  p.maxHp = newMax;
  p.hp += newMax - oldMax;
}

/** Dev-mode only: jumps straight to a spin level (1..LEVEL_MAX), bypassing pickup progress. */
export function setSpinLevel(p: ServerPlayer, level: number) {
  p.spinLevel = Math.max(1, Math.min(SPIN_LEVEL_MAX, level));
  p.spinProgress = 0;
}

/** Dev-mode only: jumps straight to a sword tier (1..LEVEL_MAX), bypassing pickup progress. Every
 * blade is re-sharpened to the tier's max HP, matching what gainSwordTier does on a real level-up. */
export function setSwordTier(p: ServerPlayer, level: number) {
  p.swordTier = Math.max(1, Math.min(LEVEL_MAX, level));
  p.swordTierProgress = 0;
  const maxHp = swordMaxHpFor(p);
  for (const s of p.swords) {
    s.maxHp = maxHp;
    s.hp = maxHp;
  }
}

/** An "upgrade" bonus pickup: same escalating-cost leveling, and sharpens every current sword to
 * the new, higher max HP the moment the tier actually increases. Once maxed (LEVEL_MAX), further
 * pickups convert to gold instead of doing nothing. */
export function gainSwordTier(p: ServerPlayer) {
  if (p.swordTier >= LEVEL_MAX) {
    p.gold += GOLD_PER_MAXED_PICKUP;
    return;
  }
  p.swordTierProgress++;
  if (p.swordTierProgress >= pickupsToNextLevel(p.swordTier)) {
    p.swordTier++;
    p.swordTierProgress = 0;
    const maxHp = swordMaxHpFor(p);
    for (const s of p.swords) {
      s.maxHp = maxHp;
      s.hp = maxHp;
    }
  }
}

export function serialize(p: ServerPlayer): PlayerState {
  return {
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    x: p.x,
    y: p.y,
    facing: p.facing,
    moving: p.inputDx !== 0 || p.inputDy !== 0,
    dashing: p.dashRemaining > 0,
    hp: p.hp,
    maxHp: p.maxHp,
    stamina: p.chargeFill,
    dashCharges: p.dashCharges,
    maxDashCharges: p.maxDashCharges,
    growthTier: p.growthTier,
    growthProgress: p.growthProgress,
    scale: scaleFor(p.growthTier),
    radius: radiusFor(p),
    swordRadius: swordRadiusFor(p),
    swordOrbitRadius: orbitRadiusFor(p),
    swordOrbitAngle: p.swordOrbitAngle,
    swordSpin: spinSpeedFor(p),
    spinLevel: p.spinLevel,
    spinProgress: p.spinProgress,
    swordTier: p.swordTier,
    swordTierProgress: p.swordTierProgress,
    swords: p.swords.map((s) => ({ ...s })),
    alive: p.alive,
    shieldUntil: p.shieldUntil,
    speedBuffUntil: p.speedBuffUntil,
    hue: p.hue,
    devMoveSpeedOffset: p.devMoveSpeedOffset,
    devStaminaRechargeOffsetSec: p.devStaminaRechargeOffsetSec,
    gold: p.gold,
  };
}
