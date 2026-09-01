// Wire protocol shared between server and client. Kept tiny and duplicated
// (copy of ../../src/net/protocol.ts) rather than pulled into a workspace —
// this is a two-package prototype, not worth the tooling overhead.

export const ARENA_WIDTH = 6000;
export const ARENA_HEIGHT = 6000;

export const SLOW_FACTOR = 0.09; // sword spin slow-down divisor per growth tier
export const MAX_SWORDS = 15; // flat cap regardless of size — reachable at any growth tier
export const LEVEL_MAX = 15; // sword-tier bonus levels 1..15 — further pickups convert to gold
export const GROWTH_LEVEL_MAX = 20; // growth (size) levels 1..20
export const SPIN_LEVEL_MAX = 15; // spin bonus levels 1..15 — further pickups convert to gold
// The HP bar is graduated in fixed-size notches, and growing adds more notches to it.
export const HP_PER_GROWTH_LEVEL = 50; // one HP-bar notch's worth of max HP granted per growth level

export type BonusType = 'sword' | 'spin' | 'soul' | 'heart' | 'shield' | 'speed' | 'upgrade';
export type EffectType = 'swordClash' | 'playerHit' | 'swordBreak' | 'bonusPickup' | 'kill' | 'dash';

export type DevCommand =
  | { kind: 'swordCount'; delta: number }
  | { kind: 'growthLevel'; delta: number }
  | { kind: 'spinLevel'; delta: number }
  | { kind: 'dashCharges'; delta: number }
  | { kind: 'moveSpeedOffset'; delta: number }
  | { kind: 'staminaRecharge'; delta: number }
  | { kind: 'botCount'; delta: number }
  | { kind: 'bonusDensity'; delta: number }
  | { kind: 'reset' };

export interface SwordState {
  id: number;
  angleOffset: number;
  hp: number;
  maxHp: number;
}

export interface PlayerState {
  id: string;
  name: string;
  isBot: boolean;
  x: number;
  y: number;
  facing: number;
  hp: number;
  maxHp: number;
  /** Fill (0..1) of the next dash-charge graduation. */
  stamina: number;
  dashCharges: number;
  maxDashCharges: number;
  growthTier: number;
  growthProgress: number;
  scale: number;
  radius: number;
  swordOrbitRadius: number;
  swordOrbitAngle: number;
  swordSpin: number;
  spinLevel: number;
  spinProgress: number;
  swordTier: number;
  swordTierProgress: number;
  swords: SwordState[];
  alive: boolean;
  shieldUntil: number;
  speedBuffUntil: number;
  hue: number;
  devMoveSpeedOffset: number;
  devStaminaRechargeOffsetSec: number;
  /** Sword-tier and spin bonuses picked up after maxing out (LEVEL_MAX / SPIN_LEVEL_MAX) convert
   * into gold instead of doing nothing — no in-game use for it yet. */
  gold: number;
}

export interface BonusState {
  id: string;
  type: BonusType;
  x: number;
  y: number;
}

export interface EffectState {
  type: EffectType;
  x: number;
  y: number;
  /** 'bonusPickup' only: which bonus was picked up, so the client can color the pickup burst. */
  bonusType?: BonusType;
  /** 'kill': the killer's id — the finishing-blow animation/sound only plays for them.
   * 'playerHit': the attacker's id — whose sword rotation briefly freezes on impact.
   * 'swordClash': one of the two participants' ids (see otherId for the other).
   * 'bonusPickup': who picked it up — lets a follow-the-player effect (like the heart pulse) track
   * them instead of staying pinned to the spot the bonus was picked up at. */
  actorId?: string;
  /** 'swordClash' only: the second participant's id (actorId is the first). */
  otherId?: string;
  /** 'playerHit' only: who got hit — lets the client flash its own screen only when it's the local player. */
  targetId?: string;
  /** 'dash' only: which direction the dash burst should visually point. */
  angle?: number;
}

export interface ArenaInfo {
  width: number;
  height: number;
}

/** The in-game top-3-by-size leaderboard. Tied players keep whichever rank they already held (see
 * GameWorld's stable sort) rather than swapping every tick on an exact tie. */
export interface LeaderboardEntry {
  id: string;
  name: string;
  hue: number;
  isBot: boolean;
  growthTier: number;
}

export type ClientMessage =
  | { t: 'join'; name?: string; hue?: number; arenaCode?: string }
  | { t: 'input'; dx: number; dy: number; sprint: boolean }
  | { t: 'retry' }
  | { t: 'dev'; command: DevCommand };

export type ServerMessage =
  | { t: 'welcome'; playerId: string; arena: ArenaInfo; arenaCode: string }
  | {
      t: 'state';
      tick: number;
      players: PlayerState[];
      bonuses: BonusState[];
      effects: EffectState[];
      bonusDensityLevel: number;
      leaderboard: LeaderboardEntry[];
      top1Since: number;
    }
  | { t: 'dead' }
  | { t: 'full'; reason: 'server_full' | 'arena_full' | 'arena_not_found' };
