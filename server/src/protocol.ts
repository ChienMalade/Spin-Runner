// Wire protocol shared between server and client. Kept tiny and duplicated
// (copy of ../../src/net/protocol.ts) rather than pulled into a workspace —
// this is a two-package prototype, not worth the tooling overhead.

export const ARENA_WIDTH = 6000;
export const ARENA_HEIGHT = 6000;

export const SLOW_FACTOR = 0.09; // sword spin slow-down divisor per growth tier
export const MAX_SWORDS = 20; // flat cap regardless of size — reachable at any growth tier
export const LEVEL_MAX = 20; // sword-tier bonus levels 1..20
export const GROWTH_LEVEL_MAX = 20; // growth (size) levels 1..20
export const SPIN_LEVEL_MAX = 20; // spin bonus levels 1..20
// Both bars are graduated in fixed-size notches, and growing adds more notches to each.
export const HP_PER_GROWTH_LEVEL = 50; // one HP-bar notch's worth of max HP granted per growth level
export const SPRINT_SECONDS_PER_GRADUATION = 0.2; // one stamina-bar notch's worth of sprint time

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
  stamina: number;
  staminaFullSince: number;
  sprintDurationSec: number;
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
   * 'swordClash': one of the two participants' ids (see otherId for the other). */
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
