import type { WebSocket } from 'ws';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  type BonusType,
  type DevCommand,
  type EffectState,
  type LeaderboardEntry,
  type ServerMessage,
} from './protocol.js';
import {
  addSword,
  BOT_RESPAWN_MS,
  CHARGE_PAUSE_MS,
  chargeFillSecondsFor,
  createPlayer,
  dashSpeedFor,
  DASH_DISTANCE,
  DEV_MAX_DASH_CHARGES,
  DEV_MOVE_SPEED_STEP,
  DEV_STAMINA_RECHARGE_STEP,
  gainGrowthLevel,
  gainSpinLevel,
  gainSwordTier,
  HP_REGEN_FRACTION_PER_SEC,
  KNOCKBACK_IMPULSE,
  maxHpFor,
  moveSpeedFor,
  radiusFor,
  removeSword,
  repairSwords,
  resetBuild,
  resetForRespawn,
  serialize,
  setGrowthLevel,
  setSpinLevel,
  SHIELD_DURATION_MS,
  SPEED_BUFF_DURATION_MS,
  spinSpeedFor,
  swordDamageToPlayerFor,
  swordDamageToSwordFor,
  swordMaxHpFor,
  SWORD_SIZE_BUFF_MS,
  swordRadiusFor,
  type ServerPlayer,
} from './entities.js';
import { circlesOverlap, clampToArena, dist, swordPosition } from './physics.js';
import { updateBotInput } from './bot.js';

const BOT_NAME_POOL = [
  'Ronflex', 'Piksou', 'Nébula', 'Grondin', 'Zéphyr', 'Cratos', 'Miko', 'Vexar',
  'Orage', 'Tanuki', 'Krill', 'Yoko', 'Baldur', 'Sable', 'Nyx', 'Kobold',
  'Ferrox', 'Lumo', 'Grizu', 'Vipère',
];

export interface BonusEntity {
  id: string;
  type: BonusType;
  x: number;
  y: number;
}

const SWORD_HIT_COOLDOWN_MS = 220;
const PLAYER_HIT_COOLDOWN_MS = 350;
const SPAWN_MARGIN = 200;
const SAFE_SPAWN_RADIUS = 260;
const SAFE_SPAWN_ATTEMPTS = 40;
// The arena always keeps total population (bots + humans) at this floor: bots fill whatever
// humans don't, shrinking out one at a time as real players join and backfilling as they leave.
const BOT_POPULATION_FLOOR = 10;
const MAX_BOT_COUNT = 20;
const DEFAULT_BONUS_DENSITY_LEVEL = 5;
const MAX_BONUS_DENSITY_LEVEL = 10;
// Hard cap on simultaneous players (bots + humans) — keeps a solid safety margin under where the
// current O(n²) collision/broadcast work could start causing real trouble.
export const MAX_TOTAL_PLAYERS = 24;
// swordHitCooldown entries (220-350ms cooldowns) are otherwise never removed — left unchecked this
// map grows forever over a long-running server. Sweep out anything far older than any real cooldown.
const COOLDOWN_SWEEP_INTERVAL_MS = 5000;
const COOLDOWN_MAX_AGE_MS = 5000;
// Player names: letters (any case), digits, spaces and hyphens only.
const NAME_ALLOWED_CHARS = /[^a-zA-Z0-9 -]/g;
const MAX_NAME_LEN = 16;

/** Dev-mode bonus density is a 0..10 dial — 0 spawns none, 10 floods the field. Linear in bonus
 * count, and the spawn interval shortens (down to a floor) as the level climbs. */
function bonusDensityFor(level: number): { maxBonuses: number; intervalMs: number } {
  if (level <= 0) return { maxBonuses: 0, intervalMs: 5000 };
  return { maxBonuses: level * 15, intervalMs: Math.max(150, 1400 - level * 120) };
}

// Every bonus type is kept in equal supply — no more weighting one type over another.
const BONUS_TYPES: BonusType[] = ['sword', 'spin', 'speed', 'upgrade', 'soul', 'heart', 'shield'];
// How many candidate spots a spawn considers before picking the least-crowded one.
const BONUS_PLACEMENT_CANDIDATES = 8;

