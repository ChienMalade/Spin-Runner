import { radiusFor, type ServerPlayer } from './entities.js';
import type { BonusEntity } from './gameLoop.js';
import { ARENA_HEIGHT, ARENA_WIDTH } from './protocol.js';

const SENSE_RADIUS = 900;
const FLEE_RADIUS = 340;
/** An enemy must be at least this much bigger to be treated as a threat (avoids flee/chase jitter
 * between near-equal-sized bots). */
const SIZE_THREAT_MARGIN = 1.12;
// Bots steer away from whichever corner they're nearest to once within this distance of both walls
// that meet there, so they don't camp/wander into a dead end where they're easy to pin down.
const CORNER_MARGIN = 750;
const CORNER_AVOID_WEIGHT = 1.6;
// Straight walls get their own, gentler push — the corner rule above only fires when a bot is close
// to two walls at once, so without this they happily hug the middle of an edge.
const EDGE_MARGIN = 420;
const EDGE_AVOID_WEIGHT = 1.1;
// A chasing bot starts curving around its target instead of beelining straight at it once within
// this many multiples of its own body radius. Deliberately INSIDE sword reach (orbit radius 48 +
// sword 8 + target body 22 ≈ 3.5 radii): circle any wider and two bots just waltz around each other
// forever, out of range, without the fight ever resolving.
const ENGAGE_RANGE_RADIUS_MULT = 3.2;
// At point-blank range, how much of the approach is still radial (closing distance) vs. tangential
// (circling) — kept high so a bot reads as charging its target, with just enough sideways drift to
// avoid the dead-on collision jam.
const MIN_RADIAL_WEIGHT = 0.55;
// How long a bot circles one way before switching — two bots that happened to pick the same
// direction would otherwise stay locked in a mutual orbit indefinitely.
const STRAFE_FLIP_MS = 2500;

// Anti-loitering: a bot that hasn't left a STUCK_RADIUS circle within STUCK_WINDOW_MS is made to
// break out and run somewhere else for a while, whatever it thought it was doing. Circling a target,
// jammed against a wall, tugging at a bonus it can't reach — none of it may hold a bot in one spot.
// Detection fires well under the 3s budget on purpose: the bot still needs to physically clear the
// circle after being told to leave, and that escape time counts toward the 3s too.
const STUCK_WINDOW_MS = 1000;
const STUCK_RADIUS = 150;
/** How far the escape must carry the bot before it may go back to hunting. Deliberately much larger
 * than STUCK_RADIUS: stopping as soon as it cleared the detection circle just let it drift straight
 * back, so the same patch of ground still held it for many seconds. */
const ESCAPE_CLEAR_RADIUS = 380;
/** While escaping, progress is checked this often; a bot that has barely moved is being blocked by
 * someone's body, so it turns and tries another way rather than shoving uselessly. */
const BREAKOUT_RECHECK_MS = 350;
const BREAKOUT_MIN_PROGRESS = 35;
/** Roughly 137° — successive re-rolls fan out instead of flip-flopping between two headings. */
const BREAKOUT_TURN = 2.4;
/** The escape heads roughly inward (never into the wall it may be pinned against), with enough
 * random spread that two stuck bots don't break out along the same line. */
const BREAKOUT_SPREAD = Math.PI / 2;

const wanderState = new WeakMap<ServerPlayer, { angle: number; until: number }>();
interface LoiterState {
  anchorX: number;
  anchorY: number;
  since: number;
  escaping: boolean;
  angle: number;
  checkAt: number;
  checkX: number;
  checkY: number;
}
const loiterState = new WeakMap<ServerPlayer, LoiterState>();

/** Returns a direction to force-move in when the bot has loitered too long, or null.
 *
 * The escape runs until the bot has actually cleared the circle, not for a fixed duration: a timed
 * escape kept expiring while the bot was still wedged against someone, and it would just settle back
 * into the same spot. */
