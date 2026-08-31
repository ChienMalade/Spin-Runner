import type { WebSocket } from 'ws';
import {
  GROWTH_LEVEL_MAX,
  LEVEL_MAX,
  MAX_SWORDS,
  SLOW_FACTOR,
  SPIN_LEVEL_MAX,
  SPRINT_SECONDS_PER_GRADUATION,
  type PlayerState,
  type SwordState,
} from './protocol.js';

export const BASE_RADIUS = 22;
export const BASE_SWORD_RADIUS = 8;
export const BASE_SWORD_ORBIT_RADIUS = 48;
export const BASE_SWORD_SPIN = 1.1; // rad/s at level 1 — lower baseline, and levels climb more gently
export const BASE_MOVE_SPEED = 230; // px/s
export const SPEED_BUFF_MULTIPLIER = 2; // flat — the "speed" bonus no longer stacks
export const SPEED_BUFF_DURATION_MS = 3000; // re-picking it up refreshes to this, it doesn't add up
export const BASE_MAX_HP = 100;
export const SWORD_MAX_HP = 45;
export const SWORD_DAMAGE_TO_SWORD = 15;
export const SWORD_DAMAGE_TO_PLAYER = 12;
export const KNOCKBACK_IMPULSE = 260;
export const SHIELD_DURATION_MS = 3000; // flat — the "shield" bonus no longer stacks either
export const SWORD_SIZE_BUFF_MS = 8000;
export const BOT_RESPAWN_MS = 3000;
export const SPRINT_MULTIPLIER = 2; // stacks multiplicatively with the "speed" buff, not additively
export const SPRINT_DRAIN_SECONDS = 1; // full stamina bar drained after this long sprinting
export const STAMINA_RECHARGE_SECONDS = 5; // full stamina bar refilled after this long not sprinting
export const STAMINA_EMPTY_LOCK_MS = 1000; // stays empty this long after hitting 0 before it can recharge
export const STAMINA_FULL_CHARGE_MS = 3000; // full bar needs to stay full this long to become "charged"
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

/** The multiplier a level-based bonus (sword tier, growth) grants at a given level: 1, 1.5, 2, 2.5,
 * 3, 3.5, 4 for levels 1..7. */
export function levelMultiplier(level: number): number {
  return 1 + 0.5 * (level - 1);
}

/** Same idea as levelMultiplier but climbs more gently — used only for the spin bonus, so a
 * maxed-out level 7 doesn't spin fast enough to be a visual headache. */
export function spinLevelMultiplier(level: number): number {
  return 1 + 0.3 * (level - 1);
}

/** Pickups needed to advance FROM this level to the next one — 1 to go from 1→2, 2 from 2→3, etc.
 * Mirrors the sword-count, spin and sword-tier bonuses alike. */
export function pickupsToNextLevel(level: number): number {
  return level;
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
  sprintInput: boolean;
  prevSprintInput: boolean;
  stamina: number;
  staminaEmptyAt: number;
  staminaFullSince: number;
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
}

/** Uniform growth multiplier applied to player radius, sword radius, orbit radius and max HP alike
 * — growth is a leveled bonus like the others (1..LEVEL_MAX), so it shares the same 1, 1.5, 2,
 * 2.5, 3, 3.5, 4 progression. */
export function scaleFor(growthTier: number): number {
  return levelMultiplier(growthTier);
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
 * sword spin carries the real size-vs-speed tradeoff. The "speed" bonus is a flat, non-stacking x2
 * buff; sprinting doubles whatever that current speed is on top of it. */
export function moveSpeedFor(p: ServerPlayer, sprinting: boolean): number {
  const speedMult = p.speedBuffUntil > Date.now() ? SPEED_BUFF_MULTIPLIER : 1;
  const sprintMult = sprinting ? SPRINT_MULTIPLIER : 1;
  const growthSlowdown = Math.pow(MOVE_SLOW_STEP_PER_TWO_LEVELS, Math.floor((p.growthTier - 1) / 2));
  const base = Math.max(20, BASE_MOVE_SPEED + p.devMoveSpeedOffset);
  return (base * speedMult * sprintMult) / growthSlowdown;
}

export function staminaRechargeSecondsFor(p: ServerPlayer): number {
  return Math.max(0.5, STAMINA_RECHARGE_SECONDS + p.devStaminaRechargeOffsetSec);
}

/** Full sprint duration grows with the player: one extra graduation (SPRINT_SECONDS_PER_GRADUATION)
 * per growth level above 1, on top of the level-1 baseline. */
export function sprintDrainSecondsFor(p: ServerPlayer): number {
  return SPRINT_DRAIN_SECONDS + (p.growthTier - 1) * SPRINT_SECONDS_PER_GRADUATION;
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
    stamina: 1,
    staminaEmptyAt: 0,
    staminaFullSince: 0,
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
  p.stamina = 1;
  p.staminaEmptyAt = 0;
  p.staminaFullSince = 0;
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

/** A "spin" bonus pickup: same escalating-cost leveling as sword tier and growth, capped at LEVEL_MAX. */
export function gainSpinLevel(p: ServerPlayer) {
  if (p.spinLevel >= SPIN_LEVEL_MAX) return;
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

/** An "upgrade" bonus pickup: same escalating-cost leveling, and sharpens every current sword to
 * the new, higher max HP the moment the tier actually increases. */
export function gainSwordTier(p: ServerPlayer) {
  if (p.swordTier >= LEVEL_MAX) return;
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
    hp: p.hp,
    maxHp: p.maxHp,
    stamina: p.stamina,
    staminaFullSince: p.staminaFullSince,
    dashCharges: p.dashCharges,
    maxDashCharges: p.maxDashCharges,
    sprintDurationSec: sprintDrainSecondsFor(p),
    growthTier: p.growthTier,
    growthProgress: p.growthProgress,
    scale: scaleFor(p.growthTier),
    radius: radiusFor(p),
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
  };
}