let nextBonusId = 1;
let nextEffectSpark = 0;

export class GameWorld {
  players = new Map<string, ServerPlayer>();
  bonuses = new Map<string, BonusEntity>();
  bots: ServerPlayer[] = [];
  private tick_ = 0;
  private lastBonusSpawn = 0;
  private swordHitCooldown = new Map<string, number>();
  private lastCooldownSweep = 0;
  private bonusDensityLevel = DEFAULT_BONUS_DENSITY_LEVEL;
  private maxBonuses = bonusDensityFor(DEFAULT_BONUS_DENSITY_LEVEL).maxBonuses;
  private bonusSpawnIntervalMs = bonusDensityFor(DEFAULT_BONUS_DENSITY_LEVEL).intervalMs;
  private nextBotSerial = 1;
  /** Previous tick's full ranking order, used only to break ties stably (a tied player keeps
   * whichever rank they already held instead of swapping every tick). */
  private leaderboardOrder: string[] = [];
  private top1Id: string | null = null;
  private top1Since = 0;

  constructor() {
    this.rebalanceBots();
  }

  private addBot() {
    if (this.bots.length >= MAX_BOT_COUNT) return;
    const name = BOT_NAME_POOL[(this.nextBotSerial - 1) % BOT_NAME_POOL.length];
    this.nextBotSerial++;
    const bot = createPlayer(name, true, ...this.randomSafeSpawn());
    this.bots.push(bot);
    this.players.set(bot.id, bot);
  }

  private removeBot() {
    const bot = this.bots.pop();
    if (bot) this.players.delete(bot.id);
  }

  /** Tops bots up or trims them so bots + humans sits at BOT_POPULATION_FLOOR — a human joining
   * evicts a bot to make room, a human leaving lets a bot back in. No-op once humans alone reach
   * the floor (bots bottom out at 0; humans keep joining past it up to MAX_TOTAL_PLAYERS). */
  private rebalanceBots() {
    const humanCount = this.players.size - this.bots.length;
    const desiredBots = Math.max(0, Math.min(MAX_BOT_COUNT, BOT_POPULATION_FLOOR - humanCount));
    while (this.bots.length > desiredBots) this.removeBot();
    while (this.bots.length < desiredBots) this.addBot();
  }

  private setBonusDensityLevel(level: number) {
    this.bonusDensityLevel = Math.max(0, Math.min(MAX_BONUS_DENSITY_LEVEL, level));
    const preset = bonusDensityFor(this.bonusDensityLevel);
    this.maxBonuses = preset.maxBonuses;
    this.bonusSpawnIntervalMs = preset.intervalMs;
  }

  /** Dev-mode manual tuning: lets one player nudge their own build stats or the world's bot count
   * and bonus density directly, for quickly testing balance without playing a full match. */
  handleDevCommand(playerId: string, command: DevCommand) {
    const p = this.players.get(playerId);
    switch (command.kind) {
      case 'swordCount':
        if (!p) return;
        if (command.delta > 0) addSword(p);
        else if (command.delta < 0) removeSword(p);
        return;
      case 'growthLevel':
        if (!p) return;
        setGrowthLevel(p, p.growthTier + command.delta);
        return;
      case 'spinLevel':
        if (!p) return;
        setSpinLevel(p, p.spinLevel + command.delta);
        return;
      case 'dashCharges':
        if (!p) return;
        p.maxDashCharges = Math.max(1, Math.min(DEV_MAX_DASH_CHARGES, p.maxDashCharges + command.delta));
        if (command.delta > 0) p.dashCharges = Math.min(p.maxDashCharges, p.dashCharges + command.delta);
        p.dashCharges = Math.min(p.dashCharges, p.maxDashCharges);
        return;
      case 'moveSpeedOffset':
        if (!p) return;
        p.devMoveSpeedOffset += command.delta * DEV_MOVE_SPEED_STEP;
        return;
      case 'staminaRecharge':
        if (!p) return;
        p.devStaminaRechargeOffsetSec += command.delta * DEV_STAMINA_RECHARGE_STEP;
        return;
      case 'botCount':
        if (command.delta > 0) this.addBot();
        else if (command.delta < 0) this.removeBot();
        return;
      case 'bonusDensity':
        this.setBonusDensityLevel(this.bonusDensityLevel + command.delta);
        return;
      case 'reset':
        if (p) resetBuild(p);
        this.rebalanceBots();
        this.setBonusDensityLevel(DEFAULT_BONUS_DENSITY_LEVEL);
        return;
    }
  }