function breakoutDirection(bot: ServerPlayer, now: number): { dx: number; dy: number } | null {
  let state = loiterState.get(bot);
  if (!state) {
    state = { anchorX: bot.x, anchorY: bot.y, since: now, escaping: false, angle: 0, checkAt: 0, checkX: 0, checkY: 0 };
    loiterState.set(bot, state);
  }

  const fromAnchor = Math.hypot(bot.x - state.anchorX, bot.y - state.anchorY);

  if (state.escaping) {
    if (fromAnchor > ESCAPE_CLEAR_RADIUS) {
      state.escaping = false;
      state.anchorX = bot.x;
      state.anchorY = bot.y;
      state.since = now;
      return null;
    }
    if (now >= state.checkAt) {
      // Barely moved since the last check: something is in the way, so try a different heading.
      if (Math.hypot(bot.x - state.checkX, bot.y - state.checkY) < BREAKOUT_MIN_PROGRESS) {
        state.angle += BREAKOUT_TURN;
      }
      state.checkAt = now + BREAKOUT_RECHECK_MS;
      state.checkX = bot.x;
      state.checkY = bot.y;
    }
    return { dx: Math.cos(state.angle), dy: Math.sin(state.angle) };
  }

  if (fromAnchor > STUCK_RADIUS) {
    // Made real ground: start measuring again from here.
    state.anchorX = bot.x;
    state.anchorY = bot.y;
    state.since = now;
    return null;
  }

  if (now - state.since < STUCK_WINDOW_MS) return null;

  const towardCentre = Math.atan2(ARENA_HEIGHT / 2 - bot.y, ARENA_WIDTH / 2 - bot.x);
  state.escaping = true;
  state.angle = towardCentre + (Math.random() - 0.5) * 2 * BREAKOUT_SPREAD;
  state.checkAt = now + BREAKOUT_RECHECK_MS;
  state.checkX = bot.x;
  state.checkY = bot.y;
  return { dx: Math.cos(state.angle), dy: Math.sin(state.angle) };
}

/** Which way a bot curves around its target. Derived from its own id (so bots don't all move in
 * unison) and a slowly-advancing time bucket offset per bot (so a pair that started out circling the
 * same way breaks out of that lockstep within a couple of seconds instead of dancing forever). */
function strafeSign(bot: ServerPlayer, now: number): number {
  const n = Number(bot.id.replace(/\D/g, '')) || 0;
  const bucket = Math.floor((now + n * 617) / STRAFE_FLIP_MS);
  return (n + bucket) % 2 === 0 ? 1 : -1;
}

/** A bot always heads for the nearest thing worth having: a bonus, or a player it can take on.
 * A player is fair game when they carry neither sword nor shield (harmless, so size doesn't matter),
 * when the bot's own shield is up (nothing can hurt it, so size doesn't matter either), or simply
 * when they aren't meaningfully bigger. Anyone else is a threat to back away from, and a shielded
 * enemy is pointless to chase — hits don't land — so it counts as one too.
 * Whatever direction that settles on is then nudged away from the nearest corner if close to one. */
