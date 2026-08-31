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

const wanderState = new WeakMap<ServerPlayer, { angle: number; until: number }>();

/** Bots always charge at the nearest bonus, player or rival bot — unless that target is
 * meaningfully bigger than them, or shielded while the bot isn't, in which case they ignore it, or
 * flee it outright if it's close. Whatever direction that settles on is then nudged away from the
 * nearest corner if the bot is close to one. */
export function updateBotInput(bot: ServerPlayer, players: ServerPlayer[], bonuses: BonusEntity[]) {
  if (!bot.alive) {
    bot.inputDx = 0;
    bot.inputDy = 0;
    return;
  }
  const now = Date.now();
  const selfRadius = radiusFor(bot);
  const selfShielded = bot.shieldUntil > now;

  let nearestThreat: ServerPlayer | null = null;
  let nearestThreatDist = Infinity;
  let nearestPrey: { x: number; y: number } | null = null;
  let nearestPreyDist = Infinity;

  for (const p of players) {
    if (p === bot || !p.alive) continue;
    const d = Math.hypot(p.x - bot.x, p.y - bot.y);
    // A shielded enemy is untouchable no matter the size difference — treat them as a threat unless
    // the bot has its own shield up too, in which case size alone decides as usual. The opposite
    // case: an enemy with no sword and no shield can't hurt anyone, so it's always fair prey
    // regardless of how much bigger it is.
    const enemyShielded = p.shieldUntil > now;
    const defenseless = p.swords.length === 0 && !enemyShielded;
    const isThreat =
      !defenseless && ((enemyShielded && !selfShielded) || radiusFor(p) > selfRadius * SIZE_THREAT_MARGIN);
    if (isThreat) {
      if (d < FLEE_RADIUS && d < nearestThreatDist) {
        nearestThreatDist = d;
        nearestThreat = p;
      }
      continue;
    }
    if (d < SENSE_RADIUS && d < nearestPreyDist) {
      nearestPreyDist = d;
      nearestPrey = p;
    }
  }

  for (const b of bonuses) {
    const d = Math.hypot(b.x - bot.x, b.y - bot.y);
    if (d < SENSE_RADIUS && d < nearestPreyDist) {
      nearestPreyDist = d;
      nearestPrey = b;
    }
  }

  let dx: number;
  let dy: number;
  if (nearestThreat) {
    dx = bot.x - nearestThreat.x;
    dy = bot.y - nearestThreat.y;
  } else if (nearestPrey) {
    dx = nearestPrey.x - bot.x;
    dy = nearestPrey.y - bot.y;
  } else {
    let w = wanderState.get(bot);
    if (!w || now > w.until) {
      w = { angle: Math.random() * Math.PI * 2, until: now + 1500 + Math.random() * 1500 };
      wanderState.set(bot, w);
    }
    dx = Math.cos(w.angle);
    dy = Math.sin(w.angle);
  }

  const corner = cornerRepulsion(bot);
  if (corner) {
    dx += corner.dx * CORNER_AVOID_WEIGHT;
    dy += corner.dy * CORNER_AVOID_WEIGHT;
  }

  steer(bot, dx, dy);
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