  private randomSpawn(): [number, number] {
    return [
      SPAWN_MARGIN + Math.random() * (ARENA_WIDTH - SPAWN_MARGIN * 2),
      SPAWN_MARGIN + Math.random() * (ARENA_HEIGHT - SPAWN_MARGIN * 2),
    ];
  }

  /** Same as randomSpawn, but rejects points too close to any currently-alive player. */
  private randomSafeSpawn(): [number, number] {
    for (let i = 0; i < SAFE_SPAWN_ATTEMPTS; i++) {
      const [x, y] = this.randomSpawn();
      const tooClose = [...this.players.values()].some(
        (p) => p.alive && Math.hypot(p.x - x, p.y - y) < SAFE_SPAWN_RADIUS
      );
      if (!tooClose) return [x, y];
    }
    return this.randomSpawn();
  }

  /** Every bonus type is kept at an equal target share of the current cap — whichever type is
   * furthest under its share spawns next (ties broken at random so it's not perfectly predictable). */
  private pickBonusType(): BonusType {
    const target = this.maxBonuses / BONUS_TYPES.length;
    const counts = new Map<BonusType, number>(BONUS_TYPES.map((t) => [t, 0]));
    for (const b of this.bonuses.values()) counts.set(b.type, (counts.get(b.type) ?? 0) + 1);

    let best: BonusType[] = [];
    let bestDeficit = -Infinity;
    for (const t of BONUS_TYPES) {
      const deficit = target - (counts.get(t) ?? 0);
      if (deficit > bestDeficit) {
        bestDeficit = deficit;
        best = [t];
      } else if (deficit === bestDeficit) {
        best.push(t);
      }
    }
    return best[Math.floor(Math.random() * best.length)];
  }