export function updateBotInput(bot: ServerPlayer, players: ServerPlayer[], bonuses: BonusEntity[]) {
  if (!bot.alive) {
    bot.inputDx = 0;
    bot.inputDy = 0;
    loiterState.delete(bot);
    return;
  }
  const now = Date.now();
  const selfRadius = radiusFor(bot);
  const selfShielded = bot.shieldUntil > now;

  // Overrides everything else: no bot is allowed to sit in one spot, whatever it's busy with.
  const breakout = breakoutDirection(bot, now);
  if (breakout) {
    steer(bot, breakout.dx, breakout.dy);
    return;
  }

  let nearestThreat: ServerPlayer | null = null;
  let nearestThreatDist = Infinity;
  let nearestPrey: { x: number; y: number } | null = null;
  let nearestPreyDist = Infinity;
  /** Chasing a player (fight) rather than a bonus (walk onto it) — they steer differently. */
  let preyIsPlayer = false;

  for (const p of players) {
    if (p === bot || !p.alive) continue;
    const d = Math.hypot(p.x - bot.x, p.y - bot.y);
    const enemyShielded = p.shieldUntil > now;
    const defenseless = p.swords.length === 0 && !enemyShielded;
    const attackable = defenseless || (!enemyShielded && (selfShielded || radiusFor(p) <= selfRadius * SIZE_THREAT_MARGIN));
    if (!attackable) {
      if (d < FLEE_RADIUS && d < nearestThreatDist) {
        nearestThreatDist = d;
        nearestThreat = p;
      }
      continue;
    }
    if (d < SENSE_RADIUS && d < nearestPreyDist) {
      nearestPreyDist = d;
      nearestPrey = p;
      preyIsPlayer = true;
    }
  }

  for (const b of bonuses) {
    const d = Math.hypot(b.x - bot.x, b.y - bot.y);
    if (d < SENSE_RADIUS && d < nearestPreyDist) {
      nearestPreyDist = d;
      nearestPrey = b;
      preyIsPlayer = false;
    }
  }

  let dx: number;
  let dy: number;
  let chasingPlayer = false;
  if (nearestThreat) {
    // Fleeing stays a clean, direct retreat — no circling, the point is to get out of reach.
    dx = bot.x - nearestThreat.x;
    dy = bot.y - nearestThreat.y;
  } else if (nearestPrey) {
    dx = nearestPrey.x - bot.x;
    dy = nearestPrey.y - bot.y;
    chasingPlayer = preyIsPlayer;
  } else {
    let w = wanderState.get(bot);
    if (!w || now > w.until) {
      w = { angle: Math.random() * Math.PI * 2, until: now + 1500 + Math.random() * 1500 };
      wanderState.set(bot, w);
    }
    dx = Math.cos(w.angle);
    dy = Math.sin(w.angle);
  }

  // Approaching a target head-on is what made bots pile into each other and sit there vibrating:
  // each tick's step toward the target gets undone by body-collision resolution pushing them back
  // out, so nothing ever resolves. Instead, the closer a chasing bot gets, the more its approach
  // turns tangential — it circles its target at fighting range (still pressing in, so its swords
  // keep connecting) rather than trying to occupy the same spot.
  //
  // Only ever for a PLAYER target: a bonus has to be walked onto to be picked up, and circling one
  // meant bots orbited bonuses forever instead of collecting them.
  if (chasingPlayer) {
    const dist = Math.hypot(dx, dy) || 1;
    const rx = dx / dist;
    const ry = dy / dist;
    const engageRange = selfRadius * ENGAGE_RANGE_RADIUS_MULT;
    const closeness = Math.max(0, Math.min(1, 1 - dist / engageRange));
    const radialWeight = 1 - closeness * (1 - MIN_RADIAL_WEIGHT);
    const sign = strafeSign(bot, now);
    dx = rx * radialWeight + -ry * sign * closeness;
    dy = ry * radialWeight + rx * sign * closeness;
  }

  // Everything below is blended against a UNIT heading, so the avoidance weights actually mean what
  // they say — otherwise a target 900 units away would drown out a wall two steps in front.
  const headingLen = Math.hypot(dx, dy) || 1;
  dx /= headingLen;
  dy /= headingLen;

  const edge = edgeRepulsion(bot);
  if (edge) {
    dx += edge.dx * EDGE_AVOID_WEIGHT;
    dy += edge.dy * EDGE_AVOID_WEIGHT;
  }

  const corner = cornerRepulsion(bot);
  if (corner) {
    const cornerLen = Math.hypot(corner.dx, corner.dy) || 1;
    dx += (corner.dx / cornerLen) * CORNER_AVOID_WEIGHT;
    dy += (corner.dy / cornerLen) * CORNER_AVOID_WEIGHT;
  }

  steer(bot, dx, dy);
}

/** Push away from any wall the bot is within EDGE_MARGIN of, strongest right up against it. Returns
 * a vector of magnitude 0..1 per axis, or null when the bot is out in open ground. */
function edgeRepulsion(bot: ServerPlayer): { dx: number; dy: number } | null {
  let dx = 0;
  let dy = 0;
  if (bot.x < EDGE_MARGIN) dx += (EDGE_MARGIN - bot.x) / EDGE_MARGIN;
  if (bot.x > ARENA_WIDTH - EDGE_MARGIN) dx -= (bot.x - (ARENA_WIDTH - EDGE_MARGIN)) / EDGE_MARGIN;
  if (bot.y < EDGE_MARGIN) dy += (EDGE_MARGIN - bot.y) / EDGE_MARGIN;
  if (bot.y > ARENA_HEIGHT - EDGE_MARGIN) dy -= (bot.y - (ARENA_HEIGHT - EDGE_MARGIN)) / EDGE_MARGIN;
  return dx !== 0 || dy !== 0 ? { dx, dy } : null;
}

/** A vector pointing back toward the arena center once a bot is within CORNER_MARGIN of both walls
 * meeting at whichever corner it's nearest — null everywhere else. */
function cornerRepulsion(bot: ServerPlayer): { dx: number; dy: number } | null {
  const nearLeft = bot.x < CORNER_MARGIN;
  const nearRight = bot.x > ARENA_WIDTH - CORNER_MARGIN;
  const nearTop = bot.y < CORNER_MARGIN;
  const nearBottom = bot.y > ARENA_HEIGHT - CORNER_MARGIN;
  if (!((nearLeft || nearRight) && (nearTop || nearBottom))) return null;
  return { dx: ARENA_WIDTH / 2 - bot.x, dy: ARENA_HEIGHT / 2 - bot.y };
}

function steer(bot: ServerPlayer, dx: number, dy: number) {
  const len = Math.hypot(dx, dy) || 1;
  bot.inputDx = dx / len;
  bot.inputDy = dy / len;
}