  /** Tries a handful of random spots and keeps whichever is farthest from any existing bonus —
   * weighted even more heavily against bonuses of the same type — so spawns spread out instead of
   * clustering, and a type doesn't pile up in one corner of the map. */
  private pickBonusPosition(type: BonusType): [number, number] {
    let best: [number, number] = this.randomSpawn();
    let bestScore = -Infinity;
    for (let i = 0; i < BONUS_PLACEMENT_CANDIDATES; i++) {
      const [x, y] = this.randomSpawn();
      let nearestAny = Infinity;
      let nearestSame = Infinity;
      for (const b of this.bonuses.values()) {
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < nearestAny) nearestAny = d;
        if (b.type === type && d < nearestSame) nearestSame = d;
      }
      const score = Math.min(nearestAny, 4000) + Math.min(nearestSame, 4000) * 1.5;
      if (score > bestScore) {
        bestScore = score;
        best = [x, y];
      }
    }
    return best;
  }

  /** Returns null if the arena is already at MAX_TOTAL_PLAYERS — never trust the client to have
   * enforced the name character whitelist either, so it's re-applied here regardless. */
  addHumanPlayer(ws: WebSocket, name: string, hue?: number): ServerPlayer | null {
    if (this.players.size >= MAX_TOTAL_PLAYERS) return null;
    const cleaned = (name ?? '').replace(NAME_ALLOWED_CHARS, '').trim().slice(0, MAX_NAME_LEN);
    const p = createPlayer(cleaned || 'Joueur', false, ...this.randomSafeSpawn());
    if (hue != null && Number.isFinite(hue)) p.hue = ((hue % 360) + 360) % 360;
    p.ws = ws;
    this.players.set(p.id, p);
    this.rebalanceBots();
    return p;
  }

  removePlayer(id: string) {
    if (this.bots.some((b) => b.id === id)) return;
    this.players.delete(id);
    this.rebalanceBots();
  }

  setInput(id: string, dx: number, dy: number, sprint: boolean) {
    const p = this.players.get(id);
    if (!p || !p.alive) return;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    p.inputDx = dx;
    p.inputDy = dy;
    p.sprintInput = sprint;
  }

  retry(id: string) {
    const p = this.players.get(id);
    if (!p || p.alive) return;
    resetForRespawn(p, ...this.randomSafeSpawn());
  }

  /** Advances the simulation by dtSec and returns the broadcast state message plus ids that just died. */
  tick(dtSec: number): { message: ServerMessage; deaths: string[] } {
    this.tick_++;
    const now = Date.now();
    const deaths: string[] = [];
    const effects: EffectState[] = [];
    const players = [...this.players.values()];

    for (const bot of this.bots) {
      if (!bot.alive && now - bot.deadSince > BOT_RESPAWN_MS) {
        resetForRespawn(bot, ...this.randomSafeSpawn());
      }
    }
    for (const bot of this.bots) {
      updateBotInput(bot, players, [...this.bonuses.values()]);
    }

    for (const p of players) {
      if (!p.alive) continue;

      // Knockback (vx/vy) decays each tick; input drives movement directly on top of it.
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.vx *= 0.86;
      p.vy *= 0.86;

      // A ready dash charge is a persisted count (0..maxDashCharges). A press fires one instantly if
      // any are ready — no sprint/hold mechanic, holding the button does nothing extra.
      if (p.sprintInput && !p.prevSprintInput && p.dashCharges > 0) {
        const dirLen = Math.hypot(p.inputDx, p.inputDy);
        const dashAngle = dirLen > 0.01 ? Math.atan2(p.inputDy, p.inputDx) : p.facing;
        p.dashAngle = dashAngle;
        p.dashRemaining = DASH_DISTANCE;
        p.dashCharges--;
        effects.push({ type: 'dash', x: p.x, y: p.y, actorId: p.id, angle: dashAngle });
      }
      p.prevSprintInput = p.sprintInput;

      if (p.dashRemaining > 0) {
        // A charged dash locks in its direction and always covers exactly DASH_DISTANCE, ignoring
        // the current input direction — a committed burst, not steerable mid-flight.
        const step = Math.min(p.dashRemaining, dashSpeedFor(p) * dtSec);
        p.x += Math.cos(p.dashAngle) * step;
        p.y += Math.sin(p.dashAngle) * step;
        p.dashRemaining -= step;
      } else {
        const speed = moveSpeedFor(p);
        p.x += p.inputDx * speed * dtSec;
        p.y += p.inputDy * speed * dtSec;
        if (p.inputDx !== 0 || p.inputDy !== 0) {
          p.facing = Math.atan2(p.inputDy, p.inputDx);
        }
      }

      // Charges just fill up on their own, one graduation at a time: it takes chargeFillSecondsFor
      // to fill, becomes a real charge THE INSTANT it's full (no extra hold-at-full delay), then
      // there's a brief pause before the next graduation starts.
      if (p.dashCharges < p.maxDashCharges && now >= p.nextChargeFillAt) {
        p.chargeFill = Math.min(1, p.chargeFill + dtSec / chargeFillSecondsFor(p));
        if (p.chargeFill >= 1) {
          p.dashCharges++;
          p.chargeFill = 0;
          p.nextChargeFillAt = now + CHARGE_PAUSE_MS;
        }
      }

      // Slow passive regen — a trickle, not a replacement for the heart bonus.
      if (p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * HP_REGEN_FRACTION_PER_SEC * dtSec);
      }

      const r = radiusFor(p);
      const clamped = clampToArena(p.x, p.y, r, ARENA_WIDTH, ARENA_HEIGHT);
      p.x = clamped.x;
      p.y = clamped.y;

      p.swordOrbitAngle += spinSpeedFor(p) * dtSec;
    }

    this.resolvePlayerCollisions(players);
    this.resolveSwordCollisions(players, effects, now);
    this.resolveSwordVsPlayer(players, effects, now, deaths);
    this.spawnBonuses(now);
    this.resolvePickups(players, effects);
    this.sweepStaleCooldowns(now);
    const { entries: leaderboard, top1Since } = this.computeLeaderboard(players, now);

    const message: ServerMessage = {
      t: 'state',
      tick: this.tick_,
      players: players.map(serialize),
      bonuses: [...this.bonuses.values()].map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y })),
      effects,
      bonusDensityLevel: this.bonusDensityLevel,
      leaderboard,
      top1Since,
    };
    return { message, deaths };
  }

  /** Player bodies can't overlap — push them apart, heavier (bigger) players yielding less. */
  private resolvePlayerCollisions(players: ServerPlayer[]) {
    for (let i = 0; i < players.length; i++) {
      const a = players[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < players.length; j++) {
        const b = players[j];
        if (!b.alive) continue;
        const ra = radiusFor(a);
        const rb = radiusFor(b);
        const minDist = ra + rb;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= minDist) continue;
        const overlap = minDist - (d || 0.001);
        const nx = dx / (d || 1);
        const ny = dy / (d || 1);
        const massA = ra * ra;
        const massB = rb * rb;
        const totalMass = massA + massB;
        a.x -= nx * overlap * (massB / totalMass);
        a.y -= ny * overlap * (massB / totalMass);
        b.x += nx * overlap * (massA / totalMass);
        b.y += ny * overlap * (massA / totalMass);
      }
    }
    for (const p of players) {
      if (!p.alive) continue;
      const clamped = clampToArena(p.x, p.y, radiusFor(p), ARENA_WIDTH, ARENA_HEIGHT);
      p.x = clamped.x;
      p.y = clamped.y;
    }
  }

  private resolveSwordCollisions(players: ServerPlayer[], effects: EffectState[], now: number) {
    for (let i = 0; i < players.length; i++) {
      const a = players[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < players.length; j++) {
        const b = players[j];
        if (!b.alive) continue;
        for (const sa of a.swords) {
          const pa = swordPosition(a, sa);
          const ra = swordRadiusFor(a);
          for (const sb of b.swords) {
            const pb = swordPosition(b, sb);
            const rb = swordRadiusFor(b);
            if (!circlesOverlap(pa.x, pa.y, ra, pb.x, pb.y, rb)) continue;
            const key = `${sa.id}-${sb.id}`;
            const last = this.swordHitCooldown.get(key) ?? 0;
            if (now - last < SWORD_HIT_COOLDOWN_MS) continue;
            this.swordHitCooldown.set(key, now);

            // A shield protects its owner's swords too, not just their body.
            if (a.shieldUntil <= now) sa.hp -= swordDamageToSwordFor(b);
            if (b.shieldUntil <= now) sb.hp -= swordDamageToSwordFor(a);
            const nx = pa.x - pb.x || 1;
            const ny = pa.y - pb.y || 1;
            const nlen = Math.hypot(nx, ny) || 1;
            a.vx += (nx / nlen) * KNOCKBACK_IMPULSE;
            a.vy += (ny / nlen) * KNOCKBACK_IMPULSE;
            b.vx -= (nx / nlen) * KNOCKBACK_IMPULSE;
            b.vy -= (ny / nlen) * KNOCKBACK_IMPULSE;
            effects.push({ type: 'swordClash', x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2, actorId: a.id, otherId: b.id });
          }
        }
      }
      a.swords = a.swords.filter((s) => {
        if (s.hp > 0) return true;
        effects.push({ type: 'swordBreak', x: a.x, y: a.y });
        return false;
      });
    }
  }

  /** A sword left sitting inside a player still ticks its normal per-second damage (the existing
   * PLAYER_HIT_COOLDOWN_MS cooldown, unchanged). On top of that: whenever the sword touching a
   * player CHANGES — a different sword takes over, or one starts touching after none were — that
   * transition always lands a guaranteed hit immediately, bypassing its own cooldown. So a faster
   * spin (more swords cycling past a target per second) directly translates into more damage. */
  private resolveSwordVsPlayer(
    players: ServerPlayer[],
    effects: EffectState[],
    now: number,
    deaths: string[]
  ) {
    const touchedThisTick = new Set<string>();
    for (const attacker of players) {
      if (!attacker.alive) continue;
      for (const sword of attacker.swords) {
        const sp = swordPosition(attacker, sword);
        const sr = swordRadiusFor(attacker);
        for (const target of players) {
          if (target === attacker || !target.alive) continue;
          if (target.shieldUntil > now) continue;
          const tr = radiusFor(target);
          if (!circlesOverlap(sp.x, sp.y, sr, target.x, target.y, tr)) continue;

          touchedThisTick.add(target.id);
          const key = `hit-${sword.id}-${target.id}`;

          if (target.lastTouchingSwordId !== sword.id) {
            // A new sword just took over — guaranteed hit, and it resets this sword's own cooldown
            // so the very next tick doesn't immediately double-dip on top of it.
            target.lastTouchingSwordId = sword.id;
            this.swordHitCooldown.set(key, now);
            this.dealSwordDamage(attacker, target, effects, now, deaths);
            continue;
          }

          const last = this.swordHitCooldown.get(key) ?? 0;
          if (now - last < PLAYER_HIT_COOLDOWN_MS) continue;
          this.swordHitCooldown.set(key, now);
          this.dealSwordDamage(attacker, target, effects, now, deaths);
        }
      }
    }
    for (const p of players) {
      if (!touchedThisTick.has(p.id)) p.lastTouchingSwordId = 0;
    }
  }

  private dealSwordDamage(
    attacker: ServerPlayer,
    target: ServerPlayer,
    effects: EffectState[],
    now: number,
    deaths: string[]
  ) {
    target.hp -= swordDamageToPlayerFor(attacker);
    effects.push({ type: 'playerHit', x: target.x, y: target.y, targetId: target.id, actorId: attacker.id });

    if (target.hp <= 0 && target.alive) {
      target.alive = false;
      target.hp = 0;
      target.deadSince = now;
      deaths.push(target.id);
      effects.push({ type: 'kill', x: target.x, y: target.y, actorId: attacker.id });
      this.absorbFromVictim(attacker, target);
    }
  }

  /** Top 3 by growth tier. Ties are broken by the previous ranking order so a tied player doesn't
   * flicker in and out of the top spot every tick against someone who just caught up. */
  private computeLeaderboard(players: ServerPlayer[], now: number): { entries: LeaderboardEntry[]; top1Since: number } {
    const alive = players.filter((p) => p.alive);
    const prevIndex = new Map(this.leaderboardOrder.map((id, i) => [id, i]));
    const sorted = [...alive].sort((a, b) => {
      if (b.growthTier !== a.growthTier) return b.growthTier - a.growthTier;
      return (prevIndex.get(a.id) ?? Infinity) - (prevIndex.get(b.id) ?? Infinity);
    });
    this.leaderboardOrder = sorted.map((p) => p.id);

    const top3 = sorted.slice(0, 3);
    const newTop1 = top3[0]?.id ?? null;
    if (newTop1 !== this.top1Id) {
      this.top1Id = newTop1;
      this.top1Since = newTop1 ? now : 0;
    }

    return {
      entries: top3.map((p) => ({ id: p.id, name: p.name, hue: p.hue, isBot: p.isBot, growthTier: p.growthTier })),
      top1Since: this.top1Since,
    };
  }

  /** No soul drop on a kill — the killer instead directly absorbs whichever of the victim's build
   * stats (size, sword count, spin tier, sword tier) were better than their own. */
  private absorbFromVictim(attacker: ServerPlayer, victim: ServerPlayer) {
    if (victim.growthTier > attacker.growthTier) {
      const oldMax = attacker.maxHp;
      attacker.growthTier = victim.growthTier;
      attacker.growthProgress = 0;
      attacker.maxHp = maxHpFor(attacker);
      attacker.hp += attacker.maxHp - oldMax;
    }
    // Every kill also grants growth progress proportional to the victim's own accumulated size —
    // even a smaller victim pays off, not just punching up. Stacks on top of the tier inherit above.
    for (let i = 0; i < victim.growthTier; i++) gainGrowthLevel(attacker);
    while (attacker.swords.length < victim.swords.length) {
      if (!addSword(attacker)) break;
    }
    if (victim.spinLevel > attacker.spinLevel) {
      attacker.spinLevel = victim.spinLevel;
      attacker.spinProgress = 0;
    }
    if (victim.swordTier > attacker.swordTier) {
      attacker.swordTier = victim.swordTier;
      attacker.swordTierProgress = 0;
      const maxHp = swordMaxHpFor(attacker);
      for (const s of attacker.swords) {
        s.maxHp = maxHp;
        s.hp = maxHp;
      }
    }
  }

  /** swordHitCooldown keys are never removed when their sword/player goes away — sword ids only
   * ever increase, so without this the map grows forever on a long-running server. Every real
   * cooldown here is well under a second, so anything older than COOLDOWN_MAX_AGE_MS is dead weight. */
  private sweepStaleCooldowns(now: number) {
    if (now - this.lastCooldownSweep < COOLDOWN_SWEEP_INTERVAL_MS) return;
    this.lastCooldownSweep = now;
    for (const [key, ts] of this.swordHitCooldown) {
      if (now - ts > COOLDOWN_MAX_AGE_MS) this.swordHitCooldown.delete(key);
    }
  }

  /** Tops the field up toward the density cap — used for the initial fill and after a density
   * change. Steady-state replacement (a picked-up bonus respawning) happens immediately in
   * resolvePickups instead of waiting on this timer. */
  private spawnBonuses(now: number) {
    if (now - this.lastBonusSpawn < this.bonusSpawnIntervalMs) return;
    if (this.bonuses.size >= this.maxBonuses) return;
    this.lastBonusSpawn = now;
    const type = this.pickBonusType();
    this.spawnBonus(type);
  }

  private spawnBonus(type: BonusType) {
    const id = `b-${nextBonusId++}`;
    const [x, y] = this.pickBonusPosition(type);
    this.bonuses.set(id, { id, type, x, y });
  }

  private resolvePickups(players: ServerPlayer[], effects: EffectState[]) {
    // Snapshotted once per tick rather than re-spread from the Map for every player — a bonus
    // claimed by an earlier player this same tick is skipped via the `has` check below instead.
    const candidates = [...this.bonuses.values()];
    for (const p of players) {
      if (!p.alive) continue;
      const r = radiusFor(p);
      for (const bonus of candidates) {
        if (!this.bonuses.has(bonus.id)) continue;
        if (!circlesOverlap(p.x, p.y, r, bonus.x, bonus.y, 20)) continue;
        this.applyBonus(p, bonus);
        this.bonuses.delete(bonus.id);
        effects.push({ type: 'bonusPickup', x: bonus.x, y: bonus.y, bonusType: bonus.type, actorId: p.id });
        // A bonus that disappears into a pickup is replaced right away by one of the same type, so
        // the mix of types on the field stays even instead of drifting as players clear one kind out.
        if (this.bonuses.size < this.maxBonuses) this.spawnBonus(bonus.type);
      }
    }
  }

  private applyBonus(p: ServerPlayer, bonus: BonusEntity) {
    switch (bonus.type) {
      case 'sword':
        addSword(p);
        break;
      case 'spin':
        gainSpinLevel(p);
        p.swordSizeBuffUntil = Date.now() + SWORD_SIZE_BUFF_MS;
        break;
      case 'speed':
        p.speedBuffUntil = Date.now() + SPEED_BUFF_DURATION_MS;
        // Fills one graduation instantly (on top of the speed boost) — the 3-slot cap is fixed,
        // this bonus never raises it.
        p.dashCharges = Math.min(p.maxDashCharges, p.dashCharges + 1);
        break;
      case 'upgrade':
        gainSwordTier(p);
        break;
      case 'soul':
        gainGrowthLevel(p);
        break;
      case 'heart':
        p.hp = p.maxHp;
        repairSwords(p);
        break;
      case 'shield':
        p.shieldUntil = Date.now() + SHIELD_DURATION_MS;
        break;
    }
  }
}
